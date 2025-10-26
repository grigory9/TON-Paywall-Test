# MVP Launch Guide - TON Subscription Paywall

## 🎉 Critical Fixes Completed

This guide documents the critical fixes implemented for MVP launch and provides step-by-step deployment instructions.

### ✅ What Was Fixed

#### 1. Smart Contract Fixes (`contracts/contracts/factory.tact`)
- **Fixed tolerance calculation** - Proper order of operations to avoid rounding issues
- **Fixed revenue accounting** - Now tracks actual received amounts instead of just monthly price
- **Optimized gas reservation** - Reduced from 0.05 to 0.02 TON (saves 60% on gas fees)
- **Improved overpayment refunds** - Lowered threshold from 0.1 to 0.01 TON
- **Added typed messages** - Replaced string-based messages with proper message structs
- **Added price validation** - Maximum price limit of 1000 TON

#### 2. TON Blockchain Integration (`shared/ton-client.ts`)
- ✅ **Wallet Management** - Load wallet from mnemonic, sign transactions
- ✅ **Contract Deployment** - Real blockchain deployment with transaction confirmation
- ✅ **Payment Verification** - Parse transactions and verify subscription payments
- ✅ **Contract Method Calls** - Call isActive() and getExpiry() getters
- ✅ **Transaction Waiting** - Wait for seqno updates to confirm transactions

#### 3. Payment Monitoring (`payment-bot/src/services/payment.ts`)
- ✅ **Real Payment Verification** - Uses blockchain transaction parsing
- ✅ **Proper Activation** - Records transaction hash, from address, amount
- ✅ **Health Checks** - Monitors service health and prevents overlapping checks
- ✅ **Idempotency** - Prevents duplicate activations
- ✅ **Better SQL Queries** - Parameterized queries, 24-hour window, proper indexing

#### 4. Configuration & Security
- ✅ **Fixed Environment Variables** - ADMIN_BOT_TOKEN and PAYMENT_BOT_TOKEN (not TELEGRAM_BOT_TOKEN)
- ✅ **Production Validation** - Prevents running on testnet in production mode
- ✅ **SQL Injection Prevention** - Validates deep link channel IDs
- ✅ **Fixed tact.config.json** - Removed non-existent file reference

## 🚀 Deployment Steps

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- TON wallet with balance for contract deployment
- Two Telegram bot tokens (from @BotFather)

### Step 1: Install Dependencies

```bash
# From project root
npm install

# Install contracts dependencies
cd contracts && npm install && cd ..

# Install admin bot dependencies
cd admin-bot && npm install && cd ..

# Install payment bot dependencies
cd payment-bot && npm install && cd ..
```

### Step 2: Setup Database

```bash
# Create database
sudo -u postgres psql -c "CREATE DATABASE ton_subscription_mvp;"
sudo -u postgres psql -c "CREATE USER ton_app WITH PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ton_subscription_mvp TO ton_app;"

# Apply schema
psql -U ton_app -d ton_subscription_mvp -f shared/database-schema.sql
```

### Step 3: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit with your values
nano .env
```

Required variables:
```env
# Database
DATABASE_URL=postgresql://ton_app:your_secure_password@localhost:5432/ton_subscription_mvp

# Telegram Bots (get from @BotFather)
ADMIN_BOT_TOKEN=123456789:ABCdefGHI...
PAYMENT_BOT_TOKEN=987654321:ZYXwvuTSR...
PAYMENT_BOT_USERNAME=YourPaymentBot
PAYMENT_BOT_ID=987654321

# TON Blockchain
TON_NETWORK=testnet  # Use testnet for testing first!
FACTORY_CONTRACT_ADDRESS=  # Will fill after deployment
ADMIN_MNEMONIC="word1 word2 word3 ... word24"  # Your deployment wallet

# Application
NODE_ENV=development  # Use development for testing
PAYMENT_CHECK_INTERVAL=30000
```

### Step 4: Build Everything

```bash
# Build contracts
cd contracts
npm run build
cd ..

# Build admin bot
cd admin-bot
npm run build
cd ..

# Build payment bot
cd payment-bot
npm run build
cd ..
```

### Step 5: Deploy Factory Contract

⚠️ **Start with testnet!** Only deploy to mainnet after thorough testing.

```bash
cd contracts

