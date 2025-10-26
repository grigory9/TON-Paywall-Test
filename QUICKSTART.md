# Quick Start Guide

## TON Subscription Paywall MVP

Get your subscription paywall running in minutes!

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] PostgreSQL 15+ installed
- [ ] Two Telegram bot tokens from @BotFather
- [ ] TON wallet with testnet/mainnet TON

## 5-Minute Setup (Development)

### 1. Install Dependencies

```bash
cd ton-paywall
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:
```bash
# Get these from @BotFather
ADMIN_BOT_TOKEN=your_admin_bot_token
PAYMENT_BOT_TOKEN=your_payment_bot_token
PAYMENT_BOT_USERNAME=YourPaymentBot
PAYMENT_BOT_ID=bot_user_id

# Your PostgreSQL connection
DATABASE_URL=postgresql://user:password@localhost:5432/ton_subscription_mvp

# Start with testnet
TON_NETWORK=testnet
```

### 3. Setup Database

```bash
# Create database
createdb ton_subscription_mvp

# Apply schema
psql $DATABASE_URL < shared/database-schema.sql
```

### 4. Deploy Smart Contract

```bash
cd contracts
npm install
npm run build

# Deploy to testnet
npm run deploy:testnet
# Save the factory address!
```

Add factory address to `.env`:
```bash
FACTORY_CONTRACT_ADDRESS=EQC...
```

### 5. Start Bots

Terminal 1 (Admin Bot):
```bash
cd admin-bot
npm install
npm run dev
```

Terminal 2 (Payment Bot):
```bash
cd payment-bot
npm install
npm run dev
```

### 6. Test!

1. Open Admin Bot in Telegram
2. Send `/start`
3. Use `/setup` to add a channel
4. Open Payment Bot
5. Send `/channels`
6. Test subscription flow

## Production Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production setup with PM2.

Quick version:
```bash
# Build all
npm run build

# Deploy with PM2
pm2 start admin-bot/dist/index.js --name admin-bot
pm2 start payment-bot/dist/index.js --name payment-bot
pm2 save
```

## Project Structure Overview

```
ton-paywall/
├── contracts/          # Smart contracts (Tact)
├── admin-bot/         # Channel owner bot
├── payment-bot/       # Subscriber bot
├── shared/            # Database & utilities
├── deployment/        # Deploy scripts
└── docs/             # Documentation
```

## Key Files

### Configuration
- `.env.example` - Environment template
- `shared/database-schema.sql` - Database schema

### Smart Contracts
- `contracts/contracts/factory.tact` - Factory + Subscription contracts
- `contracts/scripts/deploy.ts` - Deployment script

### Bots
- `admin-bot/src/bot.ts` - Admin bot main logic
- `payment-bot/src/bot.ts` - Payment bot main logic

### Documentation
- `README.md` - Complete guide
- `docs/DEPLOYMENT.md` - Production deployment
- `docs/ARCHITECTURE.md` - Architecture patterns
- `docs/IMPLEMENTATION_SUMMARY.md` - What was built

## Common Commands

### Development
```bash
# Start admin bot (dev mode with hot reload)
cd admin-bot && npm run dev

# Start payment bot (dev mode)
cd payment-bot && npm run dev

# Build TypeScript
npm run build  # All workspaces

# Deploy contracts
cd contracts && npm run deploy
```

### Production
```bash
# Build
npm run build

# Start with PM2
pm2 start admin-bot/dist/index.js --name admin-bot
pm2 start payment-bot/dist/index.js --name payment-bot

# Monitor
pm2 monit

# Logs
pm2 logs admin-bot
pm2 logs payment-bot

# Restart
pm2 restart all
```

### Database
```bash
# Apply schema
psql $DATABASE_URL < shared/database-schema.sql

# Connect to database
psql $DATABASE_URL

# Backup
pg_dump ton_subscription_mvp > backup.sql

