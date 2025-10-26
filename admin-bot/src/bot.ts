// Admin bot for channel owners to manage subscriptions
import { Bot, Context, SessionFlavor, session, InputFile } from 'grammy';
import { conversations, createConversation, ConversationFlavor } from '@grammyjs/conversations';
import { Pool } from 'pg';
import { ChannelSetupService } from './services/channel-setup';
import { ContractDeploymentService } from './services/contract-deployment';
import { AnalyticsService } from './services/analytics';
import { DatabaseService } from './database/database';

interface SessionData {
  currentChannelId?: number;
  setupStep?: string;
  walletAddress?: string;
}

type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor;

export class AdminBot {
  private bot: Bot<BotContext>;
  private db: Pool;
  private database: DatabaseService;
  private channelSetup: ChannelSetupService;
  private contractDeployment: ContractDeploymentService;
  private analytics: AnalyticsService;
  private tonConnect: ReturnType<typeof import('./services/tonconnect.service').createTonConnectService>;

  constructor(token: string, dbUrl: string) {
    this.bot = new Bot<BotContext>(token);
    this.db = new Pool({ connectionString: dbUrl });

    // Initialize TON Connect service
    const { createTonConnectService } = require('./services/tonconnect.service');
    this.tonConnect = createTonConnectService(this.db);

    // Initialize services
    this.database = new DatabaseService(this.db);
    this.channelSetup = new ChannelSetupService(this.db, this.bot.api);
    this.contractDeployment = new ContractDeploymentService(this.db, this.tonConnect);
    this.analytics = new AnalyticsService(this.db);

    // Setup middleware
    this.bot.use(session({ initial: (): SessionData => ({}) }));
    this.bot.use(conversations());

    // Register conversations (without .bind to preserve function name)
    this.bot.use(createConversation(async (conversation: any, ctx: BotContext) => {
      return this.setupChannelConversation(conversation, ctx);
    }, 'setupChannelConversation'));

    // Setup command handlers
    this.setupCommands();
    this.setupCallbacks();

    // Error handling
    this.bot.catch((err) => {
      console.error('Bot error:', err);
    });
  }

