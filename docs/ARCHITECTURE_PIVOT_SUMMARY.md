# Architectural Pivot Summary: Subscription → One-Time Access

## Executive Summary

This document summarizes the architectural changes made to transform the TON Subscription Paywall system from a recurring subscription model to a one-time payment model for permanent channel access.

**Date:** October 26, 2025
**Version:** 2.0.0
**Status:** Implementation Complete, Testing Required

---

## Key Architectural Changes

### 1. Payment Model Transformation

**Before (Subscription Model):**
- Monthly recurring payments
- Expiry tracking (30-day periods)
- Automatic renewal required
- Periodic access verification
- Public channels with periodic removal

**After (One-Time Access Model):**
- Single payment for lifetime access
- No expiry dates
- No renewal needed
- Purchase tracked on-chain
- Private channels with join request approval

### 2. Channel Type Change

**Before:**
- Public channels (anyone can join)
- Bot periodically removes unpaid users
- Username-based invite links (@channelname)

**After:**
- Private channels (join by invite only)
- Join requests require payment approval
- Invite links with join request enabled
- Bot approves after payment confirmation

### 3. Smart Contract Simplification

**Before: ChannelSubscription Contract**
- Tracks expiry timestamps per subscriber
- Calculates 30-day periods
- Extends existing subscriptions
- Complex state management

**After: ChannelAccessGate Contract**
- Records payment timestamp (purchase proof)
- No expiry calculation needed
- Simple boolean check: did user pay?
- Minimal state storage

### 4. Database Schema Changes

**Table Renames:**
- `channels` → `protected_channels`
- `subscriptions` → `access_purchases`

**Removed Fields:**
- `monthly_price_ton` → `access_price_ton`
- `expires_at` (no longer needed)
- `starts_at` (no longer needed)
- `auto_renew` (no longer needed)
- `reminder_sent` (no longer needed)

**Added Fields:**
- `invite_link` (Telegram invite URL)
- `channel_type` (private/public)
- `purchase_type` (always 'lifetime')
- `approved_at` (when join request approved)
- `access_revoked` (admin can revoke)
- `total_members` (cached member count)
- `total_revenue_ton` (cached revenue)

**New Tables:**
- `pending_join_requests` (tracks join requests awaiting payment)

**Removed Tables:**
- `setup_progress` (no longer needed)
- `analytics_summary` (replaced with view)

---

## Technical Implementation

### Smart Contracts

**Location:** `/home/gmet/workspace/ton-paywall/contracts/contracts/access-gate.tact`

**New Contracts:**
1. **AccessGateFactory**
   - Deploys channel-specific access gates
   - Manages deployer role (hot wallet separation)
   - Registers deployment parameters

2. **ChannelAccessGate**
   - Processes one-time payments
   - Records purchase on-chain
   - Emits `AccessPurchased` event for bot detection
   - Handles overpayment refunds

**Key Methods:**
```tact
// User pays for access
receive("buy") { ... }

// Check if wallet paid
get fun hasPurchased(wallet: Address): Bool { ... }

// Get payment timestamp
get fun getPurchaseTimestamp(wallet: Address): Int { ... }
```

### Database Migration

**Location:** `/home/gmet/workspace/ton-paywall/migrations/001_pivot_to_onetime_access.sql`

**Safety Features:**
- Pre-flight checks (prevent double-run)
- Transactional (atomic commit)
- Data validation
- Rollback script provided
- Helper functions included

**Helper Functions:**
```sql
-- Check if user has access
has_channel_access(user_id BIGINT, channel_id INTEGER) → BOOLEAN

-- Cleanup expired requests
cleanup_expired_join_requests() → INTEGER
```

**Analytical View:**
```sql
CREATE VIEW channel_analytics AS ...
-- Real-time analytics for channel owners
```

### TypeScript Types

**Location:** `/home/gmet/workspace/ton-paywall/shared/types.ts`

**New Interfaces:**
```typescript
interface ProtectedChannel {
  access_price_ton: number;  // One-time price
  invite_link?: string;      // Private channel invite
  channel_type: 'private' | 'public';
  total_members: number;
  total_revenue_ton: number;
}

interface AccessPurchase {
  purchase_type: 'lifetime';
  approved_at?: Date;
  access_revoked: boolean;
  revoked_at?: Date;
  revoked_reason?: string;
}

interface PendingJoinRequest {
  user_id: number;
  channel_id: number;
  expires_at: Date;  // 48 hours
  payment_sent: boolean;
}
```

