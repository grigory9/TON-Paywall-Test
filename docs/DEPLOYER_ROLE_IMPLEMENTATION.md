# Deployer Role Implementation Guide

## Executive Summary

**Problem:** Storing the factory owner's mnemonic on the backend server creates a critical security risk. If the server is compromised, an attacker gains full control of the factory contract.

**Solution:** Implement a separate "deployer" role with limited privileges. The backend uses a deployer wallet that can ONLY register deployment parameters, while the owner wallet (with full control) remains in cold storage.

---

## Security Model Comparison

### Before (HIGH RISK)
```
Server .env:
  FACTORY_OWNER_MNEMONIC = "word1 word2 ... word24"  ← FULL FACTORY CONTROL

Risk if compromised:
  - Attacker can drain factory funds
  - Attacker can change deployment fee
  - Attacker can deploy malicious contracts
  - Entire system compromised
```

### After (LOW RISK)
```
Cold Storage (hardware wallet/paper):
  FACTORY_OWNER_MNEMONIC = "word1 word2 ... word24"  ← FULL CONTROL (offline)

Server .env:
  DEPLOYER_MNEMONIC = "word1 word2 ... word24"  ← LIMITED: Can only register deployments

Risk if compromised:
  - Attacker can register spam deployments (limited impact)
  - Attacker CANNOT drain funds
  - Attacker CANNOT change factory settings
  - Owner can revoke deployer access anytime
```

---

## Architecture Changes

### Smart Contract Modifications

**New Contract State:**
```tact
contract SubscriptionFactory with Deployable, Ownable {
    owner: Address;
    deployer: Address;  // NEW: Separate deployer role
    // ... rest unchanged
}
```

**New Message:**
```tact
message SetDeployer {
    newDeployer: Address;
}
```

**Modified Authorization:**
```tact
receive(msg: RegisterDeployment) {
    let ctx: Context = context();

    // OLD: self.requireOwner();  ← Only owner could call

    // NEW: Owner OR deployer can call
    require(
        ctx.sender == self.owner || ctx.sender == self.deployer,
        "Unauthorized: only owner or deployer can register"
    );

    // ... rest of logic unchanged
}
```

---

## Implementation Steps

### Phase 1: One-Time Setup (Requires Owner Key)

**Prerequisites:**
- Factory contract already deployed
- `FACTORY_CONTRACT_ADDRESS` in .env
- `FACTORY_OWNER_MNEMONIC` available (will be removed from server after setup)

**Run Setup Script:**
```bash
cd contracts
npx ts-node scripts/setup-deployer-role.ts
```

**Script Actions:**
1. ✅ Generates new 24-word deployer mnemonic
2. ✅ Creates deployer wallet address
3. ✅ Prompts you to fund deployer wallet (send ~1 TON)
4. ✅ Uses owner wallet to call `SetDeployer(deployerAddress)`
5. ✅ Verifies deployer was set correctly
6. ✅ Saves deployer mnemonic to `.deployer-setup.txt`

**Output Example:**
```
========================================
DEPLOYER ROLE SETUP - SECURITY CRITICAL
========================================

Network: testnet
Factory: EQC...

Step 1: Generating new deployer wallet...

✅ Deployer wallet generated
Address: UQA...xyz

⚠️  CRITICAL: Save this mnemonic securely!

DEPLOYER_MNEMONIC:
word1 word2 word3 ... word24

Add this to your server .env file (replace FACTORY_OWNER_MNEMONIC)

📄 Setup details saved to: .deployer-setup.txt
⚠️  DELETE THIS FILE after saving mnemonic securely!

Step 2: Checking deployer wallet balance...
Current balance: 0 TON

⚠️  WARNING: Deployer wallet needs funding!
Send at least 1 TON to: UQA...xyz
Re-run this script after funding.
```

**After Funding Deployer Wallet:**
```bash
# Re-run script
npx ts-node scripts/setup-deployer-role.ts
```

**Expected Output:**
```
Step 2: Checking deployer wallet balance...
Current balance: 1.2 TON
✅ Deployer wallet has sufficient balance

Step 3: Authorizing deployer in factory contract...
This requires owner wallet signature...

Owner wallet: EQD...abc
Current deployer: EQD...abc  ← Initially same as owner

Sending SetDeployer transaction...
Transaction sent. Waiting for confirmation...
✅ Transaction confirmed

New deployer: UQA...xyz

========================================
✅ DEPLOYER ROLE SETUP COMPLETE
========================================

NEXT STEPS:
1. Add to server .env:
   DEPLOYER_MNEMONIC="word1 word2 ... word24"
2. Remove from server .env:
   FACTORY_OWNER_MNEMONIC (keep in cold storage only)
3. Update backend code to use DEPLOYER_MNEMONIC for registerDeployment()
4. Test channel setup flow on testnet
5. DELETE .deployer-setup.txt
```

