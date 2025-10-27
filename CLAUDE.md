# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TON Subscription Paywall is a blockchain-based subscription management system for Telegram channels. It uses TON cryptocurrency for payments and consists of two Telegram bots (admin and payment), smart contracts written in Tact, and a PostgreSQL database.

## Architecture

**Two-Bot System:**
- `admin-bot/` - Channel owner management interface (setup, analytics, settings)
- `payment-bot/` - User subscription and payment interface

**Smart Contracts (Tact):**
- `contracts/contracts/factory.tact` - Factory pattern implementation
  - `SubscriptionFactory` - Deploys channel-specific subscription contracts
  - `ChannelSubscription` - Handles payments, subscriptions, and access control per channel

**Database:**
- PostgreSQL with schema in `shared/database-schema.sql`
- Core tables: `admins`, `channels`, `subscribers`, `subscriptions`, `payments`
- Supporting: `setup_progress`, `analytics_summary`

**Shared Utilities:**
- `shared/types.ts` - TypeScript interfaces
- `shared/ton-client.ts` - TON blockchain interaction utilities
- `shared/database-schema.sql` - Complete database schema

## Development Commands

### Initial Setup
```bash
# Install all dependencies
npm install

# Setup database (run once)
psql $DATABASE_URL < shared/database-schema.sql

# Configure environment
cp .env.example .env
# Edit .env with your bot tokens, database URL, etc.
```

### Smart Contracts
```bash
cd contracts

# Install dependencies
npm install

# Build contracts
npm run build

# Deploy factory contract (testnet)
npm run deploy:testnet

# Deploy factory contract (mainnet)
npm run deploy

# Run contract tests
npm test
```

### Admin Bot
```bash
cd admin-bot

# Install dependencies
npm install

# Development mode (with hot reload)
npm run dev

# Build TypeScript
npm run build

# Production
npm start
```

### Payment Bot
```bash
cd payment-bot

# Install dependencies
npm install

# Development mode (with hot reload)
npm run dev

# Build TypeScript
npm run build

# Production
npm start
```

### Workspace Commands (from root)
```bash
# Install all workspaces
npm run install:all

# Build all workspaces
npm run build

# Deploy contracts
npm run deploy:contracts

# Start admin bot (production)
npm run start:admin

# Start payment bot (production)
npm run start:payment

# Development mode
npm run dev:admin
npm run dev:payment

# Run all tests
npm test
```

### Production with PM2
```bash
# Build everything first
npm run build

# Start both bots
pm2 start admin-bot/dist/index.js --name admin-bot
pm2 start payment-bot/dist/index.js --name payment-bot

# Monitor
pm2 monit
pm2 logs admin-bot
pm2 logs payment-bot

# Restart
pm2 restart admin-bot
pm2 restart payment-bot
pm2 restart all

# Save PM2 configuration
pm2 save
pm2 startup
```

## Key Architectural Patterns

### Factory Pattern (Smart Contracts)
- **Deploy factory ONCE** - Save address to `FACTORY_CONTRACT_ADDRESS` in `.env`
- Factory deploys channel-specific subscription contracts on-demand
- Never deploy `ChannelSubscription` directly
- Get contract addresses via `factory.getSubscriptionAddress(channelId)`

### Service Layer Architecture
Both bots follow three-tier architecture:
1. **Presentation Layer** - Bot handlers (`bot.ts`)
2. **Business Logic** - Services (`services/`)
3. **Data Access** - Database service (`database/database.ts`)

**Key Services:**
- `ChannelSetupService` - Channel verification and setup
- `ContractDeploymentService` - Smart contract deployment
- `AnalyticsService` - Channel analytics
- `SubscriptionService` - Subscription management
- `PaymentService` - Payment monitoring and processing
- `DatabaseService` - Centralized database access

### Database Service Pattern
- **Never access `Pool` directly** from bot handlers
- Always use `DatabaseService` methods
- Centralized queries prevent SQL injection and improve maintainability

Example:
```typescript
// Good
await this.database.getAdminByTelegramId(userId);
await this.database.updateChannel(channelId, updates);

// Bad
await this.db.query('SELECT * FROM admins WHERE telegram_id = $1', [userId]);
```

