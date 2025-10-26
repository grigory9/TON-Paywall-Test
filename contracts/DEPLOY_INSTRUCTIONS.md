# Factory Contract Deployment Instructions

## ✅ Contract Compiled Successfully!

Your smart contracts have been compiled and are ready for deployment.

**Compiled files location**: `build/SubscriptionFactory_SubscriptionFactory.code.boc`

## 🚀 Deployment Options

Since this is an MVP, here are the recommended deployment methods:

### Option 1: Use TON Blueprint (Recommended)

TON Blueprint is the official deployment framework:

```bash
# Install blueprint globally
npm install -g @ton/blueprint

# Deploy to testnet
npx blueprint run

# Follow the prompts to deploy SubscriptionFactory
```

### Option 2: Manual Deployment via TONScan

1. Go to https://testnet.tonscan.org (or https://tonscan.org for mainnet)
2. Navigate to "Deploy Contract"
3. Upload `build/SubscriptionFactory_SubscriptionFactory.code.boc`
4. Provide owner address (your wallet address)
5. Send deployment transaction
6. Copy the deployed contract address

### Option 3: Deploy from Bot Service

Since the bots have all the dependencies, you can deploy from there:

```bash
# From project root
cd admin-bot
# or cd payment-bot

# Run deployment script (we'll create one)
npm run deploy-factory
```

## 📝 After Deployment

Once your factory contract is deployed:

1. **Copy the contract address**
   - Format: `EQC...` (starts with EQ or UQ)

2. **Add to .env file**:
   ```env
   FACTORY_CONTRACT_ADDRESS=EQC...your_address_here...
   ```

3. **Verify deployment**:
   - Visit testnet explorer: https://testnet.tonscan.org
   - Search for your contract address
   - Verify status is "Active"

4. **Test factory methods**:
   - Check `getDeploymentFee()` returns 0.1 TON
   - Verify contract is owned by your wallet

## 🧪 Testnet Testing

**IMPORTANT**: Always test on testnet first!

1. Get testnet TON: https://testnet.tonfaucet.com
2. Deploy factory to testnet
3. Test full channel setup + subscription flow
4. Verify payments work correctly
5. Only then deploy to mainnet

## 🔧 Troubleshooting

### "Insufficient gas" error
- Ensure your wallet has at least 1 TON
- Deployment costs ~0.5-1 TON total

### "Contract already exists"
- Each deployment creates a new address
- Check if you already deployed (search in TONScan)

### "Invalid code" error
- Ensure you ran `npm run build` successfully
- Check the .boc file exists in `build/` folder

## 📚 Additional Resources

- TON Blueprint: https://github.com/ton-org/blueprint
- TON Documentation: https://docs.ton.org
- TONScan (testnet): https://testnet.tonscan.org
- TONScan (mainnet): https://tonscan.org

## ⚠️ Security Reminders

- **Never share your mnemonic phrase**
- **Test on testnet first**
- **Verify contract code before deployment**
- **Keep backup of deployment addresses**
- **Start with small amounts for testing**

---

**For complete MVP deployment guide, see**: `../MVP_LAUNCH_GUIDE.md`
