/**
 * Address Format Verification Script
 * Tests that addresses are formatted correctly for the current network
 */

import { Address } from '@ton/core';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const FACTORY_ADDRESS = process.env.FACTORY_CONTRACT_ADDRESS || '';
const TON_NETWORK = process.env.TON_NETWORK || 'testnet';

console.log('═══════════════════════════════════════════════════════════');
console.log('TON Address Format Verification');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`Network: ${TON_NETWORK}`);
console.log(`Factory Address (from .env): ${FACTORY_ADDRESS}\n`);

if (!FACTORY_ADDRESS || FACTORY_ADDRESS === 'EQC...') {
  console.error('❌ FACTORY_CONTRACT_ADDRESS not configured in .env');
  process.exit(1);
}

try {
  // Parse the address (this normalizes any format to internal representation)
  const factory = Address.parse(FACTORY_ADDRESS);

  console.log('Address Format Variations:');
  console.log('─────────────────────────────────────────────────────────────\n');

  // Test all combinations
  const formats = [
    { name: 'Mainnet Bounceable (EQ)', options: { bounceable: true, testOnly: false, urlSafe: true } },
    { name: 'Mainnet Non-Bounceable (UQ)', options: { bounceable: false, testOnly: false, urlSafe: true } },
    { name: 'Testnet Bounceable (kQ)', options: { bounceable: true, testOnly: true, urlSafe: true } },
    { name: 'Testnet Non-Bounceable (0Q)', options: { bounceable: false, testOnly: true, urlSafe: true } },
  ];

  formats.forEach(({ name, options }) => {
    const formatted = factory.toString(options);
    const prefix = formatted.substring(0, 2);
    console.log(`${name}: ${formatted}`);
    console.log(`  Prefix: ${prefix}\n`);
  });

  console.log('─────────────────────────────────────────────────────────────\n');

  // Show the CORRECT format for current network
  const isTestnet = TON_NETWORK === 'testnet';
  const correctFormat = factory.toString({
    bounceable: true,
    testOnly: isTestnet,
    urlSafe: true
  });

  const expectedPrefix = isTestnet ? 'kQ' : 'EQ';
  const actualPrefix = correctFormat.substring(0, 2);

  console.log(`✅ CORRECT FORMAT FOR ${TON_NETWORK.toUpperCase()}:`);
  console.log(`   ${correctFormat}`);
  console.log(`   Prefix: ${actualPrefix}`);

  if (actualPrefix === expectedPrefix) {
    console.log(`\n✅ SUCCESS: Address has correct prefix "${expectedPrefix}" for ${TON_NETWORK}`);
  } else {
    console.log(`\n❌ ERROR: Expected prefix "${expectedPrefix}" but got "${actualPrefix}"`);
    process.exit(1);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Verification Result: PASSED');
  console.log('═══════════════════════════════════════════════════════════');

} catch (error) {
  console.error('❌ Error parsing factory address:', error);
  console.error('\nPlease check that FACTORY_CONTRACT_ADDRESS in .env is valid.');
  process.exit(1);
}
