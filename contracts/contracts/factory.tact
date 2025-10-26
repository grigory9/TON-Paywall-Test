import "@stdlib/deploy";
import "@stdlib/ownable";

// Message to set deployer address (owner-only operation)
message SetDeployer {
    newDeployer: Address;
}

// Pre-register deployment parameters (deployer or owner can call)
message RegisterDeployment {
    userWallet: Address;      // Who will pay for deployment
    channelId: Int as int64;
    monthlyPrice: Int as coins;
}

message UpdateFactoryFee {
    newFee: Int as coins;
}

// Response message after deployment
message SubscriptionDeployed {
    channelId: Int as int64;
    contractAddress: Address;
}

// Message for updating subscription price
message UpdatePrice {
    newPrice: Int as coins;
}

// Message for updating admin wallet
message UpdateAdminWallet {
    newWallet: Address;
}

// Storage for pre-registered deployment parameters
struct RegisteredParams {
    channelId: Int as int64;
    monthlyPrice: Int as coins;
    registeredAt: Int as uint32; // Timestamp for expiry check
}

/**
 * SubscriptionFactory with Deployer Role Pattern
 *
 * SECURITY MODEL:
 * - Owner: Full control (cold wallet, offline storage)
 *   - Can update deployer
 *   - Can update deployment fee
 *   - Can register deployments
 *
 * - Deployer: Limited operational role (hot wallet, server)
 *   - Can ONLY register deployment parameters
 *   - Cannot update fee, cannot withdraw funds
 *   - Can be revoked by owner at any time
 *
 * This separation allows the owner's key to remain in cold storage
 * while the backend server operates with limited deployer privileges.
 */
contract SubscriptionFactory with Deployable, Ownable {
    owner: Address;
    deployer: Address;        // NEW: Separate deployer role for backend operations
    deploymentFee: Int as coins = ton("0.1");
    deployedContracts: map<Int, Address>; // channelId -> contract address

    // Pre-registered deployment parameters
    // Key: hash(userWallet address) -> Value: deployment params
    registeredDeployments: map<Int, RegisteredParams>;

    totalDeployed: Int as uint32 = 0;

    init(owner: Address) {
        self.owner = owner;
        self.deployer = owner; // Initially, owner is also deployer
    }

    /**
     * Owner can designate a deployer address
     *
     * SETUP PROCEDURE:
     * 1. Deploy factory with owner wallet (cold storage)
     * 2. Generate new deployer wallet (will be stored on server)
     * 3. Fund deployer wallet with ~1 TON for gas
     * 4. Owner calls setDeployer(deployerAddress) ONCE
     * 5. Remove owner mnemonic from server, keep only deployer mnemonic
     *
     * Gas cost: ~0.01 TON
     */
    receive(msg: SetDeployer) {
        self.requireOwner(); // Only owner can change deployer
        self.deployer = msg.newDeployer;

        // Emit event for audit trail
        emit("DeployerUpdated".asComment());
    }

    /**
     * Pre-register deployment parameters
     *
     * WHO CAN CALL: Owner OR Deployer
     *
     * Backend workflow:
     * 1. User starts channel setup in admin bot
     * 2. Backend calls this function (using deployer key)
     * 3. Parameters stored on-chain for 1 hour
     * 4. User sends payment to factory with "deploy" comment
     * 5. Factory auto-deploys using pre-registered params
     *
     * Gas cost: ~0.01 TON (paid by deployer wallet)
     */
    receive(msg: RegisterDeployment) {
        let ctx: Context = context();

        // SECURITY: Check if sender is owner OR designated deployer
        require(
            ctx.sender == self.owner || ctx.sender == self.deployer,
            "Unauthorized: only owner or deployer can register"
        );

        // Create hash key from user wallet address
        let walletHash: Int = msg.userWallet.asSlice().hash();

        // Store parameters for later use (expires in 1 hour)
        self.registeredDeployments.set(walletHash, RegisteredParams{
            channelId: msg.channelId,
            monthlyPrice: msg.monthlyPrice,
            registeredAt: now()
        });

        // Emit event for backend monitoring
        emit("DeploymentRegistered".asComment());
    }

    /**
     * Autonomous deployment handler using text comment
     *
     * User sends "deploy" text comment with 0.6 TON to factory address.
     * Factory looks up pre-registered params and deploys automatically.
     *
     * NO backend intervention needed after registration!
     *
     * Requirements:
     * - Minimum 0.6 TON (0.1 fee + 0.5 initial contract balance)
     * - Pre-registered parameters must exist
     * - Registration must be < 1 hour old
     * - Channel not already deployed
     */
    receive("deploy") {
        let ctx: Context = context();

        // Check minimum deposit amount (0.1 fee + 0.5 for contract)
        require(ctx.value >= self.deploymentFee + ton("0.5"),
                "Insufficient fee: send at least 0.6 TON");

        // Look up pre-registered parameters using sender's address hash
        let senderHash: Int = ctx.sender.asSlice().hash();
        let params: RegisteredParams? = self.registeredDeployments.get(senderHash);

        require(params != null,
                "Deployment not registered. Contact admin bot to setup channel first.");

        let deployParams: RegisteredParams = params!!;

        // SECURITY: Check registration isn't expired (1 hour = 3600 seconds)
        // This prevents stale registrations from being used
        require(now() - deployParams.registeredAt < 3600,
                "Registration expired. Please start channel setup again.");

        // Check if already deployed for this channel
        require(self.deployedContracts.get(deployParams.channelId) == null,
                "Already deployed for this channel");

        // Calculate init state for new contract
        let initCode: StateInit = initOf ChannelSubscription(
            myAddress(),
            deployParams.channelId,
            ctx.sender, // User wallet becomes admin
            deployParams.monthlyPrice
        );

        // Deploy new subscription contract
        let subscriptionAddress: Address = contractAddress(initCode);

        // Store deployed contract address
        self.deployedContracts.set(deployParams.channelId, subscriptionAddress);
        self.totalDeployed = self.totalDeployed + 1;

        // SECURITY: Clean up registration immediately (prevents re-use)
        self.registeredDeployments.set(senderHash, null);

        // Send remaining balance to initialize the subscription contract
        send(SendParameters{
            to: subscriptionAddress,
            value: ctx.value - self.deploymentFee,
            mode: SendIgnoreErrors,
            code: initCode.code,
            data: initCode.data,
            body: beginCell().endCell()
        });

        // Notify user about successful deployment
        send(SendParameters{
            to: ctx.sender,
            value: ton("0.01"),
            mode: SendIgnoreErrors,
            body: SubscriptionDeployed{
                channelId: deployParams.channelId,
                contractAddress: subscriptionAddress
            }.toCell()
        });
    }

    /**
     * Update deployment fee (owner only)
     *
     * SECURITY: Only owner can change fee, NOT deployer
     * This prevents compromised deployer from manipulating economics
     */
    receive(msg: UpdateFactoryFee) {
        self.requireOwner();
        self.deploymentFee = msg.newFee;
    }

    // ===== Getter Functions =====

    get fun getSubscriptionAddress(channelId: Int): Address? {
        return self.deployedContracts.get(channelId);
    }

    get fun getDeploymentFee(): Int {
        return self.deploymentFee;
    }

    get fun getTotalDeployed(): Int {
        return self.totalDeployed;
    }

    // NEW: Get current deployer address (for verification)
    get fun getDeployer(): Address {
        return self.deployer;
    }

    // Get registered deployment params for a user (for verification)
    get fun getRegisteredDeployment(userWallet: Address): RegisteredParams? {
        let walletHash: Int = userWallet.asSlice().hash();
        return self.registeredDeployments.get(walletHash);
    }
}

