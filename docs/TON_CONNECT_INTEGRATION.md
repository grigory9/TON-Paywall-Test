# TON Connect Integration Guide

## Overview

TON Connect has been successfully integrated into the payment bot, allowing users to pay for subscriptions using Telegram's native wallet and other TON wallets with a seamless in-app experience.

## Features Implemented

### 1. Wallet Connection
- Users can connect their TON wallet via TON Connect protocol
- Supports multiple wallets:
  - Telegram Wallet (native)
  - Tonkeeper
  - MyTonWallet
  - Tonhub
  - And more...
- QR code support for desktop wallets
- Deep links for mobile wallets
- Session persistence across bot restarts

### 2. Payment Flow
- **TON Connect Payment** (Recommended):
  - One-tap payment with connected wallet
  - No manual address copying
  - Transaction confirmation in wallet app
  - Automatic blockchain verification

- **Manual Payment** (Fallback):
  - Traditional Tonkeeper deep link
  - Manual transaction sending
  - For users without TON Connect support

### 3. User Commands

#### `/wallet`
Shows current wallet connection status
- If connected: displays wallet name and address
- If not connected: shows connection options

#### `/help`
Updated to include wallet connection instructions

### 4. Payment Options UI

When user clicks "Pay", they see:
1. **Pay with [Connected Wallet]** - if wallet is connected
2. **Connect Wallet & Pay** - if no wallet connected
3. **Pay with Other Wallet** - manual payment option (always available)
4. **I've sent payment** - check payment status

## Database Changes

### New Migration File
**File**: `/home/gmet/workspace/ton-paywall/shared/migrations/002_add_subscriber_tonconnect_support.sql`

**Changes**:
1. Added columns to `subscribers` table:
   - `wallet_connected` (BOOLEAN)
   - `wallet_connection_method` (VARCHAR)

2. Created new table `tonconnect_sessions_subscribers`:
   - Stores TON Connect session data for subscribers
   - Isolated from admin sessions for security
   - Sessions expire after 24 hours
   - Supports session restoration across bot restarts

**To apply migration**:
```bash
psql $DATABASE_URL < /home/gmet/workspace/ton-paywall/shared/migrations/002_add_subscriber_tonconnect_support.sql
```

## Implementation Details

### File Structure

#### New Files Created:
1. **`/home/gmet/workspace/ton-paywall/payment-bot/src/services/tonconnect.service.ts`**
   - TON Connect service implementation
   - Wallet connection management
   - Transaction sending
   - Session persistence using PostgreSQL

#### Modified Files:
1. **`/home/gmet/workspace/ton-paywall/payment-bot/src/bot.ts`**
   - Added TON Connect service integration
   - New wallet commands and callbacks
   - Updated payment flow to support both methods
   - Wallet connection polling

2. **`/home/gmet/workspace/ton-paywall/payment-bot/package.json`**
   - Added `qrcode` dependency for QR code generation
   - Added `@types/qrcode` dev dependency

3. **`/home/gmet/workspace/ton-paywall/payment-bot/.env.example`**
   - Added `TONCONNECT_MANIFEST_URL` environment variable

4. **`/home/gmet/workspace/ton-paywall/payment-bot/tsconfig.json`**
   - Updated to include `../shared/**/*` in compilation

### Key Components

#### 1. TonConnectService
**Location**: `payment-bot/src/services/tonconnect.service.ts`

**Main Methods**:
- `getInstance(userId)` - Get/create TON Connect instance for user
- `generateConnectionUrl(options)` - Generate wallet connection URL
- `checkConnection(userId)` - Check wallet connection status
- `disconnect(userId)` - Disconnect wallet
- `sendTransaction(userId, transaction)` - Send payment transaction

**Features**:
- PostgreSQL-backed session storage
- QR code generation
- Deep link generation for popular wallets
- Transaction validation
- Error handling (user rejection, insufficient funds, timeout)

#### 2. PostgreSQL Storage Adapter
**Class**: `TonConnectPostgresStorage`

