# TON Connect Quick Start Guide

## TL;DR
TON Connect is now integrated! Users can pay with one tap using Telegram Wallet or other TON wallets.

## Quick Setup (5 minutes)

### 1. Apply Database Migration
```bash
psql $DATABASE_URL < /home/gmet/workspace/ton-paywall/shared/migrations/002_add_subscriber_tonconnect_support.sql
```

### 2. Install Dependencies
```bash
cd /home/gmet/workspace/ton-paywall/payment-bot
npm install
```

### 3. Build
```bash
npm run build
```

### 4. Add Environment Variable
Add to `/home/gmet/workspace/ton-paywall/payment-bot/.env`:
```bash
TONCONNECT_MANIFEST_URL=https://www.ton-connect.com/ton-paywall-client-manifest.json
```

### 5. Restart Bot
```bash
pm2 restart payment-bot
# OR
npm start
```

## Quick Test

### Test Wallet Connection
1. Send `/wallet` to your payment bot
2. Click "Connect Wallet"
3. Choose Telegram Wallet (or Tonkeeper)
4. Approve connection
5. Bot confirms: "✅ Wallet Connected Successfully!"

### Test Payment
1. Send `/channels`
2. Subscribe to any channel
3. Click "Pay with [Your Wallet]" (new option!)
4. Confirm in wallet
5. Wait ~1 minute for confirmation
6. Access granted!

## What Changed?

### For Users
- **Before**: Copy address, open wallet, paste, send
- **After**: One tap, confirm in wallet, done!

### Payment Options
When user subscribes, they see:
```
[💳 Pay with Telegram Wallet] ← NEW! Recommended
[💎 Pay with Other Wallet]    ← Old method (still works)
[✅ I've sent payment]
```

### New Commands
- `/wallet` - Manage wallet connection

## Supported Wallets
- ✅ Telegram Wallet (built into Telegram)
- ✅ Tonkeeper
- ✅ MyTonWallet
- ✅ Tonhub
- ✅ Any TON Connect 2.0 wallet

## Troubleshooting

### "Command not found" error
**Fix**: Rebuild the bot
```bash
cd /home/gmet/workspace/ton-paywall/payment-bot
npm run build
pm2 restart payment-bot
```

### "Wallet not connected" error
**Fix**: User needs to run `/wallet` first

### Database error
**Fix**: Check migration was applied
```bash
psql $DATABASE_URL -c "\d tonconnect_sessions_subscribers"
```
Should show the table. If not, run migration again.

### QRCode dependency error
**Fix**: Install dependencies
```bash
cd /home/gmet/workspace/ton-paywall/payment-bot
npm install qrcode @types/qrcode
npm run build
```

## Files Changed

### Created:
- `payment-bot/src/services/tonconnect.service.ts` - TON Connect service
- `shared/migrations/002_add_subscriber_tonconnect_support.sql` - Database migration
- `docs/TON_CONNECT_INTEGRATION.md` - Full documentation

### Modified:
- `payment-bot/src/bot.ts` - Added wallet commands and payment options
- `payment-bot/package.json` - Added qrcode dependency
- `payment-bot/.env.example` - Added TONCONNECT_MANIFEST_URL
- `payment-bot/tsconfig.json` - Updated to include shared directory

## Production Notes

### Before Mainnet
1. Create your own manifest file (HTTPS required)
2. Host on your domain
3. Update `TONCONNECT_MANIFEST_URL` in production `.env`
4. Test on testnet first!

### Manifest Template
Create `tonconnect-manifest.json` on your domain:
```json
{
  "url": "https://yourdomain.com",
  "name": "Your Bot Name",
  "iconUrl": "https://yourdomain.com/icon-512x512.png"
}
```

## Need Help?

### Documentation
- Full guide: `/home/gmet/workspace/ton-paywall/docs/TON_CONNECT_INTEGRATION.md`
- Implementation summary: `/home/gmet/workspace/ton-paywall/TON_CONNECT_IMPLEMENTATION_SUMMARY.md`

### Check Logs
```bash
pm2 logs payment-bot --lines 100
```

Look for:
- ✅ "TON Connect Service (Payment Bot) initialized"
- ✅ "Created TON Connect instance for user"
- ❌ Any error messages

### Check Database
```bash
psql $DATABASE_URL
```
```sql
-- Check if migration applied
\d tonconnect_sessions_subscribers

-- Check wallet connections
SELECT telegram_id, wallet_connected FROM subscribers WHERE wallet_connected = true;

-- Check active sessions
SELECT COUNT(*) FROM tonconnect_sessions_subscribers WHERE expires_at > NOW();
```

## Safety Net

Don't worry! The old manual payment method still works as a fallback. If TON Connect has any issues:
- Users can click "Pay with Other Wallet"
- Traditional Tonkeeper deep link works as before
- Payment monitoring detects both types of payments

## Performance

Tested and optimized:
- ✅ No memory leaks
- ✅ Fast database queries (indexed)
- ✅ Session cleanup (24h expiry)
- ✅ Graceful error handling

## What Users Will Say

**Before**: "Why do I have to copy all this stuff?"

**After**: "Wow, that was easy! One click and done!"

---

**Ready?** Run the 5 commands above and you're good to go!

**Questions?** Check the full documentation in `/docs/TON_CONNECT_INTEGRATION.md`