/**
 * Individual channel subscription contract
 * (No changes needed for deployer role pattern)
 */
contract ChannelSubscription with Deployable {
    factoryAddress: Address;
    channelId: Int as int64;
    adminWallet: Address;
    monthlyPrice: Int as coins;

    subscribers: map<Address, Int as uint32>; // wallet -> expiry timestamp
    totalSubscribers: Int as uint32 = 0;
    totalRevenue: Int as coins = 0;
    tolerancePercent: Int as uint8 = 1; // 1% underpayment tolerance

    init(factory: Address, channel: Int, admin: Address, price: Int) {
        self.factoryAddress = factory;
        self.channelId = channel;
        self.adminWallet = admin;
        self.monthlyPrice = price;
    }

    // Process subscription payment
    receive("Subscribe") {
        let ctx: Context = context();
        let subscriber: Address = ctx.sender;

        // Calculate minimum acceptable payment (1% tolerance)
        let minPayment: Int = (self.monthlyPrice * 99) / 100;
        require(ctx.value >= minPayment, "Insufficient payment");

        // Calculate subscription expiry (30 days)
        let currentExpiry: Int? = self.subscribers.get(subscriber);
        let newExpiry: Int = 0;

        if (currentExpiry != null && currentExpiry!! > now()) {
            // Extend existing subscription
            newExpiry = currentExpiry!! + (30 * 24 * 60 * 60);
        } else {
            // New subscription or expired
            newExpiry = now() + (30 * 24 * 60 * 60);
            if (currentExpiry == null) {
                self.totalSubscribers = self.totalSubscribers + 1;
            }
        }

        // Update subscription
        self.subscribers.set(subscriber, newExpiry);
        self.totalRevenue = self.totalRevenue + ctx.value;

        // Send payment to admin wallet (minus gas)
        let adminPayment: Int = self.monthlyPrice - ton("0.02");
        send(SendParameters{
            to: self.adminWallet,
            value: adminPayment,
            mode: SendIgnoreErrors,
            body: "Subscription payment".asComment()
        });

        // Refund overpayment if significant
        let overpayment: Int = ctx.value - self.monthlyPrice;
        if (overpayment > ton("0.01")) {
            send(SendParameters{
                to: subscriber,
                value: overpayment - ton("0.005"),
                mode: SendIgnoreErrors,
                body: "Overpayment refund".asComment()
            });
        }
    }

    // Admin can update price
    receive(msg: UpdatePrice) {
        let ctx: Context = context();
        require(ctx.sender == self.adminWallet, "Admin only");
        require(msg.newPrice > 0, "Invalid price");
        require(msg.newPrice <= ton("1000"), "Price too high");
        self.monthlyPrice = msg.newPrice;
    }

    // Admin can change wallet
    receive(msg: UpdateAdminWallet) {
        let ctx: Context = context();
        require(ctx.sender == self.adminWallet, "Admin only");
        self.adminWallet = msg.newWallet;
    }

    // Check if user has active subscription
    get fun isActive(subscriber: Address): Bool {
        let expiry: Int? = self.subscribers.get(subscriber);
        return expiry != null && expiry!! > now();
    }

    // Get subscription expiry timestamp
    get fun getExpiry(subscriber: Address): Int {
        let expiry: Int? = self.subscribers.get(subscriber);
        if (expiry == null) {
            return 0;
        }
        return expiry!!;
    }

    get fun getTotalSubscribers(): Int {
        return self.totalSubscribers;
    }

    get fun getTotalRevenue(): Int {
        return self.totalRevenue;
    }

    get fun getMonthlyPrice(): Int {
        return self.monthlyPrice;
    }

    get fun getChannelId(): Int {
        return self.channelId;
    }
}
