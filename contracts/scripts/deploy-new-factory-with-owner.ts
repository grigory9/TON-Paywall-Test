/**
 * Deploy New Factory with Generated Owner Wallet
 * This creates a new owner wallet, deploys the factory, and saves the mnemonic
 */

import { Address, toNano, beginCell, internal } from '@ton/core';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { SubscriptionFactory } from '../build/SubscriptionFactory_SubscriptionFactory';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('\n========================================');
    console.log('DEPLOY NEW FACTORY WITH NEW OWNER');
    console.log('========================================\n');

    const network = 'testnet';
    const endpoint = 'https://testnet.toncenter.com/api/v2/jsonRPC';

    console.log(`🌐 Network: ${network}`);
    console.log(`📡 Endpoint: ${endpoint}\n`);

    // Step 1: Generate NEW owner wallet
    console.log('Step 1: Generating new owner wallet...\n');

    const ownerMnemonic = await mnemonicNew(24);
    const ownerKeyPair = await mnemonicToPrivateKey(ownerMnemonic);
    const ownerWallet = WalletContractV4.create({
        workchain: 0,
        publicKey: ownerKeyPair.publicKey
    });

    const ownerAddress = ownerWallet.address;

    console.log('✅ Owner wallet generated!');
    console.log(`   Address: ${ownerAddress.toString()}\n`);

    console.log('🔑 OWNER MNEMONIC (24 words):');
    console.log('─────────────────────────────────────────────────────────');
    console.log(ownerMnemonic.join(' '));
    console.log('─────────────────────────────────────────────────────────\n');

    console.log('⚠️  CRITICAL: Save this mnemonic in COLD STORAGE!');
    console.log('   This wallet has FULL CONTROL over the factory.\n');

    // Initialize TON client
    const client = new TonClient({ endpoint });

    // Check if owner wallet is funded
    const ownerContract = client.open(ownerWallet);
    const balance = await ownerContract.getBalance();

    console.log(`💰 Owner Balance: ${Number(balance) / 1e9} TON`);

    if (balance < toNano('0.2')) {
        console.log('\n⚠️  Owner wallet needs funding!');
        console.log(`   Send at least 0.5 TON to: ${ownerAddress.toString()}`);
        console.log(`   Testnet faucet: https://testnet.tonscan.org/faucet\n`);

        // Save details for later
        const outputPath = path.join(__dirname, '../.new-factory-owner.txt');
        fs.writeFileSync(outputPath, [
            'NEW FACTORY OWNER WALLET',
            '======================',
            '',
            `Generated: ${new Date().toISOString()}`,
            '',
            'OWNER MNEMONIC (24 words):',
            ownerMnemonic.join(' '),
            '',
            'Owner Address:',
            ownerAddress.toString(),
            '',
            'NEXT STEPS:',
            '1. Send 0.5 TON to owner address',
            '2. Re-run this script to deploy factory',
            ''
        ].join('\n'));

        console.log(`📄 Details saved to: .new-factory-owner.txt`);
        console.log('   Re-run this script after funding.\n');
        return;
    }

    // Step 2: Deploy factory contract
    console.log('\nStep 2: Deploying factory contract...\n');

    const factory = client.open(await SubscriptionFactory.fromInit(ownerAddress));
    const factoryAddress = factory.address;

    console.log(`📍 Factory Address: ${factoryAddress.toString()}`);

    // Check if already deployed
    const contractState = await client.getContractState(factoryAddress);

    if (contractState.state === 'active') {
        console.log('✅ Factory already deployed!\n');
    } else {
        console.log('⏳ Deploying factory contract...');
        console.log('💰 Cost: ~0.05 TON\n');

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
                        .storeUint(0, 64)
                        .endCell()
                })
            ]
        });

        console.log('⏳ Waiting for deployment...');

        // Wait for seqno increment
        let currentSeqno = seqno;
        while (currentSeqno === seqno) {
            await sleep(2000);
            currentSeqno = await ownerContract.getSeqno();
        }

        await sleep(5000);

        console.log('✅ Factory deployed!\n');
    }

    // Save configuration
    const configPath = path.join(__dirname, '../.factory-config.txt');
    fs.writeFileSync(configPath, [
        'FACTORY DEPLOYMENT COMPLETE',
        '===========================',
        '',
        `Deployed: ${new Date().toISOString()}`,
        `Network: ${network}`,
        '',
        'FACTORY ADDRESS:',
        factoryAddress.toString(),
        '',
        'OWNER ADDRESS:',
        ownerAddress.toString(),
        '',
        'OWNER MNEMONIC (24 words):',
        ownerMnemonic.join(' '),
        '',
        '⚠️  SECURITY:',
        '- Store owner mnemonic in COLD STORAGE (hardware wallet/paper)',
        '- NEVER commit this mnemonic to git',
        '- Use deployer role pattern for backend operations',
        ''
    ].join('\n'));

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ FACTORY DEPLOYED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📋 Configuration:');
    console.log(`   Factory: ${factoryAddress.toString()}`);
    console.log(`   Owner: ${ownerAddress.toString()}\n`);

    console.log('📝 Next Steps:\n');

    console.log('1. 📄 Update .env files:');
    console.log(`   FACTORY_CONTRACT_ADDRESS="${factoryAddress.toString()}"\n`);

    console.log('2. 🔐 Setup deployer role:');
    console.log('   a. Update contracts/.env with owner mnemonic');
    console.log('   b. Run: npx ts-node scripts/generate-deployer-wallet.ts');
    console.log('   c. Fund deployer wallet with ~1 TON');
    console.log('   d. Run: npx ts-node scripts/authorize-deployer.ts\n');

    console.log('3. 💾 Store owner mnemonic securely:');
    console.log('   - Save to hardware wallet or paper');
    console.log('   - NEVER keep on server after deployer setup');
    console.log('   - Saved to: .factory-config.txt (DELETE after saving)\n');

    console.log('📊 Verify on TONScan:');
    console.log(`   https://testnet.tonscan.org/address/${factoryAddress.toString()}\n`);

    console.log('✅ Setup complete!');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
