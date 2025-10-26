import { toNano, Address, beginCell, internal } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { SubscriptionFactory } from '../build/SubscriptionFactory_SubscriptionFactory';
import * as dotenv from 'dotenv';

dotenv.config();

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    console.log('\n========================================');
    console.log('DEPLOY SUBSCRIPTION FACTORY');
    console.log('========================================\n');

    const ownerMnemonicStr = process.env.FACTORY_OWNER_MNEMONIC;
    if (!ownerMnemonicStr) {
        throw new Error('FACTORY_OWNER_MNEMONIC not found in .env');
    }

    const ownerMnemonic = ownerMnemonicStr.split(' ');
    const network = process.env.TON_NETWORK || 'testnet';
    const endpoint = network === 'mainnet'
        ? 'https://toncenter.com/api/v2/jsonRPC'
        : 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const apiKey = process.env.TON_API_KEY || '';

    const client = new TonClient({ endpoint, apiKey });

    // Initialize owner wallet
    const ownerKeyPair = await mnemonicToPrivateKey(ownerMnemonic);
    const ownerWallet = WalletContractV4.create({
        workchain: 0,
        publicKey: ownerKeyPair.publicKey
    });

    const ownerContract = client.open(ownerWallet);
    const ownerAddress = ownerWallet.address;

    console.log('👤 Owner Address:', ownerAddress.toString({ testOnly: network === 'testnet' }));

    // Check balance
    const balance = await ownerContract.getBalance();
    console.log('💰 Balance:', Number(balance) / 1e9, 'TON\n');

    if (balance < toNano('0.2')) {
        throw new Error('Insufficient balance. Need at least 0.2 TON for deployment.');
    }

    // Initialize factory
    const factory = client.open(await SubscriptionFactory.fromInit(ownerAddress));
    const factoryAddress = factory.address;

    console.log('📍 Factory Address:', factoryAddress.toString({ testOnly: network === 'testnet' }));
    console.log('📍 Factory (mainnet format):', factoryAddress.toString({ testOnly: false }));

    // Check if already deployed
    const state = await client.getContractState(factoryAddress);
    if (state.state === 'active') {
        console.log('\n✅ Factory already deployed at this address!');
        console.log('\n📋 Update your .env:');
        console.log('FACTORY_CONTRACT_ADDRESS="' + factoryAddress.toString({ testOnly: false }) + '"');
        return;
    }

    console.log('\n⏳ Deploying factory contract...');

    // Get seqno
    const seqno = await ownerContract.getSeqno();
    console.log('📝 Current seqno:', seqno);

    // Deploy factory
    await ownerContract.sendTransfer({
        seqno,
        secretKey: ownerKeyPair.secretKey,
        messages: [
            internal({
                to: factoryAddress,
                value: toNano('0.1'),
                bounce: false,
                init: {
                    code: (await SubscriptionFactory.fromInit(ownerAddress)).init?.code!,
                    data: (await SubscriptionFactory.fromInit(ownerAddress)).init?.data!
                },
                body: beginCell()
                    .storeUint(0x946a98b6, 32) // Deploy opcode
                    .storeUint(0, 64) // queryId
                    .endCell()
            })
        ]
    });

    console.log('✅ Deployment transaction sent!');
    console.log('⏳ Waiting for confirmation...\n');

    // Wait for deployment
    let attempts = 0;
    const maxAttempts = 30;
    while (attempts < maxAttempts) {
        await sleep(2000);
        const newState = await client.getContractState(factoryAddress);
        if (newState.state === 'active') {
            console.log('✅ FACTORY DEPLOYED SUCCESSFULLY!\n');
            console.log('═══════════════════════════════════════════════════════════');
            console.log('📋 Contract Configuration:');
            console.log('   Factory Address:', factoryAddress.toString({ testOnly: false }));
            console.log('   Owner:', ownerAddress.toString({ testOnly: network === 'testnet' }));
            console.log('   Network:', network);
            console.log('═══════════════════════════════════════════════════════════\n');

            console.log('📝 Next Steps:\n');
            console.log('1. Update .env files:');
            console.log('   FACTORY_CONTRACT_ADDRESS="' + factoryAddress.toString({ testOnly: false }) + '"');
            console.log('\n2. Verify on TONScan:');
            const scanUrl = network === 'mainnet'
                ? 'https://tonscan.org/address/' + factoryAddress.toString({ testOnly: false })
                : 'https://testnet.tonscan.org/address/' + factoryAddress.toString({ testOnly: true });
            console.log('   ' + scanUrl + '\n');
            return;
        }
        attempts++;
        process.stdout.write('.');
    }

    throw new Error('Deployment timeout. Please check TONScan.');
})();
