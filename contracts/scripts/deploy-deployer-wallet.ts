/**
 * Deploy Deployer Wallet Contract
 * The wallet has funds but the contract isn't deployed yet
 */

import { Address, toNano, beginCell, internal } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4 } from '@ton/ton';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log('\n========================================');
    console.log('DEPLOY DEPLOYER WALLET CONTRACT');
    console.log('========================================\n');

    // Deployer mnemonic
    const deployerMnemonicStr = process.env.DEPLOYER_MNEMONIC;
    if (!deployerMnemonicStr) {
        // Read from admin-bot .env
        const adminEnvPath = '/home/gmet/workspace/ton-paywall/admin-bot/.env';
        const fs = require('fs');
        const content = fs.readFileSync(adminEnvPath, 'utf-8');
        const match = content.match(/DEPLOYER_MNEMONIC="([^"]+)"/);
        if (!match) {
            throw new Error('DEPLOYER_MNEMONIC not found');
        }
        process.env.DEPLOYER_MNEMONIC = match[1];
    }

    const deployerMnemonic = (process.env.DEPLOYER_MNEMONIC || '').split(' ');

    console.log('📋 Deployer mnemonic loaded');
    console.log(`   Words: ${deployerMnemonic.length}\n`);

    // Initialize TON client
    const network = 'testnet';
    const endpoint = 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const apiKey = process.env.TON_API_KEY || '48d1010f4b83aef80086a889e221ee2d860d4d30915406c731461829db67f825';

    const client = new TonClient({
        endpoint,
        apiKey
    });

    console.log(`🌐 Network: ${network}`);
    console.log(`📡 Endpoint: ${endpoint}\n`);

    // Initialize deployer wallet
    const deployerKeyPair = await mnemonicToPrivateKey(deployerMnemonic);
    const deployerWallet = WalletContractV4.create({
        workchain: 0,
        publicKey: deployerKeyPair.publicKey
    });

    const deployerContract = client.open(deployerWallet);
    const deployerAddress = deployerWallet.address;

    console.log(`📍 Deployer Address: ${deployerAddress.toString()}\n`);

    // Check wallet state
    try {
        const state = await client.getContractState(deployerAddress);
        console.log(`Contract State: ${state.state}`);

        const balance = await deployerContract.getBalance();
        console.log(`Balance: ${Number(balance) / 1e9} TON\n`);

        if (state.state === 'active') {
            console.log('✅ Deployer wallet already deployed!');
            console.log('   No action needed.\n');
            return;
        }

        if (balance < toNano('0.01')) {
            throw new Error('Insufficient balance to deploy wallet. Need at least 0.01 TON.');
        }

        console.log('⏳ Deploying wallet contract...');
        console.log('   Sending initialization transaction...\n');

        // Send a small amount to self to deploy the wallet
        await deployerContract.sendTransfer({
            seqno: 0, // First transaction from uninitialized wallet
            secretKey: deployerKeyPair.secretKey,
            messages: [
                internal({
                    to: deployerAddress,
                    value: toNano('0.001'), // Tiny amount to self
                    bounce: false,
                    body: beginCell().endCell() // Empty message
                })
            ]
        });

        console.log('✅ Deployment transaction sent!');
        console.log('⏳ Waiting for confirmation...\n');

        // Wait for wallet to become active
        await sleep(10000);

        const newState = await client.getContractState(deployerAddress);
        console.log(`New Contract State: ${newState.state}\n`);

        if (newState.state === 'active') {
            console.log('═══════════════════════════════════════════════════════════');
            console.log('✅ DEPLOYER WALLET DEPLOYED SUCCESSFULLY');
            console.log('═══════════════════════════════════════════════════════════\n');

            const finalBalance = await deployerContract.getBalance();
            console.log(`Final Balance: ${Number(finalBalance) / 1e9} TON`);
            console.log(`Address: ${deployerAddress.toString()}\n`);

            console.log('✅ Wallet is now ready for use!');
            console.log('   Backend can now send transactions from this wallet.\n');
        } else {
            console.log('⚠️  Warning: Wallet may not be fully deployed yet.');
            console.log('   Wait a few more seconds and check again.\n');
        }

    } catch (error: any) {
        console.error('Error:', error.message);
        throw error;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
