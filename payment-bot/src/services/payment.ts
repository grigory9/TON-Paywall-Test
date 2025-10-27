// Payment monitoring and processing service
import { Pool } from 'pg';
import { Bot } from 'grammy';
import { createTonService } from '../../../shared/ton-client';

// Callback function type for sending notifications
type NotificationCallback = (userId: number, message: string, options?: any) => Promise<void>;

export class PaymentService {
  private db: Pool;
  private bot?: Bot; // Reference to bot for approving join requests
  private tonService: ReturnType<typeof createTonService>;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private checkInProgress: boolean = false;
  private lastSuccessfulCheck: number = Date.now();
  private sendNotification?: NotificationCallback;

  constructor(db: Pool, sendNotification?: NotificationCallback, bot?: Bot) {
    this.db = db;
    this.bot = bot;
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
      // Get all pending access purchases (updated for new table names)
      const pendingPurchases = await this.db.query(
        `SELECT ap.*, c.subscription_contract_address, c.access_price_ton, c.telegram_id as channel_telegram_id,
                sub.telegram_id, sub.wallet_address, c.title
         FROM access_purchases ap
         JOIN protected_channels c ON ap.channel_id = c.id
         JOIN subscribers sub ON ap.subscriber_id = sub.id
         WHERE ap.status = $1
         AND ap.created_at > NOW() - INTERVAL '24 hours'
         ORDER BY ap.created_at DESC
         LIMIT $2`,
        ['pending', 100]
      );

      console.log(`Checking ${pendingPurchases.rows.length} pending access purchases`);

      for (const purchase of pendingPurchases.rows) {
        await this.checkAccessPayment(purchase);
      }

      // Note: We no longer expire purchases - lifetime access model
    } catch (error) {
      console.error('Error checking pending payments:', error);
    }
  }

  /**
   * Check if payment has been made for an access purchase
   * Updated for one-time access model
   */
  private async checkAccessPayment(purchase: any) {
    try {
      const contractAddress = purchase.subscription_contract_address;

      if (!contractAddress) {
        console.warn(`Access purchase ${purchase.id} has no contract address`);
        return;
      }

      // Check contract state
      const state = await this.tonService.getContractState(contractAddress);

      if (state?.state !== 'active') {
        return; // Contract not deployed yet
      }

      // Verify payment transaction on blockchain
      const sinceTimestamp = Math.floor(new Date(purchase.created_at).getTime() / 1000);
      const paymentResult = await this.tonService.verifyPayment(
        contractAddress,
        purchase.access_price_ton,
        sinceTimestamp
      );

      if (paymentResult.found) {
        console.log(`✅ Payment found for access purchase ${purchase.id}:`, paymentResult);

        // Grant access and approve join request
        await this.grantAccess(
          purchase.id,
          purchase.telegram_id,
          purchase.channel_telegram_id,
          paymentResult.txHash!,
          paymentResult.fromAddress!,
          paymentResult.amount!,
          contractAddress
        );

        console.log(`✅ Access granted for user ${purchase.telegram_id} to channel ${purchase.title}`);

        // Send confirmation notification to user
        if (this.sendNotification) {
          try {
            // Get channel invite link for private channels
            const channelUrl = purchase.invite_link ||
                              (purchase.username ? `https://t.me/${purchase.username}` : 'https://t.me/');

            // Escape special MarkdownV2 characters in dynamic values
            const escapedTitle = String(purchase.title || 'the channel').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
            const escapedAmount = String(purchase.access_price_ton).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');

            await this.sendNotification(
              purchase.telegram_id,
              `✅ *Payment Confirmed\\!*\n\n` +
              `Your one\\-time payment of ${escapedAmount} TON is confirmed\\.\n\n` +
              `You now have *permanent access* to *${escapedTitle}*\\!\n\n` +
              `📱 Click the button below to join the channel\\.\n\n` +
              `You can leave and rejoin anytime\\!`,
              {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📺 Join Channel', url: channelUrl }]
                  ]
                }
              }
            );
            console.log(`✅ Notification sent to user ${purchase.telegram_id} with link: ${channelUrl}`);
          } catch (error) {
            console.error(`Failed to send notification to user ${purchase.telegram_id}:`, error);
            // Don't throw - notification failure shouldn't break activation
          }
        }
      }
    } catch (error) {
      console.error(`Error checking payment for access purchase ${purchase.id}:`, error);
    }
  }

  /**
   * Grant permanent access and approve join request
   * Updated for one-time lifetime access model
   *
   * CRITICAL: This approves the Telegram join request, allowing user into channel
   */
  private async grantAccess(
    purchaseId: number,
    userId: number,
    channelTelegramId: number,
    transactionHash: string,
    fromAddress: string,
    amount: number,
    toAddress: string
  ) {
    await this.db.query('BEGIN');

    try {
      // Check if already granted (idempotency)
      const existing = await this.db.query(
        'SELECT status FROM access_purchases WHERE id = $1 FOR UPDATE',
        [purchaseId]
      );

      if (existing.rows[0]?.status === 'active') {
        console.log(`Access purchase ${purchaseId} already active`);
        await this.db.query('ROLLBACK');
        return;
      }

      // Update access purchase status with transaction hash (no expiry - lifetime!)
      await this.db.query(
        `UPDATE access_purchases
         SET status = 'active',
             approved_at = NOW(),
             transaction_hash = $2,
             amount_ton = $3,
             purchase_type = 'lifetime',
             updated_at = NOW()
         WHERE id = $1`,
        [purchaseId, transactionHash, amount]
      );

      // Create payment record with full details
      await this.db.query(
        `INSERT INTO payments (subscription_id, transaction_hash, amount_ton, from_address, to_address, status, confirmed_at)
         VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW())
         ON CONFLICT (transaction_hash) DO NOTHING`,
        [purchaseId, transactionHash, amount, fromAddress, toAddress]
      );

      await this.db.query('COMMIT');

      console.log(`✅ Access purchase ${purchaseId} granted with tx ${transactionHash}`);

      // CRITICAL: Approve Telegram join request
      if (this.bot) {
        try {
          await this.bot.api.approveChatJoinRequest(channelTelegramId, userId);
          console.log(`✅ Join request approved: user ${userId} → channel ${channelTelegramId}`);
        } catch (approveError: any) {
          // Handle Telegram API errors gracefully
          if (approveError.description?.includes('USER_ALREADY_PARTICIPANT')) {
            console.log(`User ${userId} already in channel ${channelTelegramId}`);
          } else if (approveError.description?.includes('HIDE_REQUESTER_MISSING')) {
            console.log(`Join request already processed for user ${userId}`);
          } else {
            console.error('Failed to approve join request:', approveError);
            // Don't throw - database record is more important
          }
        }

        // Clean up pending join request
        try {
          await this.db.query(
            'DELETE FROM pending_join_requests WHERE user_id = $1 AND channel_id = (SELECT id FROM protected_channels WHERE telegram_id = $2)',
            [userId, channelTelegramId]
          );
          console.log(`✅ Pending join request cleaned up for user ${userId}`);
        } catch (cleanupError) {
          console.error('Failed to cleanup pending join request:', cleanupError);
        }
      } else {
        console.warn('⚠️ Bot instance not available, cannot approve join request');
      }

    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error(`Failed to grant access for purchase ${purchaseId}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // REMOVED: expireOldSubscriptions()
  // One-time access model has no expiry - lifetime access!
  // ============================================================================

  async getPaymentStatus(purchaseId: number): Promise<string> {
    const result = await this.db.query(
      'SELECT status FROM access_purchases WHERE id = $1',
      [purchaseId]
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