### Conversation-Based Setup
Admin bot uses Grammy conversations for multi-step flows:
- Channel setup wizard (6 steps)
- Uses `conversation.wait()` for user input
- Uses `conversation.waitForCallbackQuery()` for button responses
- Allows cancellation at any step

### Payment Monitoring
Payment bot runs background monitoring:
- Checks pending subscriptions every 30 seconds
- Verifies blockchain transactions
- Automatically activates subscriptions when payment confirmed
- Sends automatic notification to users when subscription activates
- Updates database with transaction hash and payment details

### TON Connect Integration
Both bots support TON Connect for wallet connections:
- **Payment Bot**: Users connect wallet to pay for subscriptions
- **Admin Bot**: Channel owners connect wallet for contract deployment
- Manifest URLs configured separately:
  - Admin: `TONCONNECT_MANIFEST_URL` → `ton-paywall-admin-manifest.json`
  - Payment: `TONCONNECT_MANIFEST_URL` → `ton-paywall-client-manifest.json`
- Sessions stored in PostgreSQL (separate tables for admins/subscribers)
- QR codes for desktop, deep links for mobile
- Supports Telegram Wallet, Tonkeeper, MyTonWallet, Tonhub, etc.

## Smart Contract Development

### Tact Language Key Points
- Contracts deployed via factory pattern
- `ChannelSubscription` stores subscriber expiry timestamps on-chain
- Payment handling includes:
  - 1% underpayment tolerance
  - Automatic overpayment refunds
  - Instant forwarding to admin wallet (minus gas)

### Contract Deployment Flow
1. Deploy `SubscriptionFactory` once (via `contracts/scripts/deploy.ts`)
2. Save factory address to `.env`
3. When channel owner sets up channel, bot sends `DeploySubscription` message to factory
4. Factory deploys `ChannelSubscription` for that channel
5. Bot stores subscription contract address in database

### Important Contract Methods
**Factory:**
- `receive(DeploySubscription)` - Deploy new subscription contract
- `getSubscriptionAddress(channelId)` - Get contract address for channel

**Subscription:**
- `receive("Subscribe")` - Process subscription payment
- `isActive(subscriber)` - Check if user has active subscription
- `getExpiry(subscriber)` - Get subscription expiry timestamp
- `getStats()` - Get contract statistics

## Database Schema Notes

### Key Relationships
```
admins (1) → (N) channels
channels (1) → (N) subscriptions
subscribers (1) → (N) subscriptions
subscriptions (1) → (N) payments
```

### Subscription State Machine
```
pending → active → expired
          ↓
       cancelled
```

### Important Constraints
- `subscriptions.UNIQUE(subscriber_id, channel_id)` - One subscription per user per channel
- Cascade deletes on foreign keys to maintain referential integrity
- Indexes on frequently queried columns (`telegram_id`, `expires_at`, etc.)

## Environment Variables

Required variables in `.env`:
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ton_subscription_mvp

# Telegram Bots (from @BotFather)
ADMIN_BOT_TOKEN=your_admin_bot_token
PAYMENT_BOT_TOKEN=your_payment_bot_token
PAYMENT_BOT_USERNAME=YourPaymentBot
PAYMENT_BOT_ID=bot_user_id_number

# TON Blockchain
TON_NETWORK=testnet  # or mainnet
FACTORY_CONTRACT_ADDRESS=EQC...  # After deploying factory
```

## Testing Strategy

### Smart Contracts
```bash
cd contracts
npm test  # Uses @ton/sandbox for testing
```

### Bot Testing
- Test on testnet first before mainnet
- Use test Telegram accounts
- Verify all conversation flows
- Test payment monitoring with small amounts

## Common Issues and Solutions

### Contract Deployment
- Ensure wallet has sufficient TON for gas
- Verify `TON_NETWORK` matches intended network
- Check mnemonic is correct in deployment script
- Factory address must be saved to `.env` after deployment

### Bot Issues
- Verify bot tokens are valid
- Check database connection string
- Ensure bots have correct permissions in channels
- For admin bot: User must be channel admin
- For payment bot: Bot must be added as channel admin with post/edit permissions

### Payment Monitoring
- Verify `FACTORY_CONTRACT_ADDRESS` is set correctly
- Check TON network connectivity
- Ensure payment bot is running (not just admin bot)
- Payment confirmation takes ~1 minute on TON blockchain

### Database
- Run schema only once to avoid conflicts
- Use transactions for multi-step operations
- Check indexes exist for performance

## Code Organization

### Admin Bot Structure
```
admin-bot/src/
├── bot.ts                    # Main bot logic, commands, conversations
├── services/
│   ├── channel-setup.ts      # Channel verification
│   ├── contract-deployment.ts # Smart contract deployment
│   └── analytics.ts          # Analytics calculations
└── database/
    └── database.ts           # Database service
