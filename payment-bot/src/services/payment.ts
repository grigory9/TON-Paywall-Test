// Payment monitoring and processing service
import { Pool } from 'pg';
import { createTonService } from '../../../shared/ton-client';

// Callback function type for sending notifications
type NotificationCallback = (userId: number, message: string, options?: any) => Promise<void>;

export class PaymentService {
  private db: Pool;
  private tonService: ReturnType<typeof createTonService>;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private checkInProgress: boolean = false;
  private lastSuccessfulCheck: number = Date.now();
  private sendNotification?: NotificationCallback;

  constructor(db: Pool, sendNotification?: NotificationCallback) {
    this.db = db;
    this.sendNotification = sendNotification;
    const network = (process.env.TON_NETWORK || 'testnet') as 'mainnet' | 'testnet';
    this.tonService = createTonService(network);
    this.tonService.init();
  }

  startMonitoring(): boolean {
    // Check pending payments every 30 seconds
    const intervalMs = parseInt(process.env.PAYMENT_CHECK_INTERVAL || '30000');

    // Validate interval
    if (intervalMs < 10000 || intervalMs > 300000) {
      console.error(`Invalid PAYMENT_CHECK_INTERVAL: ${intervalMs}. Must be 10-300 seconds.`);
      return false;
    }

    this.monitoringInterval = setInterval(async () => {
      // Prevent overlapping checks
      if (this.checkInProgress) {
        console.warn('Previous payment check still in progress, skipping cycle');
        return;
      }

      this.checkInProgress = true;
      try {
        await this.checkPendingPayments();
        this.lastSuccessfulCheck = Date.now();
      } catch (error) {
        console.error('Payment monitoring error:', error);
        // Alert if monitoring fails repeatedly
        if (Date.now() - this.lastSuccessfulCheck > 300000) {
          console.error('CRITICAL: Payment monitoring failed for 5+ minutes');
          // TODO: Send alert to admin
        }
      } finally {
        this.checkInProgress = false;
      }
    }, intervalMs);

    console.log(`Payment monitoring started (interval: ${intervalMs}ms)`);
    return true;
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  private async checkPendingPayments() {
    try {
      // Get all pending subscriptions (parameterized query)
      const pendingSubs = await this.db.query(
        `SELECT s.*, c.subscription_contract_address, c.monthly_price_ton, sub.telegram_id, sub.wallet_address
         FROM subscriptions s
         JOIN channels c ON s.channel_id = c.id
         JOIN subscribers sub ON s.subscriber_id = sub.id
         WHERE s.status = $1
         AND s.created_at > NOW() - INTERVAL '24 hours'
         ORDER BY s.created_at DESC
         LIMIT $2`,
        ['pending', 100]
      );

      console.log(`Checking ${pendingSubs.rows.length} pending subscriptions`);

      for (const sub of pendingSubs.rows) {
        await this.checkSubscriptionPayment(sub);
      }

      // Also expire old subscriptions
      await this.expireOldSubscriptions();
    } catch (error) {
      console.error('Error checking pending payments:', error);
    }
  }

  private async checkSubscriptionPayment(subscription: any) {
    try {
      const contractAddress = subscription.subscription_contract_address;

      if (!contractAddress) {
        console.warn(`Subscription ${subscription.id} has no contract address`);
        return;
      }

      // Check contract state
      const state = await this.tonService.getContractState(contractAddress);

      if (state?.state !== 'active') {
        return; // Contract not deployed yet
      }

      // Verify payment transaction on blockchain
      const sinceTimestamp = Math.floor(new Date(subscription.created_at).getTime() / 1000);
      const paymentResult = await this.tonService.verifyPayment(
        contractAddress,
        subscription.monthly_price_ton,
        sinceTimestamp
      );

      if (paymentResult.found) {
        console.log(`Payment found for subscription ${subscription.id}:`, paymentResult);

        // Activate subscription with transaction details
        await this.activateSubscription(
          subscription.id,
          paymentResult.txHash!,
          paymentResult.fromAddress!,
          paymentResult.amount!,
          contractAddress
        );

        console.log(`Subscription ${subscription.id} activated for user ${subscription.telegram_id}`);

        // Send confirmation notification to user
        if (this.sendNotification) {
          try {
            // Get subscription details with updated info
            const updatedSub = await this.db.query(
              `SELECT s.*, c.title, c.username, c.monthly_price_ton
               FROM subscriptions s
               JOIN channels c ON s.channel_id = c.id
               WHERE s.id = $1`,
              [subscription.id]
            );

            if (updatedSub.rows.length > 0) {
              const sub = updatedSub.rows[0];
              const expiryDate = new Date(sub.expires_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              });

              await this.sendNotification(
                subscription.telegram_id,
                `✅ *Payment Confirmed!*\n\n` +
                `Your subscription to *${sub.title}* is now active\\.\n\n` +
                `💎 Amount: ${sub.monthly_price_ton} TON\n` +
                `📅 Expires: ${expiryDate}\n` +
                `🔗 Access: @${sub.username}\n\n` +
                `Click the channel link above to access your subscription\\!`,
                {
                  parse_mode: 'MarkdownV2',
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: '📺 Open Channel', url: `https://t.me/${sub.username}` }],
                      [{ text: '📊 My Subscriptions', callback_data: 'my_subscriptions' }]
                    ]
                  }
                }
              );
              console.log(`✅ Notification sent to user ${subscription.telegram_id}`);
            }
          } catch (error) {
            console.error(`Failed to send notification to user ${subscription.telegram_id}:`, error);
            // Don't throw - notification failure shouldn't break activation
          }
        }
      }
    } catch (error) {
      console.error(`Error checking payment for subscription ${subscription.id}:`, error);
    }
  }

  private async activateSubscription(
    subscriptionId: number,
    transactionHash: string,
    fromAddress: string,
    amount: number,
    toAddress: string
  ) {
    await this.db.query('BEGIN');

    try {
      // Check if already activated (idempotency)
      const existing = await this.db.query(
        'SELECT status FROM subscriptions WHERE id = $1 FOR UPDATE',
        [subscriptionId]
      );

      if (existing.rows[0]?.status === 'active') {
        console.log(`Subscription ${subscriptionId} already active`);
        await this.db.query('ROLLBACK');
        return;
      }

      // Update subscription status with transaction hash
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

      // Create payment record with full details
      await this.db.query(
        `INSERT INTO payments (subscription_id, transaction_hash, amount_ton, from_address, to_address, status, confirmed_at)
         VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW())
         ON CONFLICT (transaction_hash) DO NOTHING`,
        [subscriptionId, transactionHash, amount, fromAddress, toAddress]
      );

      await this.db.query('COMMIT');

      console.log(`Subscription ${subscriptionId} activated with tx ${transactionHash}`);
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error(`Failed to activate subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  private async expireOldSubscriptions() {
    try {
      const result = await this.db.query(
        `UPDATE subscriptions
         SET status = 'expired', updated_at = NOW()
         WHERE status = 'active' AND expires_at < NOW()
         RETURNING id`
      );

      if (result.rows.length > 0) {
        console.log(`Expired ${result.rows.length} subscriptions`);
      }
    } catch (error) {
      console.error('Error expiring subscriptions:', error);
    }
  }

  async getPaymentStatus(subscriptionId: number): Promise<string> {
    const result = await this.db.query(
      'SELECT status FROM subscriptions WHERE id = $1',
      [subscriptionId]
    );

    return result.rows[0]?.status || 'unknown';
  }

  async recordPayment(
    subscriptionId: number,
    transactionHash: string,
    amount: number,
    fromAddress: string,
    toAddress: string
  ) {
    await this.db.query(
      `INSERT INTO payments (subscription_id, transaction_hash, amount_ton, from_address, to_address, status, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW())
       ON CONFLICT (transaction_hash) DO NOTHING`,
      [subscriptionId, transactionHash, amount, fromAddress, toAddress]
    );
  }
}
