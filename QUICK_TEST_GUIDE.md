# Quick Test Guide - TON Connect Integration

## Fast Setup for Testing (5 minutes)

### 1. Install Dependencies
```bash
cd /home/gmet/workspace/ton-paywall/admin-bot
npm install
```

### 2. Apply Database Migration
```bash
cd /home/gmet/workspace/ton-paywall
psql $DATABASE_URL < shared/migrations/001_add_tonconnect_support.sql
```

### 3. Host TON Connect Manifest

**Quick Option - Use GitHub Gist:**

1. Go to https://gist.github.com/
2. Create new gist with filename: `tonconnect-manifest.json`
3. Paste this content:
```json
{
  "url": "https://ton-subscription-paywall.com",
  "name": "TON Subscription Paywall Test",
  "iconUrl": "https://ton.org/download/ton_symbol.png",
  "termsOfUseUrl": "https://ton.org/terms",
  "privacyPolicyUrl": "https://ton.org/privacy"
}
```
4. Click "Create public gist"
5. Click "Raw" button to get URL like: `https://gist.githubusercontent.com/username/...`

### 4. Update .env
```bash
cd /home/gmet/workspace/ton-paywall
nano .env  # or use your preferred editor
```

Add this line:
```bash
TONCONNECT_MANIFEST_URL=https://gist.githubusercontent.com/your-gist-url.../tonconnect-manifest.json
```

### 5. Start Admin Bot
```bash
cd /home/gmet/workspace/ton-paywall/admin-bot
npm run dev
```

### 6. Test in Telegram

1. Open Telegram and find your admin bot
2. Send: `/start`
3. Send: `/setup`
4. Follow the flow:
   - ✅ Forward message from channel
   - ✅ Bot verifies admin rights
   - ✅ Add payment bot to channel
   - **🆕 Connect wallet:**
     - Bot shows QR code
     - Open Tonkeeper or TON Wallet
     - Scan QR code or click "Open in Wallet"
     - Approve connection
   - ✅ Set subscription price (e.g., 5 TON)
   - **🆕 Approve deployment:**
     - Bot requests 0.7 TON transaction
     - Open wallet app
     - Review transaction details
     - Approve and sign
     - Wait ~30-60 seconds for confirmation
   - ✅ Contract deployed! Channel active!

## What to Expect

### Wallet Connection (Step 5)
```
Bot: "🔄 Generating TON Connect link..."
Bot: [Shows QR code image]
Bot: "💳 Connect Your TON Wallet
      Scan this QR code with your TON wallet app..."

[User scans QR code in Tonkeeper]

Bot: "✅ Wallet Connected Successfully!
      📍 Address: EQ...
      You will use this wallet to:
      • Pay for contract deployment (0.7 TON)
      • Receive subscription payments"
```

### Contract Deployment (Step 7)
```
Bot: "🚀 Deploying your subscription smart contract...
      💰 You will need to approve a transaction in your wallet:
      • Amount: 0.7 TON (deployment fee)
      • This is a one-time payment
      Please confirm the transaction in your wallet app..."

[Wallet app shows transaction notification]
[User approves in wallet]

Bot: "✅ Transaction sent!
      ⏳ Waiting for blockchain confirmation...
      Transaction: a3f5e8b7c9d2..."

Bot: "⏳ Checking deployment status..."

Bot: "✅ Setup Complete!
      Your subscription bot is now active for Test Channel
      📊 Subscription Details:
      • Monthly Price: 5 TON
      • Contract: EQ...
      • Payment Wallet: EQ..."
```

## Troubleshooting

### "Failed to generate QR code"
```bash
cd admin-bot
npm install qrcode @types/qrcode
```

### "Wallet already connected"
Clear sessions:
```sql
DELETE FROM tonconnect_sessions WHERE telegram_id = YOUR_TELEGRAM_ID;
```

### "Transaction confirmation timeout"
- Normal! Blockchain can be slow
- Transaction was sent successfully
- Contract will still deploy
- Check with `/channels` after 1-2 minutes

### Can't see transaction in wallet
- Ensure wallet app is up to date
- Try disconnecting and reconnecting wallet
- Check wallet app supports TON Connect

## Verification

After successful deployment, verify:

1. **Check database:**
```sql
SELECT telegram_id, wallet_address, wallet_connected, wallet_connection_method
FROM admins
WHERE telegram_id = YOUR_TELEGRAM_ID;

-- Should show:
-- wallet_connected: true
-- wallet_connection_method: 'ton-connect'
```

2. **Check channel:**
```sql
SELECT title, subscription_contract_address, is_active
FROM channels
WHERE telegram_id = YOUR_CHANNEL_ID;

-- Should show:
-- subscription_contract_address: EQ... (not null)
-- is_active: true
```

3. **Check TON Explorer:**
   - Go to https://testnet.tonscan.org (for testnet)
   - Search for contract address
   - Should see "Active" status
   - Should see deployment transaction

4. **Test subscription flow:**
   - Share link with test user: `t.me/YourPaymentBot?start=ch_CHANNEL_ID`
   - User should be able to subscribe
   - Payment should go to YOUR wallet (not bot's)

## Success Indicators

✅ No errors during npm install
✅ Migration applies successfully
✅ Manifest is publicly accessible
✅ Bot starts without errors
✅ QR code displays in Telegram
✅ Wallet connects successfully
✅ Deployment transaction appears in wallet
✅ User can approve transaction
✅ Contract deploys (visible on explorer)
✅ Channel shows as active
✅ User paid 0.7 TON (not bot)

## Next Steps After Testing

1. ✅ Test works on testnet → Deploy to mainnet
2. ✅ Update `TON_NETWORK=mainnet` in .env
3. ✅ Deploy factory contract to mainnet
4. ✅ Update `FACTORY_CONTRACT_ADDRESS` in .env
5. ✅ Host manifest on production domain
6. ✅ Update `TONCONNECT_MANIFEST_URL` to production
7. ✅ Restart bot in production mode
8. 🚀 Launch!

## Need Help?

- **Setup details**: `TONCONNECT_SETUP.md`
- **Changes made**: `IMPLEMENTATION_CHANGES.md`
- **TON Connect docs**: https://docs.ton.org/develop/dapps/ton-connect
- **Project README**: `README.md`

## Comparison: Before vs After

| Aspect | Before (Wrong) | After (Correct) |
|--------|----------------|-----------------|
| Wallet Connection | User types address | User scans QR code |
| Who Pays Deployment | Bot pays 0.7 TON | User pays 0.7 TON ✓ |
| Security | Bot has no wallet | Secure TON Connect |
| User Experience | Manual entry | Wallet app integration |
| Scalability | Bot needs funds | Users pay own costs ✓ |
| Standard | Custom implementation | TON Connect protocol |

The new implementation is **correct, secure, and scalable**!