---

### Phase 2: Update Server Configuration

**1. Update .env on Production Server:**
```bash
# OLD (REMOVE THIS):
# FACTORY_OWNER_MNEMONIC=word1 word2 ... word24

# NEW (ADD THIS):
DEPLOYER_MNEMONIC=deployer_word1 deployer_word2 ... deployer_word24
```

**2. Store Owner Mnemonic in Cold Storage:**
- Write on paper and store in safe
- Use hardware wallet (Ledger, SafePal)
- Use encrypted offline storage
- **NEVER store on server again**

---

### Phase 3: Update Backend Code

**Modify `admin-bot/src/services/contract-deployment.ts`:**

```typescript
// OLD CODE:
async requestDeploymentFromUser(
    channelId: number,
    adminWallet: string,
    monthlyPrice: number
) {
    // ❌ This used owner mnemonic (HIGH RISK)
    const adminMnemonic = process.env.ADMIN_MNEMONIC;
    if (!adminMnemonic) {
        throw new Error('ADMIN_MNEMONIC not configured');
    }

    const mnemonic = adminMnemonic.split(' ');
    await this.tonService.initWallet(mnemonic);

    // ... rest
}

// NEW CODE:
async requestDeploymentFromUser(
    channelId: number,
    adminWallet: string,
    monthlyPrice: number
) {
    // ✅ Use deployer mnemonic (LIMITED PRIVILEGES)
    const deployerMnemonic = process.env.DEPLOYER_MNEMONIC;
    if (!deployerMnemonic) {
        throw new Error('DEPLOYER_MNEMONIC not configured - run setup-deployer-role.ts');
    }

    const mnemonic = deployerMnemonic.split(' ');
    await this.tonService.initWallet(mnemonic);

    // Register deployment (deployer wallet authorized for this operation)
    await this.tonService.registerDeployment(
        factoryAddress,
        adminWallet,
        channelId,
        monthlyPrice
    );

    console.log('✅ Deployment registered using deployer wallet');
}
```

**Update Environment Variable Validation:**

```typescript
// admin-bot/src/bot.ts or config validation

// OLD:
if (!process.env.ADMIN_MNEMONIC) {
    throw new Error('ADMIN_MNEMONIC required');
}

// NEW:
if (!process.env.DEPLOYER_MNEMONIC) {
    throw new Error('DEPLOYER_MNEMONIC required - see docs/DEPLOYER_ROLE_IMPLEMENTATION.md');
}
```

---

### Phase 4: Testing

**1. Test Registration on Testnet:**
```bash
# Start admin bot
cd admin-bot
npm run dev

# In Telegram:
# 1. Start channel setup wizard
# 2. Backend should register deployment using deployer wallet
# 3. Verify no errors in logs
```

**2. Verify Deployer Authorization:**
```bash
# Query factory contract
cd contracts
npx blueprint run get-deployer

# Expected output:
# Current deployer: UQA...xyz  ← Your deployer wallet
```

**3. Test Full Channel Setup Flow:**
```bash
# Complete flow:
# 1. Admin bot: Setup channel (uses deployer wallet for registration)
# 2. User sends 0.6 TON with "deploy" comment
# 3. Factory auto-deploys using pre-registered params
# 4. Verify subscription contract deployed
```

---

## Emergency Procedures

### Scenario 1: Backend Server Compromised

**Immediate Action:**
```bash
# 1. Retrieve owner mnemonic from cold storage
export FACTORY_OWNER_MNEMONIC="word1 word2 ... word24"

# 2. Revoke compromised deployer
cd contracts
npx ts-node scripts/revoke-deployer.ts

# Output:
# ⚠️  EMERGENCY DEPLOYER REVOCATION ⚠️
# Current deployer: UQA...xyz (compromised)
# Type "REVOKE" to confirm: REVOKE
# ✅ DEPLOYER ACCESS REVOKED

# 3. Generate new deployer
npx ts-node scripts/setup-deployer-role.ts

# 4. Update server .env with new DEPLOYER_MNEMONIC

# 5. Return owner mnemonic to cold storage
```

**Impact During Revocation:**
- ⚠️ Channel setup temporarily disabled until new deployer authorized
- ✅ Existing subscriptions continue working normally
- ✅ Factory contract protected from unauthorized access

---

### Scenario 2: Owner Key Compromised (CRITICAL)

**This is a worst-case scenario requiring full migration:**