### AccessService

**Location:** `/home/gmet/workspace/ton-paywall/shared/services/access-service.ts`

**Responsibilities:**
- Check if user has access
- Grant access and approve join requests
- Handle join request workflow
- Revoke access (admin operation)
- Send payment instructions

**Key Methods:**
```typescript
async checkAccess(userId, channelId): AccessCheckResult
async grantAccess(userId, channelId, txHash?, amount?)
async handleJoinRequest(request: ChatJoinRequest)
async revokeAccess(userId, channelId, reason)
```

**Integration:**
```typescript
// In payment bot
private accessService: AccessService;

constructor() {
  this.accessService = new AccessService({
    bot: this.bot,
    database: this.database
  });
}

// Handle join requests
bot.on('chat_join_request', async (ctx) => {
  await this.accessService.handleJoinRequest(ctx.chatJoinRequest);
});
```

---

## User Flow Comparison

### Old Flow (Subscription Model)

```
1. User visits public channel
2. Sees content preview
3. Clicks bot link in channel description
4. Bot presents subscription offer (30 days)
5. User pays via TON Connect or manual
6. Bot adds user to channel
7. After 30 days: expiry warning
8. User must renew or loses access
9. Bot removes user if not renewed
```

### New Flow (One-Time Access Model)

```
1. User receives private channel invite link
2. Clicks "Request to Join Channel"
3. Bot sends payment instructions
4. User pays one-time fee via TON Connect or manual
5. Bot detects payment (~1 minute)
6. Bot approves join request automatically
7. User joins channel
8. User has permanent access (no expiry)
9. Can leave and rejoin anytime (already paid)
```

---

## Benefits of New Architecture

### For Users

**Simpler:**
- One payment, lifetime access
- No renewal reminders
- No risk of forgetting to renew
- Can leave and rejoin freely

**More Transparent:**
- Clear one-time price
- No hidden recurring fees
- Purchase recorded on blockchain

### For Channel Owners

**Easier Management:**
- No expiry tracking needed
- No renewal reminders to send
- Private channel = better content protection
- Clear revenue per user

**Better Economics:**
- Higher upfront revenue
- Predictable income per member
- No churn from forgotten renewals
- Lifetime value clearer

### For System

**Simpler Codebase:**
- No complex expiry calculations
- No renewal logic
- No subscription state machine
- Fewer edge cases

**Better Performance:**
- No periodic expiry checks
- Less database queries
- Simpler contract logic
- Lower gas costs

**More Reliable:**
- Fewer points of failure
- Less state to manage
- Clearer error handling
- Easier to debug

---

## Security Considerations

### Smart Contract Security

**Implemented:**
- 1% payment tolerance (gas fee variations)
- Automatic overpayment refunds (>0.1 TON)
- Admin-only price updates
- Deployer role separation (hot/cold wallet)
- Reentrancy protection
- Integer overflow protection

**Required Before Mainnet:**
- Third-party security audit (e.g., CertiK, Trail of Bits)
- Formal verification of critical functions
- Bug bounty program
- Gradual rollout with small channels first

### Bot Security

**Implemented:**
- Parameterized SQL queries (no injection)
- Input validation on all user inputs
- Rate limiting on payment checks
- Authorization checks on admin operations
- Error handling without information leakage

**Monitoring Required:**
- Failed payment attempts (potential fraud)
- Rapid join/leave patterns (abuse detection)
- Unusual payment amounts (typo detection)
- Bot uptime and responsiveness

### Data Security

**Implemented:**
- No private keys stored in bot code
- Encrypted database connections
- Transaction hashes for audit trail
- User data minimization

**Privacy:**
- Only essential user data stored
- No tracking beyond payment verification
- User can delete account (GDPR compliance)

---

## Performance Characteristics

### Expected Load

**Per Channel:**
- Join requests: 10-100/day
- Payments: 5-50/day
- Re-joins: 1-10/day

**System-Wide (100 channels):**
- Join requests: 1,000-10,000/day
- Payments: 500-5,000/day
- Database queries: ~100,000/day

### Optimization Strategies

**Database:**
- Indexed queries on frequently accessed fields
- View for analytics (avoids complex joins)
- Helper function uses indexes efficiently
- Connection pooling (max 20 connections)

