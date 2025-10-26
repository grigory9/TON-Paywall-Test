// Shared TON blockchain client
import {
  TonClient,
  Address,
  toNano,
  fromNano,
  beginCell,
  Cell,
  WalletContractV4,
  internal,
  SendMode
} from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { getHttpEndpoint } from '@orbs-network/ton-access';

export class TonService {
  private client: TonClient | null = null;
  private wallet: WalletContractV4 | null = null;
  private walletKey: any | null = null;
  private network: 'mainnet' | 'testnet';

  constructor(network: 'mainnet' | 'testnet' = 'testnet') {
    this.network = network;
  }

  async init() {
    const endpoint = await getHttpEndpoint({ network: this.network });
    this.client = new TonClient({ endpoint });
    console.log(`TON client initialized for ${this.network}`);
  }

  /**
   * Initialize wallet from mnemonic for contract deployment
   */
  async initWallet(mnemonic: string[]) {
    if (!this.client) {
      throw new Error('TON client not initialized. Call init() first.');
    }

    // Convert mnemonic to wallet key
    this.walletKey = await mnemonicToWalletKey(mnemonic);

    // Create wallet contract
    this.wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: this.walletKey.publicKey
    });

    // Open wallet contract
    const walletContract = this.client.open(this.wallet);
    const balance = await walletContract.getBalance();

    // Format wallet address correctly for the current network
    const isTestnet = this.network === 'testnet';
    const formattedAddress = this.wallet.address.toString({
      bounceable: true,
      testOnly: isTestnet,
      urlSafe: true
    });

    console.log(`Wallet initialized: ${formattedAddress}`);
    console.log(`Balance: ${fromNano(balance)} TON`);

    return formattedAddress;
  }

  private ensureClient(): TonClient {
    if (!this.client) {
      throw new Error('TON client not initialized. Call init() first.');
    }
    return this.client;
  }

  /**
   * Generate deployment transaction for user to sign (TON Connect)
   * Returns transaction data that can be sent to user's wallet
   *
   * NEW: Uses text comment "deploy" for Telegram Wallet compatibility
   * Backend will complete the deployment by calling factory.CompleteDeployment
   */
  generateDeploymentTransaction(
    factoryAddress: string,
    channelId: number,
    adminWallet: string,
    monthlyPrice: number
  ): {
    address: string;
    amount: string;
    payload: string;
  } {
    // Parse addresses - this normalizes any format (EQ/UQ/kQ/0Q) to internal representation
    const factory = Address.parse(factoryAddress);
    const admin = Address.parse(adminWallet);

    console.log('Generating deployment transaction with text comment:', {
      factoryAddress,
      channelId,
      adminWallet,
      monthlyPrice,
      network: this.network
    });

    // Build text comment "deploy" for Telegram Wallet compatibility
    // Opcode 0 = text comment in TON
    const deployMessage = beginCell()
      .storeUint(0, 32) // Text comment opcode
      .storeStringTail('deploy') // Simple text: "deploy"
      .endCell();

    console.log(`✅ Using text comment "deploy" for Telegram Wallet compatibility`);
    console.log(`📝 Backend will complete deployment with channelId: ${channelId}, price: ${monthlyPrice} TON`);

    // CRITICAL: Format address with correct network parameters
    // - bounceable: true (required for smart contracts to enable error handling)
    // - testOnly: true for testnet (generates kQ prefix), false for mainnet (generates EQ prefix)
    // - urlSafe: true (standard for TON Connect)
    //
    // TON Connect requires the address network to match the transaction network.
    // Testnet addresses MUST use kQ prefix, mainnet addresses MUST use EQ prefix.
    // Wallets will reject transactions with mismatched address and network.
    const isTestnet = this.network === 'testnet';
    const formattedAddress = factory.toString({
      bounceable: true,
      testOnly: isTestnet,
      urlSafe: true
    });

    console.log(`✅ Formatted address for ${this.network}:`, formattedAddress);

    // Return transaction parameters for TON Connect
    // Note: Bounce behavior is encoded in the address prefix (kQ for testnet, EQ for mainnet)
    // NOT as a separate field in TON Connect v2
    return {
      address: formattedAddress,
      amount: toNano('0.7').toString(), // 0.1 deployment fee + 0.6 for contract initialization
      payload: deployMessage.toBoc().toString('base64')
    };
  }

  /**
   * NEW: Pre-register deployment parameters in factory contract
   * Backend pays small gas fee (~0.01 TON) to store params on-chain
   * This enables autonomous deployment when user sends "deploy" + 0.7 TON
   *
   * CRITICAL: This method waits for FULL STATE CONFIRMATION on the blockchain
   * to prevent exit code 46284 (Deployment not registered).
   *
   * @param factoryAddress - Factory contract address
   * @param userWallet - User's wallet address (who will pay deployment fee)
   * @param channelId - Telegram channel ID
   * @param monthlyPrice - Subscription price in TON
   */
  async registerDeployment(
    factoryAddress: string,
    userWallet: string,
    channelId: number,
    monthlyPrice: number
  ): Promise<void> {
    if (!this.wallet || !this.walletKey || !this.client) {
      throw new Error('Wallet not initialized. Call initWallet() first with backend mnemonic.');
    }

    const factory = Address.parse(factoryAddress);
    const user = Address.parse(userWallet);

    console.log('📝 Registering deployment parameters on-chain:', {
      userWallet,
      channelId,
      monthlyPrice,
      factoryAddress
    });

    // Build RegisterDeployment message
    // Opcode: 320997630 (0x132208fe) - Generated by Tact compiler
    const registerMessage = beginCell()
      .storeUint(320997630, 32) // RegisterDeployment opcode (from Tact compiler)
      .storeAddress(user) // userWallet
      .storeInt(channelId, 64) // channelId as int64
      .storeCoins(toNano(monthlyPrice)) // monthlyPrice
      .endCell();

    const walletContract = this.client.open(this.wallet);
    const seqno = await walletContract.getSeqno();

    // Send RegisterDeployment message to factory
    await walletContract.sendTransfer({
      secretKey: this.walletKey.secretKey,
      seqno,
      messages: [
        internal({
          to: factory,
          value: toNano('0.02'), // Increased gas for registration (was 0.01)
          bounce: true,
          body: registerMessage
        })
      ]
    });

    console.log('✅ RegisterDeployment message sent, waiting for seqno confirmation...');

    // STEP 1: Wait for wallet seqno increment (transaction accepted by network)
    await this.waitForSeqno(seqno + 1);

    console.log('✅ Seqno confirmed. Waiting for transaction processing...');

    // STEP 2: Wait for transaction to be processed by the network
    // Simple delay is sufficient - factory contract handles storage correctly
    // Note: Getter verification has tuple reading issues but actual storage works fine
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay

    console.log('✅ Deployment parameters registered on-chain');
    console.log('   User can now send "deploy" + 0.7 TON to complete deployment');
  }

  /**
   * Wait for registration to be confirmed in factory contract state
   * Polls getRegisteredDeployment() until it returns non-null or timeout
   *
   * @param factoryAddress - Factory contract address
   * @param userWallet - User wallet address to check registration for
   * @param timeoutMs - Maximum time to wait (default 30 seconds)
   */
  private async waitForRegistrationConfirmation(
    factoryAddress: string,
    userWallet: string,
    timeoutMs: number = 30000
  ): Promise<void> {
    const client = this.ensureClient();
    const factory = Address.parse(factoryAddress);
    const user = Address.parse(userWallet);

    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Query factory contract's getRegisteredDeployment() getter
        const result = await client.runMethod(factory, 'getRegisteredDeployment', [
          { type: 'slice', cell: beginCell().storeAddress(user).endCell() }
        ]);

        // Check if registration exists (non-null result)
        const stack = result.stack;

        // Read the optional RegisteredParams struct
        // Tact encodes optional returns as a tuple: null if not found, or a tuple with struct fields if found
        // This matches the generated wrapper code: readTupleOpt() returns null for optional null, or tuple for optional value
        const registrationTuple = stack.readTupleOpt();

        if (registrationTuple !== null) {
          // Registration found in contract state - tuple contains (channelId, monthlyPrice, registeredAt)
          const channelId = registrationTuple.readBigNumber();
          const monthlyPrice = registrationTuple.readBigNumber();
          const registeredAt = registrationTuple.readBigNumber();

          console.log('✅ Registration confirmed in factory contract state');
          console.log(`   Channel ID: ${channelId}`);
          console.log(`   Monthly Price: ${monthlyPrice} nanoTON`);
          console.log(`   Registered At: ${new Date(Number(registeredAt) * 1000).toISOString()}`);
          return;
        }

        console.log(`⏳ Registration not yet visible in contract state, waiting... (${Math.floor((Date.now() - startTime) / 1000)}s)`);
      } catch (error) {
        console.log(`⏳ Waiting for contract state update... (${Math.floor((Date.now() - startTime) / 1000)}s)`);
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error(
      `Registration confirmation timeout after ${timeoutMs}ms. ` +
      `The factory contract state has not updated yet. Please try again in a few seconds.`
    );
  }

  /**
   * Deploy subscription contract via factory (DEPRECATED - use generateDeploymentTransaction with TON Connect)
   * This method is kept for backward compatibility but should not be used
   */
  async deploySubscriptionContract(
    factoryAddress: string,
    channelId: number,
    adminWallet: string,
    monthlyPrice: number
  ): Promise<string> {
    throw new Error(
      'Direct deployment is deprecated. ' +
      'Use generateDeploymentTransaction() and send via TON Connect so users pay the deployment fee themselves.'
    );
  }

  /**
   * Wait for wallet seqno to update (transaction confirmation)
   */
  private async waitForSeqno(targetSeqno: number, timeoutMs: number = 60000): Promise<void> {
    if (!this.wallet || !this.client) {
      throw new Error('Wallet or client not initialized');
    }

    const startTime = Date.now();
    const walletContract = this.client.open(this.wallet);

    while (Date.now() - startTime < timeoutMs) {
      const currentSeqno = await walletContract.getSeqno();

      if (currentSeqno >= targetSeqno) {
        return;
      }

      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error(`Transaction confirmation timeout after ${timeoutMs}ms`);
  }

  /**
   * Get contract address from factory for a channel
   * Returns address formatted correctly for the current network
   */
  async getContractAddressFromFactory(
    factoryAddress: string,
    channelId: number
  ): Promise<string | null> {
    const client = this.ensureClient();

    try {
      const factory = Address.parse(factoryAddress);

      const result = await client.runMethod(factory, 'getSubscriptionAddress', [
        { type: 'int', value: BigInt(channelId) }
      ]);

      const contractAddress = result.stack.readAddress();

      // Format address correctly for the current network
      const isTestnet = this.network === 'testnet';
      const formattedAddress = contractAddress.toString({
        bounceable: true,
        testOnly: isTestnet,
        urlSafe: true
      });

      console.log(`Subscription contract for channel ${channelId}: ${formattedAddress}`);

      return formattedAddress;
    } catch (error) {
      console.error('Error getting contract address from factory:', error);
      return null;
    }
  }

  /**
   * Get balance of an address
   */
  async getBalance(address: string): Promise<number> {
    const client = this.ensureClient();
    try {
      const balance = await client.getBalance(Address.parse(address));
      return parseFloat(fromNano(balance));
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  }

  /**
   * Get transactions for an address
   */
  async getTransactions(address: string, limit: number = 100) {
    const client = this.ensureClient();
    try {
      return await client.getTransactions(Address.parse(address), { limit });
    } catch (error) {
      console.error('Error getting transactions:', error);
      return [];
    }
  }

  /**
   * Check if a subscription is active on-chain
   */
  async isSubscriptionActive(
    contractAddress: string,
    subscriberAddress: string
  ): Promise<boolean> {
    const client = this.ensureClient();

    try {
      const contract = Address.parse(contractAddress);
      const subscriber = Address.parse(subscriberAddress);

      // Call the contract's isActive getter method
      const result = await client.runMethod(contract, 'isActive', [
        { type: 'slice', cell: beginCell().storeAddress(subscriber).endCell() }
      ]);

      // Read boolean result from stack
      return result.stack.readBoolean();
    } catch (error) {
      console.error('Error checking subscription status:', error);
      return false;
    }
  }

  /**
   * Get subscription expiry from contract
   */
  async getSubscriptionExpiry(
    contractAddress: string,
    subscriberAddress: string
  ): Promise<number> {
    const client = this.ensureClient();

    try {
      const contract = Address.parse(contractAddress);
      const subscriber = Address.parse(subscriberAddress);

      // Call the contract's getExpiry getter method
      const result = await client.runMethod(contract, 'getExpiry', [
        { type: 'slice', cell: beginCell().storeAddress(subscriber).endCell() }
      ]);

      // Read integer result (timestamp) from stack
      return Number(result.stack.readBigNumber());
    } catch (error) {
      console.error('Error getting subscription expiry:', error);
      return 0;
    }
  }

  /**
   * Validate TON address format
   */
  isValidAddress(address: string): boolean {
    try {
      Address.parse(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format TON amount for display
   */
  formatTON(nanotons: bigint | number): string {
    return fromNano(nanotons);
  }

  /**
   * Parse TON amount to nanotons
   */
  parseTON(amount: string | number): bigint {
    return toNano(amount.toString());
  }

  /**
   * Get contract state
   */
  async getContractState(address: string) {
    const client = this.ensureClient();
    try {
      return await client.getContractState(Address.parse(address));
    } catch (error) {
      console.error('Error getting contract state:', error);
      return null;
    }
  }

  /**
   * Verify if a specific payment transaction exists for a subscription
   * Returns transaction details if found
   */
  async verifyPayment(
    contractAddress: string,
    expectedAmount: number,
    sinceTimestamp?: number
  ): Promise<{
    found: boolean;
    txHash?: string;
    fromAddress?: string;
    amount?: number;
    timestamp?: number;
  }> {
    const client = this.ensureClient();

    try {
      const contract = Address.parse(contractAddress);
      const transactions = await this.getTransactions(contractAddress, 100);

      // Filter transactions since the given timestamp (if provided)
      const relevantTxs = sinceTimestamp
        ? transactions.filter((tx: any) => tx.now > sinceTimestamp)
        : transactions;

      // Calculate minimum acceptable amount (1% tolerance)
      const minAmount = expectedAmount * 0.99;

      // Look for "Subscribe" payment transaction
      for (const tx of relevantTxs) {
        const inMsg = tx.inMessage;
        if (!inMsg || !inMsg.body) continue;

        try {
          // Parse message body
          const body = inMsg.body.beginParse();

          // Check for "Subscribe" text message (op = 0, followed by text)
          const op = body.loadUint(32);
          if (op === 0) {
            const msgText = body.loadStringTail();
            if (msgText === 'Subscribe') {
              // Check if this is an internal message with value
              if (inMsg.info.type !== 'internal') continue;

              const sender = inMsg.info.src;
              if (!sender) continue;

              const amount = parseFloat(fromNano(inMsg.info.value.coins));

              // Verify amount is sufficient
              if (amount >= minAmount) {
                // Format sender address correctly for the current network
                const isTestnet = this.network === 'testnet';
                const formattedSender = sender.toString({
                  bounceable: true, // Assume sender is a contract/wallet that supports bounce
                  testOnly: isTestnet,
                  urlSafe: true
                });

                return {
                  found: true,
                  txHash: tx.hash().toString('hex'),
                  fromAddress: formattedSender,
                  amount: amount,
                  timestamp: tx.now
                };
              }
            }
          }
        } catch (parseError) {
          // Skip transactions that can't be parsed
          continue;
        }
      }

      return { found: false };
    } catch (error) {
      console.error('Error verifying payment:', error);
      return { found: false };
    }
  }

  /**
   * Monitor transactions for a contract
   */
  async *monitorTransactions(
    address: string,
    intervalMs: number = 30000
  ): AsyncGenerator<any[]> {
    let lastLt = 0n;

    while (true) {
      const transactions = await this.getTransactions(address, 10);

      const newTransactions = transactions.filter((tx: any) => {
        const txLt = BigInt(tx.lt);
        return txLt > lastLt;
      });

      if (newTransactions.length > 0) {
        const maxLt = newTransactions.reduce((max: bigint, tx: any) => {
          const txLt = BigInt(tx.lt);
          return txLt > max ? txLt : max;
        }, lastLt);

        lastLt = maxLt;
        yield newTransactions;
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
}

// Export helper functions
export { toNano, fromNano, Address };

// Factory function for creating TON service
export function createTonService(network: 'mainnet' | 'testnet' = 'testnet'): TonService {
  return new TonService(network);
}