# Deploy to testnet
TON_NETWORK=testnet npm run deploy

# Note the factory address from output
# Example: Factory deployed at: EQC...
```

Update `.env` with the factory address:
```env
FACTORY_CONTRACT_ADDRESS=EQC...  # Address from deployment output
```

### Step 6: Initialize TON Client

The TON client needs to be initialized with your deployer wallet mnemonic. This wallet will:
- Deploy subscription contracts for each channel
- Pay for gas fees

Make sure your wallet has sufficient balance:
- **Testnet**: Get free testnet TON from https://testnet.tonfaucet.com
- **Mainnet**: Ensure at least 5 TON for multiple deployments

### Step 7: Start Bots

#### Development Mode (with hot reload)

```bash
# Terminal 1: Admin Bot
cd admin-bot
npm run dev

# Terminal 2: Payment Bot
cd payment-bot
npm run dev
```

#### Production Mode (with PM2)

```bash
# Build first
npm run build

# Start with PM2
pm2 start admin-bot/dist/index.js --name admin-bot
pm2 start payment-bot/dist/index.js --name payment-bot

# Save PM2 configuration
pm2 save
pm2 startup
```

### Step 8: Verify Bots are Running

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs admin-bot
pm2 logs payment-bot

# Or for development mode, check console output
```

Expected output:
```
✅ Admin Bot started successfully
Network: testnet
Factory: EQC...

✅ Payment Bot started successfully
Network: testnet
Factory: EQC...
Payment monitoring started (interval: 30000ms)
```

## 🧪 Testing Checklist

### 1. Test Admin Bot

1. **Start conversation**: Send `/start` to admin bot
2. **Setup channel**: Use `/setup` command
   - Forward message from your test channel
   - Verify admin rights (you must be channel admin)
   - Add payment bot as admin to channel
   - Enter your TON wallet address
   - Set subscription price (e.g., 1 TON for testing)
   - Wait for contract deployment (~30 seconds)
   - Note the contract address in output

3. **View channels**: Send `/channels` to see your configured channel
4. **Check analytics**: Send `/analytics` (will be empty initially)

### 2. Test Payment Bot

1. **Start conversation**: Send `/start` to payment bot
2. **Subscribe via deep link**: Use link from admin bot setup completion
   - Format: `t.me/YourPaymentBot?start=ch_<channel_id>`
3. **Initiate payment**: Click "Pay X TON" button
4. **Send payment**:
   - Click "Pay with TON Wallet" button
   - Or manually send TON to contract address with comment "Subscribe"
5. **Wait for confirmation**: Should take 1-2 minutes
6. **Check subscription**: Click "I've sent payment" to check status

### 3. Verify Payment Monitoring

```bash
# Watch payment bot logs
pm2 logs payment-bot --lines 50

# Should see:
# "Checking X pending subscriptions"
# "Payment found for subscription X"
# "Subscription X activated with tx ..."
```

### 4. Verify On-Chain

Visit TON Explorer:
- **Testnet**: https://testnet.tonscan.org
- **Mainnet**: https://tonscan.org

Search for:
1. Factory contract address
2. Subscription contract address
3. Transaction hash from payment

## 📋 Manual Channel Access (MVP Workaround)

⚠️ **Channel access control is not automated in this MVP.** You must manually manage channel access:

### When Subscription is Activated

1. **Check payment-bot logs** for "Subscription X activated" messages
2. **Get subscriber Telegram ID** from logs or database:
   ```sql
   SELECT sub.telegram_id, sub.username
   FROM subscriptions s
   JOIN subscribers sub ON s.subscriber_id = sub.id
   WHERE s.status = 'active' AND s.channel_id = <your_channel_id>;
   ```
3. **Create invite link** in your channel:
   - Go to channel settings
   - Create invite link with 1 use limit
   - Send link to subscriber via payment bot (manual message)

### Alternative: Make Channel Public

For MVP testing, you can:
1. Make channel public temporarily
2. Share channel link: `https://t.me/your_channel`
3. Users can join directly after payment is confirmed

### Future Enhancement

Full automation requires:
- Telegram Bot API to generate single-use invite links
- Automatic link sending after payment confirmation
- Periodic sync to remove expired subscriptions

