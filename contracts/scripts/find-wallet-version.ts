/**
 * Find which wallet version matches the address
 */

import { mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton';

const mnemonic = "style mad venture space protect steel alley wise wink shed board final casual hole feature vintage course switch debate flower nice swallow typical siren".split(' ');

(async () => {
    const keyPair = await mnemonicToPrivateKey(mnemonic);

    console.log('\n=== Wallet Version Check ===\n');

    // v3R1
    const v3r1 = WalletContractV3R1.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    });
    console.log('v3R1:');
    console.log('  Testnet (bounceable):    ', v3r1.address.toString({ testOnly: true, bounceable: true }));
    console.log('  Testnet (non-bounceable):', v3r1.address.toString({ testOnly: true, bounceable: false }));

    // v3R2
    const v3r2 = WalletContractV3R2.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    });
    console.log('\nv3R2:');
    console.log('  Testnet (bounceable):    ', v3r2.address.toString({ testOnly: true, bounceable: true }));
    console.log('  Testnet (non-bounceable):', v3r2.address.toString({ testOnly: true, bounceable: false }));

    // v4R2
    const v4 = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    });
    console.log('\nv4R2:');
    console.log('  Testnet (bounceable):    ', v4.address.toString({ testOnly: true, bounceable: true }));
    console.log('  Testnet (non-bounceable):', v4.address.toString({ testOnly: true, bounceable: false }));

    // v5R1
    const v5 = WalletContractV5R1.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    });
    console.log('\nv5R1 (W5):');
    console.log('  Testnet (bounceable):    ', v5.address.toString({ testOnly: true, bounceable: true }));
    console.log('  Testnet (non-bounceable):', v5.address.toString({ testOnly: true, bounceable: false }));

    console.log('\n=== Looking for: 0QBKghuEDfi-16V6oCrOps8r_06aJowxUhNtkL64t_YR4lVa ===\n');

    const targetAddress = '0QBKghuEDfi-16V6oCrOps8r_06aJowxUhNtkL64t_YR4lVa';

    if (v3r1.address.toString({ testOnly: true, bounceable: false }) === targetAddress) {
        console.log('✅ MATCH: v3R1');
    }
    if (v3r2.address.toString({ testOnly: true, bounceable: false }) === targetAddress) {
        console.log('✅ MATCH: v3R2');
    }
    if (v4.address.toString({ testOnly: true, bounceable: false }) === targetAddress) {
        console.log('✅ MATCH: v4R2');
    }
    if (v5.address.toString({ testOnly: true, bounceable: false }) === targetAddress) {
        console.log('✅ MATCH: v5R1 (W5)');
    }
})();
