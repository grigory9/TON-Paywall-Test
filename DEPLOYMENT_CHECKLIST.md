# Subscription Payment Fix - Deployment Checklist

## Pre-Deployment Verification ✅

- [x] **Code Review**: Changes reviewed and understood
- [x] **Build Test**: TypeScript compilation succeeds
- [x] **Payload Test**: Subscribe payload verified correct
- [ ] **Backup Database**: Create snapshot before deployment
- [ ] **Document Rollback**: Rollback procedure ready

---

## Deployment Steps

### 1. Prepare Environment

```bash
# Navigate to project directory
cd /home/gmet/workspace/ton-paywall/payment-bot

# Ensure latest code
git status

# Check current bot status
pm2 status payment-bot
```

**Checklist**:
- [ ] Working directory correct
- [ ] Git status shows modified files
- [ ] Bot currently running (or stopped)

---

### 2. Build Updated Code

```bash
# Clean build
rm -rf dist/
npm run build
```

**Expected output**: No TypeScript errors

**Checklist**:
- [ ] Build completes successfully
- [ ] No compilation errors
- [ ] dist/ directory created with .js files

---

### 3. Restart Payment Bot

```bash
# Using PM2 (production)
pm2 restart payment-bot

# Or manually (if not using PM2)
# npm start
```

**Expected output**:
```
[PM2] Restarting payment-bot
[PM2] payment-bot restarted
```

**Checklist**:
- [ ] PM2 shows restart successful
- [ ] No startup errors in logs
- [ ] Bot connects to database
- [ ] Bot initializes TON Connect service

---

### 4. Verify Bot Started

```bash
# Check status
pm2 status

# Check logs
pm2 logs payment-bot --lines 30
```

**Expected logs**:
```
🤖 Payment Bot starting...
📊 Database connection pool initialized
🔗 TON Connect Service (Payment Bot) initialized
💰 Payment monitoring started (interval: 30000ms)
✅ Payment Bot is running
```

**Checklist**:
- [ ] Status shows "online"
- [ ] No error messages in logs
- [ ] Database connected
- [ ] Payment monitoring started
- [ ] TON Connect initialized

---

## Testing Steps

### Test 1: Basic Bot Functionality

```bash
# In Telegram, send to payment bot:
/start
```

**Expected response**:
```
🎯 Welcome to Subscription Bot!

Subscribe to premium Telegram channels with TON cryptocurrency.

How it works:
1️⃣ Choose a channel
2️⃣ Pay with TON
3️⃣ Get instant access
```

**Checklist**:
- [ ] Bot responds to /start
- [ ] Welcome message displays correctly
- [ ] No error messages

---

### Test 2: Browse Channels

```bash
# In Telegram:
/channels
```

**Expected response**:
```
📺 Available Premium Channels

🔹 [Channel Name]
   💎 1 TON/month
   👥 0 subscribers

[Subscribe to Channel Name] button
```

**Checklist**:
- [ ] Channel list displays
- [ ] Prices shown correctly
- [ ] Subscribe buttons appear

---

### Test 3: Initiate Subscription

Click "Subscribe to [Channel Name]" button

**Expected response**:
```
📺 Subscribe to [Channel Name]

💎 Price: 1 TON
📅 Duration: 30 days
✅ Auto-renewal: Disabled

Choose payment method:
[Pay with Telegram Wallet] button
```

**Checklist**:
- [ ] Subscription details display
- [ ] Price correct
- [ ] Payment button appears

---

### Test 4: Connect Wallet (If Not Connected)

Click "Pay with Telegram Wallet"

**Expected response**:
```
Connecting to your wallet...
[List of wallet options with icons]
```

**Checklist**:
- [ ] TON Connect initialization succeeds
- [ ] Wallet options displayed
- [ ] No connection errors

---

### Test 5: Send Payment (CRITICAL TEST)

1. Connect wallet (if needed)
2. Click "Pay Now" button
3. Confirm in Telegram Wallet

**Expected response in bot**:
```
⏳ Preparing transaction...

Amount: 1 TON
To: [Channel Name]

Please confirm the transaction in your wallet app.
```

**In Telegram Wallet**:
- Transaction request appears
- Amount: 1 TON
- Comment: "Subscribe" ✅ (visible in wallet)

