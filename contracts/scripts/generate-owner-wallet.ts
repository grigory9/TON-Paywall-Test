import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';

(async () => {
    console.log('\n=== Generating New Factory Owner Wallet ===\n');

    // Generate new 24-word mnemonic
    const mnemonic = await mnemonicNew(24);
    const keyPair = await mnemonicToPrivateKey(mnemonic);

    // Create v4R2 wallet
    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    });

    console.log('✅ New wallet generated!\n');
    console.log('🔑 Mnemonic (SAVE THIS SECURELY):');
    console.log('   ' + mnemonic.join(' '));
    console.log('\n📍 Testnet Address (non-bounceable):');
    console.log('   ' + wallet.address.toString({ testOnly: true, bounceable: false }));
    console.log('\n📍 Testnet Address (bounceable):');
    console.log('   ' + wallet.address.toString({ testOnly: true, bounceable: true }));
    console.log('\n📍 Mainnet Address (for reference):');
    console.log('   ' + wallet.address.toString({ testOnly: false, bounceable: true }));
    console.log('\n📝 Next Steps:');
    console.log('1. Send 1-2 TON to the testnet address above');
    console.log('2. Save the mnemonic to contracts/.env as FACTORY_OWNER_MNEMONIC');
    console.log('3. Deploy the factory using this wallet\n');
})();
