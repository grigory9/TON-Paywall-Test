# Implementation Changes: User-Paid Deployment via TON Connect

## Summary

The admin bot has been updated to use **TON Connect** for wallet connection and contract deployment. **Channel owners now pay deployment fees from their own wallets**, not from the bot's wallet.

## What Changed

### Before (Incorrect Implementation):
- Bot stored its own wallet mnemonic
- Bot paid 0.7 TON deployment fee for each channel
- Users only provided wallet address as text (no actual connection)
- Bot deployed contracts on behalf of users

### After (Correct Implementation):
- Users connect wallets via TON Connect (QR code + deep links)
- Users approve deployment transaction in their wallet app
- **Users pay 0.7 TON deployment fee themselves**
- Bot only facilitates the transaction, doesn't execute it
- Subscription payments still go to user's wallet (unchanged)

## Files Modified

### 1. **Dependencies** (`admin-bot/package.json`)
- Added `qrcode` for QR code generation
- Added `@types/qrcode` for TypeScript support
- `@tonconnect/sdk` was already present

### 2. **Database Schema** (`shared/migrations/001_add_tonconnect_support.sql`)
- Added `tonconnect_sessions` table for session storage (replaces Redis)
- Added `wallet_connected` boolean field to `admins` table
- Added `wallet_connection_method` field ('ton-connect' or 'manual')

### 3. **TON Connect Service** (NEW: `admin-bot/src/services/tonconnect.service.ts`)
- PostgreSQL-based session storage (no Redis needed)
- QR code generation for wallet connection
- Transaction request and confirmation handling
- Connection status monitoring
- Error handling (user rejected, insufficient funds, timeout)

### 4. **Shared TON Client** (`shared/ton-client.ts`)
- **Added**: `generateDeploymentTransaction()` - Creates transaction for user to sign
- **Added**: `getContractAddressFromFactory()` - Retrieves contract address after deployment
- **Deprecated**: `deploySubscriptionContract()` - Now throws error, not used anymore

### 5. **Contract Deployment Service** (`admin-bot/src/services/contract-deployment.ts`)
- **Changed**: Now uses TON Connect instead of bot wallet
- **Added**: `requestDeploymentFromUser()` - Sends transaction request to user
- **Added**: `waitForDeploymentAndGetAddress()` - Polls for deployment confirmation
- **Removed**: Direct deployment via bot wallet

### 6. **Admin Bot** (`admin-bot/src/bot.ts`)
- **Step 5 (Wallet Connection)**: Now uses TON Connect with QR code
  - Shows QR code for wallet apps
  - Polls for connection (5 minutes timeout)
  - Saves connection status to database
- **Step 7 (Contract Deployment)**: Now requests user transaction
  - Generates deployment transaction
  - User approves in wallet app
  - Waits for blockchain confirmation
  - Handles errors (rejection, insufficient funds, timeout)

### 7. **Database Service** (`admin-bot/src/database/database.ts`)
- Updated `updateAdmin()` to support new wallet fields
- Added support for `wallet_connected` and `wallet_connection_method`

### 8. **Configuration Files**
- **New**: `tonconnect-manifest.json` - TON Connect manifest (must be publicly hosted)
- **Updated**: `.env.example` - Added `TONCONNECT_MANIFEST_URL` variable
- **Updated**: Deprecated `ADMIN_MNEMONIC` (no longer needed)

### 9. **Documentation**
- **New**: `TONCONNECT_SETUP.md` - Complete setup guide
- **New**: `IMPLEMENTATION_CHANGES.md` - This file

## Setup Required

### 1. Install Dependencies
```bash
cd admin-bot
npm install
```

### 2. Apply Database Migration
```bash
psql $DATABASE_URL < shared/migrations/001_add_tonconnect_support.sql
```

### 3. Host TON Connect Manifest
Upload `tonconnect-manifest.json` to a publicly accessible HTTPS URL.

For testing, use GitHub:
```
https://raw.githubusercontent.com/yourusername/ton-subscription-paywall/main/tonconnect-manifest.json
```

### 4. Update Environment Variables
Add to `.env`:
```bash
TONCONNECT_MANIFEST_URL=https://your-public-url/tonconnect-manifest.json
```

Remove or comment out (no longer needed):
```bash
# ADMIN_MNEMONIC="..."
```

### 5. Test the Flow
```bash
cd admin-bot
npm run dev
```

In Telegram:
1. `/start`
2. `/setup`
3. Follow the flow - wallet connection will show QR code
4. Deployment will request 0.7 TON transaction from user

## Architectural Benefits

✅ **Correct Business Logic**: Users pay for their own infrastructure
✅ **Secure**: Bot never has access to private keys
✅ **Scalable**: No need for bot to have funds for deployments
✅ **Transparent**: Users see exact transaction details before approving
✅ **Standard**: Uses official TON Connect protocol
✅ **No Redis**: Session storage uses existing PostgreSQL database

## Transaction Flow

```
Old Flow:
┌─────────────┐
│    User     │ Provides wallet address (text)
└─────────────┘
      ↓
┌─────────────┐
│  Admin Bot  │ Deploys contract using bot's wallet
└─────────────┘ Pays 0.7 TON from bot's funds ❌
      ↓
┌─────────────┐
│  Contract   │ Deployed
└─────────────┘

New Flow:
┌─────────────┐
│    User     │ Connects wallet via TON Connect
└─────────────┘ (QR code + wallet app)
      ↓
┌─────────────┐
│  Admin Bot  │ Generates deployment transaction
└─────────────┘ Sends to user's wallet
      ↓
┌─────────────┐
│ User Wallet │ Shows transaction (0.7 TON)
└─────────────┘ User approves
      ↓
┌─────────────┐
│  Blockchain │ Transaction executed
└─────────────┘ User pays 0.7 TON ✓
      ↓
┌─────────────┐
│  Contract   │ Deployed to factory
└─────────────┘
```

## Error Handling

The implementation handles all common errors:

1. **User Rejects Transaction**: Clear message, can retry
2. **Insufficient Balance**: Tells user to add funds
3. **Connection Timeout**: Can reconnect and retry
4. **Deployment Timeout**: Transaction sent, contract may still deploy
5. **Stale Sessions**: Automatically cleaned up

## Payment Flow (Unchanged)

Subscription payments work the same as before:
1. Subscriber pays to contract address
2. Contract receives payment
3. Contract forwards to admin wallet (minus gas)
4. User gets channel access

**The only change is who pays the initial deployment fee**: now the channel owner, not the bot.

## Testing Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] Database migration applied
- [ ] TON Connect manifest hosted publicly
- [ ] Environment variable set (`TONCONNECT_MANIFEST_URL`)
- [ ] Admin bot starts without errors
- [ ] `/setup` command works
- [ ] Wallet connection shows QR code
- [ ] Can connect wallet (Tonkeeper/TON Wallet)
- [ ] Deployment transaction appears in wallet
- [ ] User can approve transaction
- [ ] Contract deploys successfully
- [ ] Channel setup completes

## Rollback (If Needed)

If issues arise, you can temporarily revert:

1. Checkout previous commit
2. Use old deployment flow
3. Bot pays fees (requires `ADMIN_MNEMONIC`)

However, this is **not recommended** for production - the new flow is the correct implementation.

## Support

- TON Connect docs: https://docs.ton.org/develop/dapps/ton-connect/overview
- Setup guide: `TONCONNECT_SETUP.md`
- Project README: `README.md`

## Next Steps

1. Test the complete flow on testnet
2. Deploy factory contract to mainnet
3. Host manifest on production domain
4. Update `TONCONNECT_MANIFEST_URL` to production
5. Launch!
