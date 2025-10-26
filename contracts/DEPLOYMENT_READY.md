# ✅ Deployment Ready - Blueprint Setup Complete

## 🎉 What's Working Now

The Blueprint-based deployment is fully configured and tested, matching ton-roulette's approach.

### Files Created:
- ✅ `blueprint.config.ts` - Blueprint configuration
- ✅ `scripts/deployFactory.ts` - Deployment script with proper run() function
- ✅ `wrappers/` - Directory for wrapper files (required by Blueprint)
- ✅ Updated `package.json` - Non-interactive build/deploy scripts

### Build Status:
```
✅ Contracts compiled successfully!
✅ Generated files in build/ directory
✅ TypeScript wrappers generated
```

## 🚀 How to Deploy

### 1. Build Contracts (already done):
```bash
cd /home/gmet/workspace/ton-paywall/contracts
npm run build
```

### 2. Deploy to Testnet:
```bash
npm run deploy:factory -- --testnet --tonconnect
```

Or with mnemonic:
```bash
npm run deploy:factory -- --testnet --mnemonic
```

Or interactively (will ask for network and wallet):
```bash
npm run deploy
```

### 3. Available Deployment Options:

**Option A: TON Connect (Recommended)**
```bash
npm run deploy:factory -- --testnet --tonconnect
```
- Opens QR code for Tonkeeper/MyTonWallet
- Most user-friendly
- No need to paste mnemonic

**Option B: Mnemonic**
```bash
npm run deploy:factory -- --testnet --mnemonic
```
- Prompts for your 24-word mnemonic
- Direct deployment

**Option C: Deep Link**
```bash
npm run deploy:factory -- --testnet --deeplink
```
- Generates ton:// link for mobile wallets

## 📋 Pre-Deployment Checklist

- [ ] Get testnet TON from https://testnet.tonfaucet.com
- [ ] Have wallet ready (Tonkeeper/MyTonWallet)
- [ ] Ensure `TON_NETWORK=testnet` in root `.env`
- [ ] Contracts built successfully (✅ already done)

## 🔍 After Deployment

The deployment script will:
1. Show the factory address before deployment
2. Deploy the contract with ~0.05 TON
3. Wait for deployment confirmation
4. Display the deployed address
5. Provide TONScan verification link
6. Show next steps

### Update .env:
```bash
cd /home/gmet/workspace/ton-paywall
nano .env
```

Add the deployed address:
```env
FACTORY_CONTRACT_ADDRESS="<address from deployment output>"
```

### Verify on TONScan:
```
https://testnet.tonscan.org/address/<your-address>
```

### Start Bots:
```bash
# Terminal 1
cd admin-bot && npm run dev

# Terminal 2
cd payment-bot && npm run dev
```

## 🔧 Build Output

Generated files in `build/` directory:
- `SubscriptionFactory_SubscriptionFactory.code.boc` - Contract code
- `SubscriptionFactory_SubscriptionFactory.ts` - TypeScript wrapper
- `SubscriptionFactory_SubscriptionFactory.abi` - Contract ABI
- `SubscriptionFactory_ChannelSubscription.ts` - Child contract wrapper

## 📖 Blueprint Commands

```bash
# Build contracts
npm run build

# Deploy factory
npm run deploy:factory -- --testnet --tonconnect

# Deploy to mainnet (after testing!)
npm run deploy:factory -- --mainnet --tonconnect

# Check Blueprint help
npx blueprint help
npx blueprint help run
```

## 🎯 Network Selection

- **Testnet** (recommended first): `--testnet`
- **Mainnet** (after testing): `--mainnet`
- **Custom**: `--custom https://your-api-endpoint`

## ⚠️ Important Notes

1. **Always test on testnet first!**
2. **Never share your mnemonic**
3. **Keep ~1 TON in wallet for deployment**
4. **Verify contract on TONScan after deployment**
5. **Save the deployed address to .env immediately**

## 🐛 Troubleshooting

### "No files to choose" error
Fixed! The `wrappers/` directory is now created.

### Interactive prompts
Fixed! Build command now specifies contract name: `blueprint build SubscriptionFactory`

### "Function run is missing"
Fixed! Created proper `scripts/deployFactory.ts` with exported `run()` function.

## ✅ Ready to Deploy!

Everything is set up and tested. When you're ready:

```bash
cd /home/gmet/workspace/ton-paywall/contracts
npm run deploy:factory -- --testnet --tonconnect
```

The deployment script will guide you through the rest!
