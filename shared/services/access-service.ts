// ============================================================================
// AccessService - Manages Permanent Channel Access
// ============================================================================
//
// RESPONSIBILITY:
// Centralized service for managing one-time access purchases and join request
// approvals for protected Telegram channels.
//
// KEY OPERATIONS:
// - Check if user has purchased access
// - Grant access and approve join requests
// - Handle join request workflow
// - Track pending requests
// - Revoke access (admin operation)
//
// USED BY:
// - Payment bot: To approve join requests after payment
// - Admin bot: To manually grant/revoke access
//
// ============================================================================

import { Bot } from 'grammy';
import type { ProtectedChannel, AccessPurchase, PendingJoinRequest } from '../types';

/**
 * Database interface required by AccessService
 * Implement this in your DatabaseService
 */
export interface AccessDatabase {
  // Check if user has active access
  hasChannelAccess(userId: number, channelId: number): Promise<boolean>;

  // Grant access to user
  grantChannelAccess(
    userId: number,
    channelId: number,
    transactionHash?: string,
    amount?: number
  ): Promise<void>;

  // Get channel details
  getChannelById(channelId: number): Promise<ProtectedChannel | null>;
  getChannelByTelegramId(telegramId: number): Promise<ProtectedChannel | null>;

  // Join request management
  savePendingJoinRequest(userId: number, channelId: number): Promise<void>;
  getPendingJoinRequest(userId: number, channelId: number): Promise<PendingJoinRequest | null>;
  markPaymentSent(userId: number, channelId: number): Promise<void>;
  deletePendingJoinRequest(userId: number, channelId: number): Promise<void>;

  // Access purchase records
  getAccessPurchase(userId: number, channelId: number): Promise<AccessPurchase | null>;
  revokeAccess(userId: number, channelId: number, reason: string): Promise<void>;

  // Analytics
  getChannelMemberCount(channelId: number): Promise<number>;
  updateChannelMemberCount(channelId: number, count: number): Promise<void>;
}

/**
 * Configuration for AccessService
 */
export interface AccessServiceConfig {
  bot: Bot;
  database: AccessDatabase;
  paymentBotUsername?: string; // For generating payment links
}

/**
 * Result of access check operation
 */
export interface AccessCheckResult {
  hasAccess: boolean;
  isPending: boolean;
  purchase?: AccessPurchase;
  reason?: string;
}

/**
 * AccessService - Manages channel access control
 *
 * USAGE EXAMPLE:
 * ```typescript
 * const accessService = new AccessService({
 *   bot: paymentBot,
 *   database: databaseService
 * });
 *
 * // Check and grant access
 * await accessService.handleJoinRequest(joinRequest);
 *
 * // Manually grant access
 * await accessService.grantAccess(userId, channelId, txHash);
 * ```
 */
export class AccessService {
  private bot: Bot;
  private database: AccessDatabase;
  private paymentBotUsername?: string;

  constructor(config: AccessServiceConfig) {
    this.bot = config.bot;
    this.database = config.database;
    this.paymentBotUsername = config.paymentBotUsername;
  }

  /**
   * Check if user has access to channel
   *
   * @param userId - Telegram user ID
   * @param channelId - Database channel ID
   * @returns AccessCheckResult with details
   */
  async checkAccess(userId: number, channelId: number): Promise<AccessCheckResult> {
    try {
      // Check for active access purchase
      const hasAccess = await this.database.hasChannelAccess(userId, channelId);

      if (hasAccess) {
        const purchase = await this.database.getAccessPurchase(userId, channelId);
        return {
          hasAccess: true,
          isPending: false,
          purchase: purchase || undefined,
          reason: 'Active access purchase'
        };
      }

      // Check for pending join request
      const pendingRequest = await this.database.getPendingJoinRequest(userId, channelId);

      if (pendingRequest) {
        return {
          hasAccess: false,
          isPending: true,
          reason: pendingRequest.payment_sent
            ? 'Payment sent, awaiting confirmation'
            : 'Join request pending payment'
        };
      }

      return {
        hasAccess: false,
        isPending: false,
        reason: 'No access or pending request'
      };
    } catch (error) {
      console.error('Error checking access:', error);
      throw new Error(`Failed to check access: ${error}`);
    }
  }

