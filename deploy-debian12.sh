#!/bin/bash
set -e  # Exit on error

echo "======================================"
echo "TON Paywall Deployment Script"
echo "Debian 12 (Bookworm)"
echo "======================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo)${NC}"
    exit 1
fi

# Get the real user (not root)
REAL_USER=${SUDO_USER:-$USER}
REAL_HOME=$(eval echo ~$REAL_USER)

echo -e "${GREEN}Running as root, deploying for user: $REAL_USER${NC}"
echo ""

# ============================================================================
# STEP 1: Update System
# ============================================================================
echo -e "${YELLOW}[1/10] Updating system packages...${NC}"
apt-get update
apt-get upgrade -y

# ============================================================================
# STEP 2: Install Node.js 20.x
# ============================================================================
echo -e "${YELLOW}[2/10] Installing Node.js 20.x...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

node_version=$(node -v)
echo -e "${GREEN}Node.js installed: $node_version${NC}"

# ============================================================================
# STEP 3: Install PostgreSQL 15
# ============================================================================
echo -e "${YELLOW}[3/10] Installing PostgreSQL 15...${NC}"
if ! command -v psql &> /dev/null; then
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
fi

echo -e "${GREEN}PostgreSQL installed${NC}"

# ============================================================================
# STEP 4: Install PM2 (Process Manager)
# ============================================================================
echo -e "${YELLOW}[4/10] Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    # Setup PM2 startup script
    env PATH=$PATH:/usr/bin pm2 startup systemd -u $REAL_USER --hp $REAL_HOME
fi

echo -e "${GREEN}PM2 installed${NC}"

# ============================================================================
# STEP 5: Install other dependencies
# ============================================================================
echo -e "${YELLOW}[5/10] Installing additional dependencies...${NC}"
apt-get install -y git curl build-essential python3

# ============================================================================
# STEP 6: Setup Database
# ============================================================================
echo -e "${YELLOW}[6/10] Setting up PostgreSQL database...${NC}"

# Generate secure password if not provided
DB_PASSWORD=${DB_PASSWORD:-$(openssl rand -base64 32)}

# Create database and user
sudo -u postgres psql <<EOF
-- Create user if not exists
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE username = 'tonpaywall') THEN
        CREATE USER tonpaywall WITH PASSWORD '$DB_PASSWORD';
    END IF;
END
\$\$;

-- Create database if not exists
SELECT 'CREATE DATABASE ton_subscription_mvp OWNER tonpaywall'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ton_subscription_mvp')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ton_subscription_mvp TO tonpaywall;
EOF

echo -e "${GREEN}Database created${NC}"
echo -e "${YELLOW}Database Password: $DB_PASSWORD${NC}"
echo -e "${YELLOW}Save this password! It will be needed for .env configuration${NC}"

# Wait for confirmation
read -p "Press Enter to continue..."

# ============================================================================
# STEP 7: Clone/Setup Project
# ============================================================================
echo -e "${YELLOW}[7/10] Setting up project files...${NC}"

PROJECT_DIR="/opt/ton-paywall"

# Check if already exists
if [ -d "$PROJECT_DIR" ]; then
    echo -e "${YELLOW}Project directory exists. Backing up...${NC}"
    mv "$PROJECT_DIR" "$PROJECT_DIR.backup.$(date +%Y%m%d_%H%M%S)"
fi

# If user already has the project
if [ -d "$REAL_HOME/workspace/ton-paywall" ]; then
    echo -e "${GREEN}Copying existing project from $REAL_HOME/workspace/ton-paywall${NC}"
    cp -r "$REAL_HOME/workspace/ton-paywall" "$PROJECT_DIR"
else
    echo -e "${RED}Project not found at $REAL_HOME/workspace/ton-paywall${NC}"
    echo "Please ensure the project is available before running this script"
    exit 1
fi

chown -R $REAL_USER:$REAL_USER "$PROJECT_DIR"

# ============================================================================
# STEP 8: Configure Environment Variables
# ============================================================================
echo -e "${YELLOW}[8/10] Configuring environment variables...${NC}"

echo ""
echo -e "${YELLOW}Please provide the following configuration:${NC}"
echo ""

# Get configuration from user
read -p "Admin Bot Token (from @BotFather): " ADMIN_BOT_TOKEN
read -p "Payment Bot Token (from @BotFather): " PAYMENT_BOT_TOKEN
read -p "Payment Bot Username (e.g., @YourBot): " PAYMENT_BOT_USERNAME
read -p "Payment Bot ID: " PAYMENT_BOT_ID
read -p "TON Network (testnet/mainnet) [testnet]: " TON_NETWORK
TON_NETWORK=${TON_NETWORK:-testnet}

