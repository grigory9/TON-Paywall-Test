import "@stdlib/deploy";
import "@stdlib/ownable";

// ============================================================================
// Message Definitions
// ============================================================================

/**
 * Message sent by factory when deploying new access gate
 */
message DeployAccessGate {
    channelId: Int as int64;
    accessPrice: Int as coins;
}

/**
 * Message to purchase one-time channel access
 * User sends this with payment to contract
 */
message BuyAccess {
    queryId: Int as uint64; // For tracking in logs
}

/**
 * Response sent after successful purchase
 * Bot monitors for this to approve join request
 */
message AccessPurchased {
    buyer: Address;
    channelId: Int as int64;
    amount: Int as coins;
    timestamp: Int as uint32;
}

/**
 * Message to update access price (admin only)
 */
message UpdateAccessPrice {
    newPrice: Int as coins;
}

/**
 * Message to update admin wallet (admin only)
 */
message UpdateAdminWallet {
    newWallet: Address;
}

/**
 * Factory message to update deployment fee (owner only)
 */
message UpdateFactoryFee {
    newFee: Int as coins;
}

/**
 * Message to register deployment params (deployer role)
 */
message RegisterAccessGate {
    userWallet: Address;
    channelId: Int as int64;
    accessPrice: Int as coins;
}

// Storage for pre-registered deployments
struct RegisteredGateParams {
    channelId: Int as int64;
    accessPrice: Int as coins;
    registeredAt: Int as uint32;
}

// ============================================================================
// AccessGateFactory Contract
// ============================================================================

/**
 * Factory contract for deploying ChannelAccessGate contracts
 *
 * SECURITY MODEL:
 * - Owner: Full control (cold wallet)
 *   - Update deployer address
 *   - Update deployment fee
 *   - Register deployments
 *
 * - Deployer: Limited operational role (hot wallet on server)
 *   - Can ONLY register deployment parameters
 *   - Cannot modify fees or withdraw funds
 *   - Can be revoked by owner
 *
 * DEPLOYMENT FLOW:
 * 1. Backend calls RegisterAccessGate (using deployer key)
 * 2. Parameters stored on-chain for 1 hour
 * 3. User sends "deploy" text with 0.6 TON to factory
 * 4. Factory auto-deploys using pre-registered params
 */
