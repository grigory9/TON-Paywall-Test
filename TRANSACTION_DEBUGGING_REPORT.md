# TON Connect Transaction Debugging Report

## Problem Statement
Transaction requests via TON Connect are timing out after 2 minutes without user confirmation. Wallet shows as connected, user has sufficient balance (19.47 TON testnet), but transaction never gets confirmed.

## Analysis Results

### Root Cause Identified
After comparing with the working `ton-roulette` project, the issue is:

**Your implementation sends BINARY CELL PAYLOADS**, while ton-roulette uses **TEXT COMMENT PROTOCOL**.

### Key Differences

| Aspect | Your Implementation | ton-roulette (Working) |
|--------|---------------------|------------------------|
| **Transaction Payload** | Binary cell with DeploySubscription message (opcode 2937566262) | Text comment "create" (opcode 0) |
| **Contract Handler** | `receive(msg: DeploySubscription)` - binary message struct | `receive(msg: String)` - text comment |
| **Parameter Passing** | Encoded in binary cell: channelId, adminWallet, monthlyPrice | Derived from transaction: amount (contains params), sender address |
| **Wallet Display** | Shows as "Smart Contract Interaction" with hex data | Shows as simple transfer with text comment |
| **User Experience** | Confusing hex payload, may not display properly | Clear "Send X TON with comment: create" |

### Transaction Flow Comparison

#### Your Current Flow
```typescript
// 1. Generate binary cell
const deployMessage = beginCell()
  .storeUint(2937566262, 32) // DeploySubscription opcode
  .storeUint(Date.now(), 64) // queryId
  .storeInt(channelId, 64) // channelId as int64
  .storeAddress(admin) // adminWallet
  .storeCoins(toNano(monthlyPrice)) // monthlyPrice
  .endCell();

// 2. Send as base64 payload
payload: deployMessage.toBoc().toString('base64')
```

#### ton-roulette Flow
```typescript
// 1. Encode text comment
const textPayload = beginCell()
  .storeUint(0, 32) // Text comment opcode
  .storeStringTail("create") // Plain text
  .endCell()
  .toBoc()
  .toString('base64');

// 2. Send as text comment payload
payload: textPayload

// 3. Contract receives as String
receive(msg: String) {
    require(msg == "create", "Use text comment: 'create'");
    // ... deploy pool with sender as creator
}
```

### Why Text Comments Work Better

1. **Wallet Compatibility**: Telegram Wallet and other wallets are optimized for text comments
2. **User Clarity**: Users see "Transfer 0.7 TON with comment: create" instead of hex data
3. **Simpler Parsing**: No complex binary cell parsing needed
4. **Proven Pattern**: Used successfully in ton-roulette for months

## Solutions

### Solution 1: Add Text Comment Protocol (RECOMMENDED)

**Pros:**
- Better user experience
- More compatible with Telegram Wallet
- Proven to work (ton-roulette)
- Simpler for users to understand

**Cons:**
- Requires contract modification
- Need to redeploy factory contract
- Tact has limited string parsing capabilities

**Implementation Approach:**

Since Tact cannot easily parse strings to integers, use this strategy:

1. Store deployment parameters in database BEFORE sending transaction
2. Send simple text comment: `"deploy"` or `"deploy:<randomId>"`
3. Contract emits event with sender address
4. Backend monitors events, matches sender to pending deployment in database
5. Backend retrieves parameters from database and completes setup

**Alternative (Simpler):**
- Admin wallet = transaction sender (ctx.sender)
- Monthly price = transaction amount minus deployment fee (0.7 TON - 0.1 TON = 0.6 TON monthly price)
- Channel ID = stored in database, matched after deployment via admin wallet address

### Solution 2: Use stateInit Field (ADVANCED)

**Concept:**
Instead of sending deployment message as payload, send the contract initialization directly via `stateInit` field.

**Pros:**
- No contract changes needed
- Proper TON pattern for contract deployment

**Cons:**
- More complex implementation
- Requires understanding of StateInit format
- May still have wallet compatibility issues

### Solution 3: Improve Current Binary Approach (INVESTIGATION)

**What to try:**

1. **Add Telegram Wallet Deep Link** ✅ DONE
   - Added `https://t.me/wallet` deep link for telegram-wallet
   - Should help users open wallet faster

2. **Verify TON Connect Bridge**
   - Check if wallet is actually receiving the transaction request
   - May need to use different bridge URL

3. **Test with Different Wallet**
   - Try Tonkeeper instead of Telegram Wallet
   - Tonkeeper may handle binary payloads better

4. **Simplify Binary Payload**
   - Remove queryId (not critical)
   - See if simpler payload works better

