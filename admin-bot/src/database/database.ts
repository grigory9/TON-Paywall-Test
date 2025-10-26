import { Pool } from 'pg';
import { Admin, Channel } from '../../../shared/types';

export class DatabaseService {
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
  ): Promise<Channel> {
    const result = await this.db.query(
      `INSERT INTO channels (telegram_id, title, username, admin_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_id) DO UPDATE
       SET title = $2, username = $3, updated_at = NOW()
       RETURNING *`,
      [telegramId, title, username, adminId]
    );
    return result.rows[0];
  }

  async getChannel(channelId: number): Promise<Channel | null> {
    const result = await this.db.query(
      'SELECT * FROM channels WHERE id = $1',
      [channelId]
    );
    return result.rows[0] || null;
  }

  async getChannelsByAdmin(adminId: number): Promise<Channel[]> {
    const result = await this.db.query(
      'SELECT * FROM channels WHERE admin_id = $1 ORDER BY created_at DESC',
      [adminId]
    );
    return result.rows;
  }

  async getActiveChannelsByAdmin(adminId: number): Promise<Channel[]> {
    const result = await this.db.query(
      'SELECT * FROM channels WHERE admin_id = $1 AND is_active = true ORDER BY created_at DESC',
      [adminId]
    );
    return result.rows;
  }

  async updateChannel(channelId: number, updates: Partial<Channel>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.payment_bot_added !== undefined) {
      fields.push(`payment_bot_added = $${paramIndex++}`);
      values.push(updates.payment_bot_added);
    }

    if (updates.monthly_price_ton !== undefined) {
      fields.push(`monthly_price_ton = $${paramIndex++}`);
      values.push(updates.monthly_price_ton);
    }

    if (updates.subscription_contract_address !== undefined) {
      fields.push(`subscription_contract_address = $${paramIndex++}`);
      values.push(updates.subscription_contract_address);
    }

    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(updates.is_active);
    }

    if (fields.length === 0) return;

    values.push(channelId);
    await this.db.query(
      `UPDATE channels SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
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
}
