// Payment bot for users to subscribe to channels
import { Bot, Context, SessionFlavor, session } from 'grammy';
import { Pool } from 'pg';
import { SubscriptionService } from './services/subscription';
import { PaymentService } from './services/payment';
import { DatabaseService } from './database/database';
import { TonConnectService, UserRejectedError, InsufficientFundsError, TransactionError } from './services/tonconnect.service';
import { Address } from '@ton/ton';
import { beginCell } from '@ton/core';

interface SessionData {
  selectedChannelId?: number;
  pendingPayment?: {
    channelId: number;
    amount: number;
    contractAddress: string;
  };
  awaitingWalletConnection?: boolean;
}

type BotContext = Context & SessionFlavor<SessionData>;

export class PaymentBot {
  private bot: Bot<BotContext>;
  private db: Pool;
  private database: DatabaseService;
  private subscriptionService: SubscriptionService;
  private paymentService: PaymentService;
  private tonConnectService: TonConnectService;

  constructor(token: string, dbUrl: string) {
    this.bot = new Bot<BotContext>(token);
    this.db = new Pool({ connectionString: dbUrl });

    // Initialize services
    this.database = new DatabaseService(this.db);
    this.subscriptionService = new SubscriptionService(this.db);

    // Initialize payment service with notification callback
    this.paymentService = new PaymentService(
      this.db,
      async (userId: number, message: string, options?: any) => {
        try {
          await this.bot.api.sendMessage(userId, message, options);
        } catch (error) {
          console.error(`Failed to send message to user ${userId}:`, error);
        }
      }
    );

    this.tonConnectService = new TonConnectService(this.db);

    // Setup middleware
    this.bot.use(session({ initial: (): SessionData => ({}) }));

    // Setup handlers
    this.setupCommands();
    this.setupCallbacks();

    // Start payment monitoring
    this.paymentService.startMonitoring();

    // Error handling
    this.bot.catch((err) => {
      console.error('Bot error:', err);
    });
  }

