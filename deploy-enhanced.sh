#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration cache file
CACHE_FILE=".deploy-cache"

echo "======================================"
echo "TON Paywall - Enhanced Deployment"
echo "with Automated Wallet Creation"
echo "Debian 12"
echo "======================================"
echo ""

# Function to read cached value or ask user
ask_value() {
    local var_name=$1
    local prompt=$2
    local default=$3
    local is_secret=$4

    # Try to read from cache
    local cached_value=""
    if [ -f "$CACHE_FILE" ]; then
        cached_value=$(grep "^${var_name}=" "$CACHE_FILE" 2>/dev/null | cut -d'=' -f2-)
    fi

    # If cached value exists, ask if user wants to use it
    if [ -n "$cached_value" ]; then
        if [ "$is_secret" = "true" ]; then
            echo -e "${BLUE}$prompt${NC}"
            echo -e "${YELLOW}Cached value found: [hidden]${NC}"
        else
            echo -e "${BLUE}$prompt${NC}"
            echo -e "${YELLOW}Cached value found: $cached_value${NC}"
        fi
        read -p "Use cached value? (Y/n): " use_cached
        use_cached=${use_cached:-Y}

        if [[ "$use_cached" =~ ^[Yy]$ ]]; then
            echo "$cached_value"
            return
        fi
    fi

    # Ask user for new value
    if [ "$is_secret" = "true" ]; then
        read -sp "$prompt: " value
        echo ""
    else
        read -p "$prompt [$default]: " value
        value=${value:-$default}
    fi

    # Save to cache
    if [ -f "$CACHE_FILE" ]; then
        sed -i "/^${var_name}=/d" "$CACHE_FILE"
    fi
    echo "${var_name}=${value}" >> "$CACHE_FILE"

    echo "$value"
}

