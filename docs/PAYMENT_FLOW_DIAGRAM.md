# Subscription Payment Flow - Before and After Fix

## Before Fix (BROKEN) ❌

```
┌──────────┐
│   User   │
└────┬─────┘
     │ 1. Click "Subscribe"
     │
     ▼
┌─────────────────┐
│  Payment Bot    │
│                 │
│  Transaction:   │
│  {              │
│    address: contract,
│    amount: 1 TON,
│    payload: <EMPTY>  ❌ NO PAYLOAD!
│  }              │
└────┬────────────┘
     │ 2. Send via TON Connect
     │
     ▼
┌─────────────────┐
│  User Wallet    │
│  (Telegram)     │
└────┬────────────┘
     │ 3. User confirms
     │ 4. Transaction sent: -1 TON
     │
     ▼
┌──────────────────────────────────┐
│  Subscription Contract           │
│  kQCeT...Rfquz                   │
│                                  │
│  Receiver handlers:              │
│  ┌────────────────────────────┐ │
│  │ receive("Subscribe") {     │ │
│  │   // Process payment       │ │
│  │ }                          │ │
│  └────────────────────────────┘ │
│                                  │
│  ❌ No matching receiver         │
│     for empty message!           │
│                                  │
│  ACTION: BOUNCE TRANSACTION      │
└────┬─────────────────────────────┘
     │ 5. Transaction aborted
     │ 6. Bounce funds back
     │
     ▼
┌─────────────────┐
│  User Wallet    │
│                 │
│  Balance:       │
│  +0.99 TON      │ ← Refund (minus gas)
└─────────────────┘

RESULT: ❌ Payment failed
        ❌ Subscription stuck in "pending"
        ❌ User confused
        ❌ Admin gets nothing
```

---

## After Fix (WORKING) ✅

```
┌──────────┐
│   User   │
└────┬─────┘
     │ 1. Click "Subscribe"
     │
     ▼
┌─────────────────────────────────────┐
│  Payment Bot                        │
│                                     │
│  Generate payload:                  │
│  ┌───────────────────────────────┐ │
│  │ const payload = beginCell()   │ │
│  │   .storeUint(0, 32)          │ │
│  │   .storeStringTail("Subscribe")│ │
│  │   .endCell()                  │ │
│  └───────────────────────────────┘ │
│                                     │
│  Transaction:                       │
│  {                                  │
│    address: contract,               │
│    amount: 1 TON,                   │
│    payload: "te6cc...e7" ✅         │
│  }                                  │
└────┬────────────────────────────────┘
     │ 2. Send via TON Connect
     │
     ▼
┌─────────────────┐
│  User Wallet    │
│  (Telegram)     │
│                 │
│  Shows:         │
│  💬 "Subscribe" │ ← User sees comment
└────┬────────────┘
     │ 3. User confirms
     │ 4. Transaction sent: -1 TON
     │
     ▼
┌──────────────────────────────────────────┐
│  Subscription Contract                   │
│  kQCeT...Rfquz                           │
│                                          │
│  Incoming message:                       │
│  ┌────────────────────────────────────┐ │
│  │ Opcode: 0 (text comment)           │ │
│  │ Text: "Subscribe"                  │ │
│  │ Value: 1 TON                       │ │
│  └────────────────────────────────────┘ │
│                                          │
│  Receiver handlers:                      │
│  ┌──────────────────────────────────┐   │
│  │ receive("Subscribe") {           │   │
│  │   ✅ MATCH FOUND!                │   │
│  │                                  │   │
│  │   // Validate payment            │   │
│  │   require(value >= minPrice)    │   │
│  │                                  │   │
│  │   // Calculate expiry            │   │
│  │   newExpiry = now() + 30 days   │   │
│  │   subscribers.set(sender, expiry)│   │
│  │                                  │   │
│  │   // Forward to admin            │   │
│  │   send(admin, 0.98 TON)         │   │
│  │ }                                │   │
│  └──────────────────────────────────┘   │
│                                          │
│  ✅ Transaction accepted!                │
│  ✅ Subscription recorded on-chain       │
└────┬─────┬───────────────────────────────┘
     │     │
     │     └──────────────────┐
     │ 5. Forward payment     │ 6. Store on-chain
     │                        │
     ▼                        ▼
┌──────────────┐    ┌──────────────────┐
│ Admin Wallet │    │ Contract Storage │
│              │    │                  │
│ Balance:     │    │ subscribers:     │
│ +0.98 TON    │    │ {                │
└──────────────┘    │   user: expiry   │
                    │ }                │
                    └──────────────────┘
     ▲
     │ 7. Monitor blockchain (every 30s)
     │
┌────┴─────────────────────┐
│  Payment Monitor Service │
│                          │
│  while (true) {          │
│    pending = getPending()│
│    for (sub in pending) {│
│      tx = checkBlockchain│
│      if (tx.found) {     │
│        activate(sub)     │
│      }                   │
│    }                     │
│    sleep(30s)            │
│  }                       │
└────┬─────────────────────┘
     │ 8. Payment detected!
     │
     ▼
┌─────────────────────────┐
│  Database               │
│                         │
│  UPDATE subscriptions   │
│  SET status = 'active'  │
│  WHERE id = X           │
│                         │
│  INSERT INTO payments   │
│  VALUES (tx_hash, ...)  │
└────┬────────────────────┘
     │ 9. Send confirmation
     │
     ▼
┌──────────┐
│   User   │
│          │
│  ✅ Subscription Active!
│  📺 Access granted
│  ⏰ Expires in 30 days
└──────────┘

RESULT: ✅ Payment successful
        ✅ Subscription activated
        ✅ Admin receives 0.98 TON
        ✅ User happy
```

---

## Payload Breakdown

