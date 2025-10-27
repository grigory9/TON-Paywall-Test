import { Pool } from 'pg';
import { Admin, ProtectedChannel, AccessPurchase, PendingJoinRequest, ChannelAnalytics } from '../../../shared/types';
import { AccessDatabase } from '../../../shared/services/access-service';

// Legacy type alias for backward compatibility
type Channel = ProtectedChannel;

export class DatabaseService implements AccessDatabase {
  constructor(private db: Pool) {}

  // Admin operations
  async upsertAdmin(
    telegramId: number,
    username?: string,
    firstName?: string
  ): Promise<Admin> {
    const result = await this.db.query(
      `INSERT INTO admins (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE
       SET username = $2, first_name = $3, updated_at = NOW()
       RETURNING *`,
      [telegramId, username, firstName]
    );
    return result.rows[0];
  }

  async getAdminByTelegramId(telegramId: number): Promise<Admin | null> {
    const result = await this.db.query(
      'SELECT * FROM admins WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0] || null;
  }

  async updateAdmin(adminId: number, updates: Partial<Admin> & {
    wallet_connected?: boolean;
    wallet_connection_method?: string;
  }): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.wallet_address !== undefined) {
      fields.push(`wallet_address = $${paramIndex++}`);
      values.push(updates.wallet_address);
    }

    if (updates.wallet_connected !== undefined) {
      fields.push(`wallet_connected = $${paramIndex++}`);
      values.push(updates.wallet_connected);
    }

    if ((updates as any).wallet_connection_method !== undefined) {
      fields.push(`wallet_connection_method = $${paramIndex++}`);
      values.push((updates as any).wallet_connection_method);
    }

    if (fields.length === 0) return;

    values.push(adminId);
    await this.db.query(
      `UPDATE admins SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
      values
    );
  }

  // Channel operations
  async upsertChannel(
    telegramId: number,
    title: string,
    username: string | undefined,
    adminId: number
  ): Promise<ProtectedChannel> {
    const result = await this.db.query(
      `INSERT INTO protected_channels (telegram_id, title, username, admin_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_id) DO UPDATE
       SET title = $2, username = $3, updated_at = NOW()
       RETURNING *`,
      [telegramId, title, username, adminId]
    );
    return result.rows[0];
  }

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

  async getChannelsByAdmin(adminId: number): Promise<ProtectedChannel[]> {
    const result = await this.db.query(
      'SELECT * FROM protected_channels WHERE admin_id = $1 ORDER BY created_at DESC',
      [adminId]
    );
    return result.rows;
  }

  async getActiveChannelsByAdmin(adminId: number): Promise<ProtectedChannel[]> {
    const result = await this.db.query(
      'SELECT * FROM protected_channels WHERE admin_id = $1 AND is_active = true ORDER BY created_at DESC',
      [adminId]
    );
    return result.rows;
  }

  async updateChannel(channelId: number, updates: Partial<ProtectedChannel>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.payment_bot_added !== undefined) {
      fields.push(`payment_bot_added = $${paramIndex++}`);
      values.push(updates.payment_bot_added);
    }

    // Support both old and new column names for backward compatibility
    if (updates.access_price_ton !== undefined) {
      fields.push(`access_price_ton = $${paramIndex++}`);
      values.push(updates.access_price_ton);
    } else if ((updates as any).monthly_price_ton !== undefined) {
      fields.push(`access_price_ton = $${paramIndex++}`);
      values.push((updates as any).monthly_price_ton);
    }

    if (updates.subscription_contract_address !== undefined) {
      fields.push(`subscription_contract_address = $${paramIndex++}`);
      values.push(updates.subscription_contract_address);
    }

    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(updates.is_active);
    }

    if (updates.invite_link !== undefined) {
      fields.push(`invite_link = $${paramIndex++}`);
      values.push(updates.invite_link);
    }

    if (updates.channel_type !== undefined) {
      fields.push(`channel_type = $${paramIndex++}`);
      values.push(updates.channel_type);
    }

    if (updates.requires_approval !== undefined) {
      fields.push(`requires_approval = $${paramIndex++}`);
      values.push(updates.requires_approval);
    }

    if (fields.length === 0) return;

    values.push(channelId);
    await this.db.query(
      `UPDATE protected_channels SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
      values
    );
  }

  // Setup progress operations
  async recordSetupProgress(
    adminId: number,
    channelId: number,
    step: string,
    data?: any
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO setup_progress (admin_id, channel_id, step, completed, completed_at, data)
       VALUES ($1, $2, $3, true, NOW(), $4)
       ON CONFLICT (admin_id, channel_id, step)
       DO UPDATE SET completed = true, completed_at = NOW(), data = $4`,
      [adminId, channelId, step, data ? JSON.stringify(data) : null]
    );
  }

  async getSetupProgress(adminId: number, channelId: number) {
    const result = await this.db.query(
      'SELECT step, completed FROM setup_progress WHERE admin_id = $1 AND channel_id = $2',
      [adminId, channelId]
    );

    const steps = ['channel_verified', 'bot_added', 'wallet_connected', 'contract_deployed'];
    const completed = result.rows.filter(r => r.completed).map(r => r.step);

    return {
      completedSteps: completed,
      nextStep: steps.find(s => !completed.includes(s)),
      isComplete: completed.length === steps.length
    };
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

  /**
   * Get analytics for a channel using the channel_analytics view
   */
  async getChannelAnalytics(channelId: number): Promise<ChannelAnalytics | null> {
    const result = await this.db.query(
      'SELECT * FROM channel_analytics WHERE channel_id = $1',
      [channelId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all analytics for channels owned by admin
   */
  async getAnalyticsByAdmin(adminId: number): Promise<ChannelAnalytics[]> {
    const result = await this.db.query(
      `SELECT ca.*
       FROM channel_analytics ca
       JOIN protected_channels pc ON ca.channel_id = pc.id
       WHERE pc.admin_id = $1
       ORDER BY ca.total_revenue_ton DESC`,
      [adminId]
    );
    return result.rows;
  }
}
