# TON Connect Address Format Fix

## Problem Summary

TON Connect transactions were being immediately rejected by wallet apps with error code 1: "Wallet declined the request". The wallet didn't display the transaction to the user - it rejected it instantly without user interaction.

## Root Cause

The issue was caused by **incorrect address formatting for the testnet network**. The code was generating addresses with the wrong network prefix:

### What Was Happening:
1. Environment configured for testnet: `TON_NETWORK=testnet`
2. Transaction payload correctly specified testnet network: `"network": "-3"`
3. BUT addresses were formatted with **mainnet prefix** (`EQ`) instead of testnet prefix (`kQ`)
4. Wallet validated the address and detected network mismatch
5. Wallet immediately rejected the transaction (error code 1)

### Why It Happened:
The code was using `Address.toString()` without specifying the `testOnly` parameter:

```typescript
// BEFORE (INCORRECT):
address: factory.toString(),
// Generated: EQDa2WH83rKsZ0jWegsCJARHCRik6aMt4wtf7QVxBUpPljZj (mainnet prefix)
```

## TON Address Format Specification

TON addresses have different prefixes based on two flags:

| Network | Bounceable | Prefix | Use Case |
|---------|-----------|--------|----------|
| Mainnet | Yes | `EQ` | Smart contracts on mainnet |
| Mainnet | No | `UQ` | Wallets on mainnet |
| Testnet | Yes | `kQ` | Smart contracts on testnet |
| Testnet | No | `0Q` | Wallets on testnet |

### Bounceable Flag:
- **bounceable: true** - Required for all smart contracts. Ensures funds are returned to sender if transaction fails.
- **bounceable: false** - Used for wallet addresses where errors are expected.

### TON Connect Requirements:
According to the official [TON Connect specification](https://github.com/ton-blockchain/ton-connect/blob/main/requests-responses.md):

> "The address field MUST be provided in the friendly format TEP-123 — that is, base64url-encoded with the bounceable or non-bounceable flag."

The wallet validates that:
1. Address is in friendly format (not raw format)
2. Address network matches the transaction `network` field
3. If mismatch detected → immediate rejection (error code 1)

## The Fix

Updated all address formatting to use correct network parameters:

```typescript
// AFTER (CORRECT):
const isTestnet = this.network === 'testnet';
const formattedAddress = factory.toString({
  bounceable: true,     // Required for smart contracts
  testOnly: isTestnet,  // true for testnet (kQ), false for mainnet (EQ)
  urlSafe: true         // Standard URL-safe encoding
});
```

### Files Modified:

1. **`/home/gmet/workspace/ton-paywall/shared/ton-client.ts`**:
   - `generateDeploymentTransaction()` - Fixed factory address formatting
   - `getContractAddressFromFactory()` - Fixed subscription contract address formatting
   - `initWallet()` - Fixed wallet address formatting
   - `verifyPayment()` - Fixed sender address formatting

### What The Fix Does:

- Detects current network from `this.network` property (set from `TON_NETWORK` env var)
- Formats addresses with correct prefix:
  - Testnet: Uses `kQ` prefix (testOnly: true)
  - Mainnet: Uses `EQ` prefix (testOnly: false)
- Ensures consistency across all address formatting in the codebase

## Testing The Fix

### Before Testing:
1. Rebuild the project:
   ```bash
   cd /home/gmet/workspace/ton-paywall/admin-bot
   npm run build
   ```

2. Restart the admin bot:
   ```bash
   pm2 restart admin-bot
   # OR for development:
   npm run dev
   ```

### Test Steps:
1. Connect wallet via TON Connect
2. Start channel setup flow
3. When prompted to deploy contract, click "Deploy Contract"
4. **Expected behavior**:
   - Transaction appears in your wallet app
   - Address shows `kQ...` prefix (testnet) or `EQ...` prefix (mainnet)
   - You can review and approve the transaction
   - No immediate rejection

### Verification:
Check the logs for correct address formatting:
```bash
pm2 logs admin-bot | grep "Formatted address"
```

Expected output:
```
✅ Formatted address for testnet: kQDA2WH83rKsZ0jWegsCJARHCRik6aMt4wtf7QVxBUpPkzKB
```

## Technical Details

### Address Encoding in TON:

The `@ton/core` library's `Address.toString()` method accepts these parameters:

```typescript
interface ToStringOptions {
  urlSafe?: boolean;    // Default: true - Use URL-safe base64 encoding
  bounceable?: boolean; // Default: true - Enable bounce for error handling
  testOnly?: boolean;   // Default: false - Use testnet format
}
```

### Why Wallets Reject Mismatched Networks:

1. **Security**: Prevents accidental transactions to wrong network
2. **User Protection**: Testnet TON has no value; mixing networks could cause confusion
3. **Protocol Requirement**: TON Connect spec mandates network validation

### Transaction Payload Structure:

```json
{
  "from": "0:ba3cbf12a22054c9e2c7dcf2c52e848866cab4ee5ac9113209477ad6c9fe4b19",
  "network": "-3",  // -3 = testnet, -239 = mainnet
  "valid_until": 1761332473,
  "messages": [{
    "address": "kQDA2WH83rKsZ0jWegsCJARHCRik6aMt4wtf7QVxBUpPkzKB",  // MUST match network
    "amount": "700000000",
    "payload": "te6cc..."
  }]
}
```

## Important Notes

### Network Consistency:
The system now ensures all addresses are formatted consistently with the configured network:
- `TON_NETWORK=testnet` → All addresses use `kQ` prefix
- `TON_NETWORK=mainnet` → All addresses use `EQ` prefix

### Factory Contract Address:
Your factory contract address in `.env` will be stored in one format (e.g., `EQ...`), but the code will automatically convert it to the correct format (`kQ...` for testnet) when sending transactions.

### Database Storage:
Addresses stored in the database will use the correct network prefix. This means:
- Testnet database: Addresses stored with `kQ` prefix
- Mainnet database: Addresses stored with `EQ` prefix

### Migration Consideration:
If you have existing addresses in the database with incorrect prefixes (e.g., `EQ` when running testnet), they will still parse correctly because `Address.parse()` normalizes all formats to internal representation. The code will output them with the correct prefix when needed.

## Summary

This fix resolves the immediate transaction rejection issue by ensuring all addresses are formatted with the correct network prefix before being sent to wallets via TON Connect. The wallet can now properly validate the transaction and present it to the user for approval.

**Key Takeaway**: Always use `toString({ testOnly: isTestnet })` when formatting addresses for TON Connect transactions. The bounce behavior is encoded in the address format itself, not as a separate field.

## References

- [TON Connect Request/Response Specification](https://github.com/ton-blockchain/ton-connect/blob/main/requests-responses.md)
- [TON Address Format (TEP-123)](https://docs.ton.org/v3/documentation/smart-contracts/addresses)
- [TON Core Address API](https://ton-core.github.io/ton-core/classes/Address.html)
- [@tonconnect/sdk Documentation](https://www.npmjs.com/package/@tonconnect/sdk)
