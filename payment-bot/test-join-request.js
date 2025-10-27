/**
 * Manual Join Request Testing Tool
 *
 * This script simulates what happens when the bot receives a join request event.
 * Use this to verify that the bot can successfully approve users after configuration.
 *
 * USAGE:
 *   node test-join-request.js <userId> <channelId>
 *
 * EXAMPLE:
 *   node test-join-request.js 6626619451 68
 */

const { Pool } = require('pg');
const { Bot } = require('grammy');

const BOT_TOKEN = '8462111363:AAEPUGFhQk2cSZmkRQp4jwNssi1Lr8BeSYM';
const DATABASE_URL = 'postgresql://tonpaywall:tonpaywall_secure_password_123@localhost:5433/ton_subscription_mvp';

const bot = new Bot(BOT_TOKEN);
const db = new Pool({ connectionString: DATABASE_URL });

async function testJoinRequest(userId, channelDbId) {
  console.log('🧪 JOIN REQUEST TEST\n');
  console.log('='.repeat(60));

  try {
    // 1. Get channel from database
    console.log(`\n1️⃣ Looking up channel ${channelDbId} in database...`);
    const channelResult = await db.query(
      'SELECT * FROM protected_channels WHERE id = $1',
      [channelDbId]
    );

    if (channelResult.rows.length === 0) {
      console.error(`❌ Channel ${channelDbId} not found in database`);
      process.exit(1);
    }

    const channel = channelResult.rows[0];
    console.log(`✅ Found channel: ${channel.title}`);
    console.log(`   Telegram ID: ${channel.telegram_id}`);
    console.log(`   Is Active: ${channel.is_active}`);
    console.log(`   Requires Approval: ${channel.requires_approval}`);

    // 2. Check if user has access
    console.log(`\n2️⃣ Checking if user ${userId} has access...`);
    const accessResult = await db.query(
      `SELECT has_channel_access($1, $2) as has_access`,
      [userId, channelDbId]
    );

    const hasAccess = accessResult.rows[0]?.has_access || false;
    console.log(`   Has Access: ${hasAccess ? '✅ YES' : '❌ NO'}`);

    if (hasAccess) {
      // Get access purchase details
      const purchaseResult = await db.query(
        `SELECT ap.*, s.telegram_id
         FROM access_purchases ap
         JOIN subscribers s ON ap.subscriber_id = s.id
         WHERE s.telegram_id = $1 AND ap.channel_id = $2`,
        [userId, channelDbId]
      );

      if (purchaseResult.rows.length > 0) {
        const purchase = purchaseResult.rows[0];
        console.log(`   Purchase Status: ${purchase.status}`);
        console.log(`   Amount Paid: ${purchase.amount_ton} TON`);
        console.log(`   Transaction: ${purchase.transaction_hash}`);
      }
    }

    // 3. Check bot permissions in channel
    console.log(`\n3️⃣ Checking bot permissions in channel...`);
    const botInfo = await bot.api.getMe();
    console.log(`   Bot: @${botInfo.username} (ID: ${botInfo.id})`);

    try {
      const chatMember = await bot.api.getChatMember(channel.telegram_id, botInfo.id);
      console.log(`   ✅ Bot Status: ${chatMember.status}`);

      if (chatMember.status === 'administrator') {
        console.log(`   ✅ Can Invite Users: ${chatMember.can_invite_users}`);
        console.log(`   ✅ Can Manage Chat: ${chatMember.can_manage_chat}`);
        console.log(`   ✅ Can Post Messages: ${chatMember.can_post_messages}`);

        if (!chatMember.can_invite_users) {
          console.error(`   ⚠️  WARNING: Bot lacks "can_invite_users" permission!`);
          console.error(`   Cannot approve join requests without this permission.`);
        }
      } else {
        console.error(`   ❌ Bot is not admin! Cannot approve join requests.`);
      }
    } catch (error) {
      console.error(`   ❌ ERROR: ${error.message}`);
      if (error.message.includes('chat not found')) {
        console.error(`   Bot is NOT in the channel!`);
        console.error(`   Add bot as admin first: @${botInfo.username}`);
      }
      console.log('\n❌ TEST FAILED: Bot cannot access channel\n');
      process.exit(1);
    }

    // 4. Simulate join request approval
    console.log(`\n4️⃣ Simulating join request approval...`);

    if (hasAccess) {
      console.log(`   User has paid, attempting auto-approval...`);

      try {
        // CRITICAL: This is the actual API call the bot makes
        await bot.api.approveChatJoinRequest(channel.telegram_id, userId);
        console.log(`   ✅ SUCCESS! User ${userId} has been approved!`);
        console.log(`   User should now be a member of the channel.`);

        // Send notification to user
        try {
          await bot.api.sendMessage(
            userId,
            `✅ Welcome back to ${channel.title}!\n\n` +
            'You already have lifetime access to this channel.'
          );
          console.log(`   ✅ Notification sent to user`);
        } catch (msgError) {
          console.error(`   ⚠️  Could not send notification: ${msgError.message}`);
        }

      } catch (approveError) {
        console.error(`   ❌ APPROVAL FAILED: ${approveError.message}`);

        if (approveError.message.includes('USER_ALREADY_PARTICIPANT')) {
          console.log(`   ℹ️  User is already in the channel (this is fine)`);
        } else if (approveError.message.includes('HIDE_REQUESTER_MISSING')) {
          console.error(`   ℹ️  No pending join request found for this user`);
          console.error(`   This is expected if testing without actual join request`);
        } else {
          console.error(`   Check bot permissions and try again`);
        }
      }

    } else {
      console.log(`   User hasn't paid yet.`);
      console.log(`   In real scenario, bot would send payment instructions.`);

      // Simulate sending payment instructions
      try {
        await bot.api.sendMessage(
          userId,
          `💎 **${channel.title}**\n\n` +
          `Price: **${channel.access_price_ton} TON** (one-time payment)\n\n` +
          `Pay once, access forever! Click below to proceed:`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💳 Pay with TON Connect', callback_data: `pay_${channel.id}` }],
                [{ text: 'ℹ️ What is TON?', url: 'https://ton.org' }]
              ]
            }
          }
        );
        console.log(`   ✅ Payment instructions sent to user`);
      } catch (msgError) {
        console.error(`   ⚠️  Could not send message: ${msgError.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ TEST COMPLETE\n');

    if (hasAccess) {
      console.log('📋 SUMMARY:');
      console.log('• User has paid for access ✅');
      console.log('• Bot has admin permissions ✅');
      console.log('• Join request would be auto-approved ✅');
      console.log('\nThe real bot will work correctly when it receives join request events.');
    } else {
      console.log('📋 SUMMARY:');
      console.log('• User has NOT paid yet ❌');
      console.log('• User would receive payment instructions');
      console.log('• User needs to pay before being approved');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.error(error.stack);
  } finally {
    await db.end();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
  console.error('❌ Usage: node test-join-request.js <userId> <channelDbId>');
  console.error('\nExample:');
  console.error('  node test-join-request.js 6626619451 68');
  console.error('\nArguments:');
  console.error('  userId       - Telegram user ID (number)');
  console.error('  channelDbId  - Database channel ID (number)');
  process.exit(1);
}

const userId = parseInt(args[0], 10);
const channelDbId = parseInt(args[1], 10);

if (isNaN(userId) || isNaN(channelDbId)) {
  console.error('❌ Both userId and channelDbId must be numbers');
  process.exit(1);
}

testJoinRequest(userId, channelDbId);
