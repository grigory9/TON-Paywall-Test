# TON Wallet Deployment Guide

## Overview

This guide explains the enhanced deployment script that automatically creates TON wallets for your subscription paywall system.

## What Gets Created

The deployment process creates **two wallets**:

1. **Owner Wallet** - Receives all subscription payments from your channels
2. **Deployment Wallet** - Used to deploy the factory smart contract

Both wallets are fully functional TON blockchain wallets with 24-word recovery mnemonics.

## Prerequisites

- Debian 12 server (or compatible Linux)
- Node.js 18+ (installed automatically if missing)
- Docker (installed automatically if missing)
- At least **2 TON** for wallet funding (1 TON per wallet)

## Quick Start

```bash
# Clone repository
git clone <your-repo-url>
cd ton-paywall

# Run enhanced deployment
./deploy-enhanced.sh
```

The script will:
1. Check prerequisites and install missing dependencies
2. Collect configuration (bot tokens, network, etc.)
3. **Generate two TON wallets automatically**
4. **Display wallet addresses and wait for you to fund them**
5. Verify wallet balances before proceeding
6. Setup PostgreSQL database
7. Build and configure all services
8. Create startup scripts

## Deployment Flow

### Step 1: Configuration

The script will ask for:
- PostgreSQL password (auto-generated)
- Database port (default: 5433)
- Telegram bot tokens (from @BotFather)
- TON network (testnet/mainnet)
- TON Connect manifest URLs

All values are cached in `.deploy-cache` for future runs.

### Step 2: Wallet Creation

```
[2.5/9] TON Wallet Setup

Generating Owner Wallet...
══════════════════════════════════════════════════════════════════
Address:
  EQC1x2y3z4...

Mnemonic (24 words):
  word1 word2 word3 ... word24

⚠️  SAVE THIS MNEMONIC SECURELY!
   This is the ONLY way to recover your wallet.
   Never share it with anyone.
══════════════════════════════════════════════════════════════════

Generating Deployment Wallet...
══════════════════════════════════════════════════════════════════
[Similar output for deployment wallet]
══════════════════════════════════════════════════════════════════
```

**CRITICAL**: Copy both mnemonics to a secure location immediately!

### Step 3: Wallet Funding

```
FUNDING REQUIRED
══════════════════════════════════════════════════════════════════

Please send TON to these addresses:

1. Owner Wallet (1 TON):
   EQC1x2y3z4...

2. Deployment Wallet (1 TON):
   EQD4a5b6c7...

Get testnet TON from faucet:
   https://testnet.tonfaucet.com
   https://t.me/testgiver_ton_bot

Press Enter once you have sent TON to both addresses...
```

#### How to Fund Wallets

