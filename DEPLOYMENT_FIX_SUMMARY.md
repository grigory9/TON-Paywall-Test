# Contract Deployment Issues - Fixed

## Issues Identified

### Issue 1: Wallet Error After Approving Transaction
**Status:** ✅ Enhanced Error Handling & Diagnostics

The transaction is being sent correctly with the right parameters:
- **Opcode:** 2937566262 (verified from Tact compiler output)
- **Amount:** 0.7 TON (0.1 deployment fee + 0.6 contract init)
- **Message Structure:** Correct (queryId, channelId as int64, adminWallet, monthlyPrice)

**Possible Causes:**
1. **Insufficient Balance:** User wallet has less than 0.75 TON (0.7 + ~0.05 gas)
2. **Factory Not Deployed:** `FACTORY_CONTRACT_ADDRESS` in `.env` is incorrect or not deployed
3. **Network Mismatch:** Factory deployed on different network than `TON_NETWORK` setting
4. **Duplicate Deployment:** Channel already has a deployed contract

**Enhanced Error Handling Added:**
- Detailed error logging with full error stack
- Specific error messages for:
  - Transaction rejected by user
  - Insufficient balance
  - Timeout (2-minute confirmation window)
  - Wallet disconnected
  - Generic errors with troubleshooting steps

### Issue 2: Auto-Open Wallet Deep Link Not Working
**Status:** ✅ Improved & Documented

**How TON Connect Deep Links Work:**
- TON Connect uses a bridge server to send transaction requests
- The wallet app automatically receives the transaction via the bridge
- Deep links simply open the wallet app - they don't contain transaction data
- The wallet will automatically show pending transactions when opened

**Improvements Made:**
1. **Better Logging:**
   - Logs which deep link type is used (universal link vs deep link)
   - Warns when wallet doesn't support deep links (browser extensions)

2. **Enhanced UI:**
   - Button text changed to "View in {WalletName}" (more accurate)
   - Added TONScan explorer link to view transaction on blockchain
   - Handles cases where wallet is browser extension (no mobile deep link)

3. **Documentation:**
   - Added comments explaining how TON Connect deep links work
   - Clarified that wallets automatically receive transactions via bridge

**Supported Wallets:**
- ✅ Tonkeeper: `https://app.tonkeeper.com/`
- ✅ Tonhub/Sandbox: `https://tonhub.com/`
- ✅ MyTonWallet: `https://mytonwallet.io/`
- ❌ OpenMask: Browser extension only (no mobile deep link)

## Changes Made

### File: `/home/gmet/workspace/ton-paywall/admin-bot/src/services/tonconnect.service.ts`

**Lines 505-586:** Enhanced `getWalletDeepLink()` method
- Added comprehensive documentation about how TON Connect deep links work
- Improved logging to show which link type is used
- Better handling for browser extension wallets
- Clearer console output for debugging

### File: `/home/gmet/workspace/ton-paywall/admin-bot/src/bot.ts`

**Lines 475-530:** Enhanced transaction confirmation UI
- Added detailed console logging for transaction flow
- Changed confirmation message from "Transaction sent!" to "Transaction Confirmed!"
- Added TONScan explorer link buttons
- Better button text: "View in {WalletName}" instead of "Open to Confirm"
- Shows transaction hash for user reference

**Lines 567-624:** Enhanced error handling
- Detailed error logging with full stack trace
- Logs channel ID, wallet address, and price for debugging
- Specific error messages for common issues:
  - Transaction rejected
  - Insufficient balance (with breakdown)
  - Timeout (with explanation)
  - Wallet disconnected
  - Generic errors with troubleshooting steps

## Testing Checklist

Before deploying the contract, verify:

1. **Environment Configuration:**
   ```bash
   # Check .env file
   TON_NETWORK=testnet  # or mainnet
   FACTORY_CONTRACT_ADDRESS=EQ...  # Must be deployed on the network specified above
   PAYMENT_BOT_USERNAME=YourPaymentBot
   ```

2. **Factory Contract Deployed:**
   ```bash
   # Visit TONScan and verify factory is active
   https://testnet.tonscan.org/address/YOUR_FACTORY_ADDRESS
   # Should show "Active" status
   ```

