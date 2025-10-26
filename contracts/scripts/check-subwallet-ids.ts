/**
 * Check wallet addresses with different subwallet IDs
 */

import { mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';

const mnemonic = "style mad venture space protect steel alley wise wink shed board final casual hole feature vintage course switch debate flower nice swallow typical siren".split(' ');

(async () => {
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const targetAddress = '0QBKghuEDfi-16V6oCrOps8r_06aJowxUhNtkL64t_YR4lVa';

    console.log('\n=== Checking v4R2 with Different Subwallet IDs ===\n');
    console.log('Looking for:', targetAddress, '\n');

    // Check subwallet IDs 0-10
    for (let subwalletId = 0; subwalletId <= 10; subwalletId++) {
        const wallet = WalletContractV4.create({
            workchain: 0,
            publicKey: keyPair.publicKey,
            walletId: subwalletId
        });

        const testnetNonBounce = wallet.address.toString({ testOnly: true, bounceable: false });
        const testnetBounce = wallet.address.toString({ testOnly: true, bounceable: true });

        console.log(`Subwallet ID ${subwalletId}:`);
        console.log(`  Non-Bounceable: ${testnetNonBounce}`);

        if (testnetNonBounce === targetAddress) {
            console.log(`  ✅ ✅ ✅ MATCH FOUND!`);
            console.log(`  Wallet Version: v4R2`);
            console.log(`  Subwallet ID: ${subwalletId}`);
            console.log(`  Bounceable: ${testnetBounce}`);
            break;
        }
    }
})();
