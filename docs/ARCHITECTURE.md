# TON Subscription Paywall - Architecture Guide

## Overview

This document describes the architecture and implementation patterns used in the TON Subscription Paywall system, inspired by the ton-roulette project.

## System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Telegram Users                          │
└────────────┬────────────────────────┬───────────────────────┘
             │                        │
             │ Channel Owners         │ Subscribers
             │                        │
┌────────────▼──────────┐  ┌─────────▼────────────┐
│   Admin Bot           │  │   Payment Bot        │
│   (Channel Mgmt)      │  │   (Subscriptions)    │
└────────────┬──────────┘  └──────────┬───────────┘
             │                        │
             └────────┬───────────────┘
                      │
            ┌─────────▼──────────┐
            │   PostgreSQL DB    │
            │   (User Data)      │
            └─────────┬──────────┘
                      │
         ┌────────────▼─────────────┐
         │   TON Blockchain         │
         │ ┌─────────────────────┐  │
         │ │  Factory Contract   │  │
         │ │  (Deployer)         │  │
         │ └──────────┬──────────┘  │
         │            │              │
         │ ┌──────────▼──────────┐  │
         │ │ Subscription        │  │
         │ │ Contracts (N)       │  │
         │ │ (Channel-specific)  │  │
         │ └─────────────────────┘  │
         └──────────────────────────┘
```

## Key Architectural Patterns from ton-roulette

### 1. Factory Pattern (Smart Contracts)

**Pattern**: Similar to PoolFactory + Pool in ton-roulette

```
SubscriptionFactory (Parent)
    ↓ deploys
ChannelSubscription (Child, one per channel)
```

**Key Learnings from ton-roulette:**
- Deploy factory ONCE, save as `FACTORY_CONTRACT_ADDRESS`
- Child contracts auto-deployed via factory
- Use `FactoryContract.getChildAddress(id)` to retrieve contract addresses
- Never deploy child contracts directly

**Implementation:**
```tact
contract SubscriptionFactory {
    // Deploys channel-specific subscription contracts
    receive(msg: DeploySubscription) {
        let initCode = initOf ChannelSubscription(...);
        let subscriptionAddress = contractAddress(initCode);
        self.deployedContracts.set(msg.channelId, subscriptionAddress);
        // Deploy contract...
    }
}
```

### 2. Database Service Pattern

**Pattern**: Borrowed from ton-roulette's Database class

**Key Principles:**
- Never access `prisma` directly (in ton-roulette) or `Pool` directly
- Use service methods for all database operations
- Centralized database logic

**Implementation:**
```typescript
export class DatabaseService {
  constructor(private db: Pool) {}

  async upsertAdmin(telegramId: number, username?: string, firstName?: string) {
    // Centralized database logic
    const result = await this.db.query(
      `INSERT INTO admins (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE...`,
      [telegramId, username, firstName]
    );
    return result.rows[0];
  }
}
```

**Comparison with ton-roulette:**
```typescript
// ton-roulette pattern
Database.users.getUserById(id)         // Service method
Database.pools.updatePoolStatus(id, status)

// ton-paywall equivalent
database.getAdminByTelegramId(id)
database.updateChannel(id, updates)
```

### 3. TON Client Service

**Pattern**: Inspired by ton-roulette's BlockchainService

**Features:**
- Single source of truth for blockchain interactions
- Network abstraction (testnet/mainnet)
- Reusable utility functions

**Implementation:**
```typescript
export class TonService {
  private client: TonClient;
  private network: 'mainnet' | 'testnet';

  async getBalance(address: string): Promise<number> {
    const balance = await this.client.getBalance(Address.parse(address));
    return parseFloat(fromNano(balance));
  }

  async isSubscriptionActive(contractAddress: string, subscriberAddress: string): Promise<boolean> {
    // Check on-chain subscription status
  }
}
```

**ton-roulette comparison:**
```typescript
// ton-roulette
blockchainService.getWalletBalance(address)
blockchainService.isReady()
blockchainService.createPool(...)

// ton-paywall
tonService.getBalance(address)
tonService.isSubscriptionActive(...)
tonService.deploySubscriptionContract(...)
```

### 4. Service Layer Architecture

**Pattern**: Three-tier architecture from ton-roulette

```
Presentation (Bot Handlers)
    ↓
Business Logic (Services)
    ↓