# Restore
psql ton_subscription_mvp < backup.sql
```

## Bot Commands Reference

### Admin Bot (@YourAdminBot)
- `/start` - Initialize and show menu
- `/setup` - Setup new channel (step-by-step wizard)
- `/channels` - View your channels
- `/analytics` - View subscription analytics
- `/help` - Get help

### Payment Bot (@YourPaymentBot)
- `/start` - Browse channels or subscribe via deep link
- `/channels` - Browse available channels
- `/subscriptions` - View your active subscriptions
- `/help` - Get help

## User Flows

### Channel Owner Flow
1. Start Admin Bot → `/start`
2. Setup channel → `/setup`
3. Forward channel message or enter @channel
4. Verify admin rights ✓
5. Add Payment Bot to channel ✓
6. Enter TON wallet address
7. Set monthly price (e.g., 10 TON)
8. Contract deployed ✓
9. Share link with subscribers!

### Subscriber Flow
1. Click subscription link or start Payment Bot
2. Browse channels → `/channels`
3. Select channel → Click "Subscribe"
4. Click "Pay X TON"
5. Send TON to contract address
6. Wait for confirmation (~1 min)
7. Access granted! ✓

## Architecture Summary

### Smart Contracts (Factory Pattern)
```
SubscriptionFactory (deploy once)
    ↓ deploys
ChannelSubscription (one per channel)
    ↓ receives payments
Auto-forwards to admin wallet
```

### Bots
```
Admin Bot (channel owners)
  - Channel setup
  - Analytics
  - Management

Payment Bot (subscribers)
  - Browse channels
  - Subscribe
  - Manage subscriptions
```

### Database
```
admins → channels → subscriptions → payments
     ↓
subscribers
```

## Patterns from ton-roulette

This implementation uses proven patterns from the ton-roulette project:

1. **Factory Pattern** - PoolFactory → SubscriptionFactory
2. **Service Layer** - Centralized business logic
3. **Database Service** - Abstracted data access
4. **TON Client** - Blockchain interaction layer
5. **Conversation Flows** - Multi-step setup wizards
6. **Payment Monitoring** - Background transaction checking

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Troubleshooting

### Bots won't start
```bash
# Check .env file exists
ls -la .env

# Check bot tokens
echo $ADMIN_BOT_TOKEN

# Check database connection
psql $DATABASE_URL -c "SELECT 1;"
```

### Contract deployment fails
```bash
# Check network
echo $TON_NETWORK  # Should be 'testnet' or 'mainnet'

# Check wallet has TON
# Verify mnemonic is correct

# Try testnet first
cd contracts
npm run deploy:testnet
```

### Database errors
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Verify database exists
psql -l | grep ton_subscription

# Recreate schema
psql $DATABASE_URL < shared/database-schema.sql
```

### Payment not confirming
```bash
# Check payment bot is running
pm2 status

# Check payment monitoring logs
pm2 logs payment-bot | grep "monitoring"

# Verify contract address
# Check transaction on TON explorer
```

## Getting Help

1. **Check logs** - Most issues show up in logs
   ```bash
   pm2 logs
   # or
   npm run dev  # See console output
   ```

2. **Review documentation**
   - `README.md` - Main guide
   - `docs/DEPLOYMENT.md` - Deployment
   - `docs/ARCHITECTURE.md` - Architecture

3. **Common issues**
   - Missing .env variables
   - Database not running
   - Invalid bot tokens
   - Incorrect contract address

4. **Support**
   - GitHub Issues
   - Telegram: @YourSupport
   - Check ton-roulette patterns

## Next Steps

Once everything is running:

1. ✅ Test full flow end-to-end
2. ✅ Monitor logs for errors
3. ✅ Check database for records
4. ✅ Verify contract on TON explorer
5. ✅ Test with real users
6. ✅ Setup monitoring (Prometheus/Grafana)
7. ✅ Configure backups
8. ✅ Add tests (unit, integration)

## Production Checklist

Before going live:

- [ ] Test on testnet thoroughly
- [ ] Deploy factory to mainnet
- [ ] Configure production .env
- [ ] Setup PostgreSQL backups
- [ ] Use PM2 or systemd
- [ ] Setup monitoring
- [ ] Configure firewall
- [ ] Secure environment variables
- [ ] Test disaster recovery
- [ ] Document for team

## Resources

- [TON Documentation](https://docs.ton.org)
- [Grammy Bot Framework](https://grammy.dev)
- [Tact Language](https://tact-lang.org)
- [ton-roulette project](../ton-roulette/CLAUDE.md)

---

**Ready to launch?** Follow this guide step-by-step!

For detailed information, see the full documentation in `/docs`.

**Questions?** Check troubleshooting or create an issue.
