/**
 * Bot Setup Verification Script
 * This script helps diagnose and fix the chat_join_request issue
 */

const { Bot } = require('grammy');
const { Pool } = require('pg');

const BOT_TOKEN = '8462111363:AAEPUGFhQk2cSZmkRQp4jwNssi1Lr8BeSYM';
const DATABASE_URL = 'postgresql://tonpaywall:tonpaywall_secure_password_123@localhost:5433/ton_subscription_mvp';

const bot = new Bot(BOT_TOKEN);
const db = new Pool({ connectionString: DATABASE_URL });

async function verifyBotSetup() {
  console.log('🔍 BOT SETUP VERIFICATION\n');
  console.log('='.repeat(60));

  try {
    // 1. Check bot info
    console.log('\n1️⃣ Checking bot info...');
    const botInfo = await bot.api.getMe();
    console.log(`   ✅ Bot ID: ${botInfo.id}`);
    console.log(`   ✅ Bot Username: @${botInfo.username}`);
    console.log(`   ✅ Bot Name: ${botInfo.first_name}`);

    // 2. Check webhook status
    console.log('\n2️⃣ Checking webhook configuration...');
    const webhookInfo = await bot.api.getWebhookInfo();
    if (webhookInfo.url) {
      console.log(`   ❌ WEBHOOK IS SET: ${webhookInfo.url}`);
      console.log('   ⚠️  This prevents long polling from working!');
      console.log('   🔧 Fix: Run bot.api.deleteWebhook()');
    } else {
      console.log('   ✅ No webhook set - using long polling');
    }
    console.log(`   ✅ Allowed updates: ${webhookInfo.allowed_updates?.join(', ') || 'all'}`);

    // 3. Check channels in database
    console.log('\n3️⃣ Checking channels in database...');
    const channelsResult = await db.query(
      `SELECT id, telegram_id, title, is_active, requires_approval, payment_bot_added
       FROM protected_channels
       WHERE is_active = true
       ORDER BY id`
    );

    if (channelsResult.rows.length === 0) {
      console.log('   ⚠️  No active channels found in database');
    } else {
      console.log(`   ✅ Found ${channelsResult.rows.length} active channel(s):\n`);

      for (const channel of channelsResult.rows) {
        console.log(`   📺 Channel ID: ${channel.id} (Telegram ID: ${channel.telegram_id})`);
        console.log(`      Title: ${channel.title}`);
        console.log(`      Requires Approval: ${channel.requires_approval}`);
        console.log(`      Payment Bot Added: ${channel.payment_bot_added}`);

        // 4. Check bot admin status in each channel
        console.log(`\n   4️⃣ Checking bot admin status in this channel...`);
        try {
          const chatMember = await bot.api.getChatMember(channel.telegram_id, botInfo.id);

          if (chatMember.status === 'administrator') {
            console.log(`      ✅ Bot is ADMIN in channel`);
            console.log(`      Status: ${chatMember.status}`);

            // Check specific permissions
            const requiredPerms = {
              'can_invite_users': chatMember.can_invite_users,
              'can_manage_chat': chatMember.can_manage_chat,
              'can_post_messages': chatMember.can_post_messages
            };

            console.log('      Required permissions:');
            for (const [perm, value] of Object.entries(requiredPerms)) {
              console.log(`        ${value ? '✅' : '❌'} ${perm}: ${value}`);
            }

            // Critical check for chat_join_request
            if (!chatMember.can_invite_users) {
              console.log('      ⚠️  WARNING: Bot needs "can_invite_users" permission');
              console.log('      This is REQUIRED to approve join requests!');
            }

          } else {
            console.log(`      ❌ Bot is NOT admin! Status: ${chatMember.status}`);
            console.log('      🔧 Fix: Add bot as admin in channel settings');
          }

        } catch (error) {
          console.log(`      ❌ CRITICAL ERROR: ${error.message}`);
          if (error.message.includes('chat not found')) {
            console.log('      🔧 Fix: Bot is NOT in the channel at all!');
            console.log('         1. Add bot to channel');
            console.log('         2. Promote bot to administrator');
            console.log('         3. Grant "Invite Users via Link" permission');
          }
        }

        console.log('');
      }
    }

    // 5. Test update configuration
    console.log('\n5️⃣ Testing update configuration...');
    console.log('   The bot should receive these update types:');
    console.log('   ✅ message');
    console.log('   ✅ callback_query');
    console.log('   ✅ chat_join_request');

    console.log('\n' + '='.repeat(60));
    console.log('\n📋 SUMMARY AND NEXT STEPS:\n');
    console.log('To receive chat_join_request events, ensure:');
    console.log('1. ✅ Bot is added to the channel as admin');
    console.log('2. ✅ Bot has "Invite Users via Link" permission enabled');
    console.log('3. ✅ Channel is set to "Private" with approval required');
    console.log('4. ✅ No webhook is configured (use long polling)');
    console.log('5. ✅ allowed_updates includes "chat_join_request"');

    console.log('\n📱 HOW TO ADD BOT AS ADMIN:');
    console.log('1. Open your private channel in Telegram');
    console.log('2. Go to Channel Info → Administrators');
    console.log('3. Click "Add Administrator"');
    console.log(`4. Search for and select: @${botInfo.username}`);
    console.log('5. Enable these permissions:');
    console.log('   • Invite Users via Link (CRITICAL)');
    console.log('   • Add Members (CRITICAL)');
    console.log('   • Post Messages (recommended)');
    console.log('6. Click "Done" to save');

    console.log('\n⚡ TESTING:');
    console.log('After adding the bot as admin:');
    console.log('1. Restart the payment bot');
    console.log('2. Have a test user click the invite link');
    console.log('3. Watch the bot logs for: "📥 Join request: user XXX → channel YYY"');
    console.log('4. If user paid, they should be auto-approved immediately');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  } finally {
    await db.end();
  }
}

verifyBotSetup();