This will be implemented in Phase 2 (post-MVP).

## 🔍 Monitoring & Troubleshooting

### Check Service Health

```bash
# Bot status
pm2 status

# View logs
pm2 logs admin-bot --lines 100
pm2 logs payment-bot --lines 100

# Check errors only
pm2 logs --error
```

### Common Issues

#### 1. "TON client not initialized"
**Solution**: Ensure `.env` has `TON_NETWORK` set and bots are restarted after config changes.

#### 2. "Wallet not initialized"
**Solution**: Check `ADMIN_MNEMONIC` in `.env` is a valid 24-word mnemonic.

#### 3. "Factory contract address not set"
**Solution**: Deploy factory contract and add address to `.env`.

#### 4. Payment not detected
**Causes**:
- Payment sent to wrong address (check contract address)
- Wrong network (testnet vs mainnet)
- Comment not included ("Subscribe")
- Amount too low (less than 99% of price)

**Check**:
```bash
# View payment monitoring logs
pm2 logs payment-bot | grep "Checking"
pm2 logs payment-bot | grep "Payment found"
```

#### 5. Contract deployment fails
**Causes**:
- Insufficient wallet balance
- Wrong mnemonic
- Network issues

**Solution**:
```bash
# Check wallet balance
# You can use TON Explorer or run:
cd contracts
npm run check-balance  # If script exists, or check manually
```

### Database Queries for Debugging

```sql
-- Check pending subscriptions
SELECT s.id, s.created_at, sub.telegram_id, c.title, c.monthly_price_ton
FROM subscriptions s
JOIN channels c ON s.channel_id = c.id
JOIN subscribers sub ON s.subscriber_id = sub.id
WHERE s.status = 'pending'
ORDER BY s.created_at DESC;

-- Check active subscriptions
SELECT s.id, s.starts_at, s.expires_at, sub.telegram_id, c.title
FROM subscriptions s
JOIN channels c ON s.channel_id = c.id
JOIN subscribers sub ON s.subscriber_id = sub.id
WHERE s.status = 'active'
ORDER BY s.starts_at DESC;

-- Check payment records
SELECT p.*, s.channel_id
FROM payments p
JOIN subscriptions s ON p.subscription_id = s.id
ORDER BY p.confirmed_at DESC
LIMIT 10;
```

## 🎯 MVP Launch Criteria

Before launching to real users, verify:

- [ ] Factory contract deployed to **testnet**
- [ ] Both bots start without errors
- [ ] Admin can complete full channel setup
- [ ] Test payment processes correctly (1 TON)
- [ ] Payment monitoring detects payment within 2 minutes
- [ ] Subscription activates in database
- [ ] Contract balance shows payment received
- [ ] Logs show no critical errors
- [ ] Database queries return expected data

After successful testnet testing:

- [ ] Deploy factory contract to **mainnet**
- [ ] Update `.env` with mainnet factory address
- [ ] Set `TON_NETWORK=mainnet`
- [ ] Set `NODE_ENV=production`
- [ ] Test with small amount (1-5 TON)
- [ ] Verify mainnet transactions on tonscan.org
- [ ] Document channel owner onboarding process
- [ ] Create support channel for questions

## 📞 Support

For issues during deployment:

1. **Check logs**: `pm2 logs` or console output in dev mode
2. **Verify configuration**: All environment variables set correctly
3. **Check blockchain**: Use TON Explorer to verify transactions
4. **Database inspection**: Use SQL queries above
5. **GitHub Issues**: Report bugs at your repository

## 🚦 What's Next (Post-MVP)

After successful MVP launch, implement:

1. **Automated Channel Access Control**
   - Generate single-use invite links
   - Automatic link sending
   - Expiry sync

2. **Comprehensive Testing**
   - Unit tests for all services
   - Integration tests
   - Load testing

3. **Enhanced Monitoring**
   - Prometheus metrics
   - Grafana dashboards
   - Alert system

4. **User Features**
   - Multiple subscription tiers
   - Promo codes
   - Referral system
   - Subscription renewal reminders

5. **Admin Features**
   - Web dashboard
   - Bulk operations
   - Advanced analytics
   - Revenue reports

---

**Version**: MVP v1.0
**Last Updated**: 2025-10-24
**Status**: Ready for testnet deployment