```

### Payment Bot Structure
```
payment-bot/src/
├── bot.ts                    # Main bot logic, commands, handlers
├── services/
│   ├── subscription.ts       # Subscription management
│   └── payment.ts            # Payment monitoring
└── database/
    └── database.ts           # Database service
```

### Contract Structure
```
contracts/
├── contracts/
│   └── factory.tact          # Factory + Subscription contracts
├── scripts/
│   └── deploy.ts             # Deployment script
├── tests/                    # Contract tests
└── wrappers/                 # Generated TypeScript wrappers
```

## Development Workflow

### Adding a New Feature
1. Identify which bot(s) need changes (admin/payment/both)
2. Add service method if needed (in `services/`)
3. Update database schema if needed (create migration)
4. Add bot command/handler in `bot.ts`
5. Update TypeScript types in `shared/types.ts`
6. Test locally with testnet
7. Update documentation

### Modifying Smart Contracts
1. Edit `.tact` file in `contracts/contracts/`
2. Build: `npm run build`
3. Test: `npm test`
4. Deploy to testnet for testing
5. After verification, deploy to mainnet
6. Update `FACTORY_CONTRACT_ADDRESS` in production `.env`

### Database Changes
1. Create new migration SQL file
2. Test locally first
3. Apply to production with backup
4. Update `shared/types.ts` if schema changes
5. Update `DatabaseService` methods

## Security Considerations

- Bot tokens stored in environment variables only
- Database uses parameterized queries (no SQL injection)
- Admin rights verified before channel operations
- TON addresses validated before use
- No private keys in code (stored securely for deployment only)
- Payment verification done on-chain

## Production Deployment

See `docs/DEPLOYMENT.md` for complete guide. Quick steps:
1. Setup server (Ubuntu/Debian recommended)
2. Install Node.js 18+, PostgreSQL 15+, PM2
3. Clone repository and configure `.env`
4. Deploy factory contract to mainnet
5. Setup database schema
6. Build all workspaces
7. Start bots with PM2
8. Monitor logs and test with real channel

## Documentation

- `README.md` - Project overview and quick start
- `QUICKSTART.md` - 5-minute setup guide
- `docs/ARCHITECTURE.md` - Detailed architecture patterns
- `docs/DEPLOYMENT.md` - Production deployment guide
- `docs/IMPLEMENTATION_SUMMARY.md` - What was implemented
- `docs/DATABASE_SETUP.md` - Database setup details
- `phase1-mvp-simplified.md` - Original MVP specification

## Troubleshooting

### Logs
```bash
# PM2 logs
pm2 logs admin-bot
pm2 logs payment-bot

# Development mode logs
# Just run npm run dev and check console output
```

### Database Inspection
```bash
# Connect to database
psql $DATABASE_URL

# Check tables
\dt

# Check specific data
SELECT * FROM channels WHERE is_active = true;
SELECT * FROM subscriptions WHERE status = 'pending';
```

### Contract Inspection
Use TON blockchain explorer:
- Testnet: https://testnet.tonscan.org
- Mainnet: https://tonscan.org

Search for `FACTORY_CONTRACT_ADDRESS` to see deployed contracts and transactions.

## TON Blockchain Integration

### Payment Flow
1. User initiates subscription in payment bot
2. Bot creates pending subscription in database
3. User sends TON to subscription contract address
4. Contract automatically forwards payment to admin wallet
5. Payment monitoring service detects transaction
6. Bot activates subscription in database
7. User granted channel access

### Gas Fees
- Factory deployment: ~0.1 TON
- Subscription contract deployment: ~0.6 TON total (0.1 fee + 0.5 initial balance)
- Subscription payment: User pays, ~0.05 TON reserved for gas
- Admin receives: `monthly_price - 0.05 TON`

### Network Configuration
- Testnet: Use for development and testing
- Mainnet: Use for production
- Switch via `TON_NETWORK` environment variable
- Different endpoints and addresses for each network
