/**
 * EMERGENCY: Revoke Deployer Access
 *
 * Use this script if:
 * - Backend server is compromised
 * - Deployer wallet is compromised
 * - Need to rotate deployer credentials
 *
 * REQUIRES: FACTORY_OWNER_MNEMONIC (cold storage)
 *
 * Run with: npx ts-node scripts/revoke-deployer.ts
 */

import { Address, toNano } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4 } from '@ton/ton';
import * as dotenv from 'dotenv';

dotenv.config();

import { SubscriptionFactory } from '../wrappers/SubscriptionFactory';

async function main() {
    console.log('\n========================================');
    console.log('⚠️  EMERGENCY DEPLOYER REVOCATION ⚠️');
    console.log('========================================\n');

    const ownerMnemonicStr = process.env.FACTORY_OWNER_MNEMONIC;
    if (!ownerMnemonicStr) {
        throw new Error('FACTORY_OWNER_MNEMONIC required - retrieve from cold storage');
    }

    const factoryAddressStr = process.env.FACTORY_CONTRACT_ADDRESS;
    if (!factoryAddressStr) {
        throw new Error('FACTORY_CONTRACT_ADDRESS not found in .env');
    }

    const network = process.env.TON_NETWORK || 'testnet';

    console.log(`Network: ${network}`);
    console.log(`Factory: ${factoryAddressStr}\n`);

    // Initialize TON client
    const endpoint = network === 'mainnet'
        ? 'https://toncenter.com/api/v2/jsonRPC'
        : 'https://testnet.toncenter.com/api/v2/jsonRPC';

    const client = new TonClient({ endpoint });

    // Initialize owner wallet
    const ownerMnemonic = ownerMnemonicStr.split(' ');
    const ownerKeyPair = await mnemonicToPrivateKey(ownerMnemonic);
    const ownerWallet = WalletContractV4.create({
        workchain: 0,
        publicKey: ownerKeyPair.publicKey
    });

    console.log(`Owner wallet: ${ownerWallet.address.toString()}`);

    // Open factory contract
    const factoryAddress = Address.parse(factoryAddressStr);
    const factory = SubscriptionFactory.createFromAddress(factoryAddress);
    const factoryContract = client.open(factory);

    // Check current deployer
    const currentDeployer = await factoryContract.getDeployer();
    console.log(`Current deployer: ${currentDeployer.toString()}`);

    if (currentDeployer.equals(ownerWallet.address)) {
        console.log('\n✅ Deployer already set to owner - no action needed');
        console.log('(Owner is default deployer when no separate deployer set)\n');
        return;
    }

    console.log('\n⚠️  This will REVOKE deployer access and set deployer back to owner');
    console.log('Backend will NOT be able to register deployments until new deployer set');
    console.log('\nType "REVOKE" to confirm: ');

    // Wait for user confirmation (in Node.js environment)
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const confirmed = await new Promise<boolean>(resolve => {
        readline.question('', (answer: string) => {
            readline.close();
            resolve(answer.trim() === 'REVOKE');
        });
    });

    if (!confirmed) {
        console.log('\n❌ Revocation cancelled\n');
        return;
    }

    // Send SetDeployer message (set back to owner)
    console.log('\nRevoking deployer access...');

    const ownerContract = client.open(ownerWallet);
    const seqno = await ownerContract.getSeqno();

    await ownerContract.sendTransfer({
        seqno,
        secretKey: ownerKeyPair.secretKey,
        messages: [{
            to: factoryAddress,
            value: toNano('0.05'),
            body: factory.createSetDeployerMessage(ownerWallet.address) // Set to owner
        }]
    });

    console.log('Transaction sent. Waiting for confirmation...');

    // Wait for transaction
    let currentSeqno = seqno;
    while (currentSeqno === seqno) {
        await sleep(2000);
        currentSeqno = await ownerContract.getSeqno();
    }

    console.log('✅ Transaction confirmed\n');

    // Verify deployer was revoked
    const newDeployer = await factoryContract.getDeployer();
    console.log(`New deployer: ${newDeployer.toString()}`);

    if (!newDeployer.equals(ownerWallet.address)) {
        throw new Error('Failed to revoke deployer - verification mismatch');
    }

    console.log('\n========================================');
    console.log('✅ DEPLOYER ACCESS REVOKED');
    console.log('========================================\n');

    console.log('NEXT STEPS:');
    console.log('1. Remove compromised DEPLOYER_MNEMONIC from server');
    console.log('2. Run setup-deployer-role.ts to generate NEW deployer wallet');
    console.log('3. Update server .env with new DEPLOYER_MNEMONIC');
    console.log('4. Return owner mnemonic to cold storage\n');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
