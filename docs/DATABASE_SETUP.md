# PostgreSQL Database Setup Guide

## Issue: Peer Authentication Error

You're seeing this error:
```
psql: ошибка: подключиться к серверу через сокет "/var/run/postgresql/.s.PGSQL.5433" не удалось:
ВАЖНО: пользователь "postgres" не прошёл проверку подлинности (Peer)
```

This happens because PostgreSQL is using "peer" authentication, which requires your system username to match the database username.

## Quick Setup (Automated)

Run the automated setup script:

```bash
cd /home/gmet/workspace/ton-paywall
./setup-database.sh
```

This script will:
1. Create database user `tonpaywall`
2. Create database `ton_subscription_mvp`
3. Set secure password
4. Grant all privileges
5. Apply database schema
6. Update `.env` file with connection string

**That's it!** The script handles everything automatically.

## Manual Setup (If Automated Fails)

### Method 1: Using sudo with postgres user

```bash
# Switch to postgres user and create database
sudo -u postgres psql -p 5433

# In psql prompt:
CREATE USER tonpaywall WITH PASSWORD 'your_secure_password';
CREATE DATABASE ton_subscription_mvp OWNER tonpaywall;
GRANT ALL PRIVILEGES ON DATABASE ton_subscription_mvp TO tonpaywall;

# Exit psql
\q
```

### Method 2: Configure Password Authentication

1. **Edit PostgreSQL config:**
```bash
sudo nano /etc/postgresql/17/main/pg_hba.conf
```

2. **Find this line:**
```
local   all             postgres                                peer
```

3. **Change to:**
```
local   all             postgres                                md5
```

4. **Restart PostgreSQL:**
```bash
sudo systemctl restart postgresql
```

5. **Set postgres password:**
```bash
sudo -u postgres psql -p 5433
ALTER USER postgres WITH PASSWORD 'your_password';
\q
```

## Apply Database Schema

After creating the database:

```bash
# Using the tonpaywall user
PGPASSWORD='your_password' psql -h localhost -p 5433 -U tonpaywall -d ton_subscription_mvp -f shared/database-schema.sql
```

## Update .env File

Edit your `.env` file:

```bash
DATABASE_URL=postgresql://tonpaywall:your_password@localhost:5433/ton_subscription_mvp
```

## Verify Setup

```bash
# Test connection
PGPASSWORD='your_password' psql -h localhost -p 5433 -U tonpaywall -d ton_subscription_mvp -c "\dt"
```

You should see 7 tables:
- admins
- channels
- subscribers
- subscriptions
- payments
- setup_progress
- analytics_summary

## Troubleshooting

### Port 5433 Instead of 5432

PostgreSQL 17 is running on port 5433. This is normal if you have multiple PostgreSQL versions installed.

To check:
```bash
sudo systemctl status postgresql
sudo pg_lsclusters
```

### Connection Refused

Make sure PostgreSQL is running:
```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql  # Start on boot
```

### Permission Denied

If you get permission errors after creating tables:
```bash
# Grant all privileges
sudo -u postgres psql -p 5433 -d ton_subscription_mvp
GRANT ALL ON SCHEMA public TO tonpaywall;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tonpaywall;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tonpaywall;
\q
```

### Schema Already Exists

If schema was partially applied:
```bash
# Drop and recreate database
sudo -u postgres psql -p 5433
DROP DATABASE ton_subscription_mvp;
CREATE DATABASE ton_subscription_mvp OWNER tonpaywall;
\q

# Reapply schema
PGPASSWORD='your_password' psql -h localhost -p 5433 -U tonpaywall -d ton_subscription_mvp -f shared/database-schema.sql
```

## PostgreSQL Basics

### Connect to Database
```bash
PGPASSWORD='your_password' psql -h localhost -p 5433 -U tonpaywall -d ton_subscription_mvp
```

### Useful Commands
```sql
\dt                          -- List tables
\d table_name                -- Describe table
\l                           -- List databases
\du                          -- List users
\q                           -- Quit

-- View data
SELECT * FROM admins;
SELECT * FROM channels;
SELECT * FROM subscriptions;

-- Count records
SELECT COUNT(*) FROM subscribers;
```

### Backup Database
```bash
PGPASSWORD='your_password' pg_dump -h localhost -p 5433 -U tonpaywall ton_subscription_mvp > backup.sql
```

### Restore Database
```bash
PGPASSWORD='your_password' psql -h localhost -p 5433 -U tonpaywall ton_subscription_mvp < backup.sql
```

## Security Best Practices

1. **Use Strong Passwords**
   ```bash
   # Generate secure password
   openssl rand -base64 32
   ```

2. **Restrict Permissions**
   ```bash
   chmod 600 .env  # Only owner can read
   ```

3. **Configure pg_hba.conf**
   ```
   # Local connections use password
   local   all   tonpaywall   md5

   # Remote connections (if needed)
   host    ton_subscription_mvp   tonpaywall   127.0.0.1/32   md5
   ```

4. **Firewall Rules**
   ```bash
   # PostgreSQL should only listen on localhost for development
   sudo ufw status
   ```

## Environment Variables

Your `.env` should contain:

```bash
# Database (PostgreSQL 17 on port 5433)
DATABASE_URL=postgresql://tonpaywall:your_password@localhost:5433/ton_subscription_mvp

# Telegram Bots
ADMIN_BOT_TOKEN=your_admin_bot_token
PAYMENT_BOT_TOKEN=your_payment_bot_token
PAYMENT_BOT_USERNAME=YourPaymentBot
PAYMENT_BOT_ID=1234567890

# TON Blockchain
TON_NETWORK=testnet
FACTORY_CONTRACT_ADDRESS=EQC...

# Application
NODE_ENV=development
LOG_LEVEL=info
PORT_ADMIN_BOT=3001
PORT_PAYMENT_BOT=3002
```

## Next Steps

After database is configured:

1. **Deploy Smart Contracts**
   ```bash
   cd contracts
   npm install
   npm run build
   npm run deploy:testnet
   # Save factory address to .env
   ```

2. **Start Admin Bot**
   ```bash
   cd admin-bot
   npm install
   npm run dev
   ```

3. **Start Payment Bot**
   ```bash
   cd payment-bot
   npm install
   npm run dev
   ```

## Common Issues

### "database does not exist"
Run the setup script or create database manually (see Method 1 above)

### "role does not exist"
Create the user first (see Method 1 above)

### "password authentication failed"
Check your password in .env matches what you set

### "too many connections"
PostgreSQL has connection limits. Check:
```sql
SHOW max_connections;
SELECT COUNT(*) FROM pg_stat_activity;
```

## Support

If you continue having issues:
1. Check PostgreSQL logs: `sudo tail -f /var/log/postgresql/postgresql-17-main.log`
2. Verify PostgreSQL is running: `sudo systemctl status postgresql`
3. Check port: `sudo netstat -tlnp | grep 5433`
4. Review this guide carefully
5. Create a GitHub issue with error details

---

**Quick Reference:**
- Database: `ton_subscription_mvp`
- User: `tonpaywall`
- Port: `5433` (not 5432!)
- Connection: Use password authentication (`md5` or `scram-sha-256`)
