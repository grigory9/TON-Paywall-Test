# Quick Fix Guide - Deployment Issues

## What Was Fixed

### 1. Enhanced Error Handling ✅
- Better error messages showing exactly what went wrong
- Detailed logging to help diagnose issues
- Specific guidance for each error type

### 2. Improved Deep Link Feature ✅
- Added TONScan explorer link to view transactions
- Better button text: "View in {WalletName}" instead of "Open to Confirm"
- Handles browser extension wallets that don't have mobile apps
- Shows transaction hash for reference

### 3. Better User Experience ✅
- Transaction confirmation message is clearer
- Direct link to view transaction on blockchain explorer
- Helpful troubleshooting steps in error messages

## How to Test

### Step 1: Restart the Bot
```bash
cd /home/gmet/workspace/ton-paywall/admin-bot

# The build is already done, just restart
# If using PM2:
pm2 restart admin-bot

# If running manually:
npm start
# Or for development:
npm run dev
```

### Step 2: Prerequisites Check
Before trying to deploy a contract, make sure:

1. **Wallet has enough TON:**
   - Minimum: 0.75 TON
   - Recommended: 1.0 TON

2. **Factory contract is deployed:**
   ```bash
   # Check your .env file
   cat .env | grep FACTORY_CONTRACT_ADDRESS

   # Verify it's deployed on TONScan:
   # For testnet: https://testnet.tonscan.org/address/YOUR_FACTORY_ADDRESS
   # For mainnet: https://tonscan.org/address/YOUR_FACTORY_ADDRESS
   ```

3. **Correct network:**
   ```bash
   # Check your .env file
   cat .env | grep TON_NETWORK
   # Should match where your factory is deployed (testnet or mainnet)
   ```

### Step 3: Test the Flow

1. **Connect Wallet:**
   ```
   /connect
   ```
   - Click wallet button
   - Approve connection in wallet app

2. **Setup Channel:**
   ```
   /setup
   ```
   - Follow the wizard
   - When you get to deployment, watch for:
     - ✅ "Transaction Confirmed!" message
     - 📱 Button to view in wallet (if mobile wallet)
     - 🔍 Button to view on TONScan

3. **What to Expect:**
   - You approve the transaction in your wallet
   - Bot shows "Transaction Confirmed!" with hash
   - Buttons appear:
     - "📱 View in Tonkeeper" (or your wallet name)
     - "🔍 View on TONScan"
   - Bot waits 30-60 seconds for blockchain confirmation
   - Success message shows contract address

## Common Errors & Solutions

### Error: "Insufficient Balance"
```
❌ Insufficient Balance

Your wallet needs at least 0.75 TON for contract deployment:
• 0.7 TON for deployment
• ~0.05 TON for gas fees
```

**Solution:** Add more TON to your wallet

---

### Error: "Transaction Timeout"
```
⏱️ Transaction Timeout

The transaction confirmation took too long.
```

**Solution:**
- Try again
- Click the deep link button immediately when it appears
- Confirm in wallet within 2 minutes

---

### Error: "Wallet Not Connected"
```
❌ Wallet Not Connected

Your wallet connection was lost.
```

**Solution:**
```
/disconnect
/connect
```
Then try `/setup` again

---

### Error: "Transaction Rejected"
```
❌ Transaction Rejected

You cancelled the deployment transaction in your wallet.
```

**Solution:** This is normal if you clicked "Reject" in your wallet. No funds were deducted. Just try `/setup` again when ready.

---

### Wallet Shows "Insufficient fee" Error

**Cause:** Factory contract requires at least 0.6 TON, but you're sending 0.7 TON, so this should not happen unless:
1. Factory address is wrong
2. Factory is not deployed
3. Network mismatch (wallet on mainnet, factory on testnet, or vice versa)

**Solution:**
1. Verify factory address in `.env`:
   ```bash
   cat .env | grep FACTORY_CONTRACT_ADDRESS
   ```

2. Check factory on TONScan:
   - Testnet: `https://testnet.tonscan.org/address/YOUR_FACTORY_ADDRESS`
   - Mainnet: `https://tonscan.org/address/YOUR_FACTORY_ADDRESS`
   - Should show "Active" status

3. Verify network matches:
   ```bash
   cat .env | grep TON_NETWORK
   ```
   - If `TON_NETWORK=testnet`, factory must be on testnet
   - If `TON_NETWORK=mainnet`, factory must be on mainnet
   - Your wallet must be connected to the same network

4. Check if channel already has contract:
   ```sql
   psql $DATABASE_URL -c "SELECT subscription_contract_address FROM channels WHERE telegram_channel_id = 'YOUR_CHANNEL_ID';"
   ```
   - If contract exists, factory will reject with "Already deployed"

---

### Wallet Shows "Already deployed" Error

**Cause:** This channel already has a deployed contract

**Solution:**
```sql
-- Check existing contract
psql $DATABASE_URL -c "SELECT id, telegram_channel_id, subscription_contract_address FROM channels WHERE telegram_channel_id = 'YOUR_CHANNEL_ID';"

-- Option 1: Use existing contract (recommended)
-- Just mark it as active
psql $DATABASE_URL -c "UPDATE channels SET is_active = true WHERE telegram_channel_id = 'YOUR_CHANNEL_ID';"

-- Option 2: Delete and redeploy (DANGER: loses all subscription data)
psql $DATABASE_URL -c "DELETE FROM channels WHERE telegram_channel_id = 'YOUR_CHANNEL_ID';"
-- Then try /setup again
```

## Debugging Tips

### Check Detailed Logs

The bot now logs detailed information when errors occur:

```bash
# If using PM2:
pm2 logs admin-bot --lines 100

# If running manually:
# Just watch the console output
```

Look for:
```
❌ Contract deployment failed: [error]
Error details: {
  message: "...",
  stack: "...",
  channelId: ...,
  walletAddress: "...",
  price: ...
}
```

### Verify Transaction on TONScan

After clicking "Approve" in your wallet:

1. Click the "🔍 View on TONScan" button in the bot
2. Wait 5-10 seconds for transaction to appear
3. Check transaction status:
   - ✅ Success: Contract deployed
   - ⏳ Pending: Wait 30 more seconds
   - ❌ Failed: Check error message on TONScan

### Test Factory Contract Directly

```bash
# Get deployment fee from factory
curl "https://testnet.toncenter.com/api/v2/runGetMethod?address=YOUR_FACTORY_ADDRESS&method=getDeploymentFee"

# Expected response:
{
  "ok": true,
  "result": {
    "stack": [["num", "100000000"]]  // 0.1 TON in nanotons
  }
}
```

If this fails, factory is not deployed correctly.

### Check Wallet Connection

```bash
# In psql:
psql $DATABASE_URL -c "SELECT telegram_id, wallet_address, wallet_connected FROM admins WHERE telegram_id = 'YOUR_USER_ID';"

# Should show:
# wallet_connected | true
# wallet_address   | EQ... (your address)
```

If `wallet_connected` is `false`, reconnect:
```
/disconnect
/connect
```

## Files Changed

1. **tonconnect.service.ts** - Enhanced deep link generation with better logging
2. **bot.ts** - Improved error handling and user messages

## Next Steps

1. Restart the bot
2. Try the deployment flow
3. Check the logs for detailed error information
4. Share the error messages if issues persist

The bot will now provide much clearer information about what's happening and what to do if something goes wrong.