contract AccessGateFactory with Deployable, Ownable {
    owner: Address;
    deployer: Address;
    deploymentFee: Int as coins = ton("0.1");

    // channelId -> deployed contract address
    deployedGates: map<Int, Address>;

    // hash(userWallet) -> deployment params
    registeredDeployments: map<Int, RegisteredGateParams>;

    totalDeployed: Int as uint32 = 0;

    init(owner: Address) {
        self.owner = owner;
        self.deployer = owner; // Initially owner is deployer
    }

    /**
     * Set deployer address (owner only)
     * Called once during initial setup to separate hot/cold wallets
     */
    receive(msg: SetDeployer) {
        self.requireOwner();
        self.deployer = msg.newDeployer;
        emit("DeployerUpdated".asComment());
    }

    /**
     * Pre-register deployment parameters
     * Can be called by owner OR deployer
     *
     * Backend calls this before showing payment instructions to user
     */
    receive(msg: RegisterAccessGate) {
        let ctx: Context = context();

        // Only owner or deployer can register
        require(
            ctx.sender == self.owner || ctx.sender == self.deployer,
            "Unauthorized: only owner or deployer"
        );

        // Validate price is reasonable
        require(msg.accessPrice > 0, "Price must be positive");
        require(msg.accessPrice <= ton("1000"), "Price too high");

        // Hash user wallet for storage key
        let walletHash: Int = msg.userWallet.asSlice().hash();

        // Store params with expiry timestamp
        self.registeredDeployments.set(walletHash, RegisteredGateParams{
            channelId: msg.channelId,
            accessPrice: msg.accessPrice,
            registeredAt: now()
        });

        emit("GateRegistered".asComment());
    }

    /**
     * Autonomous deployment triggered by user payment
     *
     * User sends "deploy" text comment with 0.6 TON
     * Factory looks up pre-registered params and auto-deploys
     *
     * SECURITY CHECKS:
     * - Minimum 0.6 TON (0.1 fee + 0.5 contract balance)
     * - Registration must exist and be < 1 hour old
     * - Channel not already deployed
     */
    receive("deploy") {
        let ctx: Context = context();

        // Validate payment amount
        require(
            ctx.value >= self.deploymentFee + ton("0.5"),
            "Insufficient payment: send at least 0.6 TON"
        );

        // Look up pre-registered params
        let senderHash: Int = ctx.sender.asSlice().hash();
        let params: RegisteredGateParams? = self.registeredDeployments.get(senderHash);

        require(
            params != null,
            "Not registered. Use admin bot to setup channel first."
        );

        let gateParams: RegisteredGateParams = params!!;

        // Check registration not expired (1 hour = 3600 seconds)
        require(
            now() - gateParams.registeredAt < 3600,
            "Registration expired. Start setup again."
        );

        // Check not already deployed for this channel
        require(
            self.deployedGates.get(gateParams.channelId) == null,
            "Already deployed for this channel"
        );

        // Calculate init state for new access gate
        let initCode: StateInit = initOf ChannelAccessGate(
            myAddress(),
            gateParams.channelId,
            ctx.sender, // User becomes admin
            gateParams.accessPrice
        );

        let gateAddress: Address = contractAddress(initCode);

        // Store deployed address
        self.deployedGates.set(gateParams.channelId, gateAddress);
        self.totalDeployed = self.totalDeployed + 1;

        // Clean up registration (prevents reuse)
        self.registeredDeployments.set(senderHash, null);

        // Deploy access gate with remaining balance
        send(SendParameters{
            to: gateAddress,
            value: ctx.value - self.deploymentFee,
            mode: SendIgnoreErrors,
            code: initCode.code,
            data: initCode.data,
            body: beginCell().endCell()
        });

        // Notify user of successful deployment
        send(SendParameters{
            to: ctx.sender,
            value: ton("0.01"),
            mode: SendIgnoreErrors,
            body: "Access gate deployed successfully".asComment()
        });
    }

    /**
     * Update deployment fee (owner only)
     */
    receive(msg: UpdateFactoryFee) {
        self.requireOwner();
        require(msg.newFee >= ton("0.05"), "Fee too low");
        require(msg.newFee <= ton("1"), "Fee too high");
        self.deploymentFee = msg.newFee;
    }

    // ========== Getter Functions ==========

    get fun getAccessGateAddress(channelId: Int): Address? {
        return self.deployedGates.get(channelId);
    }

    get fun getDeploymentFee(): Int {
        return self.deploymentFee;
    }

    get fun getTotalDeployed(): Int {
        return self.totalDeployed;
    }

    get fun getDeployer(): Address {
        return self.deployer;
    }

    get fun getRegisteredDeployment(userWallet: Address): RegisteredGateParams? {
        let walletHash: Int = userWallet.asSlice().hash();
        return self.registeredDeployments.get(walletHash);
    }
}

// ============================================================================
// ChannelAccessGate Contract
// ============================================================================

/**
 * Individual channel access gate for one-time payments
 *
 * SIMPLIFIED MODEL vs Subscription:
 * - No expiry tracking (permanent access)
 * - No recurring payments
 * - Just tracks: did user pay? (on-chain record)
 *
 * PAYMENT FLOW:
 * 1. User requests to join channel (Telegram join request)
 * 2. Bot sends payment link to this contract
 * 3. User sends TON with "buy" comment
 * 4. Contract forwards to admin wallet
 * 5. Contract emits AccessPurchased event
 * 6. Bot detects event and approves join request
 *
 * SECURITY FEATURES:
 * - 1% underpayment tolerance for gas variations
 * - Automatic refund of overpayments >0.1 TON
 * - Admin-only price updates
 * - Admin-only wallet updates
 */
