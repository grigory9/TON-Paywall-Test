# Deployment Guide

Complete guide for deploying the TON Subscription Paywall system.

## Pre-Deployment Checklist

- [ ] Node.js 18+ installed
- [ ] PostgreSQL 15+ installed and running
- [ ] Two Telegram bots created via @BotFather
- [ ] TON wallet with sufficient balance for gas fees
- [ ] Domain/server for hosting (optional for production)

## Step-by-Step Deployment

### 1. Server Setup

#### Ubuntu/Debian

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install PM2 (process manager)
sudo npm install -g pm2

# Install build tools
sudo apt install -y build-essential
```

#### macOS

```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node@18

# Install PostgreSQL
brew install postgresql@15
brew services start postgresql@15

# Install PM2
npm install -g pm2
```

### 2. Database Setup

```bash
# Create database user
sudo -u postgres psql -c "CREATE USER tonpaywall WITH PASSWORD 'your_secure_password';"

# Create database
sudo -u postgres psql -c "CREATE DATABASE ton_subscription_mvp OWNER tonpaywall;"

# Grant privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ton_subscription_mvp TO tonpaywall;"
```

### 3. Clone and Configure

```bash
# Clone repository
git clone <your-repo-url>
cd ton-paywall

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env  # Edit with your values
```

### 4. Environment Configuration

Edit `.env` with your actual values:

```bash
# Database
DATABASE_URL=postgresql://tonpaywall:your_secure_password@localhost:5432/ton_subscription_mvp

# Telegram Bots
ADMIN_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
PAYMENT_BOT_TOKEN=987654321:ZYXwvuTSRqponMLKjihGFEdcba
PAYMENT_BOT_USERNAME=YourPaymentBot
PAYMENT_BOT_ID=987654321

# TON Blockchain
TON_NETWORK=mainnet  # or testnet for testing
FACTORY_CONTRACT_ADDRESS=EQC...  # Will be filled after deployment
```

### 5. Database Schema

```bash
# Apply schema
psql $DATABASE_URL < shared/database-schema.sql

# Verify tables created
psql $DATABASE_URL -c "\dt"
```

Expected output:
```
 Schema |        Name         | Type  |   Owner
--------+---------------------+-------+-------------
 public | admins              | table | tonpaywall
 public | analytics_summary   | table | tonpaywall
 public | channels            | table | tonpaywall
 public | payments            | table | tonpaywall
 public | setup_progress      | table | tonpaywall
 public | subscribers         | table | tonpaywall
 public | subscriptions       | table | tonpaywall
```

### 6. Smart Contract Deployment

```bash
cd contracts

# Install dependencies
npm install

# Build contracts
npm run build

# Deploy to testnet first (recommended)
TON_NETWORK=testnet npm run deploy

# Follow prompts to deploy
# Save the factory address!
```

After successful deployment:

```bash
# Update .env with factory address
echo "FACTORY_CONTRACT_ADDRESS=EQC..." >> ../.env
```

### 7. Build Bots

```bash
cd ../admin-bot
npm install
npm run build

cd ../payment-bot
npm install
npm run build

cd ..
```

### 8. Start Services

#### Option A: Using PM2 (Recommended for Production)

```bash
# Start admin bot
pm2 start admin-bot/dist/index.js --name ton-paywall-admin

# Start payment bot
pm2 start payment-bot/dist/index.js --name ton-paywall-payment

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup

# Monitor
pm2 monit
```

#### Option B: Using systemd

Create service files:

```bash
sudo nano /etc/systemd/system/ton-paywall-admin.service
```

```ini
[Unit]
Description=TON Paywall Admin Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/ton-paywall/admin-bot
ExecStart=/usr/bin/node dist/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo nano /etc/systemd/system/ton-paywall-payment.service
```

```ini
[Unit]
Description=TON Paywall Payment Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/ton-paywall/payment-bot
ExecStart=/usr/bin/node dist/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable ton-paywall-admin
sudo systemctl enable ton-paywall-payment
sudo systemctl start ton-paywall-admin
sudo systemctl start ton-paywall-payment

# Check status
sudo systemctl status ton-paywall-admin
sudo systemctl status ton-paywall-payment
```

### 9. Verify Deployment

```bash
# Check admin bot
pm2 logs ton-paywall-admin --lines 50

# Check payment bot
pm2 logs ton-paywall-payment --lines 50

# Test admin bot
# Send /start to your admin bot in Telegram

# Test payment bot
# Send /start to your payment bot in Telegram
```

### 10. Configure Telegram Bots

Set bot commands via @BotFather:

**Admin Bot:**
```
start - Start the bot
setup - Setup a new channel
channels - View your channels
analytics - View analytics
help - Get help
```

**Payment Bot:**
```
start - Start the bot
channels - Browse channels
subscriptions - My subscriptions
help - Get help
```

## Production Considerations

### Security

1. **Firewall Configuration**
```bash
sudo ufw allow 22/tcp  # SSH
sudo ufw enable
```

2. **Database Security**
```bash
# Edit PostgreSQL config
sudo nano /etc/postgresql/15/main/pg_hba.conf

# Ensure local connections use password
local   all   tonpaywall   md5
```

3. **Environment Variables**
```bash
# Ensure .env has restricted permissions
chmod 600 .env
```

### Monitoring

1. **Setup PM2 Monitoring**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

2. **Database Backups**
```bash
# Create backup script
cat > /usr/local/bin/backup-tonpaywall.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/var/backups/tonpaywall
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
pg_dump ton_subscription_mvp | gzip > $BACKUP_DIR/backup_$DATE.sql.gz
# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
EOF

chmod +x /usr/local/bin/backup-tonpaywall.sh

# Add to cron (daily at 2 AM)
crontab -e
# Add line:
0 2 * * * /usr/local/bin/backup-tonpaywall.sh
```

### Scaling

1. **Database Connection Pool**
Edit bot code to increase pool size:
```typescript
const db = new Pool({
  connectionString: dbUrl,
  max: 20,  // Increase for production
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

2. **Multiple Bot Instances**
For high traffic, run multiple instances:
```bash
pm2 start payment-bot/dist/index.js -i 2 --name payment-bot
```

## Updating

```bash
# Pull latest changes
git pull

# Update dependencies
npm install

# Rebuild
npm run build

# Restart services
pm2 restart all
```

## Troubleshooting

### Bots Not Starting

Check logs:
```bash
pm2 logs --lines 100
```

Common issues:
- Missing environment variables
- Database connection failure
- Invalid bot tokens

### Database Issues

Test connection:
```bash
psql $DATABASE_URL -c "SELECT 1;"
```

Check logs:
```bash
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

### Contract Deployment Fails

1. Check wallet balance
2. Verify network configuration
3. Check mnemonic phrase
4. Try testnet first

### Payment Monitoring Not Working

1. Check TON network connectivity
2. Verify factory contract address
3. Check subscription contract deployment
4. Review payment bot logs

## Rollback

If deployment fails:

```bash
# Stop services
pm2 stop all

# Restore database backup
gunzip < /var/backups/tonpaywall/backup_YYYYMMDD_HHMMSS.sql.gz | psql $DATABASE_URL

# Checkout previous version
git checkout <previous-commit>

# Rebuild and restart
npm run build
pm2 restart all
```

## Support

- Check logs first: `pm2 logs`
- Review documentation
- Create GitHub issue
- Contact support: @YourSupportGroup

---

For development deployment, see [DEVELOPMENT.md](./DEVELOPMENT.md)