Implements TON Connect SDK `IStorage` interface:
- Stores sessions in `tonconnect_sessions_subscribers` table
- 24-hour session expiry
- Automatic cleanup of expired sessions

#### 3. Payment Flow

**TON Connect Payment**:
```
User clicks "Pay with Connected Wallet"
    ↓
Bot prepares transaction (amount, destination)
    ↓
Transaction sent to wallet via TON Connect
    ↓
User confirms in wallet app (2-minute timeout)
    ↓
Transaction broadcasted to blockchain
    ↓
Bot receives transaction hash
    ↓
Payment monitoring service detects payment
    ↓
Subscription activated
```

**Manual Payment** (unchanged):
```
User clicks "Pay with Other Wallet"
    ↓
Bot shows contract address and amount
    ↓
User manually sends transaction
    ↓
Payment monitoring service detects payment
    ↓
Subscription activated
```

## Environment Variables

### Required
```bash
TONCONNECT_MANIFEST_URL=https://www.ton-connect.com/ton-paywall-client-manifest.json
```

**IMPORTANT**: Before production deployment, create your own manifest file and host it on your domain. The manifest file should contain:

```json
{
  "url": "https://yourdomain.com",
  "name": "TON Subscription Paywall",
  "iconUrl": "https://yourdomain.com/icon-512x512.png",
  "termsOfUseUrl": "https://yourdomain.com/terms",
  "privacyPolicyUrl": "https://yourdomain.com/privacy"
}
```

## Security Considerations

### 1. Session Isolation
- Admin sessions stored in `tonconnect_sessions` table
- Subscriber sessions stored in `tonconnect_sessions_subscribers` table
- No cross-contamination between admin and subscriber sessions

### 2. Transaction Validation
Before sending any transaction:
- Validates wallet is connected
- Validates recipient address format
- Validates amount is positive
- Sets reasonable timeout (2 minutes)

### 3. Error Handling
Custom error classes for different failure scenarios:
- `UserRejectedError` - User cancelled transaction
- `InsufficientFundsError` - Not enough balance
- `TransactionError` - Generic transaction failure
- `TonConnectError` - TON Connect protocol error

### 4. Session Expiry
- All sessions expire after 24 hours
- Expired sessions cleaned up automatically
- Stale sessions detected and cleared

## Testing Instructions

### 1. Database Setup
Apply the migration:
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

### 4. Configure Environment
Update `.env` with:
```bash
TONCONNECT_MANIFEST_URL=https://www.ton-connect.com/ton-paywall-client-manifest.json
```

### 5. Start Payment Bot
```bash
npm start
```

### 6. Test Flow

#### Test Wallet Connection:
1. Send `/wallet` to bot
2. Click "Connect Wallet"
3. Choose your wallet (Telegram Wallet recommended for testing)
4. Approve connection in wallet
5. Bot should confirm connection with wallet name and address

#### Test TON Connect Payment:
1. Browse channels with `/channels`
2. Subscribe to a channel
3. Choose "Pay with [Your Wallet]"
4. Confirm transaction in wallet
5. Wait for blockchain confirmation
6. Subscription should activate automatically

#### Test Manual Payment (Fallback):
1. Subscribe to a channel
2. Choose "Pay with Other Wallet"
3. Use Tonkeeper or manually send transaction
4. Click "I've sent payment" to check status

## User Experience Flow

### First-Time User (No Wallet Connected)
```
/start
    ↓
Browse channels
    ↓
Select channel & subscribe
    ↓
See payment options:
  [🔗 Connect Wallet & Pay]
  [💎 Pay with Other Wallet]
    ↓
Connect wallet OR use manual payment
    ↓
Complete payment
    ↓
Access granted
```

### Returning User (Wallet Already Connected)
```
/start
    ↓
Browse channels
    ↓
Select channel & subscribe
    ↓
See payment options:
  [💳 Pay 10 TON with Telegram Wallet] ← Recommended
  [💎 Pay with Other Wallet]
    ↓
One-tap payment
    ↓
Confirm in wallet
    ↓
Access granted
```

## Monitoring & Logging

### Log Messages to Watch For