3. **Wallet Balance:**
   - Minimum: **0.75 TON** (0.7 deployment + 0.05 gas)
   - Recommended: **1.0 TON** for safety margin

4. **Network Connectivity:**
   ```bash
   # Test TON API connectivity
   curl https://testnet.toncenter.com/api/v2/getAddressInformation?address=YOUR_FACTORY_ADDRESS
   ```

5. **Rebuild and Restart:**
   ```bash
   cd /home/gmet/workspace/ton-paywall/admin-bot
   npm run build
   # Then restart the bot
   ```

## Troubleshooting Guide

### "Insufficient fee" Error
**Cause:** Factory contract requires 0.6 TON minimum (see `factory.tact` line 48)
**Solution:** Ensure transaction sends 0.7 TON (current implementation is correct)

### "Already deployed" Error
**Cause:** Channel already has a contract deployed
**Solution:**
```sql
-- Check if contract exists in database
SELECT subscription_contract_address FROM channels WHERE telegram_channel_id = '-100XXXXXXXXX';

-- If exists, either:
-- 1. Use existing contract
-- 2. Delete and redeploy (CAREFUL - loses all subscription data)
```

### Transaction Timeout
**Cause:** User doesn't confirm within 2 minutes
**Solution:** User should click the deep link button immediately to open wallet and confirm

### Wallet Shows Error
**Causes:**
1. Factory not deployed on the network wallet is connected to
2. Insufficient balance
3. Network congestion (rare on TON)

**Debug Steps:**
1. Check wallet network (testnet vs mainnet)
2. Verify factory address on TONScan
3. Check wallet has 0.75+ TON
4. Try again in 1-2 minutes

## Verification After Deployment

Once user confirms the transaction:

1. **Check Transaction on TONScan:**
   - Click the "View on TONScan" button
   - Verify transaction shows "Success" status
   - Note: May take 30-60 seconds to appear

2. **Verify Contract Deployment:**
   ```sql
   -- Check database
   SELECT subscription_contract_address, is_active
   FROM channels
   WHERE telegram_channel_id = '-100XXXXXXXXX';
   ```

3. **Test Contract:**
   ```bash
   # Get contract address
   curl "https://testnet.toncenter.com/api/v2/runGetMethod?address=FACTORY_ADDRESS&method=getSubscriptionAddress&stack=[{\"type\":\"num\",\"value\":\"CHANNEL_ID\"}]"
   ```

## Next Steps

If issues persist after these fixes:

1. **Check Logs:**
   ```bash
   # View detailed logs
   tail -f /path/to/bot/logs
   # Look for "Error details:" output with full stack trace
   ```

2. **Verify Factory Contract:**
   ```bash
   # Get deployment fee from factory
   curl "https://testnet.toncenter.com/api/v2/runGetMethod?address=FACTORY_ADDRESS&method=getDeploymentFee"
   # Should return 100000000 (0.1 TON in nanotons)
   ```

3. **Test TON Connect:**
   - Disconnect wallet: `/disconnect`
   - Reconnect wallet: `/connect`
   - Verify connection: Check for "Connected" status
   - Try deployment again

4. **Manual Contract Verification:**
   ```typescript
   // In Node.js REPL or test script
   const { TonClient, Address } = require('@ton/ton');
   const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC' });

   const factory = Address.parse('YOUR_FACTORY_ADDRESS');
   const state = await client.getContractState(factory);
   console.log('Factory state:', state.state); // Should be "active"
   ```

## Files Modified

1. `/home/gmet/workspace/ton-paywall/admin-bot/src/services/tonconnect.service.ts`
   - Enhanced `getWalletDeepLink()` method (lines 505-586)
   - Added comprehensive documentation
   - Improved logging

2. `/home/gmet/workspace/ton-paywall/admin-bot/src/bot.ts`
   - Enhanced transaction confirmation UI (lines 475-530)
   - Improved error handling (lines 567-624)
   - Added TONScan explorer links
   - Detailed error logging

## Build Status

✅ TypeScript compilation successful
✅ No errors or warnings

Ready to test!
