/**
 * Test Deployment Transaction Generation
 * Verifies that generateDeploymentTransaction() produces correct address format
 */

import { createTonService } from '../shared/ton-client.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const FACTORY_ADDRESS = process.env.FACTORY_CONTRACT_ADDRESS || '';
const TON_NETWORK = (process.env.TON_NETWORK || 'testnet') as 'mainnet' | 'testnet';

console.log('═══════════════════════════════════════════════════════════');
console.log('Deployment Transaction Test');
console.log('═══════════════════════════════════════════════════════════\n');

if (!FACTORY_ADDRESS || FACTORY_ADDRESS === 'EQC...') {
  console.error('❌ FACTORY_CONTRACT_ADDRESS not configured in .env');
  process.exit(1);
}

async function testDeploymentTransaction() {
  try {
    // Create TON service
    const tonService = createTonService(TON_NETWORK);
    await tonService.init();

    console.log(`Network: ${TON_NETWORK}`);
    console.log(`Factory Address (from .env): ${FACTORY_ADDRESS}\n`);

    // Test parameters (example channel setup)
    const testParams = {
      factoryAddress: FACTORY_ADDRESS,
      channelId: -1001234567890, // Example Telegram channel ID
      adminWallet: 'UQBvI0aFLnw2QbZgjMPCLRdtRHxhUyinQudg6sdiohIwg5jL', // Example testnet wallet
      monthlyPrice: 5 // 5 TON per month
    };

    console.log('Test Parameters:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`Channel ID: ${testParams.channelId}`);
    console.log(`Admin Wallet: ${testParams.adminWallet}`);
    console.log(`Monthly Price: ${testParams.monthlyPrice} TON\n`);

    // Generate deployment transaction
    console.log('Generating deployment transaction...\n');
    const transaction = tonService.generateDeploymentTransaction(
      testParams.factoryAddress,
      testParams.channelId,
      testParams.adminWallet,
      testParams.monthlyPrice
    );

    console.log('Generated Transaction:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`Address: ${transaction.address}`);
    console.log(`Amount: ${transaction.amount} nanoTON (${Number(transaction.amount) / 1e9} TON)`);
    console.log(`Bounce: ${transaction.bounce}`);
    console.log(`Payload length: ${transaction.payload.length} bytes (base64)\n`);

    // Verify address format
    const addressPrefix = transaction.address.substring(0, 2);
    const expectedPrefix = TON_NETWORK === 'testnet' ? 'kQ' : 'EQ';

    console.log('Address Format Verification:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`Expected Prefix: ${expectedPrefix}`);
    console.log(`Actual Prefix: ${addressPrefix}`);

    if (addressPrefix === expectedPrefix) {
      console.log(`\n✅ SUCCESS: Transaction address has correct prefix for ${TON_NETWORK}`);
      console.log('✅ This transaction should be accepted by wallet apps\n');
    } else {
      console.log(`\n❌ FAILED: Expected prefix "${expectedPrefix}" but got "${addressPrefix}"`);
      console.log('❌ Wallet apps will reject this transaction!\n');
      process.exit(1);
    }

    // Show what TON Connect will send
    console.log('TON Connect Payload (what will be sent to wallet):');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(JSON.stringify({
      messages: [{
        address: transaction.address,
        amount: transaction.amount,
        payload: transaction.payload.substring(0, 50) + '...',
        bounce: transaction.bounce
      }],
      validUntil: Math.floor(Date.now() / 1000) + 600
    }, null, 2));

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Test Result: PASSED');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testDeploymentTransaction();
