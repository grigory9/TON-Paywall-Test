// Channel setup service
import { Api } from 'grammy';
import { Pool } from 'pg';

export class ChannelSetupService {
  constructor(
    private db: Pool,
    private botApi: Api
  ) {}

  async verifyChannelAdmin(channelId: number, userId: number): Promise<boolean> {
    try {
      const admins = await this.botApi.getChatAdministrators(channelId);
      return admins.some(admin => admin.user.id === userId);
    } catch (error) {
      console.error('Error checking admin rights:', error);
      return false;
    }
  }

  async verifyPaymentBotAdded(channelId: number): Promise<boolean> {
    try {
      const paymentBotId = parseInt(process.env.PAYMENT_BOT_ID!);
      const member = await this.botApi.getChatMember(channelId, paymentBotId);

      return member.status === 'administrator';
    } catch (error) {
      console.error('Error checking payment bot:', error);
      return false;
    }
  }

  async recordSetupProgress(adminId: number, channelId: number, step: string, data?: any) {
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
