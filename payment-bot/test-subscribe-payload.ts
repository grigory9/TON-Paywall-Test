/**
 * Test script to verify "Subscribe" payload generation
 *
 * This script verifies that the payload we send matches what the contract expects.
 * Run with: npx ts-node test-subscribe-payload.ts
 */

import { beginCell, Cell } from '@ton/core';

console.log('🧪 Testing "Subscribe" payload generation\n');

// Generate the payload exactly as the payment bot does
const subscribePayload = beginCell()
  .storeUint(0, 32) // Text comment opcode (0 = text comment)
  .storeStringTail("Subscribe") // The exact text the contract expects
  .endCell();

// Convert to base64 (format used in TON Connect)
const base64Payload = subscribePayload.toBoc().toString('base64');

console.log('✅ Payload generated successfully\n');
console.log('📦 Cell structure:');
console.log('   - Opcode: 0 (text comment)');
console.log('   - Text: "Subscribe"');
console.log('   - Total bits:', subscribePayload.bits.toString());
console.log();

console.log('📋 Base64 payload (for TON Connect):');
console.log(base64Payload);
console.log();

console.log('🔍 Hex representation:');
console.log(subscribePayload.toBoc().toString('hex'));
console.log();

// Verify we can parse it back
try {
  const parsedCell = Cell.fromBase64(base64Payload);
  const slice = parsedCell.beginParse();

  const opcode = slice.loadUint(32);
  const text = slice.loadStringTail();

  console.log('✅ Payload verification:');
  console.log(`   - Opcode: ${opcode} (expected: 0)`);
  console.log(`   - Text: "${text}" (expected: "Subscribe")`);
  console.log();

  if (opcode === 0 && text === "Subscribe") {
    console.log('🎉 SUCCESS! Payload is correctly formatted.');
    console.log('   The contract will accept this message.');
  } else {
    console.log('❌ ERROR! Payload format incorrect.');
    console.log('   The contract will reject this message.');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ ERROR parsing payload:', error);
  process.exit(1);
}

console.log();
console.log('📝 Example transaction format:');
console.log(JSON.stringify({
  messages: [{
    address: 'kQCeTqNA9EHqwwjs2jxH3AafLNspECs-5hZETiklVaSfRMuz', // Example testnet address
    amount: '1000000000', // 1 TON in nanotons
    payload: base64Payload
  }],
  validUntil: Math.floor(Date.now() / 1000) + 300 // 5 minutes
}, null, 2));

console.log();
console.log('🔗 References:');
console.log('   - Contract receiver: contracts/contracts/factory.tact line 273');
console.log('   - Payment bot: payment-bot/src/bot.ts line 797');
console.log('   - TON docs: https://docs.ton.org/develop/smart-contracts/guidelines/message-modes-cookbook');
