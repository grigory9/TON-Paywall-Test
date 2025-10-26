# TON Connect Setup Guide

This guide explains how to configure TON Connect for the admin bot to enable channel owners to connect their wallets and pay deployment fees themselves.

## What is TON Connect?

TON Connect is a protocol that allows Telegram bots to connect to users' TON wallets (Tonkeeper, TON Wallet, MyTonWallet, etc.) and request transaction signatures. This ensures:

- **Users pay deployment fees from their own wallets** (not the bot)
- **Secure transaction signing** - Bot never has access to private keys
- **Better UX** - QR code and deep link support for wallet apps

## Prerequisites

1. **TON Connect Manifest** - A publicly accessible JSON file
2. **Database Migration** - PostgreSQL tables for session storage
3. **Environment Variables** - Configuration for TON Connect

## Step 1: Host the TON Connect Manifest

The manifest file (`tonconnect-manifest.json`) must be publicly accessible via HTTPS.

### Option A: Use GitHub Pages (Recommended for testing)

1. Create a public GitHub repository
2. Upload `tonconnect-manifest.json` to the repository
3. Enable GitHub Pages in repository settings
4. Access via: `https://raw.githubusercontent.com/yourusername/repo/main/tonconnect-manifest.json`

### Option B: Host on your own server

1. Upload `tonconnect-manifest.json` to your web server
2. Ensure it's accessible via HTTPS
3. Example: `https://yourdomain.com/tonconnect-manifest.json`

### Update the Manifest

Edit `tonconnect-manifest.json`:

```json
{
  "url": "https://your-actual-domain.com",
  "name": "Your Bot Name",
  "iconUrl": "https://your-actual-domain.com/icon-512x512.png",
  "termsOfUseUrl": "https://your-actual-domain.com/terms",
  "privacyPolicyUrl": "https://your-actual-domain.com/privacy"
}
```

**Important**: The `iconUrl` must be a 512x512 PNG image accessible via HTTPS.

## Step 2: Apply Database Migration

Run the migration to add TON Connect session storage:

```bash
psql $DATABASE_URL < shared/migrations/001_add_tonconnect_support.sql
```

This creates:
- `tonconnect_sessions` table for session storage (replaces Redis)
- Updates `admins` table with wallet connection tracking fields

## Step 3: Update Environment Variables

Add to your `.env` file:

```bash
# TON Connect Configuration
TONCONNECT_MANIFEST_URL=https://raw.githubusercontent.com/yourusername/repo/main/tonconnect-manifest.json

# Existing variables (make sure these are set)
FACTORY_CONTRACT_ADDRESS=EQ...
TON_NETWORK=testnet  # or mainnet
ADMIN_BOT_TOKEN=your_admin_bot_token
PAYMENT_BOT_TOKEN=your_payment_bot_token
PAYMENT_BOT_USERNAME=YourPaymentBot
DATABASE_URL=postgresql://user:pass@localhost:5432/ton_subscription_mvp
```

## Step 4: Install Dependencies

```bash
cd admin-bot
npm install
```

This will install the newly added dependencies:
- `qrcode` - QR code generation for wallet connection
- `@types/qrcode` - TypeScript types

## Step 5: Test the Implementation

1. Start the admin bot:
   ```bash
   cd admin-bot
   npm run dev
   ```

2. In Telegram, message the bot:
   ```
   /start
   /setup
   ```

3. Follow the setup flow:
   - Add channel
   - Verify admin rights
   - Add payment bot
   - **Connect wallet via TON Connect** (NEW)
     - Bot will show QR code
     - Scan with Tonkeeper/TON Wallet
     - Wallet will connect to bot
   - Set subscription price
   - **Approve deployment transaction** (NEW)
     - Bot requests 0.7 TON transaction
     - User approves in wallet app
     - User pays deployment fee
     - Contract is deployed

## How It Works

### Old Flow (Bot Pays):
```
1. User provides wallet address as text
2. Bot deploys contract using bot's wallet ❌
3. Bot pays 0.7 TON deployment fee ❌
```

### New Flow (User Pays):
```
1. User connects wallet via TON Connect ✓
2. Bot generates deployment transaction ✓
3. User approves transaction in wallet app ✓
4. User pays 0.7 TON deployment fee ✓
5. Contract deployed to user's specification ✓
```

## Architecture Changes

### Services Added:
- **`tonconnect.service.ts`** - TON Connect integration with PostgreSQL storage
- Connection management, QR code generation, transaction signing

### Services Modified:
- **`contract-deployment.ts`** - Now requests user to sign deployment transactions
- **`ton-client.ts`** - Added transaction generation (not execution)
- **`database.ts`** - Added wallet connection tracking fields

### Bot Flow Modified:
- **Wallet Connection (Step 5)**:
  - Generate TON Connect QR code
  - Poll for wallet connection
  - Save connection to database

- **Contract Deployment (Step 7)**:
  - Generate deployment transaction
  - Request user signature via TON Connect
  - Wait for blockchain confirmation
  - Get contract address from factory

## Troubleshooting

### "Wallet already connected" error
Clear stale sessions:
```sql
DELETE FROM tonconnect_sessions WHERE expires_at < NOW();
```

### "Failed to generate QR code" error
Ensure `qrcode` npm package is installed:
```bash
cd admin-bot && npm install qrcode @types/qrcode
```

### "Manifest not accessible" error
1. Check manifest URL is publicly accessible
2. Try accessing in browser: should return JSON
3. Must be HTTPS (not HTTP)

### "Transaction confirmation timeout"
- Deployment takes ~30-60 seconds on TON blockchain
- Bot waits up to 60 seconds
- If timeout, contract might still deploy (check /channels)

### User doesn't see transaction request
1. Ensure wallet app is properly connected
2. Check wallet app supports TON Connect
3. Try reconnecting wallet

## Production Deployment

1. **Host manifest on production domain**
   ```
   https://your-production-domain.com/tonconnect-manifest.json
   ```

2. **Update environment variable**
   ```bash
   TONCONNECT_MANIFEST_URL=https://your-production-domain.com/tonconnect-manifest.json
   ```

3. **Deploy factory contract to mainnet**
   ```bash
   cd contracts
   TON_NETWORK=mainnet npm run deploy
   ```

4. **Update network configuration**
   ```bash
   TON_NETWORK=mainnet
   FACTORY_CONTRACT_ADDRESS=EQ_your_mainnet_factory_address
   ```

## Security Notes

- Bot never has access to private keys
- All transactions are signed by user in their wallet app
- Session storage uses PostgreSQL (secure, not shared between users)
- Sessions expire after 24 hours
- Wallet connections can be manually disconnected

## Benefits of This Implementation

✅ **User pays deployment fees** - Not the bot operator
✅ **Secure** - No private key exposure
✅ **Better UX** - Wallet apps provide familiar transaction approval flow
✅ **Scalable** - PostgreSQL session storage (no Redis needed)
✅ **Transparent** - Users see exact transaction details before signing
✅ **Works with all TON wallets** - Tonkeeper, TON Wallet, MyTonWallet, etc.

## Next Steps

After successful setup:
1. Test complete channel setup flow
2. Verify contract deployment on TON explorer
3. Test subscription payments (payment bot)
4. Monitor analytics and user experience

For support, check:
- TON Connect docs: https://docs.ton.org/develop/dapps/ton-connect/overview
- Project README: `README.md`
- Deployment guide: `docs/DEPLOYMENT.md`