```bash
# 1. Deploy NEW factory contract with new owner wallet
cd contracts
# Generate new owner mnemonic (store securely)
npm run deploy:factory

# 2. Migrate all channels to new factory
# (Requires custom migration script - beyond scope)

# 3. Update all bots to use new factory address

# 4. Notify all channel owners to update payment addresses
```

**Prevention:**
- 🔒 NEVER store owner mnemonic on server (this is why we use deployer role!)
- 🔒 Use hardware wallet for owner key
- 🔒 Limit owner key usage to absolute minimum

---

## Security Audit Checklist

Before deploying to mainnet, verify:

- [ ] Owner mnemonic NOT in server .env
- [ ] Owner mnemonic in cold storage (hardware wallet or paper)
- [ ] Deployer mnemonic in server .env
- [ ] Deployer wallet funded with ~1 TON for gas
- [ ] Factory contract `getDeployer()` returns deployer address
- [ ] Backend code uses `DEPLOYER_MNEMONIC` not `ADMIN_MNEMONIC`
- [ ] Test channel setup completes successfully
- [ ] Test deployment registration completes successfully
- [ ] Owner can still update factory fee (test on testnet)
- [ ] Deployer CANNOT update factory fee (should fail)
- [ ] Revocation procedure tested on testnet
- [ ] Backup of deployer mnemonic stored securely
- [ ] Documentation updated with new procedure

---

## Key Management Matrix

| Key Type | Storage Location | Access Level | Revocable | Risk Level |
|----------|-----------------|--------------|-----------|------------|
| **Owner Mnemonic** | Cold storage (hardware wallet/paper) | Full factory control | No (requires migration) | 🔴 CRITICAL |
| **Deployer Mnemonic** | Server encrypted env vars | Register deployments only | Yes (owner can revoke) | 🟡 MODERATE |
| **Channel Admin Wallets** | User's wallet app | Own channel only | Yes (user controls) | 🟢 LOW |

---

## FAQ

### Q: Why not use multi-sig for maximum security?
**A:** Multi-sig requires owner approval for EVERY deployment registration. This defeats the purpose of autonomous backend operations. The deployer role provides the right balance: backend can operate independently for limited operations, while owner retains ultimate control.

### Q: What happens if deployer wallet runs out of gas?
**A:** Channel setup will fail with "insufficient gas" error. Solution: Monitor deployer wallet balance and refill when below 0.5 TON. Can be automated with balance monitoring.

### Q: Can I have multiple deployer wallets?
**A:** Current implementation supports ONE deployer address. To support multiple, modify contract to use a mapping of authorized deployers instead of single `deployer` field. This adds complexity - only needed for large-scale operations.

### Q: What gas fees does deployer pay?
**A:** Each `RegisterDeployment` call costs ~0.01 TON. With 1 TON, deployer can register ~100 deployments. Monitor and refill as needed.

### Q: Can deployer withdraw funds from factory?
**A:** No. Deployer can ONLY call `RegisterDeployment`. All other operations (update fee, withdraw funds, etc.) require owner signature.

### Q: How do I rotate deployer credentials periodically?
**A:**
1. Run `revoke-deployer.ts` (requires owner key from cold storage)
2. Run `setup-deployer-role.ts` (generates new deployer)
3. Update server .env with new `DEPLOYER_MNEMONIC`
4. Return owner key to cold storage

Recommended rotation: Every 6-12 months or after security incident.

---

## Comparison with Other TON Projects

**How major TON projects handle operational keys:**

1. **TON Wallet Contracts:**
   - Use plugins system for authorized operations
   - Similar to deployer role pattern

2. **TON DEX (DeDust, STON.fi):**
   - Separate admin contract with limited privileges
   - Similar pattern to deployer role

3. **TON NFT Marketplaces:**
   - Collection owner vs platform operator roles
   - Exactly same security model we're implementing

**Our Implementation:**
- ✅ Follows TON ecosystem best practices
- ✅ Standard role-based access control
- ✅ Separation of ownership and operations
- ✅ Revocable delegated authority

---

## Summary

**Before:** ❌ Owner key on server → Full factory compromise if hacked

**After:** ✅ Deployer key on server → Limited impact if hacked + revocable access

**Security Improvement:**
- Risk reduced from 🔴 CRITICAL to 🟡 MODERATE
- Owner key in cold storage (never on server)
- Operational independence maintained
- Emergency revocation available
- Standard blockchain security pattern

**Implementation Effort:**
- Contract changes: ~20 lines of Tact code
- Backend changes: ~10 lines of TypeScript
- One-time setup: ~15 minutes
- Ongoing maintenance: Minimal (monitor deployer balance)

**Recommendation:** ✅ Implement before mainnet launch

This is a security best practice used across the blockchain industry. The small implementation effort provides significant risk reduction.
