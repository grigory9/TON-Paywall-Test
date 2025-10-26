/**
 * Generate Deployer Wallet
 * Step 1: Generate new deployer wallet and display mnemonic
 */

import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('\n========================================');
    console.log('DEPLOYER WALLET GENERATION');
    console.log('========================================\n');

    // Generate new 24-word mnemonic
    const deployerMnemonic = await mnemonicNew(24);
    const deployerKeyPair = await mnemonicToPrivateKey(deployerMnemonic);

    // Create wallet contract
    const deployerWallet = WalletContractV4.create({
        workchain: 0,
        publicKey: deployerKeyPair.publicKey
    });

    const deployerAddress = deployerWallet.address;

    console.log('✅ Deployer wallet generated successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 DEPLOYER WALLET DETAILS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('🔑 DEPLOYER MNEMONIC (24 words):');
    console.log('─────────────────────────────────────────────────────────');
    console.log(deployerMnemonic.join(' '));
    console.log('─────────────────────────────────────────────────────────\n');

    console.log('📍 Deployer Address (Testnet):');
    console.log(deployerAddress.toString({ testOnly: true, bounceable: true }));
    console.log('\n');

    console.log('📍 Deployer Address (Raw):');
    console.log(deployerAddress.toString({ testOnly: false, bounceable: true }));
    console.log('\n');

    // Save to file for reference
    const outputPath = path.join(__dirname, '../.deployer-wallet.txt');
    const content = [
        'DEPLOYER WALLET GENERATED',
        '========================',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        'DEPLOYER MNEMONIC (24 words):',
        deployerMnemonic.join(' '),
        '',
        'Deployer Address (Testnet):',
        deployerAddress.toString({ testOnly: true, bounceable: true }),
        '',
        'Deployer Address (Raw):',
        deployerAddress.toString({ testOnly: false, bounceable: true }),
        '',
        'NEXT STEPS:',
        '1. Send ~1 TON to the deployer address for gas fees',
        '2. Wait for transaction confirmation',
        '3. Run: npx ts-node scripts/authorize-deployer.ts',
        '',
        '⚠️  SECURITY:',
        '- Store this mnemonic securely',
        '- Add to server .env as DEPLOYER_MNEMONIC',
        '- DELETE this file after copying mnemonic',
        ''
    ].join('\n');

    fs.writeFileSync(outputPath, content);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 NEXT STEPS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('1. 💰 Fund the deployer wallet:');
    console.log('   Send ~1 TON to the address above\n');

    console.log('2. ⏳ Wait for confirmation:');
    console.log('   Check transaction on:');
    console.log(`   https://testnet.tonscan.org/address/${deployerAddress.toString()}\n`);

    console.log('3. 🔐 Authorize deployer:');
    console.log('   After funding, run:');
    console.log('   npx ts-node scripts/authorize-deployer.ts\n');

    console.log('4. 📋 Save mnemonic:');
    console.log('   Details saved to: .deployer-wallet.txt');
    console.log('   ⚠️  DELETE this file after copying mnemonic!\n');

    console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