contract ChannelAccessGate with Deployable {
    factoryAddress: Address;
    channelId: Int as int64;
    adminWallet: Address;
    accessPrice: Int as coins;

    // Track purchases on-chain (for verification)
    // wallet -> purchase timestamp (0 = not purchased)
    purchases: map<Address, Int as uint32>;

    totalPurchases: Int as uint32 = 0;
    totalRevenue: Int as coins = 0;

    // 1% underpayment tolerance for gas fee variations
    tolerancePercent: Int as uint8 = 1;

    init(factory: Address, channel: Int, admin: Address, price: Int) {
        self.factoryAddress = factory;
        self.channelId = channel;
        self.adminWallet = admin;
        self.accessPrice = price;
    }

    /**
     * Process access purchase
     *
     * User sends payment with "buy" text comment
     *
     * PAYMENT TOLERANCE:
     * - Accepts 1% underpayment (99% of price) for gas variations
     * - Automatically refunds overpayments >0.1 TON
     *
     * GAS HANDLING:
     * - Reserves 0.05 TON for admin transfer
     * - Reserves 0.01 TON for refund if needed
     * - Admin receives: accessPrice - 0.05 TON
     */
    receive("buy") {
        let ctx: Context = context();
        let buyer: Address = ctx.sender;

        // Calculate minimum acceptable payment (99% of price)
        let minPayment: Int = (self.accessPrice * 99) / 100;

        require(ctx.value >= minPayment, "Insufficient payment");

        // Record purchase timestamp
        self.purchases.set(buyer, now());
        self.totalPurchases = self.totalPurchases + 1;
        self.totalRevenue = self.totalRevenue + ctx.value;

        // Calculate payment distribution
        let adminPayment: Int = self.accessPrice - ton("0.05");
        let overpayment: Int = ctx.value - self.accessPrice;

        // Send payment to admin wallet (minus gas)
        send(SendParameters{
            to: self.adminWallet,
            value: adminPayment,
            mode: SendIgnoreErrors,
            body: "Channel access payment".asComment()
        });

        // Refund significant overpayments (>0.1 TON)
        if (overpayment > ton("0.1")) {
            send(SendParameters{
                to: buyer,
                value: overpayment - ton("0.01"),
                mode: SendIgnoreErrors,
                body: "Overpayment refund".asComment()
            });
        }

        // Emit event for bot to detect
        // Bot monitors blockchain for this event to approve join request
        emit(AccessPurchased{
            buyer: buyer,
            channelId: self.channelId,
            amount: ctx.value,
            timestamp: now()
        }.toCell());
    }

    /**
     * Fallback receiver for payments without text comment
     * Treats as purchase attempt
     */
    receive(msg: BuyAccess) {
        let ctx: Context = context();
        let buyer: Address = ctx.sender;

        let minPayment: Int = (self.accessPrice * 99) / 100;
        require(ctx.value >= minPayment, "Insufficient payment");

        self.purchases.set(buyer, now());
        self.totalPurchases = self.totalPurchases + 1;
        self.totalRevenue = self.totalRevenue + ctx.value;

        let adminPayment: Int = self.accessPrice - ton("0.05");

        send(SendParameters{
            to: self.adminWallet,
            value: adminPayment,
            mode: SendIgnoreErrors,
            body: "Channel access payment".asComment()
        });

        let overpayment: Int = ctx.value - self.accessPrice;
        if (overpayment > ton("0.1")) {
            send(SendParameters{
                to: buyer,
                value: overpayment - ton("0.01"),
                mode: SendIgnoreErrors,
                body: "Overpayment refund".asComment()
            });
        }

        emit(AccessPurchased{
            buyer: buyer,
            channelId: self.channelId,
            amount: ctx.value,
            timestamp: now()
        }.toCell());
    }

    /**
     * Admin can update access price
     * Useful for adjusting to TON price fluctuations
     */
    receive(msg: UpdateAccessPrice) {
        let ctx: Context = context();
        require(ctx.sender == self.adminWallet, "Admin only");
        require(msg.newPrice > 0, "Price must be positive");
        require(msg.newPrice <= ton("1000"), "Price too high");

        self.accessPrice = msg.newPrice;
        emit("PriceUpdated".asComment());
    }

    /**
     * Admin can change wallet address
     * Useful if admin wants to use different wallet
     */
    receive(msg: UpdateAdminWallet) {
        let ctx: Context = context();
        require(ctx.sender == self.adminWallet, "Admin only");

        self.adminWallet = msg.newWallet;
        emit("AdminUpdated".asComment());
    }

    // ========== Getter Functions ==========

    /**
     * Check if wallet has purchased access
     * Returns true if purchase exists, false otherwise
     */
    get fun hasPurchased(wallet: Address): Bool {
        let timestamp: Int? = self.purchases.get(wallet);
        return timestamp != null;
    }

    /**
     * Get purchase timestamp for wallet
     * Returns 0 if no purchase exists
     */
    get fun getPurchaseTimestamp(wallet: Address): Int {
        let timestamp: Int? = self.purchases.get(wallet);
        if (timestamp == null) {
            return 0;
        }
        return timestamp!!;
    }

    get fun getAccessPrice(): Int {
        return self.accessPrice;
    }

    get fun getTotalPurchases(): Int {
        return self.totalPurchases;
    }

    get fun getTotalRevenue(): Int {
        return self.totalRevenue;
    }

    get fun getChannelId(): Int {
        return self.channelId;
    }

    get fun getAdminWallet(): Address {
        return self.adminWallet;
    }

    /**
     * Get comprehensive stats for analytics
     */
    get fun getStats(): map<String, Int> {
        let stats: map<String, Int> = emptyMap();
        // Note: Tact doesn't support string keys in maps returned from getters
        // This is a conceptual design - actual implementation would return struct
        return stats;
    }
}

// ============================================================================
// Message for setting deployer (from Ownable pattern)
// ============================================================================

message SetDeployer {
    newDeployer: Address;
}