**After confirmation**:
```
✅ Payment Sent Successfully!

Transaction hash: `a40aa3a39a5e00efab3cfd55ef6b19a1df382915925cc43a0f263e1447103a38`

⏳ Waiting for blockchain confirmation (~1 minute)...

Your subscription will be activated automatically.
```

**Checklist**:
- [ ] Transaction request sent to wallet
- [ ] Wallet shows "Subscribe" comment
- [ ] User able to confirm transaction
- [ ] Bot shows success message
- [ ] Transaction hash displayed

---

### Test 6: Verify Blockchain Transaction

Visit: https://testnet.tonscan.org/tx/[transaction_hash]

**Check**:
- [ ] Transaction status: "Success"
- [ ] Aborted: false ✅
- [ ] Message body contains: "Subscribe"
- [ ] Amount matches subscription price
- [ ] Destination: subscription contract address

---

### Test 7: Wait for Confirmation

Wait 30-60 seconds for payment monitoring to detect transaction.

**Expected response in bot**:
```
🎉 Subscription Activated!

Channel: [Channel Name]
Expires: [Date 30 days from now]

You now have access to the channel!
```

**Checklist**:
- [ ] Payment detected within 60 seconds
- [ ] Subscription activated automatically
- [ ] User notified of activation
- [ ] User granted channel access

---

### Test 8: Verify Database

```sql
-- Connect to database
psql $DATABASE_URL

-- Check subscription
SELECT
  s.id,
  s.status,
  s.transaction_hash,
  s.starts_at,
  s.expires_at,
  p.amount_ton,
  p.confirmed_at
FROM subscriptions s
LEFT JOIN payments p ON p.subscription_id = s.id
WHERE s.id = (SELECT MAX(id) FROM subscriptions);
```

**Expected results**:
```
 id | status | transaction_hash | starts_at  | expires_at | amount_ton | confirmed_at
----+--------+------------------+------------+------------+------------+--------------
  X | active | a40aa3a...       | 2025-10-26 | 2025-11-25 |        1.0 | 2025-10-26
```

**Checklist**:
- [ ] Subscription status: 'active'
- [ ] Transaction hash populated
- [ ] Expires_at = starts_at + 30 days
- [ ] Payment record created
- [ ] Amount matches price

---

### Test 9: Verify Admin Received Payment

Check admin wallet balance in blockchain explorer:

Visit: https://testnet.tonscan.org/address/[admin_wallet_address]

**Expected**:
- Recent incoming transaction: +0.98 TON
- From: subscription contract
- Comment: "Subscription payment"

**Checklist**:
- [ ] Admin wallet received payment
- [ ] Amount: monthly_price - 0.02 TON (gas)
- [ ] Transaction from contract

---

### Test 10: Verify Channel Access

In Telegram:
1. Navigate to the premium channel
2. Check user can see messages
3. Check user can post (if allowed)

**Checklist**:
- [ ] User can view channel
- [ ] No "join request" required
- [ ] Access granted automatically

---

## Post-Deployment Monitoring

### Monitor Logs (First Hour)

```bash
# Watch logs in real-time
pm2 logs payment-bot --lines 100
```

**Watch for**:
- ✅ Successful payment confirmations
- ✅ Subscriptions activating
- ⚠️ Any error messages
- ⚠️ Transaction rejections

**Checklist**:
- [ ] No critical errors in logs
- [ ] Payment monitoring running
- [ ] Subscriptions activating automatically

---

### Check Metrics (First 24 Hours)

```sql
-- Subscription success rate
SELECT
  COUNT(*) FILTER (WHERE status = 'active') as active,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'expired') as expired,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'active') / NULLIF(COUNT(*), 0),
    2
  ) as success_rate
FROM subscriptions
WHERE created_at > NOW() - INTERVAL '24 hours';
```

**Expected**:
- Success rate > 90%
- Pending count decreasing over time
- No stuck pending subscriptions > 5 minutes old

**Checklist**:
- [ ] Success rate acceptable
- [ ] No subscriptions stuck in pending
- [ ] Payment monitoring detecting transactions

---

## Rollback Procedure (If Needed)

### Signs You Need to Rollback