Data Access (Database Service)
```

**ton-paywall Services:**

1. **ChannelSetupService** - Channel verification and setup flow
   ```typescript
   verifyChannelAdmin(channelId, userId)
   verifyPaymentBotAdded(channelId)
   recordSetupProgress(adminId, channelId, step)
   ```

2. **ContractDeploymentService** - Smart contract deployment
   ```typescript
   deploySubscriptionContract(channelId, adminWallet, monthlyPrice)
   verifyContractDeployment(contractAddress)
   getContractBalance(contractAddress)
   ```

3. **AnalyticsService** - Channel analytics
   ```typescript
   getChannelAnalytics(channelId)
   updateAnalyticsSummary(channelId)
   exportAnalytics(channelId, days)
   ```

4. **SubscriptionService** - Subscription management
   ```typescript
   checkSubscription(subscriberId, channelId)
   createOrUpdateSubscription(subscriberId, channelId, amount)
   activateSubscription(subscriptionId)
   getUserActiveSubscriptions(subscriberId)
   ```

5. **PaymentService** - Payment monitoring
   ```typescript
   startMonitoring()
   checkPendingPayments()
   recordPayment(subscriptionId, hash, amount)
   ```

### 5. Conversation-Based Setup

**Pattern**: Similar to ton-roulette's multi-step workflows

**Implementation:**
```typescript
private async setupChannelConversation(conversation: any, ctx: BotContext) {
  // Step 1: Get channel
  await ctx.reply('Please forward a message from your channel...');
  const channelResponse = await conversation.wait();

  // Step 2: Verify admin
  const isAdmin = await this.channelSetup.verifyChannelAdmin(...);

  // Step 3: Add payment bot
  await conversation.waitForCallbackQuery(['confirm_bot_added', 'cancel_setup']);

  // Step 4: Connect wallet
  const walletResponse = await conversation.wait();

  // Step 5: Set price
  const priceResponse = await conversation.wait();

  // Step 6: Deploy contract
  await this.contractDeployment.deploySubscriptionContract(...);
}
```

**Benefits:**
- Clear step-by-step flow
- Easy to understand and maintain
- Handles cancellation gracefully
- Progress tracking

### 6. Payment Monitoring Pattern

**Pattern**: Background job processing inspired by ton-roulette's transaction monitoring

**Implementation:**
```typescript
export class PaymentService {
  private monitoringInterval: NodeJS.Timeout | null = null;

  startMonitoring() {
    this.monitoringInterval = setInterval(async () => {
      await this.checkPendingPayments();
    }, 30000);  // Every 30 seconds
  }

  private async checkPendingPayments() {
    const pendingSubs = await this.db.query(
      `SELECT * FROM subscriptions WHERE status = 'pending'...`
    );

    for (const sub of pendingSubs.rows) {
      await this.checkSubscriptionPayment(sub);
    }
  }
}
```

**Similar to ton-roulette:**
- Periodic blockchain checks
- Transaction verification
- Status updates
- Error handling

## Database Schema Design

### Core Entities

```sql
admins
  ↓ has many
channels
  ↓ has many
subscriptions
  ↓ has many
payments
```

### Key Design Decisions

1. **Separation of Admins and Subscribers**
   - Different user types, different tables
   - Easier to manage permissions
   - Clear role separation

2. **Subscription State Machine**
   ```
   pending → active → expired
             ↓
          cancelled
   ```

3. **Analytics Denormalization**
   - `analytics_summary` table for fast queries
   - Updated daily
   - Reduces load on main tables

4. **Setup Progress Tracking**
   - `setup_progress` table
   - Allows resuming incomplete setups
   - Tracks each step independently

## Error Handling Patterns

### 1. Graceful Degradation

```typescript
try {
  const balance = await this.tonService.getBalance(address);
  return balance;
} catch (error) {
  console.error('Error getting balance:', error);
  return 0;  // Graceful fallback
}
```

### 2. Transaction Rollback

```typescript
await this.db.query('BEGIN');
try {
  await this.db.query('UPDATE subscriptions...');
  await this.db.query('INSERT INTO payments...');
  await this.db.query('COMMIT');
} catch (error) {
  await this.db.query('ROLLBACK');
  throw error;
}
```

### 3. User-Friendly Messages

```typescript
catch (error) {
  console.error('Contract deployment failed:', error);
  await ctx.reply(
    '❌ Failed to deploy contract. Please contact support.\n' +
    'Error: ' + (error as Error).message
  );
}
```

## Security Best Practices

### 1. Input Validation

```typescript
private isValidTonAddress(address: string): boolean {
  return address.length === 48 && (
    address.startsWith('EQ') ||
    address.startsWith('UQ') ||
    address.startsWith('0:') ||
    address.startsWith('-1:')
  );
}
```

### 2. Admin Verification

```typescript
async verifyChannelAdmin(channelId: number, userId: number): Promise<boolean> {
  try {
    const admins = await this.botApi.getChatAdministrators(channelId);
    return admins.some(admin => admin.user.id === userId);
  } catch (error) {
    console.error('Error checking admin rights:', error);
    return false;
  }
}
```

### 3. Environment Variables

- All secrets in `.env`
- Never commit `.env`
- Validate required variables on startup

### 4. SQL Injection Prevention

```typescript
// Always use parameterized queries
await this.db.query(
  'SELECT * FROM admins WHERE telegram_id = $1',
  [telegramId]  // Parameterized
);
```

## Performance Optimizations

### 1. Database Indexing

```sql
CREATE INDEX idx_channels_admin ON channels(admin_id);
CREATE INDEX idx_subscriptions_subscriber ON subscriptions(subscriber_id);
CREATE INDEX idx_subscriptions_expires ON subscriptions(expires_at);
```

### 2. Connection Pooling

```typescript
const db = new Pool({
  connectionString: dbUrl,
  max: 20,  // Connection pool size
  idleTimeoutMillis: 30000
});
```

### 3. Efficient Queries

```sql
-- Use aggregations
SELECT COUNT(*) FROM subscriptions WHERE status = 'active';

