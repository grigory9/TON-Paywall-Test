# Simple Factory Contract Deployment

## 🎯 Easiest Method: Deploy with ton-deployer

### Step 1: Install ton-deployer

```bash
npm install -g ton-deployer
```

### Step 2: Create Deployment Package

```bash
cd ~/workspace/ton-paywall/contracts
```

### Step 3: Deploy to Testnet

```bash
# Make sure you have testnet TON in your wallet
# Get your mnemonic ready (24 words)

ton-deployer deploy build/SubscriptionFactory_SubscriptionFactory.code.boc \
  --network testnet \
  --mnemonic "your 24 word mnemonic here"
```

---

## Alternative: Deploy via TON CLI

### Install TON CLI

```bash
# Install ton
cargo install --git https://github.com/ton-blockchain/ton-labs-cli
```

### Deploy

```bash
cd ~/workspace/ton-paywall/contracts/build

# Deploy SubscriptionFactory
ton-cli deploy SubscriptionFactory_SubscriptionFactory.code.boc \
  --network https://testnet.toncenter.com/api/v2/ \
  --key <your_private_key>
```

---

## Simplest: Use a Pre-deployed Factory (For Quick Testing)

For MVP testing, you can temporarily use a test factory contract:

1. **Add this to your .env**:
   ```env
   # Testnet test factory (for MVP testing only)
   FACTORY_CONTRACT_ADDRESS=EQC_test_factory_address_here
   ```

2. **Test the system** with this factory

3. **Deploy your own** once testing is complete

---

## Manual Deployment Steps (No Special Tools)

### What You Need:
- Your 24-word mnemonic
- ~1 TON in your wallet (testnet)
- The compiled contract: `build/SubscriptionFactory_SubscriptionFactory.code.boc`

### Using TONKeeper Mobile:

1. **Open TONKeeper app**
2. **Switch to Testnet**
   - Settings → Network → Testnet
3. **Get Testnet TON**
   - Visit https://testnet.tonfaucet.com on phone
   - Request coins to your address
4. **Deploy Contract**
   - This requires technical knowledge of contract deployment
   - Recommended: Use desktop tools below

### Using TON Minter (Web Interface):

1. **Visit**: https://minter.ton.org (for testnet)
2. **Connect Wallet** (switch to testnet)
3. **Navigate to**: Deploy → Custom Contract
4. **Upload**: `SubscriptionFactory_SubscriptionFactory.code.boc`
5. **Set Parameters**:
   - Owner: Your wallet address
6. **Sign and Deploy**
7. **Copy Contract Address** → Add to `.env`

---

## After Deployment

Once you have the factory contract address:

1. **Add to .env**:
   ```env
   FACTORY_CONTRACT_ADDRESS=EQC...your_actual_address...
   ```

2. **Verify on TONScan**:
   ```
   https://testnet.tonscan.org/address/EQC...
   ```

3. **Check it's active**:
   - Status should show "Active"
   - Balance should be visible

4. **Start the bots**:
   ```bash
   cd ~/workspace/ton-paywall
   cd admin-bot && npm run dev
   # In another terminal:
   cd payment-bot && npm run dev
   ```

---

## Quick Test Without Deploying (Development)

For development and testing the bot logic without blockchain:

1. **Comment out contract deployment** in admin bot
2. **Use mock contract addresses** for testing
3. **Test bot flows** without real payments
4. **Deploy to testnet** when ready for integration testing

---

## Need Help?

If deployment is taking too long, you can:

1. **Skip factory deployment** for now
2. **Test bot functionality** without blockchain integration
3. **Deploy factory** when you're ready for real testing
4. **Focus on** bot UX, database, and business logic first

The bots will work without a deployed factory - they just won't be able to deploy subscription contracts yet.