**Bot:**
- Payment monitoring: 30-second interval
- Batch processing of pending requests
- Async/await for non-blocking operations
- Graceful degradation if blockchain slow

**Smart Contract:**
- Minimal on-chain storage
- Efficient state packing
- Gas-optimized computations
- Event emission for off-chain processing

---

## Migration Strategy

### Grandfathering Existing Users

**Automatic Conversion:**
- All active subscriptions → lifetime access
- `expires_at` removed but access retained
- `purchase_type` set to 'lifetime'
- `approved_at` set to subscription `starts_at`

**User Communication:**
```
"Good news! We've upgraded to lifetime access.

Your subscription has been converted to permanent access
at no additional cost. You'll never need to renew again!"
```

### Handling Pending Subscriptions

**Pending at Migration Time:**
- Status: `pending` → `pending_approval`
- Kept in database for payment completion
- Once paid: converted to lifetime access
- If not paid within 48h: expires normally

### Channel Owner Migration

**Existing Channels:**
- Contract address remains same initially
- New channels use new AccessGate contract
- Gradual migration offered to owners
- Migration assistant in admin bot

**Price Adjustment:**
- Tool to calculate one-time price from monthly price
- Suggested: `one_time = monthly * 12 * 0.5`
- Owners can set any price they want

---

## Monitoring and Observability

### Key Metrics

**Business Metrics:**
- Total revenue (TON)
- Conversion rate (requests → payments)
- Average access price
- Revenue per channel
- Member retention (leave rate)

**Technical Metrics:**
- Payment detection latency (target: <60s)
- Join request approval time (target: <120s)
- Bot uptime (target: >99.9%)
- Database query performance (target: <50ms)
- Smart contract gas usage

**User Experience Metrics:**
- Join request → access granted time (target: <5min)
- Failed payment rate (target: <5%)
- Support ticket rate
- User satisfaction (surveys)

### Alerting

**Critical Alerts (Immediate):**
- Bot offline >5 minutes
- Payment detection failing
- Database connection lost
- Smart contract errors

**Warning Alerts (Within 1 hour):**
- Payment detection latency >2 minutes
- Failed payments >10%
- Pending requests backlog >100
- Database slow queries

### Logging

**Structured Logging:**
```typescript
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  component: 'payment-bot',
  event: 'payment_detected',
  userId: 123456,
  channelId: 789,
  txHash: 'abc123...',
  amount: 10.0
}));
```

**Log Levels:**
- `debug`: Detailed flow information
- `info`: Normal operations (payments, approvals)
- `warn`: Recoverable errors (retry needed)
- `error`: Critical failures (requires intervention)

---

## Testing Strategy

### Test Environments

**1. Local Development:**
- Testnet blockchain
- Local PostgreSQL database
- Test Telegram bots
- Mock wallets

**2. Staging:**
- Testnet blockchain
- Staging database (copy of production schema)
- Separate bot instances
- Realistic test data

**3. Production:**
- Mainnet blockchain
- Production database
- Live bots
- Real users and payments

### Test Coverage Requirements

**Smart Contracts:** 90%+ coverage
- All payment scenarios
- Security edge cases
- Admin functions
- Error handling

**Bot Logic:** 80%+ coverage
- Join request handling
- Payment detection
- Access granting
- Error scenarios

**Database:** 100% migration testing
- Migration success
- Data integrity
- Rollback works
- Performance acceptable

### Continuous Testing

**Pre-Deployment:**
- Unit tests pass
- Integration tests pass
- Contract tests pass
- Staging deployment successful

**Post-Deployment:**
- Smoke tests in production
- Monitor for 1 hour before full rollout
- Gradual rollout (1 channel → 10 → all)
- Rollback ready if issues

---

## Deployment Checklist

### Pre-Deployment

- [ ] Backup production database
- [ ] Test on staging environment
- [ ] Deploy contracts to testnet
- [ ] Test complete flow on testnet
- [ ] Deploy contracts to mainnet
- [ ] Run database migration on staging
- [ ] Verify migration success
- [ ] Update .env with new contract addresses
- [ ] Build all components (`npm run build`)
- [ ] Notify channel owners of maintenance window

### Deployment

- [ ] Put bots in maintenance mode
- [ ] Stop bots (`pm2 stop all`)
- [ ] Backup database again
- [ ] Run database migration
- [ ] Verify migration success
- [ ] Deploy new bot code
- [ ] Update environment variables
- [ ] Start bots (`pm2 start all`)
- [ ] Run smoke tests
- [ ] Monitor logs for 30 minutes

