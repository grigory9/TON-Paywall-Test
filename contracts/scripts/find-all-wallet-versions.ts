/**
 * Check ALL possible wallet versions
 */

import { mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV1R1, WalletContractV1R2, WalletContractV1R3,
         WalletContractV2R1, WalletContractV2R2,
         WalletContractV3R1, WalletContractV3R2,
         WalletContractV4, WalletContractV5R1 } from '@ton/ton';

const mnemonic = "style mad venture space protect steel alley wise wink shed board final casual hole feature vintage course switch debate flower nice swallow typical siren".split(' ');

(async () => {
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const targetAddress = '0QBKghuEDfi-16V6oCrOps8r_06aJowxUhNtkL64t_YR4lVa';

    console.log('\n=== Checking ALL Wallet Versions ===\n');
    console.log('Looking for:', targetAddress, '\n');

    const versions = [
        { name: 'v1R1', wallet: WalletContractV1R1.create({ workchain: 0, publicKey: keyPair.publicKey }) },
        { name: 'v1R2', wallet: WalletContractV1R2.create({ workchain: 0, publicKey: keyPair.publicKey }) },
        { name: 'v1R3', wallet: WalletContractV1R3.create({ workchain: 0, publicKey: keyPair.publicKey }) },
        { name: 'v2R1', wallet: WalletContractV2R1.create({ workchain: 0, publicKey: keyPair.publicKey }) },
        { name: 'v2R2', wallet: WalletContractV2R2.create({ workchain: 0, publicKey: keyPair.publicKey }) },
        { name: 'v3R1', wallet: WalletContractV3R1.create({ workchain: 0, publicKey: keyPair.publicKey }) },
        { name: 'v3R2', wallet: WalletContractV3R2.create({ workchain: 0, publicKey: keyPair.publicKey }) },
        { name: 'v4R2', wallet: WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey }) },
        { name: 'v5R1', wallet: WalletContractV5R1.create({ workchain: 0, publicKey: keyPair.publicKey }) },
    ];

    for (const { name, wallet } of versions) {
        const testnetBounce = wallet.address.toString({ testOnly: true, bounceable: true });
        const testnetNonBounce = wallet.address.toString({ testOnly: true, bounceable: false });

        console.log(`${name}:`);
        console.log(`  Bounceable:     ${testnetBounce}`);
        console.log(`  Non-Bounceable: ${testnetNonBounce}`);

        if (testnetNonBounce === targetAddress || testnetBounce === targetAddress.replace('0Q', 'kQ')) {
            console.log(`  ✅ ✅ ✅ MATCH FOUND! This is wallet version: ${name}`);
        }
        console.log();
    }
})();
