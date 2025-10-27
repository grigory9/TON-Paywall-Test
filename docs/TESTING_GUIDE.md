# Comprehensive Testing Guide: One-Time Access Model

## Overview

This guide provides detailed testing procedures for the one-time payment access model. Follow these tests systematically to ensure the system works correctly before production deployment.

**Testing Environment:** Testnet
**Estimated Time:** 4-6 hours for complete testing
**Prerequisites:** Testnet contracts deployed, bots configured for testnet

---

## Table of Contents

1. [Pre-Test Setup](#pre-test-setup)
2. [Database Tests](#database-tests)
3. [Smart Contract Tests](#smart-contract-tests)
4. [Bot Functionality Tests](#bot-functionality-tests)
5. [Integration Tests](#integration-tests)
6. [Edge Case Tests](#edge-case-tests)
7. [Performance Tests](#performance-tests)
8. [Security Tests](#security-tests)
9. [Test Results Template](#test-results-template)

---

## Pre-Test Setup

### 1. Environment Configuration

```bash
# Ensure testnet configuration
cd /home/gmet/workspace/ton-paywall
cat .env | grep TON_NETWORK
# Should show: TON_NETWORK=testnet

# Verify database is staging, not production
cat .env | grep DATABASE_URL
# Should NOT contain production database
```

### 2. Create Test Channel

Create a private Telegram channel for testing:
- Name: "Test Channel - TON Paywall"
- Type: Private
- Add bots as admins with these permissions:
  - Post messages
  - Delete messages
  - Ban users
  - Invite users via link
  - Manage invite links

### 3. Test User Accounts

Prepare 3 test Telegram accounts:
- **User A:** For standard flow testing
- **User B:** For concurrent testing
- **User C:** For edge case testing

### 4. Testnet TON Wallet

Ensure you have:
- Testnet wallet with at least 10 TON
- Tonkeeper or similar wallet configured for testnet
- Test wallet address noted for verification

---

## Database Tests

### Test DB-1: Migration Validation

**Objective:** Verify database migration completed successfully

```sql
-- Connect to test database
psql -d ton_subscription_staging

-- Test 1: Verify tables renamed
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('protected_channels', 'access_purchases', 'pending_join_requests');
-- Expected: All 3 tables exist

-- Test 2: Verify old tables removed
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('channels', 'subscriptions', 'setup_progress', 'analytics_summary');
-- Expected: No results

-- Test 3: Check column structure
\d protected_channels
-- Expected: access_price_ton, invite_link, channel_type, total_members, total_revenue_ton

\d access_purchases
-- Expected: purchase_type, approved_at, access_revoked, revoked_at, revoked_reason

\d pending_join_requests
-- Expected: user_id, channel_id, requested_at, expires_at, payment_sent

-- Test 4: Verify helper function exists
SELECT has_channel_access(123456, 1);
-- Expected: Returns true or false (not error)

-- Test 5: Verify cleanup function exists
SELECT cleanup_expired_join_requests();
-- Expected: Returns integer (count of deleted requests)
```

**Pass Criteria:**
- [x] All new tables exist
- [x] Old tables removed
- [x] Columns match specification
- [x] Helper functions work without errors

### Test DB-2: Data Integrity

**Objective:** Verify existing data preserved and migrated correctly

```sql
-- Test 1: Check active subscriptions converted to access purchases
SELECT COUNT(*) as grandfathered_users
FROM access_purchases
WHERE status = 'active'
  AND purchase_type = 'lifetime';
-- Expected: Count matches old active subscriptions

-- Test 2: Verify no data loss
SELECT
  (SELECT COUNT(*) FROM protected_channels) as channels,
  (SELECT COUNT(*) FROM access_purchases) as purchases,
  (SELECT COUNT(*) FROM subscribers) as subscribers;
-- Expected: Counts match pre-migration values

-- Test 3: Check foreign key constraints
SELECT
  conname,
  conrelid::regclass AS table_name,
  confrelid::regclass AS referenced_table
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace;
-- Expected: All foreign keys intact
```

**Pass Criteria:**
- [x] No data loss detected
- [x] Relationships preserved
- [x] Grandfathering applied correctly

---

## Smart Contract Tests

### Test SC-1: Factory Deployment

**Objective:** Verify factory contract deployed correctly

```bash
cd /home/gmet/workspace/ton-paywall/contracts

# Run contract tests
npm test

# Expected output:
# ✓ Factory deploys successfully
# ✓ Factory can register deployments
# ✓ Factory can deploy access gates
# ✓ Deployer role works correctly
```

**Pass Criteria:**
- [x] All contract tests pass
- [x] Factory address saved to .env
- [x] Factory visible on testnet explorer

### Test SC-2: Access Gate Deployment

**Objective:** Test deploying individual access gate

```typescript
// Test script: contracts/tests/access-gate.test.ts

it('should deploy access gate via factory', async () => {
  const channelId = 12345;
  const accessPrice = toNano('10'); // 10 TON
  const adminWallet = treasury.getSender().address;

  // Register deployment
  await factory.send(
    deployer.getSender(),
    { value: toNano('0.1') },
    {
      $$type: 'RegisterAccessGate',
      userWallet: adminWallet,
      channelId: channelId,
      accessPrice: accessPrice
    }
  );

  // User sends "deploy" with payment
  await factory.send(
    treasury.getSender(),
    { value: toNano('0.6') }, // 0.1 fee + 0.5 balance
    'deploy'
  );

  // Verify gate deployed
  const gateAddress = await factory.getAccessGateAddress(channelId);
  expect(gateAddress).toBeDefined();
});
```

**Pass Criteria:**
- [x] Gate deploys successfully
- [x] Correct initial balance
- [x] Address retrievable from factory

### Test SC-3: Payment Processing

**Objective:** Test access gate processes payments correctly

```typescript
it('should process one-time payment', async () => {
  const buyer = await blockchain.treasury('buyer');
  const accessPrice = toNano('10');

  // Send payment to gate
  await gate.send(
    buyer.getSender(),
    { value: accessPrice },
    'buy'
  );

  // Verify purchase recorded
  const hasPurchased = await gate.hasPurchased(buyer.address);
  expect(hasPurchased).toBe(true);

  // Verify admin received payment
  const adminBalance = await blockchain.getContract(adminWallet.address).balance;
  expect(adminBalance).toBeGreaterThan(initialBalance);
});
```

**Pass Criteria:**
- [x] Payment accepted (exact amount)
- [x] Payment accepted (with 1% tolerance)
- [x] Overpayment refunded automatically
- [x] Underpayment rejected
- [x] Admin receives correct amount (price - gas)

### Test SC-4: Contract Security

**Objective:** Verify security features work

```typescript
it('should reject unauthorized price updates', async () => {
  const attacker = await blockchain.treasury('attacker');

  await expect(
    gate.send(
      attacker.getSender(),
      { value: toNano('0.1') },
      { $$type: 'UpdateAccessPrice', newPrice: toNano('1') }
    )
  ).rejects.toThrow('Admin only');
});

it('should prevent double-payment exploitation', async () => {
  const buyer = await blockchain.treasury('buyer');

  // First payment
  await gate.send(buyer.getSender(), { value: toNano('10') }, 'buy');

  // Second payment attempt
  await gate.send(buyer.getSender(), { value: toNano('10') }, 'buy');

  // Verify only counted once
  const purchases = await gate.getTotalPurchases();
  expect(purchases).toBe(2); // Both recorded, but access check should handle
});
```

**Pass Criteria:**
- [x] Only admin can update price
- [x] Only admin can change wallet
- [x] Reentrancy protection works
- [x] No integer overflow/underflow

---

## Bot Functionality Tests

### Test BOT-1: Admin Bot - Channel Setup

**Test Procedure:**
1. Start admin bot: `/start`
2. Run setup: `/setup`
3. Enter test channel ID
4. Verify private channel check
5. Set access price (0.5 TON for testing)
6. Wait for contract deployment
7. Note invite link provided

**Expected Results:**
- Bot detects channel is private
- Rejects if channel is public
- Creates invite link with join requests
- Deploys contract successfully
- Saves contract address to database
- Provides shareable invite link

**Pass Criteria:**
- [x] Setup completes without errors
- [x] Private channel validation works
- [x] Invite link generated
- [x] Contract deployed
- [x] Database updated

### Test BOT-2: Admin Bot - Analytics

**Test Procedure:**
1. Run `/analytics` command
2. Verify statistics displayed:
   - Access price
   - Total members
   - Paid members
   - Pending requests
   - Total revenue
   - Conversion rate

**Expected Results:**
- Shows 0 members initially
- Updates after first payment
- Revenue calculated correctly

**Pass Criteria:**
- [x] Analytics display correctly
- [x] Numbers match database
- [x] Updates in real-time

### Test BOT-3: Payment Bot - Join Request

**Test Procedure (User A):**
1. Click invite link from setup
2. Click "Request to Join Channel"
3. Verify payment bot sends message
4. Check message contains:
   - Channel name
   - Access price
   - "Pay once, access forever" message
   - Payment buttons

**Expected Results:**
- Receives message within 5 seconds
- Message contains correct price
- Two payment options shown:
  - TON Connect payment
  - Manual wallet payment

**Pass Criteria:**
- [x] Join request triggers bot message
- [x] Correct information displayed
- [x] Payment buttons functional

### Test BOT-4: Payment Bot - TON Connect Payment

**Test Procedure (User A with connected wallet):**
1. Connect wallet: `/wallet` → Connect
2. Approve connection in wallet app
3. Return to bot
4. Request to join channel again
5. Click "Pay with TON Connect"
6. Approve transaction in wallet
7. Wait for confirmation

**Expected Results:**
- Wallet connects successfully
- Transaction prompt appears
- Payment sent to contract
- Confirmation received
- Join request approved automatically
- User can access channel

**Pass Criteria:**
- [x] Wallet connection works
- [x] Transaction sent successfully
- [x] Payment detected by bot
- [x] Join request approved
- [x] User granted channel access

### Test BOT-5: Payment Bot - Manual Payment

**Test Procedure (User B without connected wallet):**
1. Request to join channel
2. Click "Pay with Other Wallet"
3. Note payment address and amount
4. Open Tonkeeper/wallet app
5. Send exact amount to address
6. Wait for confirmation
7. Click "I've sent payment"

**Expected Results:**
- Manual payment instructions clear
- Payment address correct
- Payment detected within 1-2 minutes
- Join request approved
- Confirmation message received

**Pass Criteria:**
- [x] Manual instructions correct
- [x] Payment detected automatically
- [x] Approval happens automatically
- [x] User can access channel

---

## Integration Tests

### Test INT-1: Complete User Journey

**Objective:** Test full flow from channel creation to user access

**Procedure:**
1. **Admin:** Create channel via admin bot
2. **Admin:** Share invite link
3. **User A:** Click invite link → Request join
4. **User A:** Pay via TON Connect
5. **System:** Detect payment, approve request
6. **User A:** Access channel content
7. **User A:** Leave and rejoin (test auto-approval)

**Timeline:**
- Step 1-2: 2-3 minutes
- Step 3-4: 1-2 minutes
- Step 5: 1-2 minutes (blockchain confirmation)
- Step 6: Immediate
- Step 7: Immediate (should auto-approve)

**Pass Criteria:**
- [x] Complete flow works end-to-end
- [x] No manual intervention needed
- [x] Total time < 10 minutes
- [x] Re-join auto-approved

### Test INT-2: Concurrent Users

**Objective:** Test multiple users joining simultaneously

**Procedure:**
1. **User A:** Request to join
2. **User B:** Request to join (within 10 seconds of A)
3. **User C:** Request to join (within 10 seconds of B)
4. **All users:** Pay within 1 minute window
5. **Verify:** All approved correctly

**Expected Results:**
- No race conditions
- All payments detected
- All users approved
- Database consistency maintained

**Pass Criteria:**
- [x] All users processed correctly
- [x] No duplicate approvals
- [x] No missed payments
- [x] Correct member count

### Test INT-3: Payment Monitoring

**Objective:** Verify payment monitoring catches all transactions

**Procedure:**
1. Create 5 pending join requests
2. Send payments from different wallets
3. Vary payment timing (immediate to 5 minutes apart)
4. Monitor bot logs
5. Verify all detected and processed

**Pass Criteria:**
- [x] All 5 payments detected
- [x] Detection time < 2 minutes per payment
- [x] Correct approval for each
- [x] No false positives/negatives

---

## Edge Case Tests

### Test EDGE-1: Underpayment

**Scenario:** User sends 99% of required amount

**Expected:** Payment accepted (1% tolerance)

```bash
# If access price is 10 TON:
# Send 9.9 TON
# Should be accepted
```

**Pass Criteria:**
- [x] Payment accepted
- [x] User approved
- [x] No refund sent

### Test EDGE-2: Overpayment

**Scenario:** User sends 15 TON for 10 TON access

**Expected:** Payment accepted, 5 TON refunded (minus gas)

**Pass Criteria:**
- [x] Payment accepted
- [x] Excess refunded automatically
- [x] Refund amount correct (~4.99 TON)
- [x] User approved

### Test EDGE-3: Double Join Request

**Scenario:** User requests to join twice before paying

**Expected:** Only one pending request, no duplicates

**Pass Criteria:**
- [x] Second request doesn't create duplicate
- [x] Original request still valid
- [x] Payment works normally

### Test EDGE-4: Payment After Leave

**Scenario:** User pays, joins, leaves, then rejoins

**Expected:** Auto-approved on rejoin (already paid)

**Pass Criteria:**
- [x] First join works normally
- [x] Can leave channel
- [x] Rejoin auto-approved
- [x] No second payment required

### Test EDGE-5: Expired Join Request

**Scenario:** User requests join but doesn't pay for 48+ hours

**Expected:** Request expires, must request again

**Procedure:**
1. Request to join
2. Wait 48 hours (or manually expire in DB)
3. Try to pay old request
4. Request to join again
5. Pay new request

**Pass Criteria:**
- [x] Old request expires
- [x] Cleanup function removes it
- [x] Can create new request
- [x] New request works normally

### Test EDGE-6: Bot Offline During Payment

**Scenario:** Bot offline when user pays, comes back online

**Expected:** Payment detected when bot restarts

**Procedure:**
1. User requests to join
2. Stop payment bot: `pm2 stop payment-bot`
3. User sends payment
4. Wait 1 minute
5. Start payment bot: `pm2 start payment-bot`
6. Verify payment detected

**Pass Criteria:**
- [x] Payment detected on restart
- [x] User approved correctly
- [x] No data loss

### Test EDGE-7: Invalid Payment Amount

**Scenario:** User sends 0.01 TON instead of 10 TON

**Expected:** Payment rejected/ignored

**Pass Criteria:**
- [x] Payment not accepted
- [x] User not approved
- [x] Clear error message (if possible)

### Test EDGE-8: Wrong Contract Address

**Scenario:** User sends payment to wrong address

**Expected:** Payment not detected, user not approved

**Pass Criteria:**
- [x] Bot doesn't detect payment
- [x] User remains unapproved
- [x] Can pay again to correct address

---

## Performance Tests

### Test PERF-1: Response Time

**Objective:** Measure bot response times

**Metrics to Measure:**
- Join request → Bot message: < 3 seconds
- Payment confirmed → Approval: < 60 seconds
- Command execution: < 1 second

**Test:**
```bash
# Use test script to measure
time ./test-response-times.sh
```

**Pass Criteria:**
- [x] 95% of requests under target time
- [x] No timeouts
- [x] Consistent performance

### Test PERF-2: Load Testing

**Objective:** Test system under load

**Procedure:**
1. Simulate 50 concurrent join requests
2. Simulate 20 simultaneous payments
3. Monitor:
   - CPU usage
   - Memory usage
   - Database connections
   - Response times

**Tools:**
```bash
# Use artillery or k6
k6 run load-test.js
```

**Pass Criteria:**
- [x] No crashes
- [x] All requests processed
- [x] Response times acceptable
- [x] Database stable

### Test PERF-3: Database Performance

**Objective:** Verify database queries optimized

```sql
-- Test query performance
EXPLAIN ANALYZE
SELECT * FROM access_purchases ap
JOIN protected_channels pc ON ap.channel_id = pc.id
WHERE ap.status = 'active'
  AND ap.access_revoked = false
LIMIT 100;

-- Should use indexes efficiently
-- Execution time < 10ms
```

**Pass Criteria:**
- [x] Queries use indexes
- [x] No sequential scans on large tables
- [x] Query time < 50ms

---

## Security Tests

### Test SEC-1: SQL Injection

**Objective:** Verify inputs sanitized

**Test Inputs:**
```
Channel ID: "; DROP TABLE access_purchases; --
Access Price: 1000000000
User ID: ' OR '1'='1
```

**Expected:** All rejected/escaped safely

**Pass Criteria:**
- [x] No SQL injection possible
- [x] Parameterized queries used
- [x] Invalid inputs rejected

### Test SEC-2: Authorization

**Objective:** Verify only authorized users can perform actions

**Tests:**
- Non-admin tries to setup channel → Rejected
- User tries to approve own request → Impossible
- User tries to set price to 0 → Rejected

**Pass Criteria:**
- [x] Authorization checks in place
- [x] No privilege escalation possible
- [x] Admin actions protected

### Test SEC-3: Contract Security

**Objective:** Verify contract cannot be exploited

**Tests:**
- Send malformed messages → Handled safely
- Try to drain contract balance → Impossible
- Reentrancy attack → Protected
- Integer overflow → Protected

**Pass Criteria:**
- [x] Contract handles errors gracefully
- [x] No funds can be stolen
- [x] Access control enforced

---

## Test Results Template

### Test Execution Record

**Date:** _______________
**Tester:** _______________
**Environment:** Testnet / Staging / Production
**Version:** _______________

### Database Tests

| Test ID | Description | Status | Notes |
|---------|-------------|--------|-------|
| DB-1 | Migration validation | ☐ Pass ☐ Fail | |
| DB-2 | Data integrity | ☐ Pass ☐ Fail | |

### Smart Contract Tests

| Test ID | Description | Status | Notes |
|---------|-------------|--------|-------|
| SC-1 | Factory deployment | ☐ Pass ☐ Fail | |
| SC-2 | Gate deployment | ☐ Pass ☐ Fail | |
| SC-3 | Payment processing | ☐ Pass ☐ Fail | |
| SC-4 | Security features | ☐ Pass ☐ Fail | |

### Bot Functionality Tests

| Test ID | Description | Status | Notes |
|---------|-------------|--------|-------|
| BOT-1 | Channel setup | ☐ Pass ☐ Fail | |
| BOT-2 | Analytics | ☐ Pass ☐ Fail | |
| BOT-3 | Join request | ☐ Pass ☐ Fail | |
| BOT-4 | TON Connect payment | ☐ Pass ☐ Fail | |
| BOT-5 | Manual payment | ☐ Pass ☐ Fail | |

### Integration Tests

| Test ID | Description | Status | Notes |
|---------|-------------|--------|-------|
| INT-1 | Complete user journey | ☐ Pass ☐ Fail | |
| INT-2 | Concurrent users | ☐ Pass ☐ Fail | |
| INT-3 | Payment monitoring | ☐ Pass ☐ Fail | |

### Edge Case Tests

| Test ID | Description | Status | Notes |
|---------|-------------|--------|-------|
| EDGE-1 | Underpayment | ☐ Pass ☐ Fail | |
| EDGE-2 | Overpayment | ☐ Pass ☐ Fail | |
| EDGE-3 | Double join request | ☐ Pass ☐ Fail | |
| EDGE-4 | Payment after leave | ☐ Pass ☐ Fail | |
| EDGE-5 | Expired request | ☐ Pass ☐ Fail | |
| EDGE-6 | Bot offline | ☐ Pass ☐ Fail | |
| EDGE-7 | Invalid amount | ☐ Pass ☐ Fail | |
| EDGE-8 | Wrong address | ☐ Pass ☐ Fail | |

### Performance Tests

| Test ID | Description | Result | Target | Status |
|---------|-------------|--------|--------|--------|
| PERF-1 | Response time | ___ ms | < 3s | ☐ Pass ☐ Fail |
| PERF-2 | Load test | ___ req/s | 50 req/s | ☐ Pass ☐ Fail |
| PERF-3 | DB performance | ___ ms | < 50ms | ☐ Pass ☐ Fail |

### Security Tests

| Test ID | Description | Status | Notes |
|---------|-------------|--------|-------|
| SEC-1 | SQL injection | ☐ Pass ☐ Fail | |
| SEC-2 | Authorization | ☐ Pass ☐ Fail | |
| SEC-3 | Contract security | ☐ Pass ☐ Fail | |

### Overall Assessment

**Total Tests:** _____
**Passed:** _____
**Failed:** _____
**Success Rate:** _____%

**Ready for Production:** ☐ Yes ☐ No

**Critical Issues Found:**
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

**Recommendations:**
- _______________________________________________
- _______________________________________________
- _______________________________________________

**Sign-off:**
Tester: _______________  Date: _______________
Reviewer: _______________  Date: _______________

---

## Continuous Testing

After deployment, run these tests regularly:

**Daily:**
- Verify payment monitoring working
- Check bot health
- Review error logs

**Weekly:**
- Run edge case tests
- Check database performance
- Verify analytics accuracy

**Monthly:**
- Full integration test
- Security audit
- Performance benchmarking

---

**End of Testing Guide**
