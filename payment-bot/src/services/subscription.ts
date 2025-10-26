// Subscription management service
import { Pool } from 'pg';
import { Subscription } from '../../../shared/types';

export class SubscriptionService {
  constructor(private db: Pool) {}

  async checkSubscription(
    subscriberId: number,
    channelId: number
  ): Promise<Subscription | null> {
    const result = await this.db.query(
      'SELECT * FROM subscriptions WHERE subscriber_id = $1 AND channel_id = $2',
      [subscriberId, channelId]
    );
    return result.rows[0] || null;
  }

  async getSubscriptionById(subscriptionId: number): Promise<Subscription | null> {
    const result = await this.db.query(
      'SELECT * FROM subscriptions WHERE id = $1',
      [subscriptionId]
    );
    return result.rows[0] || null;
  }

  async createOrUpdateSubscription(
    subscriberId: number,
    channelId: number,
    amount: number
  ): Promise<Subscription> {
    const result = await this.db.query(
      `INSERT INTO subscriptions (subscriber_id, channel_id, status, amount_ton)
       VALUES ($1, $2, 'pending', $3)
       ON CONFLICT (subscriber_id, channel_id)
       DO UPDATE SET status = 'pending', amount_ton = $3, updated_at = NOW()
       RETURNING *`,
      [subscriberId, channelId, amount]
    );
    return result.rows[0];
  }

  async activateSubscription(subscriptionId: number, transactionHash?: string): Promise<void> {
    await this.db.query('BEGIN');

    try {
      // Update subscription status
      await this.db.query(
        `UPDATE subscriptions
         SET status = 'active',
             starts_at = NOW(),
             expires_at = NOW() + INTERVAL '30 days',
             transaction_hash = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [subscriptionId, transactionHash]
      );

      // Create payment record
      await this.db.query(
        `INSERT INTO payments (subscription_id, transaction_hash, amount_ton, status, confirmed_at)
         VALUES ($1, $2, (SELECT amount_ton FROM subscriptions WHERE id = $1), 'confirmed', NOW())
         ON CONFLICT (transaction_hash) DO NOTHING`,
        [subscriptionId, transactionHash]
      );

      await this.db.query('COMMIT');

      console.log(`Subscription ${subscriptionId} activated`);
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  async getUserActiveSubscriptions(subscriberId: number): Promise<Subscription[]> {
    const result = await this.db.query(
      `SELECT s.*, c.title, c.username, c.monthly_price_ton
       FROM subscriptions s
       JOIN channels c ON s.channel_id = c.id
       WHERE s.subscriber_id = $1 AND s.status = 'active'
       ORDER BY s.expires_at DESC`,
      [subscriberId]
    );
    return result.rows;
  }

  async getActiveSubscriberCount(channelId: number): Promise<number> {
    const result = await this.db.query(
      'SELECT COUNT(*) as count FROM subscriptions WHERE channel_id = $1 AND status = $2 AND expires_at > NOW()',
      [channelId, 'active']
    );
    return parseInt(result.rows[0].count);
  }

  async expireOldSubscriptions(): Promise<number> {
    const result = await this.db.query(
      `UPDATE subscriptions
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'active' AND expires_at < NOW()
       RETURNING id`
    );
    return result.rows.length;
  }

  async getPendingSubscriptions(): Promise<Subscription[]> {
    const result = await this.db.query(
      `SELECT s.*, c.subscription_contract_address, c.monthly_price_ton, sub.telegram_id
       FROM subscriptions s
       JOIN channels c ON s.channel_id = c.id
       JOIN subscribers sub ON s.subscriber_id = sub.id
       WHERE s.status = 'pending'
       AND s.created_at > NOW() - INTERVAL '1 hour'`
    );
    return result.rows;
  }
}