**For Testnet:**
1. Visit https://testnet.tonfaucet.com
2. Paste wallet address
3. Request TON (you'll get 1-2 TON per request)
4. Repeat for second wallet
5. Or use Telegram bot: @testgiver_ton_bot

**For Mainnet:**
1. Send TON from your existing wallet
2. Or buy TON from exchange and withdraw to addresses
3. Minimum 1 TON per wallet (2 TON total)

### Step 4: Balance Verification

```
Verifying wallet balances...

Waiting for Owner Wallet to be funded...
Minimum required: 1 TON

Current balance: 0.0000 TON
[Updates every 5 seconds]

Current balance: 1.0000 TON
✓ Owner Wallet funded successfully!

[Repeats for Deployment Wallet]

SUCCESS!
══════════════════════════════════════════════════════════════════
✓ Owner Wallet: 1.0000 TON
✓ Deployment Wallet: 1.0000 TON
══════════════════════════════════════════════════════════════════
```

### Step 5: Automatic Deployment

Once wallets are funded, the script automatically:
- Sets up PostgreSQL in Docker
- Initializes database schema
- Builds smart contracts
- Creates environment files with wallet addresses
- Installs dependencies
- Builds all projects
- Creates startup scripts

## Security Considerations

### Wallet Mnemonics

**CRITICAL SECURITY**: Your wallet mnemonics are stored in `.deploy-cache`

```bash
# The .deploy-cache file contains:
OWNER_WALLET_ADDRESS=EQC...
OWNER_WALLET_MNEMONIC=word1 word2 ... word24
OWNER_WALLET_PUBKEY=abcd...
DEPLOYMENT_WALLET_ADDRESS=EQD...
DEPLOYMENT_WALLET_MNEMONIC=word1 word2 ... word24
DEPLOYMENT_WALLET_PUBKEY=efgh...
```

**Security Best Practices:**

1. **Backup Immediately**
   ```bash
   # Copy to secure location
   cp .deploy-cache ~/backup/ton-wallets-backup-$(date +%Y%m%d).txt

   # Set restrictive permissions
   chmod 400 .deploy-cache
   ```

2. **Never Commit to Git**
   - Already added to `.gitignore`
   - Verify: `git status` should NOT show `.deploy-cache`

3. **Mainnet Production**
   - Consider using hardware wallet for owner wallet
   - Use cold storage for large amounts
   - Enable 2FA on server access

4. **Mnemonic Storage**
   - Write down on paper and store in safe
   - Use password manager (encrypted)
   - Never store in plain text on networked systems
   - Never share with anyone

### File Permissions

```bash
# Secure sensitive files
chmod 600 .env
chmod 600 .deploy-cache
chmod 600 admin-bot/.env
chmod 600 payment-bot/.env

# Verify
ls -la .deploy-cache .env
# Should show: -rw------- (600)
```

## Re-running Deployment

If you re-run `deploy-enhanced.sh`, it will:

1. Detect existing wallets in cache
2. Ask if you want to reuse them
3. If YES: Skip wallet creation, verify balances
4. If NO: Generate new wallets, require new funding

```
Found existing wallet configuration:
  Owner Wallet: EQC1x2y3z4...
  Deployment Wallet: EQD4a5b6c7...

Use existing wallets? (Y/n): Y
```

This allows you to:
- Update bot tokens without recreating wallets
- Change network configuration
- Rebuild after code changes
- Add new channels to existing setup

## Wallet Management

### View Wallet Balances

```bash
# Using the wallet script directly
node scripts/create-wallets.js testnet
# (Will show cached wallets and current balances)
```

### Export Wallet for TON Wallet Apps

You can import your wallets into TON mobile/desktop wallets:

1. Open TON Wallet app
2. Select "Import Existing Wallet"
3. Enter 24-word mnemonic from `.deploy-cache`
4. Wallet will be imported with full access

**Use Cases:**
- Monitor balances on mobile
- Manually send transactions
- Backup verification
- Emergency recovery

### Recovering Wallets

If you lose access to server but have mnemonics:

```bash
# On new server
mkdir ton-paywall-recovery
cd ton-paywall-recovery

# Create .deploy-cache with your mnemonics
cat > .deploy-cache << EOF
OWNER_WALLET_MNEMONIC=your 24 words here
DEPLOYMENT_WALLET_MNEMONIC=your 24 words here
EOF

# Run deployment
./deploy-enhanced.sh

# Script will detect cached mnemonics and regenerate addresses
```

## Troubleshooting

### Wallet Creation Fails

```bash
# Check Node.js version (need 18+)
node -v

# Install dependencies manually
npm install

# Run wallet script directly to see errors
node scripts/create-wallets.js testnet
```

### Balance Not Detected

```bash
# Check TON network connectivity
curl https://testnet.toncenter.com/api/v2/getAddressInformation?address=YOUR_ADDRESS

# Verify transaction on explorer
# Testnet: https://testnet.tonscan.org/address/YOUR_ADDRESS
# Mainnet: https://tonscan.org/address/YOUR_ADDRESS

# Wait 1-2 minutes after sending (blockchain confirmation)
```

### Wrong Network

If you deployed on testnet but want mainnet:

```bash
# Delete cache to start fresh
rm .deploy-cache

# Run deployment again
./deploy-enhanced.sh
# Select "mainnet" when asked
```

### Lost Mnemonics

**CRITICAL**: If you lose mnemonics and don't have backup:
- Funds in wallets are **PERMANENTLY LOST**
- You cannot recover without the 24-word mnemonic
- This is blockchain - no password reset option

**Prevention**:
- Always backup immediately after creation
- Store in multiple secure locations
- Test recovery process on testnet first

## Production Checklist

Before deploying to mainnet production:

- [ ] Backup `.deploy-cache` to secure offline location
- [ ] Write down mnemonics on paper, store in safe
- [ ] Test full deployment flow on testnet first
- [ ] Verify wallet balances on blockchain explorer
- [ ] Secure server with firewall rules
- [ ] Enable SSH key authentication only
- [ ] Setup monitoring and alerts
- [ ] Document recovery procedures
- [ ] Test wallet import in TON mobile app
- [ ] Verify all bot tokens are correct
- [ ] Test subscription flow end-to-end
- [ ] Setup automated backups for database
- [ ] Review smart contract code (consider audit)

## Cost Breakdown

### Initial Deployment

- **Owner Wallet**: 1 TON (initial funding)
- **Deployment Wallet**: 1 TON (initial funding)
- **Factory Deployment**: ~0.1 TON (gas fees)
- **Per-Channel Contract**: ~0.6 TON (0.1 gas + 0.5 initial balance)

**Total for MVP**: ~2.7 TON (2 wallet funding + 0.7 first channel)

### Ongoing Costs

- **Each new channel**: ~0.6 TON (one-time)
- **User subscriptions**: ~0.05 TON gas (deducted from payment)
- **Database/hosting**: Variable (depends on provider)

### Testnet vs Mainnet

- **Testnet**: Free TON from faucets, use for testing
- **Mainnet**: Real TON required, use for production

**Best Practice**: Always test complete flow on testnet before mainnet!

## Advanced Configuration

### Custom Wallet Amounts

Edit `scripts/create-wallets.js`:

```javascript
const MIN_BALANCE_OWNER = 5.0; // TON (change from 1.0)
const MIN_BALANCE_DEPLOYMENT = 2.0; // TON (change from 1.0)
```

### Manual Wallet Import

If you already have wallets:

```bash
# Edit .deploy-cache before running deployment
cat > .deploy-cache << EOF
OWNER_WALLET_ADDRESS=EQ...
OWNER_WALLET_MNEMONIC=existing 24 words
DEPLOYMENT_WALLET_ADDRESS=EQ...
DEPLOYMENT_WALLET_MNEMONIC=existing 24 words
EOF

# Run deployment (will use existing wallets)
./deploy-enhanced.sh
```

### Network Switching

```bash
# Change from testnet to mainnet
# Edit .deploy-cache
sed -i 's/TON_NETWORK=testnet/TON_NETWORK=mainnet/' .deploy-cache

# Re-run deployment
./deploy-enhanced.sh
```

## Support Resources

- **TON Documentation**: https://docs.ton.org
- **TON Testnet Faucet**: https://testnet.tonfaucet.com
- **TON Explorer (testnet)**: https://testnet.tonscan.org
- **TON Explorer (mainnet)**: https://tonscan.org
- **TON SDK**: https://github.com/ton-org/ton
- **Telegram Bot API**: https://core.telegram.org/bots/api

## Summary

The enhanced deployment script automates:
✓ TON wallet creation (2 wallets)
✓ Mnemonic generation and secure storage
✓ Interactive funding with balance verification
✓ Automatic blockchain connectivity testing
✓ Complete system deployment

**Security is paramount** - Always backup mnemonics immediately and store securely!

For questions or issues, review troubleshooting section or check logs in `logs/` directory.