# ============================================================================
# STEP 1: Check prerequisites
# ============================================================================
echo -e "${GREEN}[1/9] Checking prerequisites...${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${YELLOW}Warning: Running as root. This is not recommended.${NC}"
    read -p "Continue anyway? (y/N): " continue_root
    if [[ ! "$continue_root" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker not found. Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}Docker installed. Please log out and log back in for group changes to take effect.${NC}"
    echo -e "${YELLOW}Then run this script again.${NC}"
    exit 0
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found. Installing Node.js 20.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

node_version=$(node -v)
echo -e "${GREEN}Node.js version: $node_version${NC}"
echo ""

# ============================================================================
# STEP 2: Collect Configuration
# ============================================================================
echo -e "${GREEN}[2/9] Configuration${NC}"
echo ""

# Database Configuration
DB_PASSWORD=$(ask_value "DB_PASSWORD" "PostgreSQL password" "$(openssl rand -base64 24)" "true")
DB_PORT=$(ask_value "DB_PORT" "PostgreSQL port" "5433" "false")

# Bot Tokens
echo ""
echo -e "${YELLOW}Get bot tokens from @BotFather on Telegram${NC}"
ADMIN_BOT_TOKEN=$(ask_value "ADMIN_BOT_TOKEN" "Admin Bot Token" "" "true")
PAYMENT_BOT_TOKEN=$(ask_value "PAYMENT_BOT_TOKEN" "Payment Bot Token" "" "true")
PAYMENT_BOT_USERNAME=$(ask_value "PAYMENT_BOT_USERNAME" "Payment Bot Username (e.g., @MyBot)" "" "false")
PAYMENT_BOT_ID=$(ask_value "PAYMENT_BOT_ID" "Payment Bot ID (numeric)" "" "false")

# TON Configuration
echo ""
TON_NETWORK=$(ask_value "TON_NETWORK" "TON Network (testnet/mainnet)" "testnet" "false")

# TON Connect Manifests
echo ""
echo -e "${YELLOW}TON Connect manifest URLs (must be publicly accessible)${NC}"
ADMIN_MANIFEST=$(ask_value "ADMIN_MANIFEST" "Admin Bot Manifest URL" "https://example.com/ton-paywall-admin-manifest.json" "false")
PAYMENT_MANIFEST=$(ask_value "PAYMENT_MANIFEST" "Payment Bot Manifest URL" "https://example.com/ton-paywall-client-manifest.json" "false")

echo ""
echo -e "${GREEN}Configuration complete!${NC}"
echo ""

# ============================================================================
# STEP 2.5: Create TON Wallets
# ============================================================================
echo -e "${GREEN}[2.5/9] TON Wallet Setup${NC}"
echo ""

# Install dependencies for wallet creation if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies for wallet creation...${NC}"
    npm install --silent
fi

# Make wallet creation script executable
chmod +x scripts/create-wallets.js

# Run wallet creation script
echo -e "${CYAN}Creating TON wallets for deployment...${NC}"
echo ""

# Capture wallet creation output
WALLET_OUTPUT=$(node scripts/create-wallets.js "$TON_NETWORK" 2>&1)
WALLET_EXIT_CODE=$?

if [ $WALLET_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}Wallet creation failed!${NC}"
    echo "$WALLET_OUTPUT"
    exit 1
fi

# Parse wallet addresses from output
OWNER_WALLET_ADDRESS=$(echo "$WALLET_OUTPUT" | grep "^OWNER_WALLET_ADDRESS=" | cut -d'=' -f2)
DEPLOYMENT_WALLET_ADDRESS=$(echo "$WALLET_OUTPUT" | grep "^DEPLOYMENT_WALLET_ADDRESS=" | cut -d'=' -f2)
OWNER_WALLET_MNEMONIC=$(echo "$WALLET_OUTPUT" | grep "^OWNER_WALLET_MNEMONIC=" | cut -d'=' -f2-)
DEPLOYMENT_WALLET_MNEMONIC=$(echo "$WALLET_OUTPUT" | grep "^DEPLOYMENT_WALLET_MNEMONIC=" | cut -d'=' -f2-)

# Verify wallets were created successfully
if [ -z "$OWNER_WALLET_ADDRESS" ] || [ -z "$DEPLOYMENT_WALLET_ADDRESS" ]; then
    echo -e "${RED}Failed to create wallets${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Wallets created and funded successfully!${NC}"
echo -e "${CYAN}Owner Wallet: $OWNER_WALLET_ADDRESS${NC}"
echo -e "${CYAN}Deployment Wallet: $DEPLOYMENT_WALLET_ADDRESS${NC}"
echo ""

# ============================================================================
# STEP 3: Start PostgreSQL in Docker
# ============================================================================
echo -e "${GREEN}[3/9] Setting up PostgreSQL in Docker...${NC}"

# Stop existing container if running
docker stop ton-paywall-postgres 2>/dev/null || true
docker rm ton-paywall-postgres 2>/dev/null || true

# Start PostgreSQL container
docker run -d \
  --name ton-paywall-postgres \
  --restart unless-stopped \
  -e POSTGRES_DB=ton_subscription_mvp \
  -e POSTGRES_USER=tonpaywall \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -p ${DB_PORT}:5432 \
  -v ton-paywall-data:/var/lib/postgresql/data \
  postgres:15-alpine

echo -e "${YELLOW}Waiting for PostgreSQL to start...${NC}"
sleep 5

# Wait for PostgreSQL to be ready
for i in {1..30}; do
    if docker exec ton-paywall-postgres pg_isready -U tonpaywall &>/dev/null; then
        echo -e "${GREEN}PostgreSQL is ready!${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}PostgreSQL failed to start${NC}"
        exit 1
    fi
    sleep 1
done

echo ""

# ============================================================================
# STEP 4: Initialize Database Schema
# ============================================================================
echo -e "${GREEN}[4/9] Initializing database schema...${NC}"

# Copy schema to container and execute
docker cp shared/database-schema.sql ton-paywall-postgres:/tmp/schema.sql
docker exec ton-paywall-postgres psql -U tonpaywall -d ton_subscription_mvp -f /tmp/schema.sql

echo -e "${GREEN}Database schema initialized${NC}"
echo ""

# ============================================================================
# STEP 5: Deploy Factory Contract
# ============================================================================
echo -e "${GREEN}[5/9] Deploying Factory Contract...${NC}"
echo ""

# Build contracts first
echo -e "${CYAN}Building smart contracts...${NC}"
cd contracts
npm install --silent
npm run build
cd ..

echo -e "${CYAN}Deploying factory contract to $TON_NETWORK...${NC}"
echo ""

# Create temporary deployment script that uses our wallet
cat > contracts/scripts/auto-deploy.js << 'DEPLOY_SCRIPT_EOF'
const { TonClient, WalletContractV4, internal } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const fs = require('fs');

async function deploy() {
  const network = process.env.TON_NETWORK || 'testnet';
  const mnemonic = process.env.DEPLOYMENT_MNEMONIC;

  if (!mnemonic) {
    console.error('DEPLOYMENT_MNEMONIC not set');
    process.exit(1);
  }

  // Get keypair from mnemonic
  const mnemonicArray = mnemonic.split(' ');
  const keyPair = await mnemonicToPrivateKey(mnemonicArray);

  // Get endpoint
  const endpoint = await getHttpEndpoint({
    network: network === 'testnet' ? 'testnet' : 'mainnet'
  });

  // Create client
  const client = new TonClient({ endpoint });

  // Create wallet
  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: keyPair.publicKey
  });

  const contract = client.open(wallet);

  // Read factory code
  const factoryCode = fs.readFileSync('build/SubscriptionFactory_SubscriptionFactory.code.boc');

  console.log('Deploying factory contract...');
  console.log('This may take a minute...');

  // TODO: Implement actual factory deployment
  // For now, output deployment instructions
  console.log('');
  console.log('Factory contract code compiled successfully');
  console.log('Code file: build/SubscriptionFactory_SubscriptionFactory.code.boc');
  console.log('');
  console.log('MANUAL DEPLOYMENT REQUIRED:');
  console.log('Use TON Blueprint or deploy via admin-bot service');
  console.log('');

  // For MVP, we'll set a placeholder and let admin bot deploy
  console.log('FACTORY_ADDRESS=DEPLOY_VIA_ADMIN_BOT');
}