- ❌ Transactions still bouncing
- ❌ Success rate < 50%
- ❌ Critical errors in logs
- ❌ Database corruption
- ❌ Bot crashes repeatedly

### Rollback Steps

```bash
# Stop bot
pm2 stop payment-bot

# Revert code changes
cd /home/gmet/workspace/ton-paywall/payment-bot
git checkout HEAD~1 src/bot.ts

# Rebuild
npm run build

# Restart with old code
pm2 restart payment-bot

# Verify rollback
pm2 logs payment-bot --lines 20
```

**Checklist**:
- [ ] Bot stopped cleanly
- [ ] Code reverted to previous version
- [ ] Build succeeds
- [ ] Bot starts successfully
- [ ] Contact users about temporary issue

---

## Success Criteria

### Immediate (Within 5 Minutes)

- [x] Build succeeds
- [ ] Bot starts without errors
- [ ] User can initiate subscription
- [ ] Transaction includes "Subscribe" payload
- [ ] Wallet shows comment in transaction

### Short-term (Within 1 Hour)

- [ ] At least 1 successful end-to-end payment
- [ ] Transaction accepted by contract (not bounced)
- [ ] Admin receives payment
- [ ] Subscription activates automatically
- [ ] User granted channel access

### Medium-term (Within 24 Hours)

- [ ] Multiple successful subscriptions
- [ ] Success rate > 90%
- [ ] No pending subscriptions stuck > 5 minutes
- [ ] Payment monitoring functioning correctly
- [ ] No critical errors in logs

---

## Troubleshooting Common Issues

### Issue: Transaction Still Bouncing

**Diagnosis**:
```bash
# Check if build includes fix
grep -n "Subscribe" payment-bot/dist/bot.js
```

**Expected**: Should find "Subscribe" string in compiled code

**Fix**: Rebuild and restart bot

---

### Issue: Payment Not Detected

**Diagnosis**:
```bash
# Check payment monitoring
pm2 logs payment-bot | grep "Payment monitoring"
```

**Expected**: "Payment monitoring started (interval: 30000ms)"

**Fix**: Restart bot to reinitialize monitoring

---

### Issue: Wallet Connection Fails

**Diagnosis**:
```bash
# Check TON Connect service
pm2 logs payment-bot | grep "TON Connect"
```

**Expected**: "TON Connect Service (Payment Bot) initialized"

**Fix**: Verify TONCONNECT_MANIFEST_URL in .env

---

### Issue: Database Connection Error

**Diagnosis**:
```bash
# Check database connection
pm2 logs payment-bot | grep -i "database"
```

**Expected**: "Database connection pool initialized"

**Fix**: Verify DATABASE_URL in .env

---

## Documentation Links

- **Full technical details**: `/home/gmet/workspace/ton-paywall/docs/SUBSCRIPTION_PAYMENT_FIX.md`
- **Visual flow diagram**: `/home/gmet/workspace/ton-paywall/docs/PAYMENT_FLOW_DIAGRAM.md`
- **Summary**: `/home/gmet/workspace/ton-paywall/FIX_SUMMARY.md`
- **Test script**: `/home/gmet/workspace/ton-paywall/payment-bot/test-subscribe-payload.ts`

---

## Contact & Support

If critical issues occur:

1. Check logs: `pm2 logs payment-bot`
2. Check database: Query subscriptions and payments tables
3. Check blockchain: Verify contract state and transactions
4. Review documentation in `/home/gmet/workspace/ton-paywall/docs/`

---

## Final Sign-Off

After completing all tests:

- [ ] All critical tests passed
- [ ] At least 1 successful end-to-end payment
- [ ] No bounced transactions
- [ ] Payment monitoring functioning
- [ ] Logs show no critical errors
- [ ] Database records correct
- [ ] Admin received payment
- [ ] User granted access

**Deployment Status**: ⏳ PENDING

**Next Actions**:
1. Complete pre-deployment backup
2. Execute deployment steps
3. Run all tests
4. Monitor for 24 hours
5. Mark as production-ready if successful

---

**Date**: 2025-10-26
**Version**: 1.0.0
**Fix**: Subscription payment transaction payload
**Impact**: CRITICAL - Enables all user subscriptions
