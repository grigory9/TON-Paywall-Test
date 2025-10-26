import { Pool } from 'pg';
import { Subscriber, Channel } from '../../../shared/types';

export class DatabaseService {
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
  async getChannel(channelId: number): Promise<Channel | null> {
    const result = await this.db.query(
      'SELECT * FROM channels WHERE id = $1',
      [channelId]
    );
    return result.rows[0] || null;
  }

  async getChannelByTelegramId(telegramId: number): Promise<Channel | null> {
    const result = await this.db.query(
      'SELECT * FROM channels WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0] || null;
  }

  async getActiveChannels(): Promise<Channel[]> {
    const result = await this.db.query(
      `SELECT c.*, COUNT(s.id) as subscriber_count
       FROM channels c
       LEFT JOIN subscriptions s ON c.id = s.channel_id AND s.status = 'active'
       WHERE c.is_active = true
       GROUP BY c.id
       ORDER BY subscriber_count DESC
       LIMIT 20`
    );
    return result.rows;
  }

  // Get channel by contract address
  async getChannelByContractAddress(contractAddress: string): Promise<Channel | null> {
    const result = await this.db.query(
      'SELECT * FROM channels WHERE subscription_contract_address = $1',
      [contractAddress]
    );
    return result.rows[0] || null;
  }
}