  /**
   * Grant access to user and approve join request
   *
   * SECURITY: This approves the Telegram join request, allowing user into channel
   *
   * @param userId - Telegram user ID
   * @param channelId - Database channel ID (not Telegram chat ID!)
   * @param transactionHash - Optional TON transaction hash for audit
   * @param amount - Optional payment amount in TON
   */
  async grantAccess(
    userId: number,
    channelId: number,
    transactionHash?: string,
    amount?: number
  ): Promise<void> {
    try {
      // Get channel details
      const channel = await this.database.getChannelById(channelId);
      if (!channel) {
        throw new Error(`Channel ${channelId} not found`);
      }

      // Record access in database
      await this.database.grantChannelAccess(userId, channelId, transactionHash, amount);

      // Approve Telegram join request
      try {
        await this.bot.api.approveChatJoinRequest(channel.telegram_id, userId);
        console.log(`✓ Approved join request: user ${userId}, channel ${channel.title}`);
      } catch (approveError: any) {
        // Handle case where user already joined or request expired
        if (approveError.description?.includes('USER_ALREADY_PARTICIPANT')) {
          console.log(`User ${userId} already in channel ${channel.title}`);
        } else if (approveError.description?.includes('HIDE_REQUESTER_MISSING')) {
          console.log(`Join request already processed for user ${userId}`);
        } else {
          // Log but don't fail - database record is more important
          console.error('Failed to approve join request:', approveError);
        }
      }

      // Clean up pending request
      await this.database.deletePendingJoinRequest(userId, channelId);

      // Send welcome message to user
      try {
        await this.bot.api.sendMessage(
          userId,
          `✅ Access granted to ${channel.title}!\n\n` +
          `You now have permanent access to the channel. ` +
          `You can join anytime using your invite link.` +
          (transactionHash ? `\n\nTransaction: ${transactionHash}` : '')
        );
      } catch (messageError) {
        // User may have blocked bot - not critical
        console.warn(`Could not send welcome message to user ${userId}:`, messageError);
      }

      console.log(`✓ Access granted: user ${userId}, channel ${channelId}, tx ${transactionHash}`);
    } catch (error) {
      console.error('Error granting access:', error);
      throw new Error(`Failed to grant access: ${error}`);
    }
  }

  /**
   * Handle incoming join request
   *
   * WORKFLOW:
   * 1. Check if channel uses paywall
   * 2. Check if user already has access
   * 3. Auto-approve if access exists
   * 4. Otherwise, save pending request and send payment instructions
   *
   * @param request - Telegram ChatJoinRequest object
   */
  async handleJoinRequest(request: any): Promise<void> {
    const userId = request.from.id;
    const chatId = request.chat.id;

    try {
      // Check if channel uses our paywall
      const channel = await this.database.getChannelByTelegramId(chatId);

      if (!channel) {
        console.log(`Join request for non-paywall channel: ${chatId}`);
        return;
      }

      if (!channel.is_active) {
        console.log(`Join request for inactive channel: ${channel.title}`);
        return;
      }

      // Check existing access
      const accessCheck = await this.checkAccess(userId, channel.id);

      if (accessCheck.hasAccess) {
        // User already paid - auto-approve
        await this.bot.api.approveChatJoinRequest(chatId, userId);
        await this.bot.api.sendMessage(
          userId,
          `✅ Welcome back to ${channel.title}!\n\n` +
          `You already have lifetime access to this channel.`
        );
        console.log(`Auto-approved returning user ${userId} for ${channel.title}`);
        return;
      }

      // Check for existing pending request
      const existingRequest = await this.database.getPendingJoinRequest(userId, channel.id);

      if (!existingRequest) {
        // Save new pending request
        await this.database.savePendingJoinRequest(userId, channel.id);
      }

      // Send payment instructions
      await this.sendPaymentInstructions(userId, channel);

      console.log(`Sent payment instructions: user ${userId}, channel ${channel.title}`);
    } catch (error) {
      console.error('Error handling join request:', error);
      // Don't throw - we don't want to crash bot on individual join request errors
    }
  }