### What We Send

```typescript
const subscribePayload = beginCell()
  .storeUint(0, 32)              // 32 bits: opcode
  .storeStringTail("Subscribe")  // Variable: UTF-8 text
  .endCell();
```

### Binary Representation

```
┌────────────────┬──────────────────────────────────────┐
│  Opcode (32)   │  Text (variable length, UTF-8)      │
├────────────────┼──────────────────────────────────────┤
│  0x00000000    │  0x537562736372696265                │
│  (0 = text)    │  ("Subscribe")                       │
└────────────────┴──────────────────────────────────────┘
```

### Base64 Encoding (for TON Connect)

```
te6cckEBAQEADwAAGgAAAABTdWJzY3JpYmUpvXe7
```

This is what gets sent in the transaction's `payload` field.

---

## Contract Message Matching

### How Tact Matches Messages

```tact
// In the ChannelSubscription contract

// Text comment receiver (opcode 0)
receive("Subscribe") {
    // ✅ Matches when:
    // - Message opcode = 0
    // - Message text = "Subscribe"
}

// Binary message receiver
receive(msg: UpdatePrice) {
    // ✅ Matches when:
    // - Message opcode = 0x12345678 (defined in message struct)
    // - Message contains struct fields
}

// Fallback (no explicit receiver)
// ❌ Would bounce if defined as bounced(msg: bounced<Message>)
// ❌ Would throw error if no receiver matches
```

### Why Our Old Message Bounced

```
Old transaction:
{
  address: "kQC...",
  amount: "1000000000",
  payload: undefined  ❌ No payload = empty cell
}

Contract receives:
- Opcode: none (empty message)
- No matching receiver!
- Action: BOUNCE
```

### Why New Message Works

```
New transaction:
{
  address: "kQC...",
  amount: "1000000000",
  payload: "te6cckEBAQEADwAAGgAAAABTdWJzY3JpYmUpvXe7"  ✅
}

Contract receives:
- Opcode: 0 (text comment)
- Text: "Subscribe"
- Matches: receive("Subscribe") ✅
- Action: PROCESS PAYMENT
```

---

## Timeline Comparison

### Before Fix (FAILED)

```
0s   │ User clicks "Subscribe"
1s   │ Transaction sent (no payload) ❌
2s   │ Contract rejects
3s   │ Funds bounce back
30s  │ Payment monitor checks
31s  │ No payment found
60s  │ Payment monitor checks again
61s  │ Still no payment
...  │ Subscription stuck forever
```

### After Fix (SUCCESS)

```
0s   │ User clicks "Subscribe"
1s   │ Transaction sent (with "Subscribe" payload) ✅
2s   │ Contract accepts
3s   │ Admin receives 0.98 TON
4s   │ User sees "waiting for confirmation"
30s  │ Payment monitor checks
31s  │ ✅ Payment found on blockchain!
32s  │ Database updated: status = active
33s  │ User notified: "Subscription activated!"
34s  │ User granted channel access
```

---

## Error Handling

### Possible Failures (Even After Fix)

1. **Insufficient payment**
   ```tact
   require(ctx.value >= minPayment, "Insufficient payment");
   ```
   Action: Bounce transaction, user gets refund

2. **User rejects transaction**
   ```typescript
   catch (UserRejectedError) {
     await ctx.reply("Transaction cancelled. Try again when ready.");
   }
   ```
   Action: Show friendly error, allow retry

3. **Wallet disconnected**
   ```typescript
   if (!connector.connected) {
     throw new Error('Wallet not connected');
   }
   ```
   Action: Prompt to reconnect wallet

4. **Network timeout**
   ```typescript
   setTimeout(() => reject('Timeout'), 120000);
   ```
   Action: Show timeout error, allow retry

All failures are **non-destructive** - user never loses funds.

---

## Monitoring the Fix

### Check Logs

```bash
pm2 logs payment-bot --lines 50

# Look for:
# ✅ "Transaction confirmed by subscriber X"
# ✅ "Payment found for subscription X"
# ✅ "Subscription X activated"
```

### Check Blockchain

Visit: https://testnet.tonscan.org/address/kQCeTqNA9EHqwwjs2jxH3AafLNspECs-5hZETiklVaSfRMuz

Look for:
- ✅ Recent transactions with "Aborted = false"
- ✅ Message body contains "Subscribe"
- ✅ Incoming value matches subscription price

### Check Database

```sql
SELECT
  s.id,
  s.status,
  s.transaction_hash,
  s.created_at,
  s.starts_at,
  s.expires_at,
  p.amount_ton,
  p.confirmed_at
FROM subscriptions s
LEFT JOIN payments p ON p.subscription_id = s.id
WHERE s.created_at > NOW() - INTERVAL '1 hour'
ORDER BY s.created_at DESC;
```

Expected results:
- ✅ status = 'active'
- ✅ transaction_hash populated
- ✅ payment record exists
- ✅ confirmed_at within ~1 minute of created_at

---

## Key Takeaways

1. **Smart contracts are strict** - They only accept exact message formats
2. **Text comments are simple** - Opcode 0 + text string
3. **Always test payloads** - Verify message structure before sending
4. **Blockchain is permanent** - Can't undo transactions, must get it right
5. **User experience matters** - Failed transactions are confusing

**The fix is simple but critical**: Add 3 lines of code to include the "Subscribe" payload.

---

**Related Documentation**:
- Full fix details: `/home/gmet/workspace/ton-paywall/docs/SUBSCRIPTION_PAYMENT_FIX.md`
- Summary: `/home/gmet/workspace/ton-paywall/FIX_SUMMARY.md`
- Test script: `/home/gmet/workspace/ton-paywall/payment-bot/test-subscribe-payload.ts`