  private setupCommands() {
    // Start command
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      // Register admin if not exists
      await this.database.upsertAdmin(
        userId,
        ctx.from?.username,
        ctx.from?.first_name
      );

      await ctx.reply(
        '👋 Welcome to Subscription Admin Bot!\n\n' +
        'I help you monetize your Telegram channels with crypto subscriptions.\n\n' +
        '📋 Available commands:\n' +
        '/setup - Setup subscription for a channel\n' +
        '/channels - View your channels\n' +
        '/analytics - View analytics\n' +
        '/settings - Manage settings\n' +
        '/help - Get help',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '➕ Setup New Channel', callback_data: 'setup_channel' }],
              [{ text: '📊 View Analytics', callback_data: 'view_analytics' }],
              [{ text: '⚙️ Settings', callback_data: 'settings' }]
            ]
          }
        }
      );
    });

    // Setup command - start channel setup process
    this.bot.command('setup', async (ctx) => {
      await ctx.conversation.enter('setupChannelConversation');
    });

    // Channels command - list managed channels
    this.bot.command('channels', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      const admin = await this.database.getAdminByTelegramId(userId);
      if (!admin) {
        await ctx.reply('❌ Admin not found. Please /start first.');
        return;
      }

      const channels = await this.database.getChannelsByAdmin(admin.id);

      if (channels.length === 0) {
        await ctx.reply('You don\'t have any channels set up yet.\n\nUse /setup to add your first channel!');
        return;
      }

      let message = '📺 Your Channels:\n\n';

      for (const channel of channels) {
        const status = channel.is_active ? '✅ Active' : '⚠️ Setup Incomplete';
        message += `${status} ${channel.title}\n`;
        message += `├ Monthly Price: ${channel.monthly_price_ton} TON\n`;
        message += `├ Contract: ${channel.subscription_contract_address ? 'Deployed' : 'Not deployed'}\n`;
        message += `└ ID: ${channel.telegram_id}\n\n`;
      }

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: channels.map(ch => [{
            text: `⚙️ Manage ${ch.title}`,
            callback_data: `manage_channel_${ch.id}`
          }])
        }
      });
    });

    // Analytics command
    this.bot.command('analytics', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      const admin = await this.database.getAdminByTelegramId(userId);
      if (!admin) {
        await ctx.reply('❌ Admin not found. Please /start first.');
        return;
      }

      const channels = await this.database.getActiveChannelsByAdmin(admin.id);

      if (channels.length === 0) {
        await ctx.reply('No active channels found. Complete /setup first!');
        return;
      }

      await ctx.reply('Select a channel to view analytics:', {
        reply_markup: {
          inline_keyboard: channels.map(ch => [{
            text: `📊 ${ch.title}`,
            callback_data: `analytics_${ch.id}`
          }])
        }
      });
    });

    // Help command
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        '📚 Help Guide\n\n' +
        '🔹 Setup Process:\n' +
        '1. Use /setup to add your channel\n' +
        '2. Verify admin rights\n' +
        '3. Add payment bot to channel\n' +
        '4. Connect your TON wallet\n' +
        '5. Set subscription price\n' +
        '6. Deploy smart contract\n\n' +
        '🔹 Management:\n' +
        '• /channels - View and manage your channels\n' +
        '• /analytics - Check subscriber stats\n' +
        '• Update price or wallet anytime\n\n' +
        '🔹 Support:\n' +
        'Need help? Contact @YourSupport'
      );
    });
  }

  private setupCallbacks() {
    // Setup channel callback
    this.bot.callbackQuery('setup_channel', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.conversation.enter('setupChannelConversation');
    });

    // Analytics callback
    this.bot.callbackQuery(/^analytics_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const channelId = parseInt(ctx.match[1]);
      await this.showChannelAnalytics(ctx, channelId);
    });

    // Manage channel callback
    this.bot.callbackQuery(/^manage_channel_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const channelId = parseInt(ctx.match[1]);
      await this.showChannelManagement(ctx, channelId);
    });

    // Update price callback
    this.bot.callbackQuery(/^update_price_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.reply('💎 Enter new monthly price in TON:');
      // Handle price update in message handler
    });
  }

  // Channel setup conversation
  private async setupChannelConversation(conversation: any, ctx: BotContext) {
    // Step 1: Get channel username or ID
    await ctx.reply(
      '🚀 Let\'s setup subscription for your channel!\n\n' +
      'Please forward a message from your channel or enter the channel username (e.g., @yourchannel):'
    );

    const channelResponse = await conversation.wait();

    let channelId: string | number;
    let channelInfo: any;

    if (channelResponse.message?.forward_origin) {
      // Message forwarded from channel (new Telegram API)
      const origin = channelResponse.message.forward_origin;
      if (origin.type === 'channel') {
        channelInfo = origin.chat;
        channelId = channelInfo.id;
      } else {
        await ctx.reply('❌ Please forward a message from a channel, not a user.');
        return;
      }
    } else if (channelResponse.message?.text) {
      // Channel username provided
      channelId = channelResponse.message.text.trim();
      try {
        channelInfo = await this.bot.api.getChat(channelId);
      } catch (error) {
        await ctx.reply('❌ Channel not found. Please check the username and try again.');
        return;
      }
    } else {
      await ctx.reply('❌ Invalid input. Please try /setup again.');
      return;
    }

    // Step 2: Skip admin rights verification for MVP
    // Note: In production, you should verify the user is actually a channel admin
    await ctx.reply(
      '✅ Channel detected: ' + channelInfo.title + '\n\n' +
      '⚠️ Important: Make sure you are an admin of this channel with full permissions.'
    );

    // Step 3: Store channel in database
    const admin = await this.database.getAdminByTelegramId(ctx.from!.id);
    if (!admin) {
      await ctx.reply('❌ Admin not found. Please /start first.');
      return;
    }

    const channel = await this.database.upsertChannel(
      channelInfo.id,
      channelInfo.title,
      channelInfo.username,
      admin.id
    );

    ctx.session.currentChannelId = channel.id;

    // Step 4: Add payment bot to channel
    await ctx.reply(
      '📌 Now, add our payment bot to your channel:\n\n' +
      '1. Go to your channel\n' +
      `2. Add @${process.env.PAYMENT_BOT_USERNAME} as admin\n` +
      '3. Grant "Post Messages" and "Edit Messages" permissions\n' +
      '4. Click "Confirm" when done',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Confirm Bot Added', callback_data: 'confirm_bot_added' }],
            [{ text: '❌ Cancel', callback_data: 'cancel_setup' }]
          ]
        }
      }
    );

    const botAddedResponse = await conversation.waitForCallbackQuery(['confirm_bot_added', 'cancel_setup']);

    if (botAddedResponse.callbackQuery.data === 'cancel_setup') {
      await ctx.reply('Setup cancelled.');
      return;
    }

    // Skip verification - trust user added the bot
    // Note: In production, you should verify the bot was actually added
    await this.database.updateChannel(channel.id, { payment_bot_added: true });
    await ctx.reply(
      '✅ Assuming payment bot was added.\n\n' +
      '⚠️ Make sure @' + process.env.PAYMENT_BOT_USERNAME + ' is added as admin with post/edit permissions!'
    );

    // Step 5: Connect wallet via TON Connect
    let walletAddress: string | undefined;

    // Check if wallet is already connected (from session or previous step)
    const existingConnection = await this.tonConnect.checkConnection(ctx.from!.id.toString());

    if (existingConnection.connected && existingConnection.address) {
      // Wallet already connected, reuse it
      walletAddress = existingConnection.address;
      ctx.session.walletAddress = walletAddress;

      await ctx.reply(
        `✅ Using your connected wallet:\n\n` +
        `📍 Address: \`${walletAddress}\``,
        { parse_mode: 'Markdown' }
      );
    } else {
      // Wallet not connected, initiate connection flow
      await ctx.reply('💰 Connect your TON wallet to receive payments and pay deployment fees:');
      await ctx.reply('🔄 Generating TON Connect link...');

      try {
        // Generate TON Connect connection
        const connectionInfo = await this.tonConnect.generateConnectionUrl({
          userId: ctx.from!.id.toString(),
          chatId: ctx.chat!.id.toString(),
          returnStrategy: 'back'
        });

      // Send QR code as photo (same approach as ton-roulette)
      const qrBuffer = Buffer.from(connectionInfo.qrCodeUrl.split(',')[1], 'base64');

      // Build keyboard with wallet-specific buttons for mobile users
      const keyboard: any[] = [];

      // Add universal link button (works for all wallets)
      keyboard.push([{ text: '🔗 Open in Wallet', url: connectionInfo.universalUrl }]);

      // Add specific wallet buttons from deep links
      if (connectionInfo.deepLinks && connectionInfo.deepLinks.length > 0) {
        const walletButtons = connectionInfo.deepLinks
          .slice(0, 2) // Show top 2 wallets (Tonkeeper, TON Wallet)
          .filter(w => w.universalUrl || w.deepLink)
          .map(wallet => ({
            text: `📱 ${wallet.name}`,
            url: wallet.universalUrl || wallet.deepLink || connectionInfo.universalUrl
          }));

        if (walletButtons.length > 0) {
          keyboard.push(...walletButtons.map(b => [b]));
        }
      }

      keyboard.push([{ text: '📝 Manual Entry', callback_data: 'manual_wallet' }]);
      keyboard.push([{ text: '❌ Cancel', callback_data: 'cancel_wallet_connection' }]);

      await ctx.replyWithPhoto(
        new InputFile(qrBuffer, 'qr-code.png'),
        {
          caption:
            '💳 *Connect Your TON Wallet*\n\n' +
            '📱 *On Mobile:* Click a wallet button below\n' +
            '💻 *On Desktop:* Scan QR code with your wallet app\n\n' +
            'Supported wallets:\n' +
            '• Tonkeeper\n' +
            '• TON Wallet\n' +
            '• OpenMask\n' +
            '• MyTonWallet\n\n' +
            '⏳ Waiting for connection...\n\n' +
            'Connection will timeout in 5 minutes.',
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );

      // Poll for wallet connection (5 minutes max)
      let attempts = 0;
      const maxAttempts = 150; // 5 minutes with 2-second intervals
      let connected = false;

      while (attempts < maxAttempts && !connected) {
        attempts++;

        try {
          const status = await this.tonConnect.checkConnection(ctx.from!.id.toString());

          if (status.connected && status.address) {
            walletAddress = status.address;
            connected = true;

            // Update database
            await this.database.updateAdmin(admin.id, {
              wallet_address: walletAddress,
              wallet_connected: true,
              wallet_connection_method: 'ton-connect'
            });

            ctx.session.walletAddress = walletAddress;

            await ctx.reply(
              `✅ Wallet Connected Successfully!\n\n` +
              `📍 Address: \`${walletAddress}\`\n\n` +
              'You will use this wallet to:\n' +
              '• Pay for contract deployment (0.7 TON)\n' +
              '• Receive subscription payments',
              { parse_mode: 'Markdown' }
            );
            break;
          }
        } catch (pollError) {
          // Ignore polling errors and continue
          console.log('Polling check error (ignoring):', pollError instanceof Error ? pollError.message : pollError);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!connected) {
        await ctx.reply('⏱️ Connection timeout. Please try /setup again.');
        return;
      }
      } catch (error) {
        console.error('Wallet connection error:', error);
        await ctx.reply(
          '❌ Failed to connect wallet. Please try /setup again.\n' +
          'Error: ' + (error as Error).message
        );
        return;
      }
    } // End of wallet connection else block

    // Ensure wallet is connected before proceeding
    if (!walletAddress) {
      await ctx.reply('❌ Wallet connection failed. Please try /setup again.');
      return;
    }

    // Step 6: Set subscription price
    await ctx.reply(
      '💎 Set your monthly subscription price in TON:\n\n' +
      'Suggested prices:\n' +
      '• 5 TON - Basic content\n' +
      '• 10 TON - Premium content\n' +
      '• 25 TON - Exclusive/VIP content\n\n' +
      'Enter the price (number only):'
    );

    const priceResponse = await conversation.wait();
    const price = parseFloat(priceResponse.message?.text || '0');

    if (isNaN(price) || price <= 0) {
      await ctx.reply('❌ Invalid price. Please enter a positive number.');
      return;
    }

    await this.database.updateChannel(channel.id, { monthly_price_ton: price });

    // Step 7: Deploy smart contract (user pays via TON Connect)
    await ctx.reply(
      '🚀 Deploying your subscription smart contract...\n\n' +
      '💰 You will need to approve a transaction in your wallet:\n' +
      '• Amount: 0.7 TON (deployment fee)\n' +
      '• This is a one-time payment\n\n' +
      'Please confirm the transaction in your wallet app...'
    );

    try {
      // Request user to deploy contract via TON Connect
      console.log(`📤 Requesting deployment transaction for channel ${channelInfo.id}...`);

      // Get wallet deep link BEFORE sending transaction
      const walletInfo = await this.tonConnect.getWalletDeepLink(ctx.from!.id.toString());

      // Start the deployment request (this will wait for user confirmation)
      const deploymentPromise = this.contractDeployment.requestDeploymentFromUser(
        ctx.from!.id.toString(),
        channelInfo.id,
        walletAddress,
        price
      );

      // Give TON Connect SDK a moment to send the request to the wallet
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Show message with deep link button to open wallet
      const waitingMessage =
        '📱 Transaction request sent to your wallet!\n\n' +
        '⏳ Please open your wallet app and **approve the transaction**:\n' +
        '• Amount: 0.7 TON\n' +
        '• Timeout: 2 minutes\n\n' +
        '👇 Click the button below to open your wallet app:';

      if (walletInfo && walletInfo.deepLink) {
        await ctx.reply(waitingMessage, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `📱 Open ${walletInfo.walletName} to Approve`,
                  url: walletInfo.deepLink
                }
              ]
            ]
          }
        });
      } else {
        await ctx.reply(
          waitingMessage + '\n\n(Please open your wallet app manually to approve the transaction)'
        );
      }

      // Now wait for transaction confirmation
      const deploymentResult = await deploymentPromise;

      console.log(`✅ Transaction confirmed! Hash: ${deploymentResult.hash}`);

      // Build confirmation message
      const confirmationMessage =
        '✅ Transaction Confirmed!\n\n' +
        '⏳ Deploying contract on blockchain...\n' +
        `Transaction Hash: ${deploymentResult.hash.substring(0, 16)}...\n\n` +
        'This may take 30-60 seconds.';

      if (walletInfo && walletInfo.deepLink) {
        // Show message with button to open wallet app
        await ctx.reply(confirmationMessage, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `📱 View in ${walletInfo.walletName}`,
                  url: walletInfo.deepLink
                },
                {
                  text: '🔍 View on TONScan',
                  url: `https://${process.env.TON_NETWORK === 'mainnet' ? '' : 'testnet.'}tonscan.org/tx/${deploymentResult.hash}`
                }
              ]
            ]
          }
        });
      } else {
        // No deep link available, show regular message with explorer link
        await ctx.reply(confirmationMessage, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔍 View on TONScan',
                  url: `https://${process.env.TON_NETWORK === 'mainnet' ? '' : 'testnet.'}tonscan.org/tx/${deploymentResult.hash}`
                }
              ]
            ]
          }
        });
      }

      // Wait for deployment confirmation and get contract address
      await ctx.reply('⏳ Checking deployment status...');

      const contractAddress = await this.contractDeployment.waitForDeploymentAndGetAddress(
        channelInfo.id,
        60000 // 60 seconds
      );

      if (!contractAddress) {
        await ctx.reply(
          '⚠️ Contract deployment is taking longer than expected.\n\n' +
          'Your transaction was sent successfully. The contract should be ready in 1-2 minutes.\n' +
          'Please use /channels to check the status.'
        );
        return;
      }

      // Update database
      await this.database.updateChannel(channel.id, {
        subscription_contract_address: contractAddress,
        is_active: true
      });

      await ctx.reply(
        '✅ Setup Complete!\n\n' +
        `Your subscription bot is now active for ${channelInfo.title}\n\n` +
        `📊 Subscription Details:\n` +
        `• Monthly Price: ${price} TON\n` +
        `• Contract: ${contractAddress}\n` +
        `• Payment Wallet: ${walletAddress}\n\n` +
        `Share this with your subscribers:\n` +
        `👉 t.me/${process.env.PAYMENT_BOT_USERNAME}?start=ch_${channelInfo.id}\n\n` +
        'Use /analytics to view subscription stats!'
      );

    } catch (error) {
      console.error('❌ Contract deployment failed:', error);
      const errorMessage = (error as Error).message;
      const errorStack = (error as Error).stack;

      // Log detailed error for debugging
      console.error('Error details:', {
        message: errorMessage,
        stack: errorStack,
        channelId: channelInfo.id,
        walletAddress,
        price
      });

      if (errorMessage.includes('rejected') || errorMessage.includes('User rejected')) {
        await ctx.reply(
          '❌ Transaction Rejected\n\n' +
          'You cancelled the deployment transaction in your wallet.\n\n' +
          'No funds were deducted. Please try /setup again when ready.'
        );
      } else if (errorMessage.includes('Insufficient') || errorMessage.includes('insufficient')) {
        await ctx.reply(
          '❌ Insufficient Balance\n\n' +
          'Your wallet needs at least 0.75 TON for contract deployment:\n' +
          '• 0.7 TON for deployment\n' +
          '• ~0.05 TON for gas fees\n\n' +
          'Please add funds to your wallet and try /setup again.'
        );
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        await ctx.reply(
          '⏱️ Transaction Timeout\n\n' +
          'The transaction confirmation took too long.\n\n' +
          'This usually happens if you don\'t confirm the transaction in your wallet within 2 minutes.\n\n' +
          'Please try /setup again and confirm the transaction promptly.'
        );
      } else if (errorMessage.includes('Wallet not connected')) {
        await ctx.reply(
          '❌ Wallet Not Connected\n\n' +
          'Your wallet connection was lost.\n\n' +
          'Please use /connect to reconnect your wallet, then try /setup again.'
        );
      } else {
        // Generic error with details
        await ctx.reply(
          '❌ Deployment Failed\n\n' +
          `Error: ${errorMessage}\n\n` +
          'Possible causes:\n' +
          '• Wallet connection issue\n' +
          '• Network connectivity problem\n' +
          '• Insufficient balance\n\n' +
          'Please try:\n' +
          '1. Check your wallet balance (need 0.75+ TON)\n' +
          '2. Reconnect wallet with /connect\n' +
          '3. Try /setup again\n\n' +
          'If the issue persists, please contact support.'
        );
      }
    }
  }

  private async showChannelAnalytics(ctx: Context, channelId: number) {
    try {
      const analytics = await this.analytics.getChannelAnalytics(channelId);

      const message =
        `📊 Analytics for ${analytics.channelTitle}\n\n` +
        `📈 Subscribers:\n` +
        `• Total: ${analytics.totalSubscribers}\n` +
        `• Active: ${analytics.activeSubscribers}\n` +
        `• New (30d): ${analytics.newSubscribers}\n` +
        `• Churned (30d): ${analytics.churnedSubscribers}\n\n` +
        `💰 Revenue:\n` +
        `• Total: ${analytics.totalRevenue.toFixed(2)} TON\n` +
        `• This Month: ${analytics.monthlyRevenue.toFixed(2)} TON\n` +
        `• Average per User: ${analytics.arpu.toFixed(2)} TON\n\n` +
        `📅 Updated: ${new Date().toLocaleDateString()}`;

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: `analytics_${channelId}` }],
            [{ text: '📥 Export CSV', callback_data: `export_${channelId}` }]
          ]
        }
      });
    } catch (error) {
      console.error('Error showing analytics:', error);
      await ctx.reply('❌ Error loading analytics. Please try again.');
    }
  }

  private async showChannelManagement(ctx: Context, channelId: number) {
    try {
      const channel = await this.database.getChannel(channelId);

      if (!channel) {
        await ctx.reply('Channel not found.');
        return;
      }

      await ctx.reply(
        `⚙️ Manage ${channel.title}\n\n` +
        `Status: ${channel.is_active ? '✅ Active' : '⚠️ Inactive'}\n` +
        `Price: ${channel.monthly_price_ton} TON\n` +
        `Contract: ${channel.subscription_contract_address || 'Not deployed'}\n`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💎 Update Price', callback_data: `update_price_${channelId}` }],
              [{ text: '💰 Change Wallet', callback_data: `update_wallet_${channelId}` }],
              [{ text: '📊 View Analytics', callback_data: `analytics_${channelId}` }],
              [{ text: channel.is_active ? '⏸ Pause' : '▶️ Resume', callback_data: `toggle_${channelId}` }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error showing channel management:', error);
      await ctx.reply('❌ Error loading channel. Please try again.');
    }
  }

  private isValidTonAddress(address: string): boolean {
    // Basic TON address validation
    return address.length === 48 && (
      address.startsWith('EQ') ||
      address.startsWith('UQ') ||
      address.startsWith('0:') ||
      address.startsWith('-1:')
    );
  }

  async start() {
    await this.bot.start();
    console.log('✅ Admin bot started');
    console.log('🔗 Using Pre-Registration deployment architecture');
    console.log('   Deployments are fully autonomous on-chain - no monitoring needed!');
  }

  stop() {
    this.bot.stop();
    this.db.end();
    console.log('⏹ Admin bot stopped');
  }
}
