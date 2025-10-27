#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration cache file
CACHE_FILE=".deploy-cache"

echo "======================================"
echo "TON Paywall - Simple Deployment"
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
echo -e "${GREEN}[1/8] Checking prerequisites...${NC}"

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
echo -e "${GREEN}[2/8] Configuration${NC}"
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

# Factory Contract (optional - can be set later)
echo ""
FACTORY_ADDRESS=$(ask_value "FACTORY_ADDRESS" "Factory Contract Address (leave empty if not deployed yet)" "" "false")

echo ""
echo -e "${GREEN}Configuration complete!${NC}"
echo ""

# ============================================================================
# STEP 3: Start PostgreSQL in Docker
# ============================================================================
echo -e "${GREEN}[3/8] Setting up PostgreSQL in Docker...${NC}"

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
echo -e "${GREEN}[4/8] Initializing database schema...${NC}"

# Copy schema to container and execute
docker cp shared/database-schema.sql ton-paywall-postgres:/tmp/schema.sql
docker exec ton-paywall-postgres psql -U tonpaywall -d ton_subscription_mvp -f /tmp/schema.sql

echo -e "${GREEN}Database schema initialized${NC}"
echo ""

# ============================================================================
# STEP 5: Create Environment Files
# ============================================================================
echo -e "${GREEN}[5/8] Creating environment configuration...${NC}"

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
# STEP 6: Install Dependencies
# ============================================================================
echo -e "${GREEN}[6/8] Installing dependencies...${NC}"

echo "Installing shared dependencies..."
npm install --quiet

echo "Installing admin-bot dependencies..."
cd admin-bot && npm install --quiet && cd ..

echo "Installing payment-bot dependencies..."
cd payment-bot && npm install --quiet && cd ..

echo "Installing contracts dependencies..."
cd contracts && npm install --quiet && cd ..

echo -e "${GREEN}Dependencies installed${NC}"
echo ""

# ============================================================================
# STEP 7: Build Projects
# ============================================================================
echo -e "${GREEN}[7/8] Building projects...${NC}"

echo "Building admin-bot..."
cd admin-bot && npm run build && cd ..

echo "Building payment-bot..."
cd payment-bot && npm run build && cd ..

echo "Building contracts..."
cd contracts && npm run build && cd ..

echo -e "${GREEN}Build complete${NC}"
echo ""

# ============================================================================
# STEP 8: Create Startup Scripts
# ============================================================================
echo -e "${GREEN}[8/8] Creating startup scripts...${NC}"

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
echo -e "${GREEN}Deployment Complete!${NC}"
echo "======================================"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. If Factory Contract not deployed yet:"
echo "   cd contracts"
echo "   TON_NETWORK=${TON_NETWORK} npm run deploy"
echo "   # Then update FACTORY_CONTRACT_ADDRESS in .env files"
echo ""
echo "2. Start the bots:"
echo "   ./start.sh"
echo ""
echo "3. Check status:"
echo "   ./status.sh"
echo ""
echo "4. View logs:"
echo "   tail -f logs/admin-bot.log"
echo "   tail -f logs/payment-bot.log"
echo ""
echo "5. Stop the bots:"
echo "   ./stop.sh"
echo ""
echo -e "${YELLOW}Database Information:${NC}"
echo "  Host: localhost"
echo "  Port: ${DB_PORT}"
echo "  Database: ton_subscription_mvp"
echo "  User: tonpaywall"
echo "  Password: [saved in .env]"
echo ""
echo -e "${YELLOW}Docker Commands:${NC}"
echo "  View PostgreSQL logs: docker logs ton-paywall-postgres"
echo "  Stop PostgreSQL: docker stop ton-paywall-postgres"
echo "  Start PostgreSQL: docker start ton-paywall-postgres"
echo "  Remove PostgreSQL: docker rm -f ton-paywall-postgres"
echo ""
echo -e "${GREEN}Configuration saved to: $CACHE_FILE${NC}"
echo -e "${GREEN}Run this script again to update configuration${NC}"
echo ""