  private setupCommands() {
    // Start command with deep link support
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      // Register user if not exists
      await this.database.upsertSubscriber(
        userId,
        ctx.from?.username,
        ctx.from?.first_name
      );

      // Check for deep link (channel subscription)
      const payload = ctx.message?.text?.split(' ')[1];
      if (payload?.startsWith('ch_')) {
        const rawId = payload.replace('ch_', '').trim();

        // Validate channel ID to prevent SQL injection
        // Note: Telegram channel IDs can be negative (supergroups/channels start with -100)
        const channelId = parseInt(rawId, 10);
        if (isNaN(channelId) || channelId === 0 || rawId.length > 20) {
          await ctx.reply('❌ Invalid channel link. Please use a valid subscription link.');
          return;
        }

        await this.handleChannelSubscription(ctx, channelId);
        return;
      }

      // Default welcome message
      await ctx.reply(
        '🎯 Welcome to Subscription Bot!\n\n' +
        'Subscribe to premium Telegram channels with TON cryptocurrency.\n\n' +
        'How it works:\n' +
        '1️⃣ Choose a channel\n' +
        '2️⃣ Pay with TON\n' +
        '3️⃣ Get instant access\n\n' +
        'Commands:\n' +
        '/channels - Browse available channels\n' +
        '/subscriptions - My active subscriptions\n' +
        '/help - Get help',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📺 Browse Channels', callback_data: 'browse_channels' }],
              [{ text: '📊 My Subscriptions', callback_data: 'my_subscriptions' }]
            ]
          }
        }
      );
    });

    // Channels command
    this.bot.command('channels', async (ctx) => {
      await this.showAvailableChannels(ctx);
    });

    // Subscriptions command
    this.bot.command('subscriptions', async (ctx) => {
      await this.showUserSubscriptions(ctx);
    });

    // Help command
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        '📚 Help Guide\n\n' +
        '🔹 Subscribing:\n' +
        '1. Browse channels with /channels\n' +
        '2. Click subscribe on your chosen channel\n' +
        '3. Pay with TON Connect or manual wallet\n' +
        '4. Wait for confirmation (~1 minute)\n' +
        '5. Access granted!\n\n' +
        '🔹 Managing Subscriptions:\n' +
        '• /subscriptions - View all your subscriptions\n' +
        '• Subscriptions are valid for 30 days\n' +
        '• Renew before expiry to maintain access\n\n' +
        '🔹 Wallet:\n' +
        '• /wallet - Connect TON wallet for easy payments\n' +
        '• Supports Telegram Wallet, Tonkeeper, MyTonWallet, etc.\n' +
        '• Pay exact amount (1% tolerance)\n' +
        '• Overpayments are refunded automatically\n\n' +
        '🔹 Support:\n' +
        'Need help? Contact @YourSupport'
      );
    });

    // Wallet command
    this.bot.command('wallet', async (ctx) => {
      await this.showWalletStatus(ctx);
    });
  }

  private setupCallbacks() {
    // Browse channels callback
    this.bot.callbackQuery('browse_channels', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.showAvailableChannels(ctx);
    });

    // My subscriptions callback
    this.bot.callbackQuery('my_subscriptions', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.showUserSubscriptions(ctx);
    });

    // Subscribe to channel callback
    this.bot.callbackQuery(/^subscribe_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const channelId = parseInt(ctx.match[1]);
      await this.initiateSubscription(ctx, channelId);
    });

    // Payment confirmation callback
    this.bot.callbackQuery(/^pay_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const channelId = parseInt(ctx.match[1]);
      await this.showPaymentInstructions(ctx, channelId);
    });

    // Check payment callback
    this.bot.callbackQuery(/^check_payment_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery('Checking payment status...');
      const subscriptionId = parseInt(ctx.match[1]);

      const subscription = await this.subscriptionService.getSubscriptionById(subscriptionId);
      if (!subscription) {
        await ctx.reply('❌ Subscription not found.');
        return;
      }

      if (subscription.status === 'active') {
        const channel = await this.database.getChannel(subscription.channel_id);
        await ctx.reply(
          '✅ Payment confirmed! Your subscription is now active.\n\n' +
          `Access your channel: https://t.me/${channel?.username || ''}`
        );
      } else {
        await ctx.reply(
          '⏳ Payment not yet confirmed.\n\n' +
          'Please wait a moment and try again. Blockchain confirmations can take 1-2 minutes.'
        );
      }
    });

    // Cancel callback
    this.bot.callbackQuery('cancel', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.reply('❌ Cancelled.');
    });

    // Wallet connection callbacks
    this.bot.callbackQuery('connect_wallet', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.initiateWalletConnection(ctx);
    });

    this.bot.callbackQuery('disconnect_wallet', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.disconnectWallet(ctx);
    });

    this.bot.callbackQuery('wallet_status', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.showWalletStatus(ctx);
    });

    // TON Connect payment callback
    this.bot.callbackQuery(/^tonconnect_pay_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const channelId = parseInt(ctx.match[1]);
      await this.initiateTonConnectPayment(ctx, channelId);
    });

    // Manual payment callback (existing Tonkeeper flow)
    this.bot.callbackQuery(/^manual_pay_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const channelId = parseInt(ctx.match[1]);
      await this.showManualPaymentInstructions(ctx, channelId);
    });
  }

  private async handleChannelSubscription(ctx: Context, channelTelegramId: number) {
    // Find channel in database
    const channel = await this.database.getChannelByTelegramId(channelTelegramId);

    if (!channel || !channel.is_active) {
      await ctx.reply('❌ Channel not found or not active.');
      return;
    }

    // Check existing subscription
    const userId = ctx.from!.id;
    const subscriber = await this.database.getSubscriberByTelegramId(userId);

    if (!subscriber) {
      await ctx.reply('Error: User not registered. Please /start first.');
      return;
    }

    const existingSub = await this.subscriptionService.checkSubscription(
      subscriber.id,
      channel.id
    );

    if (existingSub && existingSub.status === 'active') {
      await ctx.reply(
        `✅ You already have an active subscription to ${channel.title}!\n\n` +
        `Expires: ${new Date(existingSub.expires_at!).toLocaleDateString()}\n\n` +
        `Click here to access: https://t.me/${channel.username}`
      );
      return;
    }

    // Show subscription offer
    await ctx.reply(
      `📺 ${channel.title}\n\n` +
      `💎 Price: ${channel.monthly_price_ton} TON/month\n` +
      `✅ Instant access after payment\n` +
      `🔄 Cancel anytime\n\n` +
      'Ready to subscribe?',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: `💳 Pay ${channel.monthly_price_ton} TON`, callback_data: `pay_${channel.id}` }],
            [{ text: '❌ Cancel', callback_data: 'cancel' }]
          ]
        }
      }
    );
  }

  private async showAvailableChannels(ctx: Context) {
    const channels = await this.database.getActiveChannels();

    if (channels.length === 0) {
      await ctx.reply('No channels available at the moment.');
      return;
    }

    let message = '📺 Available Channels:\n\n';
    const keyboard = [];

    for (const channel of channels) {
      const subscriberCount = await this.subscriptionService.getActiveSubscriberCount(channel.id);
      message += `🔹 ${channel.title}\n`;
      message += `   💎 ${channel.monthly_price_ton} TON/month\n`;
      message += `   👥 ${subscriberCount} subscribers\n\n`;

      keyboard.push([{
        text: `Subscribe to ${channel.title}`,
        callback_data: `subscribe_${channel.id}`
      }]);
    }

    await ctx.reply(message, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  private async showUserSubscriptions(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const subscriber = await this.database.getSubscriberByTelegramId(userId);

    if (!subscriber) {
      await ctx.reply('No subscriptions found. Please /start first.');
      return;
    }

    const subscriptions = await this.subscriptionService.getUserActiveSubscriptions(subscriber.id);

    if (subscriptions.length === 0) {
      await ctx.reply(
        'You don\'t have any active subscriptions.\n\n' +
        'Use /channels to browse available channels!'
      );
      return;
    }

    let message = '📊 Your Active Subscriptions:\n\n';

    for (const sub of subscriptions) {
      const channel = await this.database.getChannel(sub.channel_id);
      if (!channel) continue;

      const daysLeft = Math.ceil(
        (new Date(sub.expires_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      message += `📺 ${channel.title}\n`;
      message += `   💎 ${channel.monthly_price_ton} TON/month\n`;
      message += `   📅 Expires: ${new Date(sub.expires_at!).toLocaleDateString()}\n`;
      message += `   ⏱ ${daysLeft} days left\n`;
      message += `   🔗 Access: @${channel.username}\n\n`;
    }

    await ctx.reply(message);
  }

  private async initiateSubscription(ctx: Context, channelId: number) {
    const channel = await this.database.getChannel(channelId);

    if (!channel || !channel.is_active) {
      await ctx.reply('Channel not found or not active.');
      return;
    }

    await ctx.reply(
      `📺 Subscribe to ${channel.title}\n\n` +
      `💎 Price: ${channel.monthly_price_ton} TON\n` +
      `📅 Duration: 30 days\n` +
      `✅ Auto-renewal: Disabled (manual renewal)\n\n` +
      'Ready to proceed?',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: `💳 Pay ${channel.monthly_price_ton} TON`, callback_data: `pay_${channel.id}` }],
            [{ text: '❌ Cancel', callback_data: 'cancel' }]
          ]
        }
      }
    );
  }

  private async showPaymentInstructions(ctx: BotContext, channelId: number) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const channel = await this.database.getChannel(channelId);

    if (!channel) {
      await ctx.reply('Channel not found.');
      return;
    }

    if (!channel.subscription_contract_address) {
      await ctx.reply('❌ This channel is not properly configured. Please contact admin.');
      return;
    }

    // Create pending subscription
    const subscriber = await this.database.getSubscriberByTelegramId(userId);

    if (!subscriber) {
      await ctx.reply('Error: User not registered.');
      return;
    }

    const subscription = await this.subscriptionService.createOrUpdateSubscription(
      subscriber.id,
      channel.id,
      channel.monthly_price_ton
    );

    if (ctx.session) {
      ctx.session.pendingPayment = {
        channelId: channel.id,
        amount: channel.monthly_price_ton,
        contractAddress: channel.subscription_contract_address
      };
    }

    // Check wallet connection status
    const walletStatus = await this.tonConnectService.checkConnection(userId.toString());

    // Build keyboard with payment options
    const keyboard = [];

    // If wallet connected, offer TON Connect payment (recommended)
    if (walletStatus.connected) {
      keyboard.push([{
        text: `💳 Pay ${channel.monthly_price_ton} TON with ${walletStatus.wallet?.name || 'Connected Wallet'}`,
        callback_data: `tonconnect_pay_${channel.id}`
      }]);
    } else {
      keyboard.push([{
        text: `🔗 Connect Wallet & Pay`,
        callback_data: `connect_wallet`
      }]);
    }

    // Always offer manual payment option (Tonkeeper deep link)
    const paymentUrl = this.generateTonPaymentUrl(
      channel.subscription_contract_address,
      channel.monthly_price_ton,
      subscription.id
    );
    keyboard.push([{
      text: `💎 Pay with Other Wallet`,
      callback_data: `manual_pay_${channel.id}`
    }]);

    // Check payment status button
    keyboard.push([{
      text: '✅ I\'ve sent payment',
      callback_data: `check_payment_${subscription.id}`
    }]);

    await ctx.reply(
      `💳 Payment for ${channel.title}\n\n` +
      `Amount: ${channel.monthly_price_ton} TON\n` +
      `Contract: \`${channel.subscription_contract_address}\`\n\n` +
      `Choose payment method:\n` +
      (walletStatus.connected
        ? `✅ Wallet connected: ${walletStatus.wallet?.name}\n`
        : `💡 Connect your wallet for quick payment\n`) +
      `\n⚠️ Important:\n` +
      `• Send exact amount (1% tolerance)\n` +
      `• Payment confirmed in ~1 minute\n` +
      `• Access granted immediately after confirmation`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      }
    );
  }

  private generateTonPaymentUrl(address: string, amount: number, subscriptionId: number): string {
    // CRITICAL: The subscription contract requires "Subscribe" text comment
    // See contracts/contracts/factory.tact line 273: receive("Subscribe")
    const comment = "Subscribe";
    const amountNano = Math.floor(amount * 1e9);
    return `https://app.tonkeeper.com/transfer/${address}?amount=${amountNano}&text=${comment}`;
  }

  /**
   * Show manual payment instructions (Tonkeeper deep link)
   * This is the fallback method for users without TON Connect
   */
  private async showManualPaymentInstructions(ctx: Context, channelId: number) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const channel = await this.database.getChannel(channelId);
    if (!channel || !channel.subscription_contract_address) {
      await ctx.reply('❌ Channel not found or not properly configured.');
      return;
    }

    const subscriber = await this.database.getSubscriberByTelegramId(userId);
    if (!subscriber) {
      await ctx.reply('❌ Error: User not registered.');
      return;
    }

    const subscription = await this.subscriptionService.createOrUpdateSubscription(
      subscriber.id,
      channel.id,
      channel.monthly_price_ton
    );

    const paymentUrl = this.generateTonPaymentUrl(
      channel.subscription_contract_address,
      channel.monthly_price_ton,
      subscription.id
    );

    await ctx.reply(
      `💎 Manual Payment Instructions\n\n` +
      `Amount: ${channel.monthly_price_ton} TON\n` +
      `To: \`${channel.subscription_contract_address}\`\n` +
      `Comment: \`sub_${subscription.id}\`\n\n` +
      `1. Open your TON wallet (Tonkeeper, MyTonWallet, etc.)\n` +
      `2. Send exactly ${channel.monthly_price_ton} TON to the address above\n` +
      `3. Include the comment in your transaction\n` +
      `4. Wait ~1 minute for blockchain confirmation\n\n` +
      `⚠️ Important:\n` +
      `• Send exact amount (1% tolerance)\n` +
      `• Don't forget the comment\n` +
      `• Payment is verified automatically`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💎 Open Tonkeeper', url: paymentUrl }],
            [{ text: '✅ I\'ve sent payment', callback_data: `check_payment_${subscription.id}` }],
            [{ text: '🔙 Back to payment options', callback_data: `pay_${channel.id}` }]
          ]
        }
      }
    );
  }

  /**
   * Show wallet connection status
   */
  private async showWalletStatus(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      const walletStatus = await this.tonConnectService.checkConnection(userId.toString());

      if (walletStatus.connected && walletStatus.wallet) {
        // Wallet is connected
        await ctx.reply(
          `✅ Wallet Connected\n\n` +
          `Wallet: ${walletStatus.wallet.name}\n` +
          `Address: \`${walletStatus.address}\`\n\n` +
          `You can now make instant payments with your connected wallet!`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📺 Browse Channels', callback_data: 'browse_channels' }],
                [{ text: '🔌 Disconnect Wallet', callback_data: 'disconnect_wallet' }]
              ]
            }
          }
        );
      } else {
        // No wallet connected
        await ctx.reply(
          `💡 No Wallet Connected\n\n` +
          `Connect your TON wallet for quick payments:\n` +
          `• Pay with one tap\n` +
          `• No manual address copying\n` +
          `• Secure TON Connect protocol\n\n` +
          `Supported wallets:\n` +
          `✅ Telegram Wallet\n` +
          `✅ Tonkeeper\n` +
          `✅ MyTonWallet\n` +
          `✅ Tonhub\n` +
          `✅ and more...`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔗 Connect Wallet', callback_data: 'connect_wallet' }],
                [{ text: '📺 Browse Channels', callback_data: 'browse_channels' }]
              ]
            }
          }
        );
      }
    } catch (error) {
      console.error('Error checking wallet status:', error);
      await ctx.reply('❌ Error checking wallet status. Please try again.');
    }
  }

  /**
   * Initiate wallet connection flow
   */
  private async initiateWalletConnection(ctx: BotContext) {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return;

    try {
      // Check if already connected
      const walletStatus = await this.tonConnectService.checkConnection(userId.toString());
      if (walletStatus.connected) {
        await ctx.reply(
          `✅ Wallet already connected: ${walletStatus.wallet?.name}\n\n` +
          `Use /wallet to view details or disconnect.`
        );
        return;
      }

      // Generate connection URL
      const { universalUrl, qrCodeUrl, deepLinks } = await this.tonConnectService.generateConnectionUrl({
        userId: userId.toString(),
        chatId: chatId.toString(),
        returnStrategy: 'back'
      });

      // Build keyboard with wallet deep links
      const keyboard: Array<Array<{text: string, url: string}>> = deepLinks.map(wallet => [{
        text: `${wallet.name}`,
        url: wallet.universalUrl || wallet.deepLink || universalUrl
      }]);

      if (ctx.session) {
        ctx.session.awaitingWalletConnection = true;
      }

      await ctx.reply(
        `🔗 Connect Your Wallet\n\n` +
        `Choose your wallet to connect:\n\n` +
        `⚠️ You'll be redirected to your wallet app\n` +
        `✅ Approve the connection request\n` +
        `🔙 Return to Telegram\n\n` +
        `Connection expires in 10 minutes`,
        {
          reply_markup: { inline_keyboard: keyboard }
        }
      );

      // Start polling for connection
      this.pollForWalletConnection(userId.toString(), chatId);

    } catch (error: any) {
      console.error('Error initiating wallet connection:', error);
      await ctx.reply(
        `❌ Error connecting wallet: ${error.message}\n\n` +
        `Please try again or use manual payment instead.`
      );
    }
  }

  /**
   * Poll for wallet connection completion
   * Checks every 3 seconds for up to 5 minutes
   */
  private async pollForWalletConnection(userId: string, chatId: number) {
    const maxAttempts = 100; // 100 * 3 seconds = 5 minutes
    let attempts = 0;

    const checkConnection = async () => {
      attempts++;

      try {
        const walletStatus = await this.tonConnectService.checkConnection(userId);

        if (walletStatus.connected && walletStatus.wallet) {
          // Wallet connected successfully
          await this.bot.api.sendMessage(
            chatId,
            `✅ Wallet Connected Successfully!\n\n` +
            `Wallet: ${walletStatus.wallet.name}\n` +
            `Address: \`${walletStatus.address}\`\n\n` +
            `You can now make instant payments!`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📺 Browse Channels', callback_data: 'browse_channels' }]
                ]
              }
            }
          );
          return; // Stop polling
        }

        // Continue polling if not connected yet
        if (attempts < maxAttempts) {
          setTimeout(checkConnection, 3000); // Check again in 3 seconds
        } else {
          // Timeout
          await this.bot.api.sendMessage(
            chatId,
            `⏱ Connection timeout.\n\n` +
            `The wallet connection request expired. Please try again with /wallet`
          );
        }
      } catch (error) {
        console.error('Error polling wallet connection:', error);
        // Don't stop polling on error, just log it
        if (attempts < maxAttempts) {
          setTimeout(checkConnection, 3000);
        }
      }
    };

    // Start polling after a short delay
    setTimeout(checkConnection, 3000);
  }

  /**
   * Disconnect wallet
   */
  private async disconnectWallet(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      await this.tonConnectService.disconnect(userId.toString());

      await ctx.reply(
        `🔌 Wallet Disconnected\n\n` +
        `Your wallet has been disconnected successfully.\n\n` +
        `You can still make payments using manual method.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔗 Connect Again', callback_data: 'connect_wallet' }],
              [{ text: '📺 Browse Channels', callback_data: 'browse_channels' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      await ctx.reply('❌ Error disconnecting wallet. Please try again.');
    }
  }

  /**
   * Initiate TON Connect payment
   * CRITICAL: This is the main payment flow using connected wallet
   */
  private async initiateTonConnectPayment(ctx: Context, channelId: number) {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      // Get channel details
      const channel = await this.database.getChannel(channelId);
      if (!channel || !channel.subscription_contract_address) {
        await ctx.reply('❌ Channel not found or not properly configured.');
        return;
      }

      // Check wallet connection
      const walletStatus = await this.tonConnectService.checkConnection(userId.toString());
      if (!walletStatus.connected) {
        await ctx.reply(
          `❌ Wallet not connected.\n\n` +
          `Please connect your wallet first with /wallet`
        );
        return;
      }

      // Get or create subscription
      const subscriber = await this.database.getSubscriberByTelegramId(userId);
      if (!subscriber) {
        await ctx.reply('❌ Error: User not registered.');
        return;
      }

      const subscription = await this.subscriptionService.createOrUpdateSubscription(
        subscriber.id,
        channel.id,
        channel.monthly_price_ton
      );

      // Prepare transaction
      const amountNano = (channel.monthly_price_ton * 1e9).toString();
      const comment = `sub_${subscription.id}`;

      await ctx.reply(
        `⏳ Preparing transaction...\n\n` +
        `Amount: ${channel.monthly_price_ton} TON\n` +
        `To: ${channel.title}\n\n` +
        `Please confirm the transaction in your wallet app.`
      );

      // CRITICAL: The subscription contract requires "Subscribe" text comment
      // Without this payload, the contract will BOUNCE the transaction back
      // See contracts/contracts/factory.tact line 273: receive("Subscribe")
      const subscribePayload = beginCell()
        .storeUint(0, 32) // Text comment opcode (0 = text comment)
        .storeStringTail("Subscribe") // The exact text the contract expects
        .endCell();

      const transaction = {
        messages: [{
          address: channel.subscription_contract_address,
          amount: amountNano,
          payload: subscribePayload.toBoc().toString('base64'), // Base64-encoded BOC
        }],
        validUntil: Math.floor(Date.now() / 1000) + 300 // 5 minutes
      };

      // Send transaction
      const result = await this.tonConnectService.sendTransaction(
        userId.toString(),
        transaction
      );

      if (result.success) {
        await ctx.reply(
          `✅ Payment Sent Successfully!\n\n` +
          `Transaction hash: \`${result.hash}\`\n\n` +
          `⏳ Waiting for blockchain confirmation (~1 minute)...\n\n` +
          `Your subscription will be activated automatically.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Check Status', callback_data: `check_payment_${subscription.id}` }],
                [{ text: '📊 My Subscriptions', callback_data: 'my_subscriptions' }]
              ]
            }
          }
        );
      }

    } catch (error: any) {
      console.error('TON Connect payment error:', error);

      // Handle specific error types
      if (error instanceof UserRejectedError) {
        await ctx.reply(
          `❌ Transaction Rejected\n\n` +
          `You rejected the transaction in your wallet.\n\n` +
          `Try again when ready!`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: `tonconnect_pay_${channelId}` }],
                [{ text: '💎 Use Other Wallet', callback_data: `manual_pay_${channelId}` }]
              ]
            }
          }
        );
      } else if (error instanceof InsufficientFundsError) {
        await ctx.reply(
          `❌ Insufficient Balance\n\n` +
          `Your wallet doesn't have enough TON.\n\n` +
          `Please top up and try again.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: `tonconnect_pay_${channelId}` }]
              ]
            }
          }
        );
      } else if (error instanceof TransactionError) {
        await ctx.reply(
          `❌ Transaction Failed\n\n` +
          `${error.message}\n\n` +
          `You can try again or use manual payment.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: `tonconnect_pay_${channelId}` }],
                [{ text: '💎 Use Other Wallet', callback_data: `manual_pay_${channelId}` }]
              ]
            }
          }
        );
      } else {
        await ctx.reply(
          `❌ Payment Error\n\n` +
          `Something went wrong: ${error.message}\n\n` +
          `Please try again or contact support.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '💎 Use Other Wallet', callback_data: `manual_pay_${channelId}` }]
              ]
            }
          }
        );
      }
    }
  }

  async start() {
    await this.bot.start();
    console.log('✅ Payment bot started');
  }

  stop() {
    this.bot.stop();
    this.paymentService.stopMonitoring();
    this.db.end();
    console.log('⏹ Payment bot stopped');
  }
}
