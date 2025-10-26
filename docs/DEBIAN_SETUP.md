# Debian Fresh Install Setup Guide

## Issue: User Not in Sudoers

You're seeing:
```
gmet отсутствует в файле sudoers
```

This means your user `gmet` doesn't have sudo privileges on the fresh Debian installation.

## Solution 1: Add User to Sudoers (Recommended)

You need to login as **root** to add yourself to sudoers.

### Step 1: Login as Root

In your terminal:
```bash
su -
# Enter root password when prompted
```

### Step 2: Add Your User to Sudo Group

```bash
# Add gmet to sudo group
usermod -aG sudo gmet

# Verify
groups gmet
# Should show: gmet : gmet sudo ...
```

### Step 3: Logout and Login Again

```bash
exit  # Exit root shell
exit  # Logout from current session
# Login again as gmet
```

### Step 4: Test Sudo Access

```bash
sudo whoami
# Should output: root
```

### Step 5: Run Database Setup

```bash
cd /home/gmet/workspace/ton-paywall
./setup-database.sh
```

## Solution 2: Setup Database as Root (Alternative)

If you can't logout/login, run setup as root directly:

### Step 1: Login as Root

```bash
su -
# Enter root password
```

### Step 2: Navigate to Project

```bash
cd /home/gmet/workspace/ton-paywall
```

### Step 3: Run Setup Script

```bash
./setup-database-root.sh
```

## Solution 3: Manual Database Setup (No Sudo Required)

If you have the root password, you can setup database manually:

### Step 1: Login as Root

```bash
su -
```

### Step 2: Switch to Postgres User

```bash
su - postgres
```

### Step 3: Create Database

```bash
psql -p 5433

# In psql prompt, run these commands:
CREATE USER tonpaywall WITH PASSWORD 'tonpaywall_secure_password';
CREATE DATABASE ton_subscription_mvp OWNER tonpaywall;
GRANT ALL PRIVILEGES ON DATABASE ton_subscription_mvp TO tonpaywall;
\c ton_subscription_mvp
GRANT ALL ON SCHEMA public TO tonpaywall;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tonpaywall;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tonpaywall;
\q
```

### Step 4: Exit Back to Your User

```bash
exit  # Exit postgres user
exit  # Exit root
```

### Step 5: Apply Schema as Regular User

```bash
cd /home/gmet/workspace/ton-paywall

# Apply schema (no sudo needed)
PGPASSWORD='tonpaywall_secure_password' psql -h localhost -p 5433 -U tonpaywall -d ton_subscription_mvp -f shared/database-schema.sql
```

### Step 6: Update .env File

```bash
# Create .env from example
cp .env.example .env

# Edit .env and update DATABASE_URL:
nano .env

# Set this line:
DATABASE_URL=postgresql://tonpaywall:tonpaywall_secure_password@localhost:5433/ton_subscription_mvp
```

## Quick Command Reference

### Check if PostgreSQL is Running

```bash
# As root
su -
systemctl status postgresql
exit
```

### Check PostgreSQL Port

```bash
# As root
su -
netstat -tlnp | grep postgres
# Should show port 5433
exit
```

### Verify Database Connection

```bash
PGPASSWORD='tonpaywall_secure_password' psql -h localhost -p 5433 -U tonpaywall -d ton_subscription_mvp -c "\dt"
```

Should show 7 tables:
- admins
- analytics_summary
- channels
- payments
- setup_progress
- subscribers
- subscriptions

## Common Debian Issues

### PostgreSQL Not Running

```bash
su -
systemctl start postgresql
systemctl enable postgresql
exit
```

### Wrong PostgreSQL Port

PostgreSQL 17 on Debian might use different ports. Check:
```bash
su -
pg_lsclusters
exit
```

Look for the port number (usually 5432 or 5433).

### Firewall Issues

```bash
su -
ufw status
# If firewall is active and blocking:
ufw allow 5433/tcp
exit
```

## After Database Setup

1. **Add yourself to sudoers** (so future commands work):
   ```bash
   su -
   usermod -aG sudo gmet
   exit
   # Logout and login again
   ```

2. **Verify sudo works**:
   ```bash
   sudo whoami
   # Should output: root
   ```

3. **Install Node.js and dependencies**:
   ```bash
   cd /home/gmet/workspace/ton-paywall
   npm install
   ```

4. **Continue with project setup**:
   - Deploy contracts
   - Configure bots
   - Start services

## Security Notes

### Change Default Password

After setup, change the database password:
```bash
# Generate strong password
openssl rand -base64 32

# Update password
PGPASSWORD='tonpaywall_secure_password' psql -h localhost -p 5433 -U tonpaywall -d ton_subscription_mvp
ALTER USER tonpaywall WITH PASSWORD 'new_strong_password';
\q

# Update .env
nano .env
# Change DATABASE_URL password
```

### Secure .env File

```bash
chmod 600 .env
```

### Disable Root SSH (Production)

```bash
su -
nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
systemctl restart sshd
exit
```

## Troubleshooting

### "su: Сбой при проверке подлинности"

You're entering the wrong root password.

**If you forgot root password:**
1. Reboot into recovery mode
2. Remount filesystem as read-write
3. Reset root password with `passwd`
4. Reboot normally

**Or set root password if it's not set:**
```bash
# If you have sudo access on another user
sudo passwd root
```

### "Peer authentication failed"

PostgreSQL is using peer authentication. Solution 3 above bypasses this by using password authentication (`-h localhost`).

### Can't Connect to Database

Check if PostgreSQL is running:
```bash
su -
systemctl status postgresql
exit
```

### Wrong Port

Find the correct port:
```bash
su -
grep "^port" /etc/postgresql/*/main/postgresql.conf
exit
```

## Next Steps

After database is configured:

1. ✅ Database running
2. ✅ User and database created
3. ✅ Schema applied
4. ✅ .env configured
5. ⏭️ Deploy smart contracts
6. ⏭️ Start bots

Continue with `QUICKSTART.md` for next steps.
