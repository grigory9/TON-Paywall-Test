#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     TON Subscription Paywall - Factory Contract Deploy      ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

// Check if contracts are built
const buildDir = path.join(__dirname, '../build');
const factoryCodePath = path.join(buildDir, 'SubscriptionFactory_SubscriptionFactory.code.boc');

if (!fs.existsSync(factoryCodePath)) {
    console.log('❌ Contracts not built yet!');
    console.log('');
    console.log('Run this first:');
    console.log('  npm run build');
    console.log('');
    process.exit(1);
}

console.log('✅ Contracts compiled successfully!');
console.log('');
console.log('📦 Build files location:');
console.log(`   ${buildDir}`);
console.log('');
console.log('📋 Deployment Instructions');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('For MVP launch, use one of these methods:');
console.log('');
console.log('1️⃣  TON Blueprint (Recommended)');
console.log('   npm install -g @ton/blueprint');
console.log('   npx blueprint run');
console.log('');
console.log('2️⃣  Manual via TONScan');
console.log('   https://testnet.tonscan.org → Deploy Contract');
console.log('   Upload: SubscriptionFactory_SubscriptionFactory.code.boc');
console.log('');
console.log('3️⃣  Deploy from bot service (has all dependencies)');
console.log('   cd admin-bot && npm run deploy-factory');
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('📖 Detailed instructions:');
console.log('   contracts/DEPLOY_INSTRUCTIONS.md');
console.log('   MVP_LAUNCH_GUIDE.md');
console.log('');
console.log('⚠️  IMPORTANT:');
console.log('   1. Test on TESTNET first!');
console.log('   2. Get testnet TON: https://testnet.tonfaucet.com');
console.log('   3. After deployment, add address to .env:');
console.log('      FACTORY_CONTRACT_ADDRESS=<your_contract_address>');
console.log('');

// Check current configuration
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');

    if (envContent.includes('FACTORY_CONTRACT_ADDRESS=EQ')) {
        console.log('✅ Factory address already configured in .env');

        // Extract address
        const match = envContent.match(/FACTORY_CONTRACT_ADDRESS=(EQ[a-zA-Z0-9_-]+)/);
        if (match) {
            const address = match[1];
            console.log(`   Address: ${address}`);
            console.log('');
            console.log('   Verify on TONScan:');
            console.log(`   https://testnet.tonscan.org/address/${address}`);
            console.log('');
        }
    } else if (envContent.includes('FACTORY_CONTRACT_ADDRESS=')) {
        console.log('⚠️  Factory address in .env but may not be set correctly');
        console.log('   Update .env with actual deployed address');
        console.log('');
    } else {
        console.log('⚠️  FACTORY_CONTRACT_ADDRESS not found in .env');
        console.log('   Add it after deploying the contract');
        console.log('');
    }
} else {
    console.log('⚠️  .env file not found');
    console.log('   Copy .env.example to .env and configure');
    console.log('');
}

console.log('════════════════════════════════════════════════════════════════');
console.log('');
