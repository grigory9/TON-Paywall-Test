/**
 * Non-interactive Factory Deployment for Testnet
 * Uses mnemonic from environment variable
 */

import { Address, toNano, beginCell, internal } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { SubscriptionFactory } from '../build/SubscriptionFactory_SubscriptionFactory';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log('\n🚀 Deploying SubscriptionFactory to Testnet...\n');

    // Get owner mnemonic from environment
    const ownerMnemonicStr = process.env.FACTORY_OWNER_MNEMONIC;
    if (!ownerMnemonicStr) {
        throw new Error('FACTORY_OWNER_MNEMONIC not found in .env - cannot deploy');
    }

    const network = 'testnet';
    const endpoint = 'https://testnet.toncenter.com/api/v2/jsonRPC';

    console.log(`🌐 Network: ${network}`);
    console.log(`📡 Endpoint: ${endpoint}\n`);

    // Initialize TON client
    const client = new TonClient({ endpoint });

    // Initialize owner wallet
    const ownerMnemonic = ownerMnemonicStr.split(' ');
    const ownerKeyPair = await mnemonicToPrivateKey(ownerMnemonic);
    const ownerWallet = WalletContractV4.create({
        workchain: 0,
        publicKey: ownerKeyPair.publicKey
    });

    const ownerContract = client.open(ownerWallet);
    const ownerAddress = ownerWallet.address;

    console.log(`👤 Owner Address: ${ownerAddress.toString()}`);

    // Check wallet balance
    const balance = await ownerContract.getBalance();
    console.log(`💰 Owner Balance: ${Number(balance) / 1e9} TON`);

    if (balance < toNano('0.1')) {
        throw new Error('Insufficient balance. Need at least 0.1 TON for deployment.');
    }

    // Initialize factory
    const factory = client.open(await SubscriptionFactory.fromInit(ownerAddress));
    const factoryAddress = factory.address;

    console.log(`📍 Factory Address: ${factoryAddress.toString()}\n`);

    // Check if already deployed
    const contractState = await client.getContractState(factoryAddress);

    if (contractState.state === 'active') {
        console.log('✅ SubscriptionFactory already deployed!\n');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📋 Factory Address (add to .env):');
        console.log(`   FACTORY_CONTRACT_ADDRESS="${factoryAddress.toString()}"`);
        console.log('═══════════════════════════════════════════════════════════\n');

        console.log('📊 Verify on TONScan:');
        console.log(`   https://testnet.tonscan.org/address/${factoryAddress.toString()}\n`);
        return;
    }

    // Deploy contract
    console.log('⏳ Deploying contract...');
    console.log('💰 Deployment cost: ~0.05 TON\n');

    const seqno = await ownerContract.getSeqno();

    await ownerContract.sendTransfer({
        seqno,
        secretKey: ownerKeyPair.secretKey,
        messages: [
            internal({
                to: factoryAddress,
                value: toNano('0.05'),
                bounce: false,
                body: beginCell()
                    .storeUint(0x4e0e31ed, 32) // Deploy opcode
                    .storeUint(0, 64) // query_id
                    .endCell()
            })
        ]
    });

    console.log('⏳ Waiting for deployment confirmation...');

    // Wait for seqno to increase
    let currentSeqno = seqno;
    while (currentSeqno === seqno) {
        await sleep(2000);
        currentSeqno = await ownerContract.getSeqno();
    }

    // Wait a bit more for contract to activate
    await sleep(5000);

    // Verify deployment
    const newState = await client.getContractState(factoryAddress);
    if (newState.state !== 'active') {
        throw new Error('Deployment failed - contract not active');
    }

    console.log('\n✅ SubscriptionFactory deployed successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Contract Configuration:');
    console.log(`   Factory Address: ${factoryAddress.toString()}`);
    console.log(`   Owner: ${ownerAddress.toString()}`);
    console.log(`   Network: ${network}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📝 Next Steps:\n');
    console.log('1. Update .env files:');
    console.log(`   FACTORY_CONTRACT_ADDRESS="${factoryAddress.toString()}"`);
    console.log(`   FACTORY_OWNER_MNEMONIC="<keep in cold storage>"\n`);

    console.log('2. Verify on TONScan:');
    console.log(`   https://testnet.tonscan.org/address/${factoryAddress.toString()}\n`);

    console.log('3. Run deployer setup:');
    console.log('   npx ts-node scripts/setup-deployer-role.ts\n');

    console.log('✅ Deployment complete!');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
