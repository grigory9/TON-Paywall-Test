/**
 * Channel Health Monitor Service
 *
 * Periodically checks that the payment bot is properly configured as admin
 * in all active channels. This prevents the "bot not receiving join requests" issue.
 *
 * CRITICAL: The bot MUST be admin with "can_invite_users" permission to receive
 * chat_join_request events from Telegram.
 */

import { Bot } from 'grammy';
import { DatabaseService } from '../database/database';

interface ChannelHealth {
  channelId: number;
  telegramId: number;
  title: string;
  isHealthy: boolean;
  isAdmin: boolean;
  hasInvitePermission: boolean;
  errorMessage?: string;
}

export class ChannelHealthMonitor {
  private bot: Bot;
  private database: DatabaseService;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

  constructor(bot: Bot, database: DatabaseService) {
    this.bot = bot;
    this.database = database;
  }

  /**
   * Start periodic health checks
   */
  startMonitoring() {
    console.log('🏥 Channel health monitoring started');

    // Run immediate check
    this.checkAllChannels();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.checkAllChannels();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('🏥 Channel health monitoring stopped');
    }
  }

  /**
   * Check health of all active channels
   */
  private async checkAllChannels() {
    try {
      const channels = await this.database.getActiveChannels();

      if (channels.length === 0) {
        console.log('🏥 No active channels to monitor');
        return;
      }

      console.log(`🏥 Checking health of ${channels.length} channel(s)...`);

      const healthReports: ChannelHealth[] = [];
      let unhealthyCount = 0;

      for (const channel of channels) {
        const health = await this.checkChannelHealth(
          channel.id,
          channel.telegram_id,
          channel.title
        );

        healthReports.push(health);

        if (!health.isHealthy) {
          unhealthyCount++;
          console.error(
            `⚠️  UNHEALTHY: ${health.title} (ID: ${health.channelId}) - ${health.errorMessage}`
          );
        }
      }

      if (unhealthyCount === 0) {
        console.log(`✅ All ${channels.length} channels are healthy`);
      } else {
        console.error(
          `⚠️  WARNING: ${unhealthyCount} of ${channels.length} channels are unhealthy!`
        );
        this.logHealthReport(healthReports);
      }

    } catch (error) {
      console.error('❌ Error during channel health check:', error);
    }
  }

  /**
   * Check health of a single channel
   *
   * A channel is considered healthy if:
   * 1. Bot is a member of the channel
   * 2. Bot is an administrator
   * 3. Bot has "can_invite_users" permission (required for join requests)
   */
  private async checkChannelHealth(
    channelId: number,
    telegramId: number,
    title: string
  ): Promise<ChannelHealth> {
    try {
      // Get bot info
      const botInfo = await this.bot.api.getMe();

      // Try to get bot's status in channel
      const chatMember = await this.bot.api.getChatMember(telegramId, botInfo.id);

      // Check if bot is admin
      const isAdmin = chatMember.status === 'administrator';

      if (!isAdmin) {
        return {
          channelId,
          telegramId,
          title,
          isHealthy: false,
          isAdmin: false,
          hasInvitePermission: false,
          errorMessage: `Bot is not admin (status: ${chatMember.status})`
        };
      }

      // Check if bot has invite permission
      // CRITICAL: Without this permission, bot won't receive chat_join_request events
      const hasInvitePermission = chatMember.can_invite_users === true;

      if (!hasInvitePermission) {
        return {
          channelId,
          telegramId,
          title,
          isHealthy: false,
          isAdmin: true,
          hasInvitePermission: false,
          errorMessage: 'Bot is admin but lacks "Invite Users via Link" permission'
        };
      }

      // Channel is healthy
      return {
        channelId,
        telegramId,
        title,
        isHealthy: true,
        isAdmin: true,
        hasInvitePermission: true
      };

    } catch (error: any) {
      // Bot is not in channel or cannot access it
      let errorMessage = error.message || 'Unknown error';

      if (error.message?.includes('chat not found')) {
        errorMessage = 'Bot is NOT in the channel (removed or never added)';
      } else if (error.message?.includes('bot was kicked')) {
        errorMessage = 'Bot was kicked from the channel';
      }

      return {
        channelId,
        telegramId,
        title,
        isHealthy: false,
        isAdmin: false,
        hasInvitePermission: false,
        errorMessage
      };
    }
  }

  /**
   * Log detailed health report
   */
  private logHealthReport(reports: ChannelHealth[]) {
    console.log('\n' + '='.repeat(60));
    console.log('🏥 CHANNEL HEALTH REPORT');
    console.log('='.repeat(60));

    for (const report of reports) {
      const statusIcon = report.isHealthy ? '✅' : '❌';
      console.log(`\n${statusIcon} ${report.title} (ID: ${report.channelId})`);
      console.log(`   Telegram ID: ${report.telegramId}`);
      console.log(`   Is Admin: ${report.isAdmin ? '✅' : '❌'}`);
      console.log(`   Has Invite Permission: ${report.hasInvitePermission ? '✅' : '❌'}`);

      if (!report.isHealthy && report.errorMessage) {
        console.log(`   ⚠️  Issue: ${report.errorMessage}`);
        console.log(`   🔧 Fix: Add bot as admin with "Invite Users via Link" permission`);
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  /**
   * Manual health check for a specific channel (for debugging)
   */
  async checkSpecificChannel(channelId: number): Promise<ChannelHealth> {
    const channel = await this.database.getChannel(channelId);

    if (!channel) {
      throw new Error(`Channel ${channelId} not found in database`);
    }

    return this.checkChannelHealth(channel.id, channel.telegram_id, channel.title);
  }
}
