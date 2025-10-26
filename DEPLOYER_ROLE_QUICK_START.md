# Deployer Role: Quick Start Guide

## TL;DR - The Answer to Your Question

**Q: Can I provide a mnemonic that is NOT for the owner of the factory contract?**

**A: YES! Use the Deployer Role Pattern.**

✅ **DO THIS:**
- Store DEPLOYER_MNEMONIC on server (limited privileges)
- Store OWNER_MNEMONIC in cold storage (full control)
- Deployer can ONLY register deployments (not drain funds, change fees, etc.)

❌ **DON'T DO THIS:**
- Store owner mnemonic on server (current implementation - HIGH RISK)
- Use public registration without authorization (griefing attacks possible)
- Use multi-sig for every operation (kills automation)

---

## What Changed

### Before (Current - RISKY)
```typescript
// Server .env
ADMIN_MNEMONIC=owner_mnemonic  // Full factory control on server ❌

// Backend
await this.tonService.initWallet(ownerMnemonic);
await this.tonService.registerDeployment(...);
```

**Risk:** If server hacked, attacker has full factory control.

### After (Recommended - SECURE)
```typescript
// Server .env
DEPLOYER_MNEMONIC=deployer_mnemonic  // Limited deployment role ✅

// Cold storage (hardware wallet/paper)
OWNER_MNEMONIC=owner_mnemonic  // Full control, never on server

// Backend
await this.tonService.initWallet(deployerMnemonic);
await this.tonService.registerDeployment(...); // Works because deployer authorized
```

**Security:** If server hacked, attacker can only spam registrations (owner can revoke).

---

## Implementation Steps (30 minutes)

### Step 1: Update Factory Contract (5 min)

Replace `/home/gmet/workspace/ton-paywall/contracts/contracts/factory.tact` with the version in:
```
/home/gmet/workspace/ton-paywall/contracts/contracts/factory-with-deployer-role.tact
```

Key changes:
- Added `deployer: Address` field
- Added `SetDeployer` message
- Modified `RegisterDeployment` to check `owner OR deployer`

### Step 2: Build and Deploy (5 min)

```bash
cd /home/gmet/workspace/ton-paywall/contracts

# Build updated contract
npm run build

# Deploy to testnet
npm run deploy:testnet
# Or mainnet (after testing!)
npm run deploy

# Save factory address to .env
# FACTORY_CONTRACT_ADDRESS=EQC...
```

### Step 3: Setup Deployer Role (10 min)

```bash
# Run setup script (requires owner mnemonic ONE TIME)
npx ts-node scripts/setup-deployer-role.ts

# This will:
# 1. Generate new deployer wallet (24 words)
# 2. Ask you to fund deployer wallet (send 1 TON)
# 3. Authorize deployer in factory (using owner signature)
# 4. Save deployer mnemonic to .deployer-setup.txt

# After funding, re-run script to complete authorization
npx ts-node scripts/setup-deployer-role.ts
```

**Expected Output:**
```
✅ Deployer wallet generated
Address: UQA...xyz

DEPLOYER_MNEMONIC:
word1 word2 word3 ... word24

Add this to your server .env file
```

### Step 4: Update Server Configuration (5 min)

```bash
# Edit .env on production server
nano /home/gmet/workspace/ton-paywall/.env

# REMOVE (or comment out):
# ADMIN_MNEMONIC=old_owner_mnemonic

# ADD:
DEPLOYER_MNEMONIC=word1 word2 word3 ... word24
```

### Step 5: Update Backend Code (5 min)

**File:** `/home/gmet/workspace/ton-paywall/admin-bot/src/services/contract-deployment.ts`

```typescript
// Find this function:
async requestDeploymentFromUser(
    channelId: number,
    adminWallet: string,
    monthlyPrice: number
) {
    // REPLACE THIS:
    // const adminMnemonic = process.env.ADMIN_MNEMONIC;

    // WITH THIS:
    const deployerMnemonic = process.env.DEPLOYER_MNEMONIC;

    if (!deployerMnemonic) {
        throw new Error('DEPLOYER_MNEMONIC not configured - see DEPLOYER_ROLE_QUICK_START.md');
    }

    const mnemonic = deployerMnemonic.split(' ');
    await this.tonService.initWallet(mnemonic);

    // Rest stays the same
    await this.tonService.registerDeployment(
        factoryAddress,
        adminWallet,
        channelId,
        monthlyPrice
    );
}
```

### Step 6: Test Everything (10 min)

```bash
# Build and restart bots
cd /home/gmet/workspace/ton-paywall/admin-bot
npm run build
pm2 restart admin-bot

# Test channel setup in Telegram
# 1. Start /setup in admin bot
# 2. Complete wizard
# 3. Verify deployment registration succeeds
# 4. Check logs for errors
```

**Verify:**
```bash
# Check deployer is set correctly
cd /home/gmet/workspace/ton-paywall/contracts
npx blueprint run get-deployer

# Should output your deployer address
```

---

## Security Checklist

After implementation, verify:

- [ ] ✅ Owner mnemonic NOT in server .env
- [ ] ✅ Owner mnemonic stored in hardware wallet or paper backup
- [ ] ✅ Deployer mnemonic in server .env
- [ ] ✅ Deployer wallet funded with 1+ TON
- [ ] ✅ Channel setup tested successfully
- [ ] ✅ Logs show no errors
- [ ] ✅ Factory `getDeployer()` returns deployer address
- [ ] ✅ .deployer-setup.txt deleted (after saving mnemonic)

---

## What Each Key Can Do

### Owner Key (Cold Storage)
- ✅ Update deployment fee
- ✅ Set/revoke deployer address
- ✅ Withdraw factory funds (if any)
- ✅ Register deployments

