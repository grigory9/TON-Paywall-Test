# Complete Implementation Guide: Pivot to One-Time Access Model

## Executive Summary

This guide provides step-by-step instructions for implementing the architectural pivot from a recurring subscription model to a one-time payment model for permanent channel access.

**Estimated Implementation Time:** 8 days
**Risk Level:** Medium (requires database migration and contract redeployment)
**Rollback Strategy:** Database backup + version control

---

## Table of Contents

1. [Pre-Migration Checklist](#pre-migration-checklist)
2. [Phase 1: Database Migration](#phase-1-database-migration)
3. [Phase 2: Smart Contract Deployment](#phase-2-smart-contract-deployment)
4. [Phase 3: Update TypeScript Types](#phase-3-update-typescript-types)
5. [Phase 4: Implement AccessService](#phase-4-implement-accessservice)
6. [Phase 5: Update Database Service](#phase-5-update-database-service)
7. [Phase 6: Update Payment Bot](#phase-6-update-payment-bot)
8. [Phase 7: Update Admin Bot](#phase-7-update-admin-bot)
9. [Phase 8: Testing](#phase-8-testing)
10. [Phase 9: Deployment](#phase-9-deployment)
11. [Phase 10: Monitoring](#phase-10-monitoring)
12. [Rollback Procedures](#rollback-procedures)

---

## Pre-Migration Checklist

### Environment Preparation

- [ ] Backup production database
  ```bash
  pg_dump -d ton_subscription_mvp -F c -b -v -f backup_$(date +%Y%m%d_%H%M%S).backup
  ```

- [ ] Test on staging environment first
  ```bash
  # Create staging database
  createdb ton_subscription_staging
  pg_restore -d ton_subscription_staging production_backup.backup
  ```

- [ ] Verify all dependencies installed
  ```bash
  cd /home/gmet/workspace/ton-paywall
  npm run install:all
  ```

- [ ] Document current system state
  - Number of active channels
  - Number of active subscriptions
  - Current contract addresses
  - Bot tokens and credentials

- [ ] Notify channel owners of upcoming changes
  - Send announcement via admin bot
  - Explain new one-time payment model
  - Grandfather existing subscribers

### Risk Assessment

**High Risk Items:**
- Database migration (irreversible without backup)
- Smart contract redeployment (requires new addresses)
- User experience disruption during migration

**Mitigation:**
- Comprehensive testing on testnet/staging
- Maintenance mode during migration
- Clear rollback procedures
- User communication plan

---

## Phase 1: Database Migration

### Step 1.1: Review Migration Script

Location: `/home/gmet/workspace/ton-paywall/migrations/001_pivot_to_onetime_access.sql`

Key changes:
- Renames `channels` → `protected_channels`
- Renames `subscriptions` → `access_purchases`
- Removes expiry fields
- Adds `pending_join_requests` table
- Creates helper functions

### Step 1.2: Test Migration on Staging

```bash
# Connect to staging database
psql -d ton_subscription_staging

# Run migration
\i /home/gmet/workspace/ton-paywall/migrations/001_pivot_to_onetime_access.sql

# Verify results
SELECT COUNT(*) FROM protected_channels;
SELECT COUNT(*) FROM access_purchases;
SELECT * FROM pending_join_requests LIMIT 5;

# Test helper function
SELECT has_channel_access(123456, 1);
```

### Step 1.3: Run Migration on Production

**CRITICAL: Put bots in maintenance mode first!**

```bash
# Stop bots
pm2 stop admin-bot payment-bot

# Backup database
pg_dump -d ton_subscription_mvp -F c -b -v -f pre_migration_backup.backup

# Run migration
psql -d ton_subscription_mvp < /home/gmet/workspace/ton-paywall/migrations/001_pivot_to_onetime_access.sql

# Verify migration success
psql -d ton_subscription_mvp -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
```

### Step 1.4: Post-Migration Validation

```sql
-- Check data integrity
SELECT COUNT(*) as total_channels FROM protected_channels;
SELECT COUNT(*) as active_access FROM access_purchases WHERE status='active';
SELECT COUNT(*) as pending_requests FROM pending_join_requests;

-- Verify grandfathered users
SELECT
  COUNT(*) as grandfathered_users,
  SUM(CASE WHEN purchase_type='lifetime' THEN 1 ELSE 0 END) as lifetime_access
FROM access_purchases
WHERE status='active';
```

---

## Phase 2: Smart Contract Deployment

### Step 2.1: Review New Contract

Location: `/home/gmet/workspace/ton-paywall/contracts/contracts/access-gate.tact`

Key features:
- `AccessGateFactory` - Deploys channel-specific gates
- `ChannelAccessGate` - Handles one-time payments
- No expiry tracking
- Simplified payment logic

### Step 2.2: Build Contract

```bash
cd /home/gmet/workspace/ton-paywall/contracts

# Install dependencies if needed
npm install

# Build contract
npm run build

# Verify compilation
ls -la build/
```

### Step 2.3: Deploy to Testnet

```bash
# Ensure you're on testnet
export TON_NETWORK=testnet

# Deploy factory
npm run deploy:testnet

# Note the deployed address
# Example output: Factory deployed at: EQC...
```

### Step 2.4: Test Contract on Testnet

```bash
# Run contract tests
npm test

# Test deployment flow
npm run test:deploy
```

### Step 2.5: Deploy to Mainnet

**ONLY after thorough testnet testing!**

```bash
# Switch to mainnet
export TON_NETWORK=mainnet

# Deploy factory
npm run deploy

# CRITICAL: Save factory address to .env
echo "ACCESS_GATE_FACTORY_ADDRESS=EQC..." >> /home/gmet/workspace/ton-paywall/.env
```

---

## Phase 3: Update TypeScript Types

### Step 3.1: Verify Types Updated

Location: `/home/gmet/workspace/ton-paywall/shared/types.ts`

Changes already implemented:
- `ProtectedChannel` interface (replaces `Channel`)
- `AccessPurchase` interface (replaces `Subscription`)
- `PendingJoinRequest` interface (new)
- `ChannelAnalytics` interface (simplified)

### Step 3.2: Build Shared Module

```bash
cd /home/gmet/workspace/ton-paywall/shared
npm run build
```

---

## Phase 4: Implement AccessService

### Step 4.1: Verify Service Created

Location: `/home/gmet/workspace/ton-paywall/shared/services/access-service.ts`

Key methods:
- `checkAccess()` - Check if user has access
- `grantAccess()` - Approve join request and grant access
- `handleJoinRequest()` - Process incoming join requests
- `revokeAccess()` - Admin revocation (optional)

### Step 4.2: Integrate with Bots

```typescript
// In payment-bot/src/bot.ts
import { AccessService } from '../shared/services/access-service';

private accessService: AccessService;

constructor(token: string, dbUrl: string) {
  // ... existing code ...

  this.accessService = new AccessService({
    bot: this.bot,
    database: this.database,
    paymentBotUsername: process.env.PAYMENT_BOT_USERNAME
  });
}
```

---

## Phase 5: Update Database Service

### Step 5.1: Add New Methods to DatabaseService

Add these methods to both:
- `/home/gmet/workspace/ton-paywall/admin-bot/src/database/database.ts`
- `/home/gmet/workspace/ton-paywall/payment-bot/src/database/database.ts`

```typescript
/**
 * Check if user has active channel access
 */
async hasChannelAccess(userId: number, channelId: number): Promise<boolean> {
  const result = await this.db.query(
    `SELECT has_channel_access($1, $2) as has_access`,
    [userId, channelId]
  );
  return result.rows[0]?.has_access || false;
}

/**
 * Grant channel access to user
 */
async grantChannelAccess(
  userId: number,
  channelId: number,
  transactionHash?: string,
  amount?: number
): Promise<void> {
  // First, ensure subscriber exists
  const subscriberResult = await this.db.query(
    `SELECT id FROM subscribers WHERE telegram_id = $1`,
    [userId]
  );

  if (subscriberResult.rows.length === 0) {
    throw new Error(`Subscriber ${userId} not found`);
  }

  const subscriberId = subscriberResult.rows[0].id;

  // Insert or update access purchase
  await this.db.query(
    `INSERT INTO access_purchases
     (subscriber_id, channel_id, status, transaction_hash, amount_ton, purchase_type, approved_at)
     VALUES ($1, $2, 'active', $3, $4, 'lifetime', NOW())
     ON CONFLICT (subscriber_id, channel_id)
     DO UPDATE SET
       status = 'active',
       transaction_hash = COALESCE($3, access_purchases.transaction_hash),
       amount_ton = COALESCE($4, access_purchases.amount_ton),
       approved_at = NOW()`,
    [subscriberId, channelId, transactionHash, amount]
  );

  // Update channel member count
  await this.db.query(
    `UPDATE protected_channels
     SET total_members = total_members + 1,
         total_revenue_ton = total_revenue_ton + COALESCE($1, 0)
     WHERE id = $2`,
    [amount, channelId]
  );
}

/**
 * Get channel by Telegram ID
 */
async getChannelByTelegramId(telegramId: number): Promise<ProtectedChannel | null> {
  const result = await this.db.query(
    `SELECT * FROM protected_channels WHERE telegram_id = $1`,
    [telegramId]
  );
  return result.rows[0] || null;
}

/**
 * Save pending join request
 */
async savePendingJoinRequest(userId: number, channelId: number): Promise<void> {
  await this.db.query(
    `INSERT INTO pending_join_requests (user_id, channel_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, channel_id) DO NOTHING`,
    [userId, channelId]
  );
}

/**
 * Get pending join request
 */
async getPendingJoinRequest(userId: number, channelId: number): Promise<PendingJoinRequest | null> {
  const result = await this.db.query(
    `SELECT * FROM pending_join_requests
     WHERE user_id = $1 AND channel_id = $2 AND expires_at > NOW()`,
    [userId, channelId]
  );
  return result.rows[0] || null;
}

/**
 * Delete pending join request (after approval)
 */
async deletePendingJoinRequest(userId: number, channelId: number): Promise<void> {
  await this.db.query(
    `DELETE FROM pending_join_requests WHERE user_id = $1 AND channel_id = $2`,
    [userId, channelId]
  );
}

/**
 * Get access purchase record
 */
async getAccessPurchase(userId: number, channelId: number): Promise<AccessPurchase | null> {
  const result = await this.db.query(
    `SELECT ap.*
     FROM access_purchases ap
     JOIN subscribers s ON ap.subscriber_id = s.id
     WHERE s.telegram_id = $1 AND ap.channel_id = $2`,
    [userId, channelId]
  );
  return result.rows[0] || null;
}

/**
 * Revoke user access (admin operation)
 */
async revokeAccess(userId: number, channelId: number, reason: string): Promise<void> {
  await this.db.query(
    `UPDATE access_purchases ap
     SET access_revoked = true,
         revoked_at = NOW(),
         revoked_reason = $3
     FROM subscribers s
     WHERE ap.subscriber_id = s.id
       AND s.telegram_id = $1
       AND ap.channel_id = $2`,
    [userId, channelId, reason]
  );
}

/**
 * Mark payment sent for join request
 */
async markPaymentSent(userId: number, channelId: number): Promise<void> {
  await this.db.query(
    `UPDATE pending_join_requests
     SET payment_sent = true, payment_notified = true
     WHERE user_id = $1 AND channel_id = $2`,
    [userId, channelId]
  );
}

/**
 * Cleanup expired join requests (run periodically)
 */
async cleanupExpiredRequests(): Promise<number> {
  const result = await this.db.query(`SELECT cleanup_expired_join_requests()`);
  return result.rows[0]?.cleanup_expired_join_requests || 0;
}
```

---

## Phase 6: Update Payment Bot

### Step 6.1: Add Join Request Handler

Add to `/home/gmet/workspace/ton-paywall/payment-bot/src/bot.ts`:

```typescript
private setupJoinRequestHandler() {
  /**
   * CRITICAL: Handle chat_join_request events
   * This is the new entry point for users wanting to join private channels
   */
  this.bot.on('chat_join_request', async (ctx) => {
    const request = ctx.chatJoinRequest;

    console.log(`Join request: user ${request.from.id} for channel ${request.chat.id}`);

    try {
      await this.accessService.handleJoinRequest(request);
    } catch (error) {
      console.error('Error handling join request:', error);
      // Don't crash bot on individual request errors
    }
  });
}
```

### Step 6.2: Update Payment Monitoring

Modify payment monitoring to use the new access model:

```typescript
/**
 * Monitor blockchain for payments and approve join requests
 */
private async monitorPayments() {
  console.log('Starting payment monitoring...');

  setInterval(async () => {
    try {
      // Get pending access purchases awaiting payment
      const pending = await this.database.query(
        `SELECT ap.*, pc.telegram_id as channel_telegram_id,
                pc.access_price_ton, s.telegram_id as user_telegram_id
         FROM access_purchases ap
         JOIN protected_channels pc ON ap.channel_id = pc.id
         JOIN subscribers s ON ap.subscriber_id = s.id
         WHERE ap.status = 'pending'
           AND ap.created_at > NOW() - INTERVAL '48 hours'`
      );

      for (const purchase of pending.rows) {
        // Check blockchain for transaction
        const txHash = await this.checkBlockchainForPayment(
          purchase.user_telegram_id,
          pc.subscription_contract_address,
          purchase.access_price_ton
        );

        if (txHash) {
          // Payment found - grant access
          await this.accessService.grantAccess(
            purchase.user_telegram_id,
            purchase.channel_id,
            txHash,
            purchase.access_price_ton
          );

          console.log(`✓ Payment confirmed and access granted: user ${purchase.user_telegram_id}`);
        }
      }
    } catch (error) {
      console.error('Payment monitoring error:', error);
    }
  }, 30000); // Check every 30 seconds
}
```

### Step 6.3: Update Payment Instructions

Replace subscription-based messages with one-time payment messages:

```typescript
private async showPaymentInstructions(ctx: Context, channelId: number) {
  const channel = await this.database.getChannelById(channelId);

  if (!channel) {
    await ctx.reply('❌ Channel not found.');
    return;
  }

  await ctx.reply(
    `💎 **${channel.title}**\n\n` +
    `Price: **${channel.access_price_ton} TON** (one-time payment)\n\n` +
    `✅ Pay once, access forever!\n` +
    `✅ No recurring fees\n` +
    `✅ Instant approval after payment\n\n` +
    `Choose payment method:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Pay with TON Connect', callback_data: `pay_${channel.id}` }],
          [{ text: '💎 Pay with Other Wallet', callback_data: `manual_pay_${channel.id}` }]
        ]
      }
    }
  );
}
```

### Step 6.4: Remove Subscription Logic

Remove or comment out:
- Expiry checking code
- Renewal reminders
- Auto-removal from channels
- Subscription expiry warnings

---

## Phase 7: Update Admin Bot

### Step 7.1: Update Channel Setup Flow

Modify `/home/gmet/workspace/ton-paywall/admin-bot/src/bot.ts` setup conversation:

```typescript
async function channelSetupConversation(conversation: MyConversation, ctx: MyContext) {
  // Step 1: Get channel ID
  await ctx.reply('Send me the channel username or ID (e.g., @mychannel or -1001234567890)');
  const channelCtx = await conversation.wait();
  const channelInput = channelCtx.message?.text;

  // ... existing channel verification ...

  // Step 2: CRITICAL - Check channel is private
  try {
    const chat = await ctx.api.getChat(channelId);

    if (chat.type !== 'channel') {
      await ctx.reply('❌ This must be a channel, not a group.');
      return;
    }

    // Check if channel has a username (public channels have usernames)
    if ('username' in chat && chat.username) {
      await ctx.reply(
        '⚠️ **Channel must be private!**\n\n' +
        'Public channels cannot use join request paywalls.\n\n' +
        'Please:\n' +
        '1. Go to channel settings\n' +
        '2. Set channel type to **Private**\n' +
        '3. Run setup again after changing',
        { parse_mode: 'Markdown' }
      );
      return;
    }
  } catch (error) {
    await ctx.reply('❌ Could not access channel. Make sure the bot is added as an admin.');
    return;
  }

  // Step 3: Create invite link with join requests enabled
  try {
    const inviteLink = await ctx.api.createChatInviteLink(channelId, {
      creates_join_request: true,
      name: 'TON Access Paywall'
    });

    await conversation.external(() =>
      database.saveChannelInviteLink(channelId, inviteLink.invite_link)
    );

    await ctx.reply(
      '✅ Invite link created!\n\n' +
      `Link: ${inviteLink.invite_link}\n\n` +
      'Users who click this link will need to pay before being approved.'
    );
  } catch (error) {
    console.error('Failed to create invite link:', error);
    await ctx.reply('❌ Could not create invite link. Ensure bot has permission to create invite links.');
    return;
  }

  // Step 4: Ask for one-time access price
  await ctx.reply(
    '💎 **Set your access price (one-time payment)**\n\n' +
    'Suggested prices:\n' +
    '• 5 TON - Basic content\n' +
    '• 10 TON - Premium content\n' +
    '• 25 TON - Exclusive content\n' +
    '• 50+ TON - VIP access\n\n' +
    'Enter price in TON (number only):',
    { parse_mode: 'Markdown' }
  );

  const priceCtx = await conversation.wait();
  const accessPrice = parseFloat(priceCtx.message?.text || '0');

  if (isNaN(accessPrice) || accessPrice <= 0 || accessPrice > 1000) {
    await ctx.reply('❌ Invalid price. Must be between 0 and 1000 TON.');
    return;
  }

  // Step 5: Deploy access gate contract
  await ctx.reply('⏳ Deploying smart contract...');

  try {
    const contractAddress = await deployAccessGate(channelId, accessPrice, adminWallet);

    await conversation.external(() =>
      database.saveChannelAccessGate(channelId, contractAddress, accessPrice)
    );

    await ctx.reply(
      '✅ **Setup Complete!**\n\n' +
      `Channel: ${channelTitle}\n` +
      `Access Price: ${accessPrice} TON (one-time)\n` +
      `Contract: \`${contractAddress}\`\n\n` +
      `Share this invite link:\n${inviteLink.invite_link}\n\n` +
      'Users who join will need to pay once for lifetime access!',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Contract deployment failed:', error);
    await ctx.reply('❌ Contract deployment failed. Please try again or contact support.');
    return;
  }
}
```

### Step 7.2: Update Analytics

Replace subscription-based analytics with access-based analytics:

```typescript
bot.command('analytics', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Get admin's channels
  const channels = await database.getAdminChannels(userId);

  if (channels.length === 0) {
    await ctx.reply('You don\'t have any channels set up yet. Use /setup to create one.');
    return;
  }

  for (const channel of channels) {
    // Use the new analytics view
    const stats = await database.query(
      `SELECT * FROM channel_analytics WHERE channel_id = $1`,
      [channel.id]
    );

    const analytics = stats.rows[0];

    await ctx.reply(
      `📊 **${channel.title} Analytics**\n\n` +
      `💎 Access Price: ${channel.access_price_ton} TON\n` +
      `👥 Total Members: ${analytics.total_members}\n` +
      `✅ Paid Members: ${analytics.paid_members}\n` +
      `⏳ Pending Requests: ${analytics.pending_requests}\n` +
      `💰 Total Revenue: ${analytics.total_revenue_ton} TON\n\n` +
      `Conversion Rate: ${((analytics.paid_members / analytics.total_members) * 100).toFixed(1)}%`,
      { parse_mode: 'Markdown' }
    );
  }
});
```

---

## Phase 8: Testing

### Step 8.1: Unit Tests

Create test file: `/home/gmet/workspace/ton-paywall/tests/access-service.test.ts`

```typescript
import { AccessService } from '../shared/services/access-service';

describe('AccessService', () => {
  it('should check access correctly', async () => {
    // Test implementation
  });

  it('should grant access and approve join request', async () => {
    // Test implementation
  });

  it('should handle join request workflow', async () => {
    // Test implementation
  });
});
```

Run tests:
```bash
cd /home/gmet/workspace/ton-paywall
npm test
```

### Step 8.2: Integration Testing

Test complete flow on testnet:

1. **Setup Channel (Admin Bot)**
   - `/start` in admin bot
   - `/setup` command
   - Enter channel ID (use test channel)
   - Verify private channel check works
   - Set access price (e.g., 0.1 TON for testing)
   - Confirm contract deployment
   - Save invite link

2. **Request Access (Payment Bot)**
   - Click invite link (opens Telegram)
   - Click "Request to Join"
   - Verify payment bot sends message
   - Check payment instructions appear

3. **Make Payment**
   - Connect wallet or use manual payment
   - Send 0.1 TON to contract address
   - Wait for confirmation (~1 minute)

4. **Verify Access Granted**
   - Check user approved to join channel
   - Verify database records updated
   - Check user receives confirmation message
   - Verify user can access channel

5. **Test Re-Join**
   - Leave channel
   - Click invite link again
   - Verify auto-approval (already paid)

### Step 8.3: Edge Case Testing

Test these scenarios:

- [ ] User clicks invite link multiple times
- [ ] User pays wrong amount (too little)
- [ ] User overpays (should get refund)
- [ ] Payment bot offline during payment (should catch up)
- [ ] Channel owner deletes channel
- [ ] User blocks payment bot
- [ ] Concurrent join requests from same user

---

## Phase 9: Deployment

### Step 9.1: Pre-Deployment

```bash
# Build all components
cd /home/gmet/workspace/ton-paywall
npm run build

# Verify builds successful
ls -la admin-bot/dist/
ls -la payment-bot/dist/
ls -la contracts/build/
```

### Step 9.2: Deploy Smart Contracts

```bash
cd /home/gmet/workspace/ton-paywall/contracts

# Deploy to mainnet (ONLY after testnet testing!)
export TON_NETWORK=mainnet
npm run deploy

# Save factory address
# Output: Factory deployed at: EQC...
echo "ACCESS_GATE_FACTORY_ADDRESS=EQC..." >> ../.env
```

### Step 9.3: Update Environment Variables

Edit `/home/gmet/workspace/ton-paywall/.env`:

```bash
# Add new variables
ACCESS_GATE_FACTORY_ADDRESS=EQC...  # From deployment
PAYMENT_BOT_USERNAME=YourPaymentBot  # Your bot username

# Verify existing variables
ADMIN_BOT_TOKEN=...
PAYMENT_BOT_TOKEN=...
DATABASE_URL=...
TON_NETWORK=mainnet
```

### Step 9.4: Deploy Bots

```bash
# Stop existing bots
pm2 stop admin-bot payment-bot

# Deploy new versions
pm2 delete admin-bot payment-bot

pm2 start admin-bot/dist/index.js --name admin-bot
pm2 start payment-bot/dist/index.js --name payment-bot

# Save PM2 configuration
pm2 save
```

### Step 9.5: Verify Deployment

```bash
# Check bot status
pm2 status

# Check logs for errors
pm2 logs admin-bot --lines 50
pm2 logs payment-bot --lines 50

# Test with single channel
# Use admin bot /setup to create test channel
# Verify complete flow works
```

---

## Phase 10: Monitoring

### Step 10.1: Set Up Monitoring

Monitor these metrics:

```bash
# Bot health
pm2 monit

# Database queries
psql -d ton_subscription_mvp -c "
  SELECT
    COUNT(*) FILTER (WHERE status='active') as active_access,
    COUNT(*) FILTER (WHERE status='pending') as pending_payments,
    COUNT(*) as total_requests
  FROM access_purchases;
"

# Pending join requests
psql -d ton_subscription_mvp -c "
  SELECT COUNT(*) as pending_requests,
         COUNT(*) FILTER (WHERE payment_sent=true) as awaiting_approval
  FROM pending_join_requests
  WHERE expires_at > NOW();
"
```

### Step 10.2: Cleanup Tasks

Schedule these tasks to run periodically:

```bash
# Add to crontab (run every hour)
crontab -e

# Add this line:
0 * * * * psql -d ton_subscription_mvp -c "SELECT cleanup_expired_join_requests();" >> /var/log/cleanup.log 2>&1
```

### Step 10.3: Monitoring Alerts

Set up alerts for:
- Payment processing failures (>5% failure rate)
- Bot downtime (offline >5 minutes)
- Database errors
- Contract interaction failures
- High pending request backlog (>100 pending)

---

## Rollback Procedures

### Emergency Rollback (Critical Issues)

If critical issues occur within first 24 hours:

```bash
# 1. Stop bots immediately
pm2 stop admin-bot payment-bot

# 2. Restore database backup
pg_restore -d ton_subscription_mvp -c pre_migration_backup.backup

# 3. Revert to previous code version
cd /home/gmet/workspace/ton-paywall
git checkout v1.0.0  # Your previous stable version
npm run build

# 4. Start old bots
pm2 restart admin-bot payment-bot

# 5. Verify system operational
pm2 logs --lines 100
```

### Partial Rollback (Database Only)

If only database needs rollback:

```bash
# Use the provided rollback script
psql -d ton_subscription_mvp < migrations/001_pivot_to_onetime_access_ROLLBACK.sql
```

**WARNING:** This will lose all data created after migration!

### Data Reconciliation After Rollback

If users paid during the migration:

```sql
-- Identify payments made during migration
SELECT * FROM payments
WHERE created_at > '2025-10-26 00:00:00'  -- Migration timestamp
  AND status = 'confirmed';

-- Manually reconcile these payments
-- Contact affected users
-- Process refunds if necessary
```

---

## Post-Migration Tasks

### Week 1: Intensive Monitoring

- [ ] Monitor logs daily for errors
- [ ] Track payment success rate (target: >95%)
- [ ] Monitor join request approval times
- [ ] Collect user feedback
- [ ] Fix any issues immediately

### Week 2-4: Optimization

- [ ] Optimize database queries based on usage patterns
- [ ] Fine-tune payment monitoring interval
- [ ] Improve user messaging based on feedback
- [ ] Add analytics dashboards

### Month 2+: Long-term

- [ ] Schedule smart contract security audit
- [ ] Implement advanced features (referral system, etc.)
- [ ] Scale infrastructure if needed
- [ ] Plan next features

---

## Support Resources

### Documentation

- TON Documentation: https://docs.ton.org
- Tact Language: https://docs.tact-lang.org
- grammY Framework: https://grammy.dev
- PostgreSQL: https://www.postgresql.org/docs/

### Troubleshooting

**Payment not detected:**
- Check blockchain explorer for transaction
- Verify contract address correct
- Check payment monitoring logs
- Verify correct payment amount (within 1% tolerance)

**Join request not approved:**
- Check payment confirmed in database
- Verify bot has admin permissions in channel
- Check bot logs for errors
- Try manual approval via admin bot

**Contract deployment fails:**
- Verify wallet has sufficient TON
- Check network (testnet vs mainnet)
- Verify factory contract address
- Check deployment logs

---

## Success Criteria

Migration is successful when:

- [x] All database tables migrated correctly
- [x] Smart contracts deployed and functional
- [x] Bots running without errors
- [x] Join request flow working end-to-end
- [x] Payment detection and approval working
- [x] Existing users retained access (grandfathered)
- [x] No data loss
- [x] Analytics showing correct data
- [x] Admin can create new channels
- [x] Users can purchase access successfully

---

## Contact

For issues during migration:
- Check bot logs: `pm2 logs`
- Check database: `psql -d ton_subscription_mvp`
- Review documentation in `/home/gmet/workspace/ton-paywall/docs/`
- Test on testnet first if unsure

---

## Appendix: Quick Reference Commands

```bash
# Database backup
pg_dump -d ton_subscription_mvp -F c -b -v -f backup.backup

# Database restore
pg_restore -d ton_subscription_mvp -c backup.backup

# Run migration
psql -d ton_subscription_mvp < migrations/001_pivot_to_onetime_access.sql

# Build everything
npm run build

# Deploy contracts
cd contracts && npm run deploy

# Restart bots
pm2 restart all

# Check status
pm2 status && pm2 logs --lines 50

# Cleanup expired requests
psql -d ton_subscription_mvp -c "SELECT cleanup_expired_join_requests();"
```

---

**End of Implementation Guide**
