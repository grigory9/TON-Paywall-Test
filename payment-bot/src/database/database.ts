import { Pool } from 'pg';
import { Subscriber, ProtectedChannel, AccessPurchase, PendingJoinRequest } from '../../../shared/types';
import { AccessDatabase } from '../../../shared/services/access-service';

// Legacy type alias for backward compatibility
type Channel = ProtectedChannel;

export class DatabaseService implements AccessDatabase {
  constructor(private db: Pool) {}

  // Subscriber operations
  async upsertSubscriber(
    telegramId: number,
    username?: string,
    firstName?: string
  ): Promise<Subscriber> {
    const result = await this.db.query(
      `INSERT INTO subscribers (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE
       SET username = $2, first_name = $3
       RETURNING *`,
      [telegramId, username, firstName]
    );
    return result.rows[0];
  }

  async getSubscriberByTelegramId(telegramId: number): Promise<Subscriber | null> {
    const result = await this.db.query(
      'SELECT * FROM subscribers WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0] || null;
  }

  async updateSubscriberWallet(subscriberId: number, walletAddress: string): Promise<void> {
    await this.db.query(
      'UPDATE subscribers SET wallet_address = $1 WHERE id = $2',
      [walletAddress, subscriberId]
    );
  }

  // Channel operations
  async getChannel(channelId: number): Promise<ProtectedChannel | null> {
    const result = await this.db.query(
      'SELECT * FROM protected_channels WHERE id = $1',
      [channelId]
    );
    return result.rows[0] || null;
  }

  // Required by AccessDatabase interface
  async getChannelById(channelId: number): Promise<ProtectedChannel | null> {
    return this.getChannel(channelId);
  }

  async getChannelByTelegramId(telegramId: number): Promise<ProtectedChannel | null> {
    const result = await this.db.query(
      'SELECT * FROM protected_channels WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0] || null;
  }

  async getActiveChannels(): Promise<ProtectedChannel[]> {
    const result = await this.db.query(
      `SELECT c.*, COUNT(ap.id) as subscriber_count
       FROM protected_channels c
       LEFT JOIN access_purchases ap ON c.id = ap.channel_id AND ap.status = 'active' AND NOT ap.access_revoked
       WHERE c.is_active = true
       GROUP BY c.id
       ORDER BY subscriber_count DESC
       LIMIT 20`
    );
    return result.rows;
  }

  // Get channel by contract address
  async getChannelByContractAddress(contractAddress: string): Promise<ProtectedChannel | null> {
    const result = await this.db.query(
      'SELECT * FROM protected_channels WHERE subscription_contract_address = $1',
      [contractAddress]
    );
    return result.rows[0] || null;
  }

  // ============================================================================
  // AccessDatabase Interface Implementation
  // ============================================================================
  // These methods are required by the AccessService for managing channel access

  /**
   * Check if user has active access to channel
   * Uses database function has_channel_access(user_id, channel_id)
   */
  async hasChannelAccess(userId: number, channelId: number): Promise<boolean> {
    const result = await this.db.query(
      'SELECT has_channel_access($1, $2) as has_access',
      [userId, channelId]
    );
    return result.rows[0]?.has_access || false;
  }

  /**
   * Grant permanent access to user
   * Creates access_purchase record with status 'active'
   *
   * @param userId - Telegram user ID
   * @param channelId - Database channel ID
   * @param transactionHash - Optional TON transaction hash for audit trail
   * @param amount - Optional payment amount in TON
   */
  async grantChannelAccess(
    userId: number,
    channelId: number,
    transactionHash?: string,
    amount?: number
  ): Promise<void> {
    // Get or create subscriber record
    const subscriberResult = await this.db.query(
      `INSERT INTO subscribers (telegram_id)
       VALUES ($1)
       ON CONFLICT (telegram_id) DO UPDATE
       SET telegram_id = EXCLUDED.telegram_id
       RETURNING id`,
      [userId]
    );
    const subscriberId = subscriberResult.rows[0].id;

    // Create access purchase record
    await this.db.query(
      `INSERT INTO access_purchases (subscriber_id, channel_id, status, transaction_hash, amount_ton, purchase_type, approved_at)
       VALUES ($1, $2, 'active', $3, $4, 'lifetime', NOW())
       ON CONFLICT (subscriber_id, channel_id)
       DO UPDATE SET
         status = 'active',
         transaction_hash = COALESCE(EXCLUDED.transaction_hash, access_purchases.transaction_hash),
         amount_ton = COALESCE(EXCLUDED.amount_ton, access_purchases.amount_ton),
         approved_at = COALESCE(access_purchases.approved_at, NOW()),
         updated_at = NOW()`,
      [subscriberId, channelId, transactionHash, amount]
    );

    console.log(`✓ Access granted: user ${userId}, channel ${channelId}, tx ${transactionHash}`);
  }

  /**
   * Save pending join request
   * Creates record in pending_join_requests table
   */
  async savePendingJoinRequest(userId: number, channelId: number): Promise<void> {
    await this.db.query(
      `INSERT INTO pending_join_requests (user_id, channel_id, requested_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '48 hours')
       ON CONFLICT (user_id, channel_id)
       DO UPDATE SET requested_at = NOW(), expires_at = NOW() + INTERVAL '48 hours'`,
      [userId, channelId]
    );
  }

  /**
   * Get pending join request for user and channel
   */
  async getPendingJoinRequest(userId: number, channelId: number): Promise<PendingJoinRequest | null> {
    const result = await this.db.query(
      'SELECT * FROM pending_join_requests WHERE user_id = $1 AND channel_id = $2',
      [userId, channelId]
    );
    return result.rows[0] || null;
  }

  /**
   * Mark payment as sent for pending join request
   */
  async markPaymentSent(userId: number, channelId: number): Promise<void> {
    await this.db.query(
      'UPDATE pending_join_requests SET payment_sent = true WHERE user_id = $1 AND channel_id = $2',
      [userId, channelId]
    );
  }

  /**
   * Delete pending join request (after approval or expiry)
   */
  async deletePendingJoinRequest(userId: number, channelId: number): Promise<void> {
    await this.db.query(
      'DELETE FROM pending_join_requests WHERE user_id = $1 AND channel_id = $2',
      [userId, channelId]
    );
  }

  /**
   * Get access purchase record for user and channel
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
   * Revoke user's access to channel
   * Marks access_purchase as revoked
   *
   * @param userId - Telegram user ID
   * @param channelId - Database channel ID
   * @param reason - Reason for revocation (audit trail)
   */
  async revokeAccess(userId: number, channelId: number, reason: string): Promise<void> {
    await this.db.query(
      `UPDATE access_purchases ap
       SET access_revoked = true,
           revoked_at = NOW(),
           revoked_reason = $3,
           status = 'expired'
       FROM subscribers s
       WHERE ap.subscriber_id = s.id
         AND s.telegram_id = $1
         AND ap.channel_id = $2`,
      [userId, channelId, reason]
    );
    console.log(`✓ Access revoked: user ${userId}, channel ${channelId}, reason: ${reason}`);
  }

  /**
   * Get member count for channel (for analytics)
   */
  async getChannelMemberCount(channelId: number): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*) as count
       FROM access_purchases
       WHERE channel_id = $1 AND status = 'active' AND NOT access_revoked`,
      [channelId]
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Update cached member count in protected_channels table
   */
  async updateChannelMemberCount(channelId: number, count: number): Promise<void> {
    await this.db.query(
      'UPDATE protected_channels SET total_members = $1 WHERE id = $2',
      [count, channelId]
    );
  }
}