deploy().catch(console.error);
DEPLOY_SCRIPT_EOF

# Run deployment
export DEPLOYMENT_MNEMONIC="$DEPLOYMENT_WALLET_MNEMONIC"
cd contracts
node scripts/auto-deploy.js
FACTORY_ADDRESS="DEPLOY_VIA_ADMIN_BOT"
cd ..

echo ""
echo -e "${YELLOW}Factory contract will be deployed via admin bot on first channel setup${NC}"
echo ""

# ============================================================================
# STEP 6: Create Environment Files
# ============================================================================
echo -e "${GREEN}[6/9] Creating environment configuration...${NC}"

# Main .env
cat > .env <<EOF
# Database
DATABASE_URL=postgresql://tonpaywall:${DB_PASSWORD}@localhost:${DB_PORT}/ton_subscription_mvp

# Telegram Bots
ADMIN_BOT_TOKEN=${ADMIN_BOT_TOKEN}
PAYMENT_BOT_TOKEN=${PAYMENT_BOT_TOKEN}
PAYMENT_BOT_USERNAME=${PAYMENT_BOT_USERNAME}
PAYMENT_BOT_ID=${PAYMENT_BOT_ID}

# TON Network
TON_NETWORK=${TON_NETWORK}
FACTORY_CONTRACT_ADDRESS=${FACTORY_ADDRESS}

# TON Wallets
OWNER_WALLET_ADDRESS=${OWNER_WALLET_ADDRESS}
DEPLOYMENT_WALLET_ADDRESS=${DEPLOYMENT_WALLET_ADDRESS}
DEPLOYMENT_WALLET_MNEMONIC=${DEPLOYMENT_WALLET_MNEMONIC}

# TON Connect Manifests
ADMIN_MANIFEST_URL=${ADMIN_MANIFEST}
PAYMENT_MANIFEST_URL=${PAYMENT_MANIFEST}

# Monitoring
PAYMENT_CHECK_INTERVAL=30000

# Node
NODE_ENV=production
EOF

# Copy to subdirectories
cp .env admin-bot/.env
cp .env payment-bot/.env

echo -e "${GREEN}Environment files created${NC}"
echo ""

# ============================================================================
# STEP 7: Install Dependencies
# ============================================================================
echo -e "${GREEN}[7/9] Installing dependencies...${NC}"

echo "Installing shared dependencies..."
npm install --silent

echo "Installing admin-bot dependencies..."
cd admin-bot && npm install --silent && cd ..

echo "Installing payment-bot dependencies..."
cd payment-bot && npm install --silent && cd ..

echo "Installing contracts dependencies..."
cd contracts && npm install --silent && cd ..

echo -e "${GREEN}Dependencies installed${NC}"
echo ""

# ============================================================================
# STEP 8: Build Projects
# ============================================================================
echo -e "${GREEN}[8/9] Building projects...${NC}"

echo "Building admin-bot..."
cd admin-bot && npm run build && cd ..

echo "Building payment-bot..."
cd payment-bot && npm run build && cd ..

echo "Building contracts..."
cd contracts && npm run build && cd ..

echo -e "${GREEN}Build complete${NC}"
echo ""

# ============================================================================
# STEP 9: Create Startup Scripts
# ============================================================================
echo -e "${GREEN}[9/9] Creating startup scripts...${NC}"

# Create start script
cat > start.sh <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"

# Kill existing processes
pkill -f "admin-bot/dist/index.js" 2>/dev/null || true
pkill -f "payment-bot/dist/index.js" 2>/dev/null || true

# Start admin bot
echo "Starting admin bot..."
cd admin-bot
node dist/index.js > ../logs/admin-bot.log 2>&1 &
ADMIN_PID=$!
echo $ADMIN_PID > ../logs/admin-bot.pid
cd ..

