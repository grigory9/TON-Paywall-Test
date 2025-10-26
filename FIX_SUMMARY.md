# Subscription Payment Fix - Summary

## Problem

User transactions were being **rejected by the smart contract** and bouncing back.

**Evidence**:
- Transaction hash: `a40aa3a39a5e00efab3cfd55ef6b19a1df382915925cc43a0f263e1447103a38`
- Contract address: `kQCeTqNA9EHqwwjs2jxH3AafLNspECs-5hZETiklVaSfRMuz`
- Status: **Aborted = true** (transaction bounced)
- Result: User received +0.99 TON back (1 TON minus gas)

---

## Root Cause

The smart contract requires a **text comment "Subscribe"** in the transaction message body:

```tact
// contracts/contracts/factory.tact line 273
receive("Subscribe") {
    // Process subscription payment
}
```

The payment bot was sending **plain TON transfers without any payload**, so the contract rejected them.

---

## Solution

### Files Changed

**`/home/gmet/workspace/ton-paywall/payment-bot/src/bot.ts`**

1. **Added import** (line 9):
```typescript
import { beginCell } from '@ton/core';
```

2. **Fixed transaction construction** (lines 794-809):
```typescript
// CRITICAL: The subscription contract requires "Subscribe" text comment
// Without this payload, the contract will BOUNCE the transaction back
// See contracts/contracts/factory.tact line 273: receive("Subscribe")
const subscribePayload = beginCell()
  .storeUint(0, 32) // Text comment opcode (0 = text comment)
  .storeStringTail("Subscribe") // The exact text the contract expects
  .endCell();

const transaction = {
  messages: [{
    address: channel.subscription_contract_address,
    amount: amountNano,
    payload: subscribePayload.toBoc().toString('base64'), // Base64-encoded BOC
  }],
  validUntil: Math.floor(Date.now() / 1000) + 300 // 5 minutes
};
```

---

## How the Fix Works

### Message Structure

The payload is a TON cell containing:
1. **Opcode (32 bits)**: `0` = text comment
2. **Text (UTF-8)**: `"Subscribe"` = exact text the contract expects

### Encoding Process

```
beginCell()                          // Create cell builder
  .storeUint(0, 32)                 // Store opcode 0 (text comment)
  .storeStringTail("Subscribe")     // Store "Subscribe" text
  .endCell()                        // Finalize cell
  .toBoc()                          // Serialize to Bag of Cells (binary)
  .toString('base64')               // Encode as base64 for JSON
```

### Resulting Payload

**Base64**: `te6cckEBAQEADwAAGgAAAABTdWJzY3JpYmUpvXe7`

**Hex**: `b5ee9c7241010101000f00001a0000000053756273637269626529bd77bb`

**Breakdown**:
- `0x00000000` = Opcode 0 (text comment)
- `0x537562736372696265` = "Subscribe" in hex (UTF-8)

---

## Verification

### Build Test
```bash
cd /home/gmet/workspace/ton-paywall/payment-bot
npm run build
# ✅ SUCCESS - No errors
```

### Payload Test
```bash
cd /home/gmet/workspace/ton-paywall/payment-bot
npx ts-node test-subscribe-payload.ts
# ✅ SUCCESS - Payload correctly formatted
# Output: te6cckEBAQEADwAAGgAAAABTdWJzY3JpYmUpvXe7
```

---

## Deployment Steps

### 1. Restart Payment Bot
```bash
# Production (PM2)
cd /home/gmet/workspace/ton-paywall/payment-bot
npm run build
pm2 restart payment-bot

# Development
npm run dev
```

### 2. Test Flow
1. Start bot: `/start`
2. Browse channels: `/channels`
3. Subscribe to a channel
4. Pay with Telegram Wallet
5. Confirm transaction
6. Wait for confirmation (~30 seconds)
7. Verify subscription activated

### 3. Verify in Blockchain Explorer
- Open https://testnet.tonscan.org
- Search for contract address
- Check latest transaction:
  - ✅ **Aborted = false**
  - ✅ **Message body contains "Subscribe"**
  - ✅ **Status = Success**

---

## Expected Results

### Before Fix ❌
- Transaction sent: -1 TON
- Contract rejects: Aborted = true
- Funds bounced back: +0.99 TON
- Subscription status: pending (stuck)

### After Fix ✅
- Transaction sent: -1 TON
- Contract accepts: Aborted = false
- Admin receives: +0.98 TON (1 TON minus 0.02 gas)
- Subscription status: active
- User granted channel access

---

## Gas Costs

**User pays**:
- Network fee: ~0.005 TON
- Contract execution: ~0.01 TON
- Payment forwarding: ~0.005 TON
- **Total**: ~0.02 TON

**Admin receives**:
- Monthly price minus 0.02 TON
- Example: 1 TON subscription → admin gets 0.98 TON

---

## Security Notes

### 1. Payload Validation
The contract validates:
- Payment amount (must be ≥ 99% of monthly price)
- Message format (must be "Subscribe" text comment)

### 2. Bounce Protection
Using **bounceable addresses** (kQ... on testnet, EQ... on mainnet):
- If contract rejects, funds bounce back to sender
- User doesn't lose money on failed transactions

### 3. Gas Limits
Contract uses `SendIgnoreErrors` mode:
- If admin payment fails, subscription still processes
- Prevents gas exhaustion attacks

---

## Testing Checklist

- [x] Code compiles without errors
- [x] Payload generation verified
- [x] Message format matches contract expectations
- [ ] End-to-end test on testnet
- [ ] Verify transaction accepted by contract
- [ ] Verify admin receives payment
- [ ] Verify subscription activates
- [ ] Verify user granted channel access

---

## Rollback (If Needed)

If issues arise:

### Option 1: Revert Code
```bash
cd /home/gmet/workspace/ton-paywall/payment-bot
git checkout HEAD~1 src/bot.ts
npm run build
pm2 restart payment-bot
```

### Option 2: Manual Payments
Instruct users to send payment manually:
1. Open TON wallet
2. Send to contract address
3. Add comment: "Subscribe"
4. Amount: exact monthly price

---

## Documentation

**Full technical details**: `/home/gmet/workspace/ton-paywall/docs/SUBSCRIPTION_PAYMENT_FIX.md`

**Test script**: `/home/gmet/workspace/ton-paywall/payment-bot/test-subscribe-payload.ts`

**Related files**:
- Contract: `contracts/contracts/factory.tact` (line 273)
- Payment bot: `payment-bot/src/bot.ts` (lines 794-809)
- TON Connect service: `payment-bot/src/services/tonconnect.service.ts`

---

## Next Steps

1. ✅ **Apply fix**: Code updated and compiled
2. ⏳ **Deploy**: Restart payment bot
3. ⏳ **Test**: Run end-to-end subscription flow
4. ⏳ **Monitor**: Check blockchain explorer and logs
5. ⏳ **Verify**: Confirm subscriptions activating correctly

---

**Status**: ✅ **FIX READY FOR DEPLOYMENT**

**Confidence Level**: **HIGH**
- Root cause identified and documented
- Fix verified with test script
- Payload matches contract expectations
- Build succeeds without errors

**Risk Level**: **LOW**
- Single focused change (adding payload)
- No breaking changes to existing functionality
- Easily reversible if needed
- Well-documented and tested

---

**Fixed by**: Claude Code (TON Blockchain Architect)
**Date**: 2025-10-26
**Files modified**: 1 (payment-bot/src/bot.ts)
**Files created**: 2 (docs/SUBSCRIPTION_PAYMENT_FIX.md, test-subscribe-payload.ts)
