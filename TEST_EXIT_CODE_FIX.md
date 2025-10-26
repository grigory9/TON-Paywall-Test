# Testing Guide: Exit Code 46284 Fix

## Quick Test Procedure

### 1. Deploy the Fix

```bash
# Navigate to admin bot directory
cd /home/gmet/workspace/ton-paywall/admin-bot

# Rebuild admin bot with fixed ton-client
npm run build

# Restart admin bot
pm2 restart admin-bot

# Watch logs in real-time
pm2 logs admin-bot --lines 100
```

### 2. Test with Real User

1. **User sends** `/setup` to admin bot
2. **Bot verifies** admin rights
3. **User inputs** channel details (price, subscription duration)
4. **Backend sends** RegisterDeployment transaction
5. **Watch for new logs**:
   ```
   ✅ Seqno confirmed. Now waiting for contract state update...
   ⏳ Registration not yet visible in contract state, waiting... (2s)
   ⏳ Registration not yet visible in contract state, waiting... (4s)
   ✅ Registration confirmed in factory contract state
   ✅ Deployment parameters fully confirmed on-chain
   ```
6. **Bot sends** TON Connect payment request to user
7. **User confirms** payment in Telegram Wallet
8. **Verify** transaction succeeds (exit code 0, not 46284)
9. **Verify** contract address saved to database

### 3. Verify Success

Check the deployment transaction on TONScan:

**Testnet**: https://testnet.tonscan.org

Look for:
- **Exit code**: 0 (success)
- **Compute phase**: true
- **Action phase**: success
- **Emitted events**: "DeploymentRegistered", contract deployed

### 4. Database Verification

```bash
# Connect to database
psql $DATABASE_URL

# Check channel record
SELECT id, telegram_id, contract_address, is_active
FROM channels
WHERE telegram_id = -1002XXXXXXXXX;

# Verify contract_address is populated
# Verify is_active = true
```

## Expected Timeline

| Event | Time | What to Watch |
|-------|------|---------------|
| RegisterDeployment sent | T+0s | Log: "RegisterDeployment message sent" |
| Seqno confirmed | T+2-5s | Log: "Seqno confirmed" |
| State polling begins | T+2-5s | Log: "Now waiting for contract state update" |
| State confirmed | T+4-10s | Log: "Registration confirmed in factory contract state" |
| User sees payment request | T+4-10s | Bot sends TON Connect request |
| User confirms payment | T+10-30s | User action in Telegram Wallet |
| Deployment executes | T+15-40s | Factory deploys ChannelSubscription |

**Total Time**: Typically 15-40 seconds from start to deployed contract.

## Troubleshooting

### If State Confirmation Times Out (30s)

**Error**: "Registration confirmation timeout after 30000ms"

**Cause**: TON network congestion or RPC endpoint issues

**Solution**:
1. Ask user to try again in 1 minute
2. Check TON network status
3. Verify factory contract is responding: `getDeployer()`, `getTotalDeployed()`

### If Exit Code 46284 Still Occurs

**This should NOT happen with the fix.**

If it does:
1. Check logs for "Registration confirmed in factory contract state"
2. If confirmation logged but still 46284, there's a deeper issue
3. Possible causes:
   - User sent "deploy" before backend asked them to (manual transaction)
   - Registration expired (>1 hour between registration and user payment)
   - Wrong factory address in environment

### If RegisterDeployment Fails (Bounced)

**Symptoms**: Transaction bounces back, registration never completes

**Causes**:
1. Wrong opcode (should be 320997630)
2. Insufficient gas (should be 0.02 TON)
3. Deployer wallet not authorized
4. Wrong message structure

**Verify**:
```bash
# Check deployer is authorized
cd /home/gmet/workspace/ton-paywall/contracts
npx ts-node scripts/check-deployer.ts
```

## Rollback Plan

If the fix causes new issues:

```bash
# Revert to previous version
cd /home/gmet/workspace/ton-paywall
git checkout HEAD~1 -- shared/ton-client.ts

# Rebuild
cd admin-bot
npm run build

# Restart
pm2 restart admin-bot
```

## Success Criteria

- [ ] No more exit code 46284 errors
- [ ] State confirmation logs appear
- [ ] User "deploy" transactions succeed
- [ ] Contract addresses saved to database
- [ ] Total wait time < 40 seconds

## Monitoring

### Key Metrics to Watch

1. **Registration confirmation time**: Should be 4-10 seconds
2. **Exit code 46284 occurrences**: Should be ZERO
3. **Deployment success rate**: Should be >95%
4. **User experience**: Smooth, no repeated failures

### Logs to Monitor

```bash
# Real-time logs
pm2 logs admin-bot --lines 50

# Filter for deployment flow
pm2 logs admin-bot | grep -E "Register|deploy|confirmed"

# Check for errors
pm2 logs admin-bot | grep -E "Error|46284"
```

## Next Steps After Successful Testing

1. Document typical confirmation times
2. Update user-facing messages with realistic time estimates
3. Add progress indicators in bot UI
4. Deploy to mainnet
5. Monitor mainnet deployments for 24 hours
6. Mark issue as resolved

---

**Last Updated**: 2025-10-25
**Tester**: _______________________
**Test Date**: _______________________
**Result**: [ ] PASS [ ] FAIL
**Notes**: _______________________
