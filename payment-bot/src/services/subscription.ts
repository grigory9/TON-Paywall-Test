// Access Purchase management service (formerly Subscription)
// Updated for one-time lifetime access model
import { Pool } from 'pg';
import { AccessPurchase } from '../../../shared/types';

// Legacy type alias for backward compatibility
type Subscription = AccessPurchase;

export class SubscriptionService {
  constructor(private db: Pool) {}

  /**
   * Check if user has purchased access to channel
   * Updated for one-time access model
   */
  async checkSubscription(
    subscriberId: number,
    channelId: number
  ): Promise<AccessPurchase | null> {
    const result = await this.db.query(
      'SELECT * FROM access_purchases WHERE subscriber_id = $1 AND channel_id = $2',
      [subscriberId, channelId]
    );
    return result.rows[0] || null;
  }

  async getSubscriptionById(purchaseId: number): Promise<AccessPurchase | null> {
    const result = await this.db.query(
      'SELECT * FROM access_purchases WHERE id = $1',
      [purchaseId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create or update access purchase
   * No expiry - lifetime access!
   */
  async createOrUpdateSubscription(
    subscriberId: number,
    channelId: number,
    amount: number
  ): Promise<AccessPurchase> {
    const result = await this.db.query(
      `INSERT INTO access_purchases (subscriber_id, channel_id, status, amount_ton, purchase_type)
       VALUES ($1, $2, 'pending', $3, 'lifetime')
       ON CONFLICT (subscriber_id, channel_id)
       DO UPDATE SET status = 'pending', amount_ton = $3, updated_at = NOW()
       RETURNING *`,
      [subscriberId, channelId, amount]
    );
    return result.rows[0];
  }

  /**
   * Grant lifetime access (no expiry!)
   * Updated for one-time access model
   */
  async activateSubscription(purchaseId: number, transactionHash?: string): Promise<void> {
    await this.db.query('BEGIN');

    try {
      // Update access purchase status (NO expiry - lifetime!)
      await this.db.query(
        `UPDATE access_purchases
         SET status = 'active',
             approved_at = NOW(),
             transaction_hash = $2,
             purchase_type = 'lifetime',
             updated_at = NOW()
         WHERE id = $1`,
        [purchaseId, transactionHash]
      );

      // Create payment record
      await this.db.query(
        `INSERT INTO payments (subscription_id, transaction_hash, amount_ton, status, confirmed_at)
         VALUES ($1, $2, (SELECT amount_ton FROM access_purchases WHERE id = $1), 'confirmed', NOW())
         ON CONFLICT (transaction_hash) DO NOTHING`,
        [purchaseId, transactionHash]
      );

      await this.db.query('COMMIT');

      console.log(`Access purchase ${purchaseId} activated with lifetime access`);
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get user's active access purchases (lifetime access)
   * No expiry check needed!
   */
  async getUserActiveSubscriptions(subscriberId: number): Promise<AccessPurchase[]> {
    const result = await this.db.query(
      `SELECT ap.*, c.title, c.username, c.access_price_ton
       FROM access_purchases ap
       JOIN protected_channels c ON ap.channel_id = c.id
       WHERE ap.subscriber_id = $1 AND ap.status = 'active' AND NOT ap.access_revoked
       ORDER BY ap.created_at DESC`,
      [subscriberId]
    );
    return result.rows;
  }

  /**
   * Get active member count for channel
   * Updated for one-time access model
   */
  async getActiveSubscriberCount(channelId: number): Promise<number> {
    const result = await this.db.query(
      'SELECT COUNT(*) as count FROM access_purchases WHERE channel_id = $1 AND status = $2 AND NOT access_revoked',
      [channelId, 'active']
    );
    return parseInt(result.rows[0].count);
  }

  // ============================================================================
  // REMOVED: expireOldSubscriptions()
  // One-time access model has no expiry - lifetime access!
  // ============================================================================

  /**
   * Get pending access purchases
   * Updated for new table names
   */
  async getPendingSubscriptions(): Promise<AccessPurchase[]> {
    const result = await this.db.query(
      `SELECT ap.*, c.subscription_contract_address, c.access_price_ton, sub.telegram_id
       FROM access_purchases ap
       JOIN protected_channels c ON ap.channel_id = c.id
       JOIN subscribers sub ON ap.subscriber_id = sub.id
       WHERE ap.status = 'pending'
       AND ap.created_at > NOW() - INTERVAL '1 hour'`
    );
    return result.rows;
  }
}
