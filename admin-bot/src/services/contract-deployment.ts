// Contract deployment service (via TON Connect)
import { Pool } from 'pg';
import { createTonService } from '../../../shared/ton-client';
import { TonConnectService, SendTransactionResponse } from './tonconnect.service';

export class ContractDeploymentService {
  private tonService: ReturnType<typeof createTonService>;
  private tonConnectService: TonConnectService;

  constructor(private db: Pool, tonConnectService: TonConnectService) {
    const network = (process.env.TON_NETWORK || 'testnet') as 'mainnet' | 'testnet';
    this.tonService = createTonService(network);
    this.tonService.init();
    this.tonConnectService = tonConnectService;
  }

  /**
   * Request user to deploy subscription contract via TON Connect
   * NEW: Uses Pre-Registration architecture for autonomous deployment
   *
   * Flow:
   * 1. Backend pre-registers deployment params on-chain (pays ~0.01 TON gas)
   * 2. User sends "deploy" + 0.7 TON via TON Connect
   * 3. Factory autonomously deploys using pre-registered params (NO backend intervention!)
   */
  async requestDeploymentFromUser(
    userId: string,
    channelId: number,
    adminWallet: string,
    monthlyPrice: number
  ): Promise<SendTransactionResponse> {
    const factoryAddress = process.env.FACTORY_CONTRACT_ADDRESS;
    const deployerMnemonic = process.env.DEPLOYER_MNEMONIC;

    if (!factoryAddress) {
      throw new Error('Factory contract address not configured');
    }

    if (!deployerMnemonic) {
      throw new Error('DEPLOYER_MNEMONIC not configured - needed for registration');
    }

    console.log('📤 Requesting deployment transaction from user:', {
      userId,
      channelId,
      adminWallet,
      monthlyPrice
    });

    try {
      // STEP 1: Pre-register deployment parameters on-chain
      console.log('📝 Step 1: Pre-registering deployment parameters...');

      // Initialize deployer wallet for registration
      const mnemonic = deployerMnemonic.split(' ');
      await this.tonService.initWallet(mnemonic);

      // Register deployment parameters in factory contract
      await this.tonService.registerDeployment(
        factoryAddress,
        adminWallet,
        channelId,
        monthlyPrice
      );

      console.log('✅ Parameters registered on-chain. Factory is ready for user payment.');

      // STEP 2: Generate simple "deploy" transaction for user
      console.log('📝 Step 2: Generating user transaction...');

      const transaction = this.tonService.generateDeploymentTransaction(
        factoryAddress,
        channelId,
        adminWallet,
        monthlyPrice
      );

      // STEP 3: Send transaction request to user's wallet via TON Connect
      console.log('📝 Step 3: Sending transaction to user wallet...');

      const result = await this.tonConnectService.sendTransaction(userId, {
        messages: [transaction],
        validUntil: Math.floor(Date.now() / 1000) + 3600 // 1 hour (matches contract registration expiry)
      });

      console.log('✅ Deployment transaction sent by user:', result.hash);
      console.log('   Factory will autonomously deploy when user confirms payment');

      return result;
    } catch (error) {
      console.error('Error requesting deployment from user:', error);
      throw new Error('Failed to request contract deployment: ' + (error as Error).message);
    }
  }

  /**
   * Wait for deployment to be confirmed and get contract address
   */
  async waitForDeploymentAndGetAddress(
    channelId: number,
    maxWaitMs: number = 60000
  ): Promise<string | null> {
    const factoryAddress = process.env.FACTORY_CONTRACT_ADDRESS;

    if (!factoryAddress) {
      throw new Error('Factory contract address not configured');
    }

    const startTime = Date.now();
    const checkInterval = 5000; // Check every 5 seconds

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const contractAddress = await this.tonService.getContractAddressFromFactory(
          factoryAddress,
          channelId
        );

        if (contractAddress) {
          // Verify contract is actually deployed
          const state = await this.tonService.getContractState(contractAddress);
          if (state?.state === 'active') {
            console.log('Contract deployment confirmed:', contractAddress);
            return contractAddress;
          }
        }
      } catch (error) {
        console.log('Waiting for deployment confirmation...');
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.warn('Contract deployment confirmation timeout');
    return null;
  }

  /**
   * Verify contract deployment
   */
  async verifyContractDeployment(contractAddress: string): Promise<boolean> {
    try {
      const state = await this.tonService.getContractState(contractAddress);
      return state?.state === 'active';
    } catch (error) {
      console.error('Error verifying contract:', error);
      return false;
    }
  }

  /**
   * Get contract balance
   */
  async getContractBalance(contractAddress: string): Promise<number> {
    try {
      return await this.tonService.getBalance(contractAddress);
    } catch (error) {
      console.error('Error getting contract balance:', error);
      return 0;
    }
  }

  /**
   * Get contract address from factory (synchronously checks if already deployed)
   */
  async getContractAddress(channelId: number): Promise<string | null> {
    const factoryAddress = process.env.FACTORY_CONTRACT_ADDRESS;

    if (!factoryAddress) {
      throw new Error('Factory contract address not configured');
    }

    try {
      return await this.tonService.getContractAddressFromFactory(factoryAddress, channelId);
    } catch (error) {
      console.error('Error getting contract address:', error);
      return null;
    }
  }

}