# Create .env file
cat > "$PROJECT_DIR/.env" <<EOF
# Database Configuration
DATABASE_URL=postgresql://tonpaywall:$DB_PASSWORD@localhost:5432/ton_subscription_mvp

# Telegram Bot Tokens
ADMIN_BOT_TOKEN=$ADMIN_BOT_TOKEN
PAYMENT_BOT_TOKEN=$PAYMENT_BOT_TOKEN
PAYMENT_BOT_USERNAME=$PAYMENT_BOT_USERNAME
PAYMENT_BOT_ID=$PAYMENT_BOT_ID

# TON Blockchain Configuration
TON_NETWORK=$TON_NETWORK
FACTORY_CONTRACT_ADDRESS=

# Payment Monitoring
PAYMENT_CHECK_INTERVAL=30000

# Node Environment
NODE_ENV=production
EOF

# Copy .env to subdirectories
cp "$PROJECT_DIR/.env" "$PROJECT_DIR/admin-bot/"
cp "$PROJECT_DIR/.env" "$PROJECT_DIR/payment-bot/"

chown $REAL_USER:$REAL_USER "$PROJECT_DIR/.env"
chown $REAL_USER:$REAL_USER "$PROJECT_DIR/admin-bot/.env"
chown $REAL_USER:$REAL_USER "$PROJECT_DIR/payment-bot/.env"

echo -e "${GREEN}Environment variables configured${NC}"

# ============================================================================
# STEP 9: Install Dependencies and Build
# ============================================================================
echo -e "${YELLOW}[9/10] Installing dependencies and building project...${NC}"

cd "$PROJECT_DIR"

# Install dependencies for all packages
echo "Installing shared dependencies..."
sudo -u $REAL_USER npm install

echo "Installing admin-bot dependencies..."
cd "$PROJECT_DIR/admin-bot"
sudo -u $REAL_USER npm install

echo "Installing payment-bot dependencies..."
cd "$PROJECT_DIR/payment-bot"
sudo -u $REAL_USER npm install

echo "Installing contracts dependencies..."
cd "$PROJECT_DIR/contracts"
sudo -u $REAL_USER npm install

# Build TypeScript
echo "Building admin-bot..."
cd "$PROJECT_DIR/admin-bot"
sudo -u $REAL_USER npm run build

echo "Building payment-bot..."
cd "$PROJECT_DIR/payment-bot"
sudo -u $REAL_USER npm run build

echo "Building contracts..."
cd "$PROJECT_DIR/contracts"
sudo -u $REAL_USER npm run build

echo -e "${GREEN}Build completed${NC}"

# ============================================================================
# STEP 10: Initialize Database Schema
# ============================================================================
echo -e "${YELLOW}[10/10] Initializing database schema...${NC}"

cd "$PROJECT_DIR"

# Run database migration
PGPASSWORD=$DB_PASSWORD psql -h localhost -U tonpaywall -d ton_subscription_mvp < shared/database-schema.sql

echo -e "${GREEN}Database schema initialized${NC}"

# ============================================================================
# Post-Installation Instructions
# ============================================================================
echo ""
echo "======================================"
echo -e "${GREEN}Installation Complete!${NC}"
echo "======================================"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo ""
echo "1. Deploy Factory Contract:"
echo "   cd $PROJECT_DIR/contracts"
echo "   TON_NETWORK=$TON_NETWORK npm run deploy"
echo ""
echo "2. Update FACTORY_CONTRACT_ADDRESS in .env files:"
echo "   nano $PROJECT_DIR/.env"
echo "   nano $PROJECT_DIR/admin-bot/.env"
echo "   nano $PROJECT_DIR/payment-bot/.env"
echo ""
echo "3. Start the bots with PM2:"
echo "   cd $PROJECT_DIR"
echo "   pm2 start admin-bot/dist/index.js --name admin-bot"
echo "   pm2 start payment-bot/dist/index.js --name payment-bot"
echo ""
echo "4. Save PM2 configuration:"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "5. Monitor the bots:"
echo "   pm2 monit"
echo "   pm2 logs admin-bot"
echo "   pm2 logs payment-bot"
echo ""
echo -e "${YELLOW}IMPORTANT FILES:${NC}"
echo "  - Project Directory: $PROJECT_DIR"
echo "  - Configuration: $PROJECT_DIR/.env"
echo "  - Database: postgresql://localhost:5432/ton_subscription_mvp"
echo "  - Database User: tonpaywall"
echo "  - Database Password: $DB_PASSWORD"
echo ""
echo -e "${YELLOW}SECURITY REMINDERS:${NC}"
echo "  - Keep your .env files secure (they contain bot tokens)"
echo "  - Save the database password in a secure location"
echo "  - Configure firewall (ufw) to restrict access"
echo "  - Setup SSL/TLS for production"
echo ""
echo -e "${GREEN}Deployment script completed successfully!${NC}"