### Post-Deployment

- [ ] Test with single channel
- [ ] Verify payment flow works
- [ ] Check analytics display correctly
- [ ] Enable for all channels
- [ ] Monitor for 24 hours
- [ ] Collect user feedback
- [ ] Fix any issues immediately
- [ ] Document lessons learned

---

## Rollback Procedures

### Quick Rollback (Critical Issues)

**If severe issues within 24 hours:**

```bash
# 1. Stop bots
pm2 stop admin-bot payment-bot

# 2. Restore database
pg_restore -d ton_subscription_mvp -c pre_migration_backup.backup

# 3. Revert code
git checkout v1.0.0
npm run build

# 4. Restart bots
pm2 start admin-bot payment-bot

# 5. Monitor recovery
pm2 logs --lines 200
```

### Partial Rollback

**If only specific components need rollback:**
- Database: Use rollback SQL script
- Bots: Revert specific commits
- Contracts: Cannot rollback (deploy new version)

### Data Reconciliation

**After rollback:**
- Identify payments made during migration
- Contact affected users
- Process manually if needed
- Compensate for any losses

---

## Future Enhancements

### Phase 2 Features (Month 2-3)

**Referral System:**
- Users earn rewards for referrals
- Tracked on-chain via smart contract
- Automatic reward distribution

**Tiered Access:**
- Basic / Premium / VIP tiers
- Different prices for different access levels
- Multiple access gates per channel

**Promotional Pricing:**
- Time-limited discounts
- Early bird pricing
- Bulk purchase discounts

### Phase 3 Features (Month 4-6)

**Advanced Analytics:**
- Real-time dashboards
- Revenue forecasting
- Member engagement metrics
- A/B testing pricing

**Integration APIs:**
- Webhook notifications
- Third-party integrations
- Export capabilities
- Programmatic channel management

**Enhanced Security:**
- Two-factor authentication for admins
- IP whitelisting
- Advanced fraud detection
- Automated refund handling

---

## Documentation and Support

### For Developers

**Required Reading:**
1. This document (architecture overview)
2. `/docs/PIVOT_IMPLEMENTATION_GUIDE.md` (step-by-step)
3. `/docs/TESTING_GUIDE.md` (comprehensive testing)
4. `CLAUDE.md` (project context)

**Code Documentation:**
- Inline comments explain WHY (not WHAT)
- JSDoc for all exported functions
- README in each module
- Examples for complex operations

### For Channel Owners

**User Guides:**
- "Getting Started with TON Paywall"
- "Setting Up Your First Channel"
- "Understanding Analytics"
- "Troubleshooting Common Issues"

**Video Tutorials:**
- Channel setup walkthrough
- Pricing strategy guide
- Managing members
- Interpreting analytics

### For End Users

**Help Articles:**
- "How to Pay with TON"
- "Connecting Your Wallet"
- "Accessing Private Channels"
- "What If Payment Doesn't Work?"

---

## Success Metrics

### Launch Week (Days 1-7)

**Target Metrics:**
- 0 critical bugs
- >95% payment success rate
- <5 minutes average join time
- 0 data loss incidents
- >90% user satisfaction

### First Month (Days 1-30)

**Target Metrics:**
- 100+ channels using new system
- 1,000+ successful access purchases
- <2% refund rate
- >99% bot uptime
- >85% user satisfaction

### Three Months (Days 1-90)

**Target Metrics:**
- 500+ active channels
- 10,000+ total access purchases
- Revenue maintained or increased vs. subscription model
- <1% support ticket rate
- >90% user satisfaction

---

## Conclusion

This architectural pivot simplifies the system significantly while providing a better user experience and more predictable revenue model for channel owners. The one-time payment model aligns better with Telegram's private channel architecture and eliminates the complexity of subscription management.

**Key Takeaways:**
- Simpler is better: Fewer moving parts = more reliability
- User experience first: One payment >> recurring hassle
- Security cannot be compromised: Audit before mainnet
- Test thoroughly: Edge cases will happen in production
- Monitor everything: You can't fix what you don't measure

**Ready for Implementation:** YES
**Confidence Level:** HIGH
**Risk Level:** MEDIUM (managed with proper testing and rollback)

---

**Document Version:** 1.0
**Last Updated:** October 26, 2025
**Next Review:** After implementation completion
