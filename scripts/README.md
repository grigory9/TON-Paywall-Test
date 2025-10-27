# Deployment Scripts

This directory contains utility scripts for TON Paywall deployment and wallet management.

## Scripts

### create-wallets.js

**Purpose**: Automated TON wallet creation and funding verification

**Usage**:
```bash
# Create wallets for testnet
node scripts/create-wallets.js testnet

# Create wallets for mainnet
node scripts/create-wallets.js mainnet

# Use environment variable
TON_NETWORK=testnet node scripts/create-wallets.js
```

**Features**:
- Generates two wallets (Owner + Deployment)
- Creates 24-word mnemonics using TON SDK
- Caches wallet data in `.deploy-cache`
- Detects existing wallets and offers to reuse
- Interactive funding flow with balance verification
- Real-time balance checking (every 5 seconds)
- Network-specific address generation
- Secure mnemonic storage

**Output**:
```
╔══════════════════════════════════════════════════════════════╗
║          TON Wallet Creation for Paywall Deployment         ║
╚══════════════════════════════════════════════════════════════╝

Network: testnet

OWNER WALLET (Receives Payments)
══════════════════════════════════════════════════════════════
Address:
  EQC1x2y3z4a5b6c7d8e9f0...

Mnemonic (24 words):
  word1 word2 word3 ... word24

⚠️  SAVE THIS MNEMONIC SECURELY!
   This is the ONLY way to recover your wallet.
   Never share it with anyone.
══════════════════════════════════════════════════════════════

[Similar output for Deployment Wallet]

FUNDING REQUIRED
══════════════════════════════════════════════════════════════

Please send TON to these addresses:

1. Owner Wallet (1 TON):
   EQC1x2y3z4...

2. Deployment Wallet (1 TON):
   EQD4a5b6c7...

Get testnet TON from faucet:
   https://testnet.tonfaucet.com
   https://t.me/testgiver_ton_bot

Press Enter once you have sent TON to both addresses...

Verifying wallet balances...

Waiting for Owner Wallet to be funded...
Minimum required: 1 TON

Current balance: 1.0000 TON
✓ Owner Wallet funded successfully!

[Similar for Deployment Wallet]

SUCCESS!
══════════════════════════════════════════════════════════════
✓ Owner Wallet: 1.0000 TON
✓ Deployment Wallet: 1.0000 TON
══════════════════════════════════════════════════════════════

Next step: Factory contract deployment
```

**Exit Codes**:
- `0` - Success, both wallets created and funded
- `1` - Error (insufficient balance, network error, etc.)

**Environment Variables**:
- `TON_NETWORK` - Network to use (testnet/mainnet)
- `MIN_BALANCE_OWNER` - Minimum balance for owner wallet (default: 1 TON)
- `MIN_BALANCE_DEPLOYMENT` - Minimum balance for deployment wallet (default: 1 TON)

**Cache File**: `.deploy-cache`

The script stores wallet information in `.deploy-cache`:
```
OWNER_WALLET_ADDRESS=EQ...
OWNER_WALLET_MNEMONIC=word1 word2 ... word24
OWNER_WALLET_PUBKEY=hex...
DEPLOYMENT_WALLET_ADDRESS=EQ...
DEPLOYMENT_WALLET_MNEMONIC=word1 word2 ... word24
DEPLOYMENT_WALLET_PUBKEY=hex...
```

**SECURITY WARNING**: `.deploy-cache` contains sensitive mnemonics. Always:
- Backup immediately after creation
- Set permissions to 600 (`chmod 600 .deploy-cache`)
- Never commit to git (already in .gitignore)
- Store backup in secure offline location

**Dependencies**:
- `@ton/ton` - TON SDK
- `@ton/crypto` - Cryptographic functions
- `@orbs-network/ton-access` - Network endpoints

All dependencies are included in main package.json.

## Integration with deploy-enhanced.sh

The `create-wallets.js` script is automatically called by `deploy-enhanced.sh` at Step 2.5.

The deployment script:
1. Runs `node scripts/create-wallets.js $TON_NETWORK`
2. Parses output to extract wallet addresses
3. Waits for successful funding
4. Continues with deployment using funded wallets

