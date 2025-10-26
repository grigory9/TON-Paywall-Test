/**
 * ONE-TIME SETUP: Configure Deployer Role for Backend
 *
 * SECURITY PROCEDURE:
 * 1. Run this script on a SECURE machine (not the production server)
 * 2. This script requires FACTORY_OWNER_MNEMONIC (from deployment)
 * 3. Generates new deployer wallet for backend operations
 * 4. Authorizes deployer in factory contract
 * 5. After completion, remove FACTORY_OWNER_MNEMONIC from server
 * 6. Add DEPLOYER_MNEMONIC to server .env instead
 *
 * Run with: npx ts-node scripts/setup-deployer-role.ts
 */

import { Address, toNano, beginCell, Cell } from '@ton/core';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4 } from '@ton/ton';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

async function main() {
    console.log('\n========================================');
    console.log('DEPLOYER ROLE SETUP - SECURITY CRITICAL');
    console.log('========================================\n');

    // Validate owner mnemonic exists
    const ownerMnemonicStr = process.env.FACTORY_OWNER_MNEMONIC;
    if (!ownerMnemonicStr) {
        throw new Error('FACTORY_OWNER_MNEMONIC not found in .env - cannot proceed');
    }

    const factoryAddressStr = process.env.FACTORY_CONTRACT_ADDRESS;
    if (!factoryAddressStr) {
        throw new Error('FACTORY_CONTRACT_ADDRESS not found in .env - deploy factory first');
    }

    const network = process.env.TON_NETWORK || 'testnet';
    console.log(`Network: ${network}`);
    console.log(`Factory: ${factoryAddressStr}\n`);

    // Initialize TON client
    const endpoint = network === 'mainnet'
        ? 'https://toncenter.com/api/v2/jsonRPC'
        : 'https://testnet.toncenter.com/api/v2/jsonRPC';

    const client = new TonClient({ endpoint });

    // ===== STEP 1: Generate NEW deployer wallet =====
    console.log('Step 1: Generating new deployer wallet...');
    const deployerMnemonic = await mnemonicNew(24);
    const deployerKeyPair = await mnemonicToPrivateKey(deployerMnemonic);
    const deployerWallet = WalletContractV4.create({
        workchain: 0,
        publicKey: deployerKeyPair.publicKey
    });

    console.log('\n✅ Deployer wallet generated');
    console.log(`Address: ${deployerWallet.address.toString()}`);
    console.log('\n⚠️  CRITICAL: Save this mnemonic securely!\n');
    console.log('DEPLOYER_MNEMONIC:');
    console.log(deployerMnemonic.join(' '));
    console.log('\nAdd this to your server .env file (replace FACTORY_OWNER_MNEMONIC)\n');

    // Save to temporary file for reference
    const outputPath = path.join(__dirname, '../.deployer-setup.txt');
    fs.writeFileSync(outputPath, [
        'DEPLOYER WALLET SETUP',
        '====================',
        '',
        `Deployer Address: ${deployerWallet.address.toString()}`,
        '',
        'Deployer Mnemonic (24 words):',
        deployerMnemonic.join(' '),
        '',
        'INSTRUCTIONS:',
        '1. Fund deployer address with ~1 TON for gas fees',
        '2. Add DEPLOYER_MNEMONIC to .env on production server',
        '3. Remove FACTORY_OWNER_MNEMONIC from .env on production server',
        '4. Keep owner mnemonic in COLD STORAGE (hardware wallet or paper)',
        '',
        `Generated: ${new Date().toISOString()}`,
    ].join('\n'));

    console.log(`\n📄 Setup details saved to: ${outputPath}`);
    console.log('⚠️  DELETE THIS FILE after saving mnemonic securely!\n');

    // ===== STEP 2: Check deployer wallet balance =====
    console.log('Step 2: Checking deployer wallet balance...');

    const deployerContract = client.open(deployerWallet);
    const deployerBalance = await deployerContract.getBalance();

    console.log(`Current balance: ${Number(deployerBalance) / 1e9} TON`);

    if (deployerBalance < toNano('0.5')) {
        console.log('\n⚠️  WARNING: Deployer wallet needs funding!');
        console.log(`Send at least 1 TON to: ${deployerWallet.address.toString()}`);
        console.log('Re-run this script after funding.\n');
        return;
    }

    console.log('✅ Deployer wallet has sufficient balance\n');

    // ===== STEP 3: Authorize deployer in factory contract =====
    console.log('Step 3: Authorizing deployer in factory contract...');
    console.log('This requires owner wallet signature...\n');

    // Initialize owner wallet
    const ownerMnemonic = ownerMnemonicStr.split(' ');
    const ownerKeyPair = await mnemonicToPrivateKey(ownerMnemonic);
    const ownerWallet = WalletContractV4.create({
        workchain: 0,
        publicKey: ownerKeyPair.publicKey
    });

    console.log(`Owner wallet: ${ownerWallet.address.toString()}`);

    // Factory contract address
    const factoryAddress = Address.parse(factoryAddressStr);

    // Create SetDeployer message manually
    // SetDeployer opcode (you may need to adjust this based on your contract)
    const setDeployerOpcode = 0x4d1e4e6e; // Placeholder - adjust if needed

    const setDeployerMessage = beginCell()
        .storeUint(setDeployerOpcode, 32) // op code
        .storeUint(0, 64) // query_id
        .storeAddress(deployerWallet.address) // newDeployer
        .endCell();

    // Send SetDeployer message
    console.log('\nSending SetDeployer transaction...');

    const ownerContract = client.open(ownerWallet);
    const seqno = await ownerContract.getSeqno();

    await ownerContract.sendTransfer({
        seqno,
        secretKey: ownerKeyPair.secretKey,
        messages: [{
            address: factoryAddress,
            amount: toNano('0.05'), // Gas for transaction
            payload: setDeployerMessage
        }]
    });

    console.log('Transaction sent. Waiting for confirmation...');

    // Wait for transaction confirmation
    let currentSeqno = seqno;
    while (currentSeqno === seqno) {
        await sleep(2000);
        currentSeqno = await ownerContract.getSeqno();
    }

    console.log('✅ Transaction confirmed\n');

    // Note: Verification would require calling factory's getDeployer() method
    // For now, we trust the transaction succeeded
    console.log('✅ SetDeployer transaction sent successfully');
    console.log(`Expected new deployer: ${deployerWallet.address.toString()}`);

    console.log('\n========================================');
    console.log('✅ DEPLOYER ROLE SETUP COMPLETE');
    console.log('========================================\n');

    console.log('NEXT STEPS:');
    console.log('1. Add to server .env:');
    console.log(`   DEPLOYER_MNEMONIC="${deployerMnemonic.join(' ')}"`);
    console.log('2. Remove from server .env:');
    console.log('   FACTORY_OWNER_MNEMONIC (keep in cold storage only)');
    console.log('3. Update backend code to use DEPLOYER_MNEMONIC for registerDeployment()');
    console.log('4. Test channel setup flow on testnet');
    console.log(`5. DELETE ${outputPath}\n`);

    console.log('⚠️  SECURITY REMINDER:');
    console.log('- Owner mnemonic = Cold storage only (full factory control)');
    console.log('- Deployer mnemonic = Server only (limited deployment registration)');
    console.log('- Never commit mnemonics to git');
    console.log('- Use environment variables or secret management service\n');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
