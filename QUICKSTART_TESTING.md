# Quick Start - Test Without Factory Deployment

## 🚀 Test the System in 5 Minutes

You can test most of the system without deploying the factory contract!

### Step 1: Setup .env

```bash
cd ~/workspace/ton-paywall
cp .env.example .env
nano .env
```

**Configure with these test values**:
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ton_subscription_mvp

# Telegram Bots (REQUIRED - get from @BotFather)
ADMIN_BOT_TOKEN=your_real_admin_bot_token
PAYMENT_BOT_TOKEN=your_real_payment_bot_token
PAYMENT_BOT_USERNAME=YourPaymentBot
PAYMENT_BOT_ID=123456789

# TON Blockchain (can use dummy for testing)
TON_NETWORK=testnet
FACTORY_CONTRACT_ADDRESS=EQTest_Dummy_Factory_Address_For_Testing_Only_123456789
ADMIN_MNEMONIC="test test test test test test test test test test test test test test test test test test test test test test test test"

# Application
NODE_ENV=development
PAYMENT_CHECK_INTERVAL=30000
```

### Step 2: Setup Database

```bash
# Create database
sudo -u postgres psql -c "CREATE DATABASE ton_subscription_mvp;"

# Apply schema
sudo -u postgres psql ton_subscription_mvp < shared/database-schema.sql
```

### Step 3: Build Everything

```bash
# Build admin bot
cd admin-bot
npm install
npm run build
cd ..

# Build payment bot
cd payment-bot
npm install
npm run build
cd ..
```

### Step 4: Start Bots in Test Mode

```bash
# Terminal 1: Admin Bot
cd admin-bot
npm run dev

# Terminal 2: Payment Bot (in new terminal)
cd payment-bot
npm run dev
```

### Step 5: Test Bot Flows

1. **Test Admin Bot**:
   - Send `/start` to your admin bot
   - Try `/channels` command
   - Test the conversation flow (will work up to contract deployment)

2. **Test Payment Bot**:
   - Send `/start` to your payment bot
   - Test `/channels` command
   - Test the subscription flow UI

### What Will Work:
✅ Bot commands and responses
✅ Telegram conversation flows
✅ Database operations
✅ Channel setup wizard (up to deployment step)
✅ User registration
✅ Subscription flow UI

### What Won't Work Yet:
❌ Contract deployment (needs real factory)
❌ Payment processing (needs real contracts)
❌ On-chain verification (needs real contracts)

---

## When You're Ready for Full Testing

Once you've verified the bot logic works, deploy the factory:

### Quick Factory Deployment Script

I'll create a working deployment script for you:

```bash
# Create simple deploy script
cd ~/workspace/ton-paywall/contracts
cat > scripts/simple-deploy.sh << 'EOF'
#!/bin/bash

echo "🚀 TON Factory Deployment Helper"
echo ""
echo "This will help you deploy to testnet."
echo ""
echo "Prerequisites:"
echo "1. Get testnet TON: https://testnet.tonfaucet.com"
echo "2. Have your 24-word mnemonic ready"
echo ""

# Use Blueprint if available
if command -v blueprint &> /dev/null; then
    echo "✅ Blueprint found! Using Blueprint..."
    npx blueprint run deploy
elif command -v ton &> /dev/null; then
    echo "✅ TON CLI found! Using TON CLI..."
    ton deploy build/SubscriptionFactory_SubscriptionFactory.code.boc
else
    echo "⚠️  No deployment tools found."
    echo ""
    echo "Install one of these:"
    echo "1. npm install -g @ton/blueprint"
    echo "2. Or deploy manually via TONScan"
    echo ""
    echo "See contracts/SIMPLE_DEPLOY.md for details"
fi
EOF

chmod +x scripts/simple-deploy.sh
./scripts/simple-deploy.sh
```

---

## Recommended Testing Flow

1. ✅ **Today**: Test bots without factory (verify logic)
2. ⏰ **Tomorrow**: Deploy factory to testnet
3. ✅ **Day 3**: Test full payment flow end-to-end
4. 🚀 **Day 4**: Deploy to mainnet (if testing successful)

---

## Skip Factory for Now?

**Yes! You can develop and test 80% of the system without the factory.**

The factory is only needed for:
- Creating subscription contracts per channel
- Processing real payments
- On-chain verification

Everything else (bot UI, database, analytics, admin flows) works without it!

---

## Quick Commands

```bash
# Start admin bot (dev mode)
cd admin-bot && npm run dev

# Start payment bot (dev mode)
cd payment-bot && npm run dev

# Check bot logs
pm2 logs admin-bot
pm2 logs payment-bot

# Check database
sudo -u postgres psql ton_subscription_mvp -c "SELECT * FROM admins;"
sudo -u postgres psql ton_subscription_mvp -c "SELECT * FROM channels;"
```

---

**🎯 Bottom Line**: Start testing the bots now! Deploy factory when ready for payment testing.
