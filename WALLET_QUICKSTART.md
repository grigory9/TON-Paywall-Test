# TON Wallet Deployment - Quick Start

## One-Line Deployment

```bash
./deploy-enhanced.sh
```

That's it! The script will guide you through everything.

## What You Need

1. **Telegram Bot Tokens** (from @BotFather)
   - One for admin bot
   - One for payment bot

2. **TON for Wallets** (2 TON total)
   - 1 TON for owner wallet
   - 1 TON for deployment wallet

3. **TON Connect Manifest URLs** (publicly accessible)
   - For admin bot
   - For payment bot

## Quick Flow

### Step 1: Run Script
```bash
./deploy-enhanced.sh
```

### Step 2: Enter Configuration
Script will ask for:
- Database password (auto-generated)
- Bot tokens (from @BotFather)
- Network (testnet/mainnet)
- Manifest URLs

**TIP**: All values are cached. Re-running script lets you reuse them.

### Step 3: Wallets Created

Script generates two wallets and shows:
```
OWNER WALLET (Receives Payments)
════════════════════════════════
Address: EQC1x2y3z4...
Mnemonic: word1 word2 ... word24

⚠️  SAVE THIS MNEMONIC!
```

**ACTION REQUIRED**: Copy both mnemonics NOW!

### Step 4: Fund Wallets

Script pauses and shows:
```
Send 1 TON to: EQC1x2y3z4... (Owner)
Send 1 TON to: EQD4a5b6c7... (Deployment)

Testnet: https://testnet.tonfaucet.com
Press Enter when done...
```

**For Testnet:**
1. Visit https://testnet.tonfaucet.com
2. Paste each address
3. Get free TON
4. Press Enter

**For Mainnet:**
1. Send TON from your wallet
2. Wait for confirmation
3. Press Enter

### Step 5: Automatic Deployment

Script verifies balances, then automatically:
- ✓ Sets up database
- ✓ Builds contracts
- ✓ Configures environment
- ✓ Creates startup scripts

### Step 6: Start Bots

```bash
./start.sh
```

**Done!** Your paywall is running.

## Important Files

```
.deploy-cache          # WALLET MNEMONICS - BACKUP THIS!
.env                   # Configuration
start.sh              # Start bots
stop.sh               # Stop bots
status.sh             # Check status
logs/admin-bot.log    # Admin bot logs
logs/payment-bot.log  # Payment bot logs
```

## Security Checklist

- [ ] Backup `.deploy-cache` immediately
- [ ] Write mnemonics on paper
- [ ] Store in secure location
- [ ] Set file permissions: `chmod 600 .deploy-cache`
- [ ] Verify `.deploy-cache` not in git: `git status`

## Common Commands

```bash
# Start bots
./start.sh

# Stop bots
./stop.sh

# Check status
./status.sh

# View logs
tail -f logs/admin-bot.log
tail -f logs/payment-bot.log

# Re-deploy (keeps wallets)
./deploy-enhanced.sh
```

## Testnet vs Mainnet

| Feature | Testnet | Mainnet |
|---------|---------|---------|
| Cost | Free | Real TON |
| Purpose | Testing | Production |
| Faucet | Available | No |
| Risk | None | Real money |

**Best Practice**: Test on testnet first!

## Getting Help

**Issue**: Wallet creation fails
```bash
npm install
node scripts/create-wallets.js testnet
```

**Issue**: Balance not detected
- Wait 1-2 minutes
- Check blockchain explorer
- Verify correct address

**Issue**: Bot won't start
```bash
cd admin-bot
npm run build
node dist/index.js
# Check error messages
```

## Testnet Resources

- **Faucet**: https://testnet.tonfaucet.com
- **Explorer**: https://testnet.tonscan.org
- **Telegram Bot**: @testgiver_ton_bot

## Production Checklist

Before mainnet:
- [ ] Test complete flow on testnet
- [ ] Backup all mnemonics
- [ ] Secure server (firewall, SSH keys)
- [ ] Setup monitoring
- [ ] Verify bot tokens
- [ ] Test subscription payment
- [ ] Review smart contracts

## Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "Command not found" | `chmod +x deploy-enhanced.sh` |
| Docker permission error | `sudo usermod -aG docker $USER` then logout/login |
| Node.js not found | Script installs automatically, rerun |
| Balance shows 0.0000 | Wait 1-2 minutes, check explorer |
| Wallet creation error | `npm install` then try again |
| Bot won't start | Check logs: `tail logs/admin-bot.log` |

## Support

- Full guide: `WALLET_DEPLOYMENT_GUIDE.md`
- Architecture: `docs/ARCHITECTURE.md`
- TON Docs: https://docs.ton.org

## Summary

```bash
# Complete deployment in 3 commands:
./deploy-enhanced.sh  # Creates wallets, asks for funding
# [Fund wallets when script pauses]
./start.sh           # Start bots
./status.sh          # Verify running
```

**Remember**: Backup `.deploy-cache` immediately - it contains your wallet recovery phrases!
