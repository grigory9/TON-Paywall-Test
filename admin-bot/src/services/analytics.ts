// Analytics service
import { Pool } from 'pg';
import { AnalyticsSummary } from '../../../shared/types';

export class AnalyticsService {
  constructor(private db: Pool) {}

  async getChannelAnalytics(channelId: number): Promise<AnalyticsSummary> {
    // Get channel info
    const channelResult = await this.db.query(
      'SELECT title FROM channels WHERE id = $1',
      [channelId]
    );

    if (channelResult.rows.length === 0) {
      throw new Error('Channel not found');
    }

    const channelTitle = channelResult.rows[0].title;

    // Get total subscribers
    const totalResult = await this.db.query(
      'SELECT COUNT(DISTINCT subscriber_id) as count FROM subscriptions WHERE channel_id = $1',
      [channelId]
    );
    const totalSubscribers = parseInt(totalResult.rows[0].count);

    // Get active subscribers
    const activeResult = await this.db.query(
      'SELECT COUNT(*) as count FROM subscriptions WHERE channel_id = $1 AND status = $2 AND expires_at > NOW()',
      [channelId, 'active']
    );
    const activeSubscribers = parseInt(activeResult.rows[0].count);

    // Get new subscribers (last 30 days)
    const newResult = await this.db.query(
      'SELECT COUNT(*) as count FROM subscriptions WHERE channel_id = $1 AND created_at > NOW() - INTERVAL \'30 days\'',
      [channelId]
    );
    const newSubscribers = parseInt(newResult.rows[0].count);

    // Get churned subscribers (expired in last 30 days)
    const churnedResult = await this.db.query(
      'SELECT COUNT(*) as count FROM subscriptions WHERE channel_id = $1 AND status = $2 AND expires_at BETWEEN NOW() - INTERVAL \'30 days\' AND NOW()',
      [channelId, 'expired']
    );
    const churnedSubscribers = parseInt(churnedResult.rows[0].count);

    // Get total revenue
    const revenueResult = await this.db.query(
      'SELECT COALESCE(SUM(amount_ton), 0) as total FROM payments p JOIN subscriptions s ON p.subscription_id = s.id WHERE s.channel_id = $1 AND p.status = $2',
      [channelId, 'confirmed']
    );
    const totalRevenue = parseFloat(revenueResult.rows[0].total);

    // Get monthly revenue (last 30 days)
    const monthlyResult = await this.db.query(
      'SELECT COALESCE(SUM(amount_ton), 0) as total FROM payments p JOIN subscriptions s ON p.subscription_id = s.id WHERE s.channel_id = $1 AND p.status = $2 AND p.confirmed_at > NOW() - INTERVAL \'30 days\'',
      [channelId, 'confirmed']
    );
    const monthlyRevenue = parseFloat(monthlyResult.rows[0].total);

    // Calculate ARPU (Average Revenue Per User)
    const arpu = activeSubscribers > 0 ? totalRevenue / activeSubscribers : 0;

    return {
      channelTitle,
      totalSubscribers,
      activeSubscribers,
      newSubscribers,
      churnedSubscribers,
      totalRevenue,
      monthlyRevenue,
      arpu
    };
  }

  async updateAnalyticsSummary(channelId: number): Promise<void> {
    const analytics = await this.getChannelAnalytics(channelId);
    const today = new Date().toISOString().split('T')[0];

    await this.db.query(
      `INSERT INTO analytics_summary
       (channel_id, date, total_subscribers, active_subscribers, new_subscribers, churned_subscribers, total_revenue_ton)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (channel_id, date)
       DO UPDATE SET
         total_subscribers = $3,
         active_subscribers = $4,
         new_subscribers = $5,
         churned_subscribers = $6,
         total_revenue_ton = $7`,
      [
        channelId,
        today,
        analytics.totalSubscribers,
        analytics.activeSubscribers,
        analytics.newSubscribers,
        analytics.churnedSubscribers,
        analytics.totalRevenue
      ]
    );
  }

  async exportAnalytics(channelId: number, days: number = 30): Promise<string> {
    const result = await this.db.query(
      `SELECT * FROM analytics_summary
       WHERE channel_id = $1 AND date > NOW() - INTERVAL '${days} days'
       ORDER BY date DESC`,
      [channelId]
    );

    // Convert to CSV format
    if (result.rows.length === 0) {
      return 'No data available';
    }

    const headers = Object.keys(result.rows[0]).join(',');
    const rows = result.rows.map(row => Object.values(row).join(','));

    return [headers, ...rows].join('\n');
  }
}
