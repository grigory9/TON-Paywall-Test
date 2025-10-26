# TON Connect Transaction Rejection - Bug Fix Summary

## Issue
TON Connect transactions were immediately rejected by wallet apps with error code 1: "Wallet declined the request". The wallet never showed the transaction to the user.

## Root Cause
**Network Mismatch**: Addresses were formatted with wrong network prefix.

- Environment: `TON_NETWORK=testnet`
- Transaction payload: `"network": "-3"` (testnet)
- **Problem**: Address used mainnet prefix `EQ` instead of testnet prefix `kQ`
- **Result**: Wallet detected network mismatch and immediately rejected

## The Fix

Updated `/home/gmet/workspace/ton-paywall/shared/ton-client.ts`:

```typescript
// BEFORE (INCORRECT):
address: factory.toString(),
// Generated: EQ... (mainnet prefix)

// AFTER (CORRECT):
const isTestnet = this.network === 'testnet';
const formattedAddress = factory.toString({
  bounceable: true,     // Required for smart contracts
  testOnly: isTestnet,  // true = kQ (testnet), false = EQ (mainnet)
  urlSafe: true
});
// Generated: kQ... (testnet prefix) ✅
```

## Files Modified

1. `/home/gmet/workspace/ton-paywall/shared/ton-client.ts`:
   - `generateDeploymentTransaction()` - Factory address formatting
   - `getContractAddressFromFactory()` - Contract address formatting
   - `initWallet()` - Wallet address formatting
   - `verifyPayment()` - Sender address formatting

## Testing

Rebuild and restart the bot:
```bash
cd /home/gmet/workspace/ton-paywall/admin-bot
npm run build
pm2 restart admin-bot
```

Test the fix:
```bash
cd /home/gmet/workspace/ton-paywall
npx ts-node scripts/verify-address-format.ts
```

Expected log output:
```
✅ Formatted address for testnet: kQDA2WH83rKsZ0jWegsCJARHCRik6aMt4wtf7QVxBUpPlo3p
```

## What Changed

| Network | Old Prefix | New Prefix | Status |
|---------|-----------|-----------|--------|
| Testnet | `EQ` (wrong) | `kQ` (correct) | ✅ Fixed |
| Mainnet | `EQ` (correct) | `EQ` (correct) | ✅ OK |

## Expected Behavior After Fix

1. User initiates contract deployment
2. Transaction sent to wallet with correct `kQ` address
3. **Wallet accepts and displays transaction to user** (not immediate rejection)
4. User can review and approve/reject

## Technical Details

TON address prefixes:
- `EQ` - Mainnet bounceable (smart contracts)
- `UQ` - Mainnet non-bounceable (wallets)
- `kQ` - Testnet bounceable (smart contracts)
- `0Q` - Testnet non-bounceable (wallets)

TON Connect validates that address network matches transaction `network` field. Mismatch = immediate rejection.

## References

- [TON Connect Specification](https://github.com/ton-blockchain/ton-connect/blob/main/requests-responses.md)
- Full details: `/home/gmet/workspace/ton-paywall/docs/TON_CONNECT_ADDRESS_FIX.md`
