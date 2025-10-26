# TON Subscription Paywall MVP

A complete subscription paywall system for Telegram channels using TON blockchain for payments.

## Features

- **Two-Bot Architecture**
  - AdminBot: Channel owner management interface
  - PaymentBot: User subscription and payment interface

- **Smart Contract Factory Pattern**
  - Factory contract deploys channel-specific subscription contracts
  - Automatic payment forwarding to channel owners
  - 1% underpayment tolerance
  - Automatic overpayment refunds

- **Full Channel Management**
  - Easy channel setup process
  - Real-time analytics
  - Price and wallet management
  - Subscriber tracking

- **Subscription Features**
  - 30-day subscription periods
  - TON cryptocurrency payments
  - Instant access after payment confirmation
  - Payment monitoring and verification

## Project Structure

```
ton-paywall/
├── contracts/              # Smart contracts (Tact)
│   ├── contracts/
│   │   └── factory.tact   # Factory + Subscription contracts
│   └── scripts/
│       └── deploy.ts      # Deployment script
├── admin-bot/             # Admin bot for channel owners
│   └── src/
│       ├── bot.ts         # Main bot logic
│       ├── services/      # Business logic
│       └── database/      # Database queries
├── payment-bot/           # Payment bot for subscribers
│   └── src/
│       ├── bot.ts         # Main bot logic
│       ├── services/      # Payment processing
│       └── database/      # Database queries
├── shared/                # Shared utilities
│   ├── database-schema.sql
│   ├── ton-client.ts
│   └── types.ts
└── deployment/            # Deployment scripts
    └── deploy.sh
```

## Prerequisites

- Node.js 18+
- PostgreSQL 15+
- TON Wallet with mainnet/testnet TON for gas
- Two Telegram Bot tokens (from @BotFather)

## Quick Start

### 1. Clone and Install

```bash
git clone <repository>
cd ton-paywall
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

Required environment variables:
- `ADMIN_BOT_TOKEN` - Admin bot token from @BotFather
- `PAYMENT_BOT_TOKEN` - Payment bot token from @BotFather
- `PAYMENT_BOT_USERNAME` - Payment bot username
- `PAYMENT_BOT_ID` - Payment bot user ID
- `DATABASE_URL` - PostgreSQL connection string
- `TON_NETWORK` - testnet or mainnet
- `FACTORY_CONTRACT_ADDRESS` - Factory contract address (after deployment)

### 3. Setup Database

```bash
psql $DATABASE_URL < shared/database-schema.sql
```

### 4. Deploy Smart Contracts

```bash
cd contracts
npm install
npm run build
npm run deploy  # Follow prompts to deploy factory
```

Save the factory contract address to `.env` as `FACTORY_CONTRACT_ADDRESS`.

### 5. Start Bots

```bash
# Admin bot
cd admin-bot
npm install
npm run build
npm start

# Payment bot (in another terminal)
cd payment-bot
npm install
npm run build
npm start
```

Or use PM2:

```bash
pm2 start admin-bot/dist/index.js --name admin-bot
pm2 start payment-bot/dist/index.js --name payment-bot
```

## Usage

### Channel Owner Flow

1. Start the Admin Bot
2. Use `/setup` to add your channel
3. Verify admin rights
4. Add Payment Bot to your channel as admin
5. Connect your TON wallet
6. Set monthly subscription price
7. System deploys subscription smart contract
8. Share subscription link with your audience

### Subscriber Flow

1. Click channel subscription link or start Payment Bot
2. Browse available channels
3. Select a channel and click "Subscribe"
4. Send TON to the subscription contract
5. Wait for payment confirmation (~1 minute)
6. Get instant access to the channel

## Smart Contract Architecture

### Factory Contract
- Deploys channel-specific subscription contracts
- Tracks all deployed contracts
- Configurable deployment fee
- Owner-only administrative functions

### Subscription Contract
- Handles payments for a specific channel
- Stores subscriber expiry timestamps
- Automatic payment forwarding to channel owner
- 1% underpayment tolerance
- Automatic overpayment refunds
- Admin functions for price and wallet updates

## Database Schema

### Core Tables
- `admins` - Channel owners
- `channels` - Managed channels
- `subscribers` - Users who subscribe
- `subscriptions` - Subscription records
- `payments` - Payment transactions

### Supporting Tables
- `setup_progress` - Channel setup tracking
- `analytics_summary` - Daily analytics snapshots

## Development

### Running in Development Mode

```bash
# Admin bot
cd admin-bot
npm run dev

# Payment bot
cd payment-bot
npm run dev
```

### Building

```bash
npm run build  # Build all workspaces
```

### Testing Smart Contracts

```bash
cd contracts
npm test
```

## Deployment to Production

1. Use the deployment script:

```bash
chmod +x deployment/deploy.sh
./deployment/deploy.sh
```

2. Or follow manual deployment steps in `DEPLOYMENT.md`

## Architecture Decisions

### Why Two Bots?
- **Separation of concerns**: Admin functions separate from user functions
- **Security**: Admin operations isolated
- **UX**: Clear user experience for each role
- **Scalability**: Can scale bots independently

### Why Factory Pattern?
- **Gas efficiency**: Deploy contracts only when needed
- **Maintainability**: Single factory to manage all subscriptions
- **Upgradability**: Can deploy new contract versions
- **Tracking**: Central registry of all deployed contracts

### Payment Flow
1. User initiates subscription
2. System creates pending subscription record
3. User sends TON to subscription contract
4. Contract forwards payment to channel owner (minus gas)
5. Payment monitor detects transaction
6. System activates subscription in database
7. User gets access confirmation

## Monitoring

### Health Checks
- Database connectivity
- TON network connectivity
- Payment monitoring status

### Logs
```bash
pm2 logs admin-bot
pm2 logs payment-bot
```

### Analytics
- Use `/analytics` in Admin Bot
- View subscriber counts, revenue, churn
- Export to CSV

## Troubleshooting

### Bot Not Starting
- Check environment variables
- Verify database connection
- Check bot tokens are valid

### Payments Not Confirming
- Verify factory contract is deployed
- Check subscription contract is active
- Ensure payment monitoring is running
- Check TON network connectivity

### Contract Deployment Fails
- Ensure wallet has enough TON for gas
- Check network configuration
- Verify mnemonic is correct

## Security Considerations

- Bot tokens stored in environment variables
- Database uses parameterized queries
- No private keys in code
- Admin rights verified for channel operations
- Payment verification on-chain

## Future Enhancements

- TON Connect integration for easier payments
- Automatic subscription renewal
- Discount codes and promotions
- Multi-tier subscription plans
- Webhook notifications
- Advanced analytics dashboard
- Mobile wallet deep linking

## Support

- GitHub Issues: Report bugs and request features
- Telegram: @YourSupportGroup
- Documentation: See `/docs` folder

## License

MIT

## Contributing

Contributions welcome! Please read CONTRIBUTING.md first.

---

Built with ❤️ using TON Blockchain and Telegram Bot API