**Success**:
```
🔗 TON Connect Service (Payment Bot) initialized with manifest: [URL]
[Payment Bot] Created TON Connect instance for user [ID], connected: true
✅ Transaction confirmed by subscriber [ID]
Extracted transaction hash: [hash]
```

**Errors**:
```
TON Connect PostgreSQL storage error: [error]
Error checking TON Connect connection for subscriber [ID]: [error]
[Payment Bot] TON Connect transaction error: [error]
Transaction confirmation timed out
```

## Troubleshooting

### Issue: "Wallet not connected" error
**Solution**: User needs to run `/wallet` and connect wallet first

### Issue: "Transaction timeout"
**Cause**: User didn't confirm transaction within 2 minutes
**Solution**: User should try again and confirm faster

### Issue: Sessions not persisting
**Check**:
1. Database migration applied?
2. `tonconnect_sessions_subscribers` table exists?
3. Database connection working?

### Issue: QR code not showing
**Check**:
1. `qrcode` package installed?
2. Check logs for QR generation errors

## Production Deployment Checklist

- [ ] Apply database migration
- [ ] Create custom TON Connect manifest file
- [ ] Host manifest on your domain (HTTPS required)
- [ ] Update `TONCONNECT_MANIFEST_URL` in production `.env`
- [ ] Test wallet connection on testnet
- [ ] Test payment flow on testnet
- [ ] Verify payment monitoring detects TON Connect transactions
- [ ] Test all error scenarios (rejection, insufficient funds, timeout)
- [ ] Setup monitoring for TON Connect errors
- [ ] Document wallet support for users
- [ ] Switch to mainnet
- [ ] Final end-to-end test on mainnet

## Performance Considerations

### Database Queries
- TON Connect sessions add 2-3 queries per wallet connection
- Session lookups are indexed (fast)
- Consider cleaning up expired sessions periodically

### Wallet Connection Polling
- Polls every 3 seconds for up to 5 minutes
- Consider optimizing if many users connect simultaneously
- Current implementation is stateless (no memory accumulation)

### Transaction Timeouts
- 2-minute timeout for transaction confirmation
- 5-minute `validUntil` for blockchain validity
- Balance between user experience and resource usage

## Comparison: TON Connect vs Manual Payment

| Feature | TON Connect | Manual Payment |
|---------|-------------|----------------|
| User Experience | ⭐⭐⭐⭐⭐ One tap | ⭐⭐⭐ Copy/paste |
| Security | ⭐⭐⭐⭐⭐ Protocol-secured | ⭐⭐⭐⭐ Standard |
| Error Handling | ⭐⭐⭐⭐⭐ Detailed | ⭐⭐⭐ Basic |
| Wallet Support | Most TON wallets | All TON wallets |
| Implementation | Complex | Simple |
| Maintenance | Medium | Low |

## Future Enhancements

### Planned
- [ ] QR code display for desktop users
- [ ] Wallet balance check before payment
- [ ] Multi-wallet support (save multiple wallets)
- [ ] Payment memo/comment support in TON Connect transactions

### Under Consideration
- [ ] Automatic wallet reconnection on session expiry
- [ ] Payment history via TON Connect
- [ ] Subscription renewal reminders via connected wallet
- [ ] Batch payment support (multiple channels at once)

## Support & Resources

### TON Connect Documentation
- Official docs: https://docs.ton.org/develop/dapps/ton-connect/
- SDK reference: https://github.com/ton-connect/sdk

### TON Blockchain
- TON docs: https://docs.ton.org
- Testnet explorer: https://testnet.tonscan.org
- Mainnet explorer: https://tonscan.org

### Related Files
- Admin bot TON Connect: `/home/gmet/workspace/ton-paywall/admin-bot/src/services/tonconnect.service.ts`
- Database schema: `/home/gmet/workspace/ton-paywall/shared/database-schema.sql`
- Payment monitoring: `/home/gmet/workspace/ton-paywall/payment-bot/src/services/payment.ts`

---

**Last Updated**: 2025-10-26
**Version**: 1.0
**Status**: ✅ Production Ready (after testing)