  /**
   * Send payment instructions to user
   *
   * @param userId - Telegram user ID
   * @param channel - Channel details
   */
  private async sendPaymentInstructions(userId: number, channel: ProtectedChannel): Promise<void> {
    const message =
      `💎 **${channel.title}**\n\n` +
      `Price: **${channel.access_price_ton} TON** (one-time payment)\n\n` +
      `Pay once, access forever! Click below to proceed:`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '💳 Pay with TON Connect',
            callback_data: `pay_${channel.id}`
          }
        ],
        [
          {
            text: 'ℹ️ What is TON?',
            url: 'https://ton.org'
          }
        ]
      ]
    };

    await this.bot.api.sendMessage(userId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  /**
   * Revoke user's access to channel (admin operation)
   *
   * SECURITY: This removes user from channel and marks access as revoked
   *
   * @param userId - Telegram user ID
   * @param channelId - Database channel ID
   * @param reason - Reason for revocation (audit trail)
   */
  async revokeAccess(userId: number, channelId: number, reason: string): Promise<void> {
    try {
      const channel = await this.database.getChannelById(channelId);
      if (!channel) {
        throw new Error(`Channel ${channelId} not found`);
      }

      // Mark access as revoked in database
      await this.database.revokeAccess(userId, channelId, reason);

      // Ban user from channel (can be unbanned later)
      try {
        await this.bot.api.banChatMember(channel.telegram_id, userId);
        console.log(`✓ Banned user ${userId} from channel ${channel.title}`);
      } catch (banError) {
        console.error('Failed to ban user from channel:', banError);
      }

      // Notify user
      try {
        await this.bot.api.sendMessage(
          userId,
          `⚠️ Your access to ${channel.title} has been revoked.\n\n` +
          `Reason: ${reason}\n\n` +
          `Contact the channel admin for more information.`
        );
      } catch (messageError) {
        console.warn(`Could not notify user ${userId} of revocation:`, messageError);
      }

      console.log(`✓ Access revoked: user ${userId}, channel ${channelId}, reason: ${reason}`);
    } catch (error) {
      console.error('Error revoking access:', error);
      throw new Error(`Failed to revoke access: ${error}`);
    }
  }

  /**
   * Manually approve join request (for admin override)
   *
   * @param userId - Telegram user ID
   * @param channelId - Database channel ID
   * @param reason - Reason for manual approval (audit trail)
   */
  async manuallyApprove(userId: number, channelId: number, reason: string): Promise<void> {
    console.log(`Manual approval: user ${userId}, channel ${channelId}, reason: ${reason}`);
    await this.grantAccess(userId, channelId, `MANUAL: ${reason}`);
  }

  /**
   * Get pending join requests for a channel (for admin dashboard)
   *
   * @param channelId - Database channel ID
   * @returns Array of pending join requests
   */
  async getPendingRequests(channelId: number): Promise<PendingJoinRequest[]> {
    // This would require adding a new database method
    // For now, return empty array
    console.warn('getPendingRequests not yet implemented');
    return [];
  }

  /**
   * Cleanup expired join requests
   * Should be called periodically (e.g., every hour)
   *
   * @returns Number of expired requests removed
   */
  async cleanupExpiredRequests(): Promise<number> {
    try {
      // This would require adding a database method
      // Call the SQL function: SELECT cleanup_expired_join_requests();
      console.log('Running expired join request cleanup...');
      // Implementation depends on database service
      return 0;
    } catch (error) {
      console.error('Error cleaning up expired requests:', error);
      return 0;
    }
  }
}

/**
 * Factory function for creating AccessService
 * Useful for dependency injection
 */
export function createAccessService(config: AccessServiceConfig): AccessService {
  return new AccessService(config);
}