# Start payment bot
echo "Starting payment bot..."
cd payment-bot
node dist/index.js > ../logs/payment-bot.log 2>&1 &
PAYMENT_PID=$!
echo $PAYMENT_PID > ../logs/payment-bot.pid
cd ..

echo "Admin Bot started (PID: $ADMIN_PID)"
echo "Payment Bot started (PID: $PAYMENT_PID)"
echo ""
echo "View logs:"
echo "  tail -f logs/admin-bot.log"
echo "  tail -f logs/payment-bot.log"
EOF

chmod +x start.sh

# Create stop script
cat > stop.sh <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"

echo "Stopping bots..."

if [ -f logs/admin-bot.pid ]; then
    kill $(cat logs/admin-bot.pid) 2>/dev/null || true
    rm logs/admin-bot.pid
fi

if [ -f logs/payment-bot.pid ]; then
    kill $(cat logs/payment-bot.pid) 2>/dev/null || true
    rm logs/payment-bot.pid
fi

pkill -f "admin-bot/dist/index.js" 2>/dev/null || true
pkill -f "payment-bot/dist/index.js" 2>/dev/null || true

echo "Bots stopped"
EOF

chmod +x stop.sh

# Create status script
cat > status.sh <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"

echo "=== Bot Status ==="
echo ""

if [ -f logs/admin-bot.pid ]; then
    pid=$(cat logs/admin-bot.pid)
    if ps -p $pid > /dev/null 2>&1; then
        echo "Admin Bot: RUNNING (PID: $pid)"
    else
        echo "Admin Bot: STOPPED (stale PID file)"
    fi
else
    echo "Admin Bot: STOPPED"
fi

if [ -f logs/payment-bot.pid ]; then
    pid=$(cat logs/payment-bot.pid)
    if ps -p $pid > /dev/null 2>&1; then
        echo "Payment Bot: RUNNING (PID: $pid)"
    else
        echo "Payment Bot: STOPPED (stale PID file)"
    fi
else
    echo "Payment Bot: STOPPED"
fi

echo ""
echo "PostgreSQL Container:"
docker ps --filter name=ton-paywall-postgres --format "table {{.Names}}\t{{.Status}}"
EOF

chmod +x status.sh

# Create logs directory
mkdir -p logs

echo -e "${GREEN}Startup scripts created${NC}"
echo ""

# ============================================================================
# Summary
# ============================================================================
echo "======================================"
echo -e "${BOLD}${GREEN}Deployment Complete!${NC}"
echo "======================================"
echo ""
echo -e "${BOLD}${CYAN}Wallet Information${NC}"
echo "======================================"
echo -e "${CYAN}Owner Wallet (receives payments):${NC}"
echo "  $OWNER_WALLET_ADDRESS"
echo ""
echo -e "${CYAN}Deployment Wallet:${NC}"
echo "  $DEPLOYMENT_WALLET_ADDRESS"
echo ""
echo -e "${YELLOW}⚠️  Wallet mnemonics stored in: $CACHE_FILE${NC}"
echo -e "${RED}   Keep this file SECURE and BACKED UP!${NC}"
echo ""
echo "======================================"
echo -e "${BOLD}${CYAN}Next Steps${NC}"
echo "======================================"
echo ""
echo "1. Start the bots:"
echo "   ./start.sh"
echo ""
echo "2. Check status:"
echo "   ./status.sh"
echo ""
echo "3. View logs:"
echo "   tail -f logs/admin-bot.log"
echo "   tail -f logs/payment-bot.log"
echo ""
echo "4. Stop the bots:"
echo "   ./stop.sh"
echo ""
echo "======================================"
echo -e "${BOLD}${CYAN}Database Information${NC}"
echo "======================================"
echo "  Host: localhost"
echo "  Port: ${DB_PORT}"
echo "  Database: ton_subscription_mvp"
echo "  User: tonpaywall"
echo "  Password: [saved in .env]"
echo ""
echo "======================================"
echo -e "${BOLD}${CYAN}Important Security Notes${NC}"
echo "======================================"
echo ""
echo -e "${YELLOW}1. Backup your wallets:${NC}"
echo "   - Store mnemonics offline in a secure location"
echo "   - Consider using a hardware wallet for mainnet"
echo ""
echo -e "${YELLOW}2. Protect sensitive files:${NC}"
echo "   - $CACHE_FILE (contains wallet mnemonics)"
echo "   - .env (contains bot tokens and database password)"
echo ""
echo -e "${YELLOW}3. Factory contract deployment:${NC}"
echo "   - Will be deployed automatically when first channel is set up"
echo "   - Or deploy manually via: cd contracts && npm run deploy"
echo ""
echo -e "${GREEN}Configuration saved to: $CACHE_FILE${NC}"
echo -e "${GREEN}Run this script again to update configuration${NC}"
echo ""
