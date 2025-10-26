#!/bin/bash

echo "=== TON Subscription Bot MVP Deployment ==="

# Check environment
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    echo "Please copy .env.example to .env and configure it"
    exit 1
fi

# Load environment variables
source .env

# Install dependencies
echo "📦 Installing dependencies..."
npm install
npm install --workspaces

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Setup database
echo "🗄️  Setting up PostgreSQL database..."
if command -v psql &> /dev/null; then
    echo "Creating database and schema..."
    psql $DATABASE_URL < shared/database-schema.sql || echo "Database might already exist"
else
    echo "⚠️  psql not found. Please run the database schema manually:"
    echo "   psql \$DATABASE_URL < shared/database-schema.sql"
fi

# Deploy factory contract
echo "🚀 Deploying factory contract to TON..."
cd contracts
npm run build
echo "⚠️  Manual step required: Deploy factory contract"
echo "   Run: npm run deploy"
echo "   Then update FACTORY_CONTRACT_ADDRESS in .env"
cd ..

# Start services with PM2 (if installed)
if command -v pm2 &> /dev/null; then
    echo "🚀 Starting services with PM2..."

    # Admin bot
    pm2 start admin-bot/dist/index.js --name ton-paywall-admin

    # Payment bot
    pm2 start payment-bot/dist/index.js --name ton-paywall-payment

    # Save PM2 configuration
    pm2 save
    pm2 startup

    echo "✅ Services started with PM2"
else
    echo "⚠️  PM2 not found. Install with: npm install -g pm2"
    echo "   Or start manually:"
    echo "   cd admin-bot && npm start &"
    echo "   cd payment-bot && npm start &"
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "📋 Next steps:"
echo "1. ✅ Install dependencies"
echo "2. ✅ Build TypeScript"
echo "3. ⏳ Deploy factory contract (npm run deploy in contracts/)"
echo "4. ⏳ Update FACTORY_CONTRACT_ADDRESS in .env"
echo "5. ⏳ Start bots (pm2 or npm start)"
echo ""
echo "📊 Monitor:"
echo "   pm2 logs ton-paywall-admin"
echo "   pm2 logs ton-paywall-payment"
echo ""
echo "🔗 Bot links:"
echo "   Admin Bot: https://t.me/\${ADMIN_BOT_USERNAME}"
echo "   Payment Bot: https://t.me/\${PAYMENT_BOT_USERNAME}"