-- Use joins instead of multiple queries
SELECT s.*, c.title, c.monthly_price_ton
FROM subscriptions s
JOIN channels c ON s.channel_id = c.id;
```

## Testing Strategy

### Smart Contracts

```typescript
// Use @ton/sandbox for testing
describe('SubscriptionFactory', () => {
  it('should deploy subscription contract', async () => {
    const factory = await deployFactory();
    const result = await factory.send(deployer.getSender(), {
      value: toNano('0.5')
    }, {
      $$type: 'DeploySubscription',
      channelId: 123n,
      // ...
    });
    expect(result.success).toBe(true);
  });
});
```

### Bot Logic

```typescript
// Mock database and services
const mockDb = {
  query: jest.fn()
};

const database = new DatabaseService(mockDb as any);
```

## Deployment Checklist

- [ ] Deploy factory contract
- [ ] Configure environment variables
- [ ] Setup database schema
- [ ] Start both bots
- [ ] Test channel setup flow
- [ ] Test subscription flow
- [ ] Monitor logs
- [ ] Setup backups

## Monitoring and Maintenance

### Key Metrics

1. **System Health**
   - Bot uptime
   - Database connections
   - TON network connectivity

2. **Business Metrics**
   - New channels per day
   - New subscriptions per day
   - Total revenue
   - Active subscribers

3. **Error Rates**
   - Failed contract deployments
   - Failed payments
   - Bot errors

### Maintenance Tasks

1. **Daily**
   - Check bot logs
   - Monitor payment confirmations
   - Review error rates

2. **Weekly**
   - Database backup
   - Analytics review
   - Performance check

3. **Monthly**
   - Update dependencies
   - Security audit
   - Cost analysis

## Lessons from ton-roulette Integration

### What Worked Well

1. **Factory Pattern** - Clean, scalable contract deployment
2. **Service Layer** - Easy to test and maintain
3. **Database Abstraction** - Centralized data access
4. **TON Client Service** - Reusable blockchain utilities
5. **Error Handling** - Graceful degradation

### Adaptations Made

1. **Two Bots Instead of One**
   - Clearer separation of concerns
   - Better UX for different user types

2. **Simpler Payment Flow**
   - No wallet connection in MVP
   - Manual payment via wallet app
   - Future: Add TON Connect like ton-roulette

3. **Direct Transfers**
   - Payments go directly to admins
   - No pool accumulation
   - Simpler accounting

### Future Enhancements from ton-roulette

1. **TON Connect Integration**
   - Seamless wallet connection
   - One-click payments
   - Better UX

2. **Redis Caching**
   - Faster data access
   - Reduced database load

3. **BullMQ Job Queue**
   - Reliable background jobs
   - Better payment monitoring
   - Scheduled tasks

4. **Comprehensive Testing**
   - Unit tests
   - Integration tests
   - E2E tests

## Conclusion

This architecture provides a solid foundation for a production-ready subscription paywall system, leveraging proven patterns from the ton-roulette project while adapting them for the specific use case of channel subscriptions.

The system is designed to be:
- **Scalable**: Can handle many channels and subscribers
- **Maintainable**: Clear separation of concerns
- **Secure**: Input validation and admin verification
- **Reliable**: Error handling and graceful degradation
- **Extensible**: Easy to add new features

---

For implementation details, see:
- [README.md](../README.md) - Quick start and usage
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide
- [ton-roulette/CLAUDE.md](../../ton-roulette/CLAUDE.md) - Original patterns