**Risk if compromised:** 🔴 TOTAL SYSTEM LOSS

### Deployer Key (Server)
- ✅ Register deployment parameters
- ❌ Cannot update fee
- ❌ Cannot withdraw funds
- ❌ Cannot change deployer

**Risk if compromised:** 🟡 Spam registrations (revocable by owner)

### User Keys (User's Wallet)
- ✅ Deploy own channel
- ✅ Update own channel price
- ✅ Receive subscription payments
- ❌ Cannot affect other channels

**Risk if compromised:** 🟢 Only affects one channel

---

## Emergency: Deployer Compromised

If server is hacked and deployer key stolen:

```bash
# 1. Retrieve owner mnemonic from cold storage
export FACTORY_OWNER_MNEMONIC="owner_word1 owner_word2 ..."

# 2. Revoke deployer
cd /home/gmet/workspace/ton-paywall/contracts
npx ts-node scripts/revoke-deployer.ts
# Type "REVOKE" to confirm

# 3. Generate new deployer
npx ts-node scripts/setup-deployer-role.ts

# 4. Update server .env with new deployer mnemonic

# 5. Return owner mnemonic to cold storage
```

**Time to revoke:** ~5 minutes
**Impact:** Channel setup disabled during revocation, existing subscriptions work normally

---

## Cost Analysis

**One-Time Costs:**
- Factory deployment: ~0.1 TON
- Deployer authorization: ~0.05 TON
- **Total: ~0.15 TON (~$0.50)**

**Ongoing Costs:**
- Each registration: ~0.01 TON
- 100 channels/month: ~1 TON/month (~$3)
- **Minimal operational cost**

**Security ROI:**
- Protection from server breach: Priceless
- Peace of mind: Priceless
- Following industry best practices: Professional credibility

---

## Comparison: All Options Analyzed

| Option | Security | Complexity | Recommended? |
|--------|----------|-----------|--------------|
| **1. Deployer Role** | ⭐⭐⭐⭐ High | ⭐⭐⭐⭐ Low | ✅ **YES** |
| 2. Multi-Sig | ⭐⭐⭐⭐⭐ Maximum | ⭐⭐ High | ❌ Kills automation |
| 3. Public Registration | ⭐⭐ Low | ⭐⭐⭐⭐⭐ Minimal | ❌ Griefing attacks |
| 4. Operator Contract | ⭐⭐⭐⭐ High | ⭐⭐⭐ Medium | ❌ Over-engineered |
| 5. HSM | ⭐⭐⭐⭐⭐ Maximum | ⭐⭐ High | ⚠️ Overkill (expensive) |
| 6. Threshold Crypto | ⭐⭐⭐⭐⭐ Maximum | ⭐ Very High | ❌ Excessive complexity |

**Verdict:** Deployer Role provides best balance of security, cost, and simplicity.

---

## Files You Need

**Contract Changes:**
- `/home/gmet/workspace/ton-paywall/contracts/contracts/factory-with-deployer-role.tact`

**Setup Scripts:**
- `/home/gmet/workspace/ton-paywall/contracts/scripts/setup-deployer-role.ts`
- `/home/gmet/workspace/ton-paywall/contracts/scripts/revoke-deployer.ts`

**Documentation:**
- `/home/gmet/workspace/ton-paywall/docs/DEPLOYER_ROLE_IMPLEMENTATION.md` (detailed guide)
- `/home/gmet/workspace/ton-paywall/docs/DEPLOYER_AUTHORIZATION_OPTIONS_ANALYSIS.md` (all options analyzed)
- `/home/gmet/workspace/ton-paywall/docs/SECURITY_BEST_PRACTICES.md` (security overview)

**All files created and ready to use!**

---

## Next Steps

1. **Review** detailed documentation:
   - Read `/home/gmet/workspace/ton-paywall/docs/DEPLOYER_AUTHORIZATION_OPTIONS_ANALYSIS.md`
   - Understand why deployer role is recommended

2. **Test on Testnet:**
   - Deploy updated factory to testnet
   - Run setup-deployer-role.ts
   - Complete full channel setup flow
   - Test revocation procedure

3. **Security Audit:**
   - Review contract changes
   - Test emergency procedures
   - Verify owner key NOT on server

4. **Deploy to Mainnet** (only after testnet success):
   - Follow same procedure
   - Triple-check owner key in cold storage
   - Monitor deployer wallet balance

---

## Questions?

**Q: Do I need to redeploy existing channels?**
A: No, only the factory contract needs updating. Existing subscription contracts work unchanged.

**Q: Can I use my existing owner mnemonic to generate deployer?**
A: No, generate a SEPARATE deployer mnemonic. Never reuse keys.

**Q: How often should I rotate deployer key?**
A: Every 6-12 months, or immediately after any security incident.

**Q: What if I lose deployer mnemonic?**
A: Owner can set new deployer anytime. Keep backup in password manager.

**Q: Can I have multiple deployers?**
A: Current implementation supports one. To add multiple, modify contract to use map of authorized deployers.

**Q: Is this pattern battle-tested?**
A: Yes, used by Uniswap, Compound, Aave, and other major DeFi protocols. Industry standard.

---

## Support

**Need help?** Check detailed documentation:
- Implementation guide: `/home/gmet/workspace/ton-paywall/docs/DEPLOYER_ROLE_IMPLEMENTATION.md`
- Security practices: `/home/gmet/workspace/ton-paywall/docs/SECURITY_BEST_PRACTICES.md`

**Found a bug?** Open issue with:
- Network (testnet/mainnet)
- Factory address
- Error message
- Steps to reproduce

---

**Remember: Security is not optional. Implement deployer role before mainnet launch.**