## Immediate Action Items

### 1. Test Current Fix (Telegram Wallet Deep Link)

The code has been updated to recognize "telegram-wallet" and provide `https://t.me/wallet` as the deep link.

**To test:**
```bash
cd /home/gmet/workspace/ton-paywall/admin-bot
npm run dev
# Then try the setup flow again with the bot
```

**Expected behavior:**
- User should see button: "📱 Open telegram-wallet to Approve"
- Clicking button opens Telegram Wallet
- User should see pending transaction there

### 2. Add Debug Logging

Add more detailed logging to understand what's happening:

```typescript
// In tonconnect.service.ts sendTransaction method
console.log('🔍 Transaction details:', {
  messages: transaction.messages.map(m => ({
    address: m.address,
    amount: m.amount,
    payloadLength: m.payload?.length,
    payloadPreview: m.payload?.substring(0, 50)
  })),
  validUntil: new Date(validUntil * 1000).toISOString(),
  walletConnected: connector.connected,
  walletAddress: connector.account?.address
});
```

### 3. Try Different Wallet

Test with Tonkeeper:
1. Disconnect current wallet
2. Connect Tonkeeper
3. Try deployment flow
4. Compare behavior

### 4. Implement Text Comment Protocol (If Above Fails)

If the current binary approach continues to fail, implement the text comment protocol:

**Steps:**
1. Modify factory.tact to add `receive(msg: String)` handler
2. Store deployment params in database before transaction
3. Modify ton-client.ts to send text comment instead of binary payload
4. Add event monitoring to match deployments to database records
5. Rebuild and redeploy factory contract
6. Test on testnet

## Technical Details

### Current Transaction Format (Binary)

```json
{
  "from": "0:ba3cbf12a22054c9e2c7dcf2c52e848866cab4ee5ac9113209477ad6c9fe4b19",
  "network": "-3",
  "valid_until": 1761335097,
  "messages": [{
    "address": "kQCP_uXEiy27VZStlwmupi6hZpMLWLMQIA-zdEUkwr1XTA8i",
    "amount": "700000000",
    "payload": "te6cckEBAQEAPAAAc68XtDYAAAGaF7eQAf///xZnacH4gBdHl+JURAqZPFj7nlil0JEM2Vady1kiJkEo71rZP8ljKHc1lAFufW2+"
  }]
}
```

### Decoded Payload (Current)

Opcode: `2937566262` (DeploySubscription)
- queryId: `Date.now()`
- channelId: `-1003287363080` (int64)
- adminWallet: `0:ba3cbf12a22054c9e2c7dcf2c52e848866cab4ee5ac9113209477ad6c9fe4b19`
- monthlyPrice: `1000000000` nanoTON (1.0 TON)

### Proposed Text Comment Format

```json
{
  "messages": [{
    "address": "kQCP_uXEiy27VZStlwmupi6hZpMLWLMQIA-zdEUkwr1XTA8i",
    "amount": "700000000",
    "payload": "te6cckEBAgEADAABAAAAAABjcmVhdGUArHxg" // "create" encoded
  }]
}
```

## Monitoring and Next Steps

### Monitor These Logs

```bash
# Admin bot logs
tail -f /tmp/admin-bot.log

# Look for:
# - "📤 Requesting deployment transaction"
# - "Sending transaction via TON Connect"
# - "✅ Transaction confirmed" OR "Transaction confirmation timeout"
# - Wallet deep link generation
```

### Success Criteria

✅ User sees wallet confirmation dialog within 5 seconds
✅ Transaction is confirmed within 30 seconds
✅ Contract deploys successfully
✅ User receives confirmation message

### If Still Failing

1. Capture full error message
2. Check TON Connect SDK version (may need update)
3. Verify manifest URL is accessible
4. Test with Tonkeeper wallet
5. Consider implementing text comment protocol

## References

- ton-roulette text protocol: `/home/gmet/workspace/ton-roulette/bot/src/ton/transaction.manager.ts` lines 78-86, 198-203
- ton-roulette factory contract: `/home/gmet/workspace/ton-roulette/pool-room/contracts/PoolFactory.tact` lines 88-106
- TON Connect specification: https://docs.ton.org/develop/dapps/ton-connect/overview
- Tact language docs: https://docs.tact-lang.org/

## Conclusion

The primary issue is **binary payload compatibility with Telegram Wallet**. The immediate fix (adding Telegram Wallet deep link) may help users find the confirmation dialog, but the long-term solution is to implement the text comment protocol used successfully in ton-roulette.

**Recommendation:** Test the deep link fix first. If it still fails, implement text comment protocol as described in Solution 1.