**Output Parsing**:
```bash
# deploy-enhanced.sh looks for these lines:
WALLET_CREATION_SUCCESS=true
OWNER_WALLET_ADDRESS=EQ...
DEPLOYMENT_WALLET_ADDRESS=EQ...
OWNER_WALLET_MNEMONIC=words...
DEPLOYMENT_WALLET_MNEMONIC=words...
```

## Manual Usage

You can run the wallet creation script independently:

```bash
# Navigate to repository root
cd /path/to/ton-paywall

# Create wallets
node scripts/create-wallets.js testnet

# Check cache
cat .deploy-cache

# View wallets again (reuses cached)
node scripts/create-wallets.js testnet
```

## Troubleshooting

### "Module not found" Error

```bash
# Install dependencies
npm install

# Verify installation
npm list @ton/ton @ton/crypto
```

### Network Connection Error

```bash
# Test TON network connectivity
curl https://testnet.toncenter.com/api/v2/getAddressInformation?address=EQC...

# Check internet connection
ping 8.8.8.8

# Try again
node scripts/create-wallets.js testnet
```

### Balance Not Detected

**Symptoms**: Script shows 0.0000 TON after sending

**Solutions**:
1. Wait 1-2 minutes (blockchain confirmation time)
2. Verify transaction on explorer:
   - Testnet: https://testnet.tonscan.org
   - Mainnet: https://tonscan.org
3. Check you sent to correct address
4. Verify network matches (testnet vs mainnet)

### Wallet Already Exists

```bash
# Delete cache to start fresh
rm .deploy-cache

# Or manually edit cache
nano .deploy-cache

# Run again
node scripts/create-wallets.js testnet
```

## Security Best Practices

### 1. Protect Cache File

```bash
# Set restrictive permissions
chmod 600 .deploy-cache

# Verify
ls -la .deploy-cache
# Should show: -rw------- (600)
```

### 2. Backup Mnemonics

```bash
# Backup with timestamp
cp .deploy-cache ~/secure-backup/wallets-$(date +%Y%m%d-%H%M%S).txt

# Verify backup
cat ~/secure-backup/wallets-*.txt
```

### 3. Never Commit

```bash
# Verify .gitignore
grep deploy-cache .gitignore
# Should show: .deploy-cache

# Check git status
git status
# Should NOT list .deploy-cache
```

### 4. Production Mainnet

For production with real funds:
- Use hardware wallet for owner wallet (Ledger, etc.)
- Keep deployment wallet mnemonic in password manager
- Enable server 2FA
- Setup monitoring for wallet balances
- Use multi-signature for large amounts

## Testing

Test the wallet creation script:

```bash
# Test on testnet (safe, free TON)
node scripts/create-wallets.js testnet

# Verify wallets created
cat .deploy-cache | grep ADDRESS

# Get testnet TON
# Visit: https://testnet.tonfaucet.com
# Paste addresses from cache

# Verify balances
node scripts/create-wallets.js testnet
# Should show existing wallets and balances
```

## Advanced Usage

### Custom Balance Requirements

Edit `create-wallets.js`:

```javascript
const MIN_BALANCE_OWNER = 5.0; // Change from 1.0
const MIN_BALANCE_DEPLOYMENT = 2.0; // Change from 1.0
```

### Programmatic Integration

```javascript
const { exec } = require('child_process');

exec('node scripts/create-wallets.js testnet', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error}`);
    return;
  }

  // Parse output
  const match = stdout.match(/OWNER_WALLET_ADDRESS=(EQ[a-zA-Z0-9_-]+)/);
  const ownerAddress = match ? match[1] : null;

  console.log('Owner wallet:', ownerAddress);
});
```

### Non-Interactive Mode (Future Enhancement)

Currently the script requires user interaction for funding. To run non-interactively:

1. Pre-fund wallets from another source
2. Modify script to skip funding prompt if balance sufficient
3. Use environment variables for automation

## Support

For issues with wallet creation:
1. Check logs for error messages
2. Verify Node.js version (18+)
3. Test network connectivity
4. Review troubleshooting section above
5. Check TON documentation: https://docs.ton.org

## Contributing

When modifying wallet creation script:
- Maintain backward compatibility with cache format
- Add comprehensive error handling
- Test on both testnet and mainnet
- Update documentation
- Follow security best practices
- Never log mnemonics or private keys
