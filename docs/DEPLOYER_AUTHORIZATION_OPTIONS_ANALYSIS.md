# Deployer Authorization: Comprehensive Options Analysis

## Context

**Question:** Can the backend use a mnemonic that is NOT the factory owner's key?

**Current Risk:** Backend stores `FACTORY_OWNER_MNEMONIC` which grants full control over the factory contract. If server is compromised, attacker can:
- Drain factory funds
- Change deployment fees
- Deploy malicious contracts
- Brick the entire system

**Requirement:** Backend must be able to pre-register deployment parameters securely without storing owner's private key.

---

## Option 1: Deployer Role Pattern ⭐ RECOMMENDED

### Description
Add a separate `deployer` address to the factory contract. The deployer can ONLY register deployment parameters, not perform owner-level operations.

### Smart Contract Implementation

```tact
contract SubscriptionFactory with Deployable, Ownable {
    owner: Address;
    deployer: Address;  // NEW: Operational role for backend

    init(owner: Address) {
        self.owner = owner;
        self.deployer = owner; // Initially owner, can be changed
    }

    // Owner can designate deployer (one-time operation)
    receive(msg: SetDeployer) {
        self.requireOwner();
        self.deployer = msg.newDeployer;
    }

    // Deployer OR owner can register
    receive(msg: RegisterDeployment) {
        let ctx: Context = context();
        require(
            ctx.sender == self.owner || ctx.sender == self.deployer,
            "Unauthorized"
        );
        // ... store registration
    }

    // ONLY owner can update fee (deployer cannot)
    receive(msg: UpdateFactoryFee) {
        self.requireOwner();  // Deployer excluded
        self.deploymentFee = msg.newFee;
    }

    get fun getDeployer(): Address {
        return self.deployer;
    }
}
```

### Setup Procedure

```bash
# 1. Deploy factory (owner wallet)
npm run deploy:factory

# 2. Generate deployer wallet (one-time)
npx ts-node scripts/setup-deployer-role.ts
# Output: Deployer mnemonic (save to server .env)

# 3. Fund deployer wallet (~1 TON for gas)

# 4. Authorize deployer (requires owner key, LAST time)
# Script sends SetDeployer(deployerAddress) to factory

# 5. Remove owner mnemonic from server
# Keep only DEPLOYER_MNEMONIC on server
```

### Backend Usage

```typescript
// .env on server
DEPLOYER_MNEMONIC=word1 word2 ... word24

// Backend code
async requestDeploymentFromUser(...) {
    const deployerMnemonic = process.env.DEPLOYER_MNEMONIC.split(' ');
    await this.tonService.initWallet(deployerMnemonic);

    // This works because deployer is authorized
    await this.tonService.registerDeployment(...);
}
```

### Emergency Revocation

```typescript
// If backend compromised:
// 1. Owner (from cold storage) calls SetDeployer(ownerAddress)
// 2. Deployer access immediately revoked
// 3. Generate new deployer wallet
// 4. Re-authorize new deployer
```

### Pros
✅ **Principle of Least Privilege:** Backend has minimal necessary permissions
✅ **Key Separation:** Owner key offline, deployer key online
✅ **Revocable Access:** Owner can revoke deployer anytime
✅ **Limited Blast Radius:** Compromised deployer can only spam registrations
✅ **Industry Standard:** Same pattern as OpenZeppelin AccessControl
✅ **Simple Implementation:** ~30 lines of Tact code
✅ **Easy to Audit:** Clear security boundaries
✅ **No Breaking Changes:** Existing flow works the same

### Cons
❌ **Still Requires Hot Wallet:** Deployer mnemonic stored on server (but less risky)
❌ **One-Time Owner Key Usage:** Need owner key once to set deployer
❌ **Gas Monitoring:** Deployer wallet needs periodic refills

### Security Analysis

**Impact if Deployer Compromised:**
- Attacker can register spam deployments (low impact, rate-limited by gas)
- Attacker CANNOT drain funds (no access to owner functions)
- Attacker CANNOT change fee (requires owner)
- Owner can revoke access within minutes

**Impact if Owner Compromised:**
- Complete factory control (same as current)
- This is why owner MUST be in cold storage

**Risk Reduction:**
- Before: Server breach = 🔴 CRITICAL (full factory compromise)
- After: Server breach = 🟡 MODERATE (limited spam potential)

### Implementation Complexity
- **Contract Changes:** Low (add deployer field, update one require statement)
- **Setup Effort:** Low (one-time script execution)
- **Ongoing Maintenance:** Low (monitor deployer balance)
- **Testing Effort:** Low (existing tests mostly work)

### Cost Analysis
- Deployer setup: ~0.05 TON (one-time)
- Gas per registration: ~0.01 TON
- Monthly cost: ~1 TON if 100 channels/month

### Recommended? ✅ **YES - Best option for this use case**

---

## Option 2: Multi-Signature Approval

### Description
Require both backend signature AND owner signature for registration. Use TON multi-sig wallet contract.

### Implementation Approach

```tact
// Would integrate with multi-sig wallet contract
// Backend proposes transaction → Owner approves → Executes

// Problem: Owner must be ONLINE to approve every registration
```

### Workflow

```
User starts setup → Backend proposes RegisterDeployment
                  ↓
            Owner notified (email/telegram)
                  ↓
            Owner reviews proposal
                  ↓
            Owner signs approval
                  ↓
            Transaction executes
                  ↓
            User receives payment address
```

### Pros
✅ **Maximum Security:** Requires both parties to authorize
✅ **No Hot Wallet Risk:** Backend never has signing authority
✅ **Audit Trail:** All proposals logged

### Cons
❌ **Owner Must Be Online:** Cannot automate channel setup
❌ **Poor UX:** Users wait hours/days for owner approval
❌ **High Complexity:** Multi-sig wallet integration, proposal system
❌ **Not Scalable:** Owner bottleneck for every channel
❌ **Gas Overhead:** Multiple transactions per registration
❌ **Defeats Automation:** Backend can't operate autonomously

### Use Cases
- Suitable for: High-value transactions (>$10k), rare operations
- NOT suitable for: Frequent operational tasks (channel setup)

### Recommended? ❌ **NO - Defeats purpose of autonomous backend**

---

## Option 3: Public Registration with Anti-Spam Safeguards

### Description
Remove authorization requirement entirely. Anyone can register, but add economic and rate-limiting safeguards.

### Implementation

```tact
receive(msg: RegisterDeployment) {
    let ctx: Context = context();

    // Require payment to prevent spam (anti-spam fee)
    require(ctx.value >= ton("0.05"), "Registration fee required");

    // Rate limit: 1 registration per address per hour
    let senderHash: Int = ctx.sender.asSlice().hash();
    let lastReg: Int? = self.lastRegistration.get(senderHash);
    if (lastReg != null) {
        require(now() - lastReg!! > 3600, "Rate limit exceeded");
    }

    // Store registration
    self.registeredDeployments.set(msg.userWallet.asSlice().hash(), ...);

    // Update rate limit tracker
    self.lastRegistration.set(senderHash, now());

    // Keep fee as anti-spam deterrent
}
```

### Safeguards

1. **Economic Deterrent:** 0.05 TON fee per registration
2. **Rate Limiting:** 1 registration per address per hour
3. **Expiry:** Registrations expire after 1 hour
4. **Gas Cost:** Each spam attempt costs attacker money

### Attack Vectors

**Spam Attack:**
- Attacker registers 1000 fake deployments
- Cost: 1000 × 0.05 TON = 50 TON
- Impact: Factory storage bloated (but cleared after 1 hour expiry)

**Griefing Attack:**
- Attacker registers legitimate channelId with malicious price
- Victim cannot register same channelId (blocked)
- Impact: Denial of service for specific channels

**Sybil Attack:**
- Attacker creates multiple wallets to bypass rate limit
- Cost: Gas fees for wallet creation + registration fees
- Impact: Still can spam if willing to pay

### Pros
✅ **No Key Management:** Backend doesn't need ANY signing key for registration
✅ **Fully Decentralized:** No trust required
✅ **Gas Revenue:** Registration fees collected by factory

### Cons
❌ **Security Risk:** Anyone can register malicious parameters
❌ **Griefing Possible:** Attackers can block legitimate registrations
❌ **Rate Limiting Bypassable:** Multiple wallets defeat rate limits
❌ **No Authentication:** Cannot verify channel ownership
❌ **Economic Attack:** Cheap to spam if fee too low
❌ **UX Friction:** Legitimate users pay unnecessary fees

### Recommended? ❌ **NO - Insufficient security, griefing attacks possible**

---

## Option 4: Operator Contract Pattern

### Description
Deploy a separate "operator" contract controlled by backend. Factory authorizes operator contract, operator forwards messages.

### Architecture

```
Backend → Operator Contract → Factory Contract
          (backend owns)      (owner owns)
```

### Implementation

```tact
// Operator contract (controlled by backend)
contract DeploymentOperator with Ownable {
    owner: Address;         // Backend wallet
    factoryAddress: Address;

    init(owner: Address, factory: Address) {
        self.owner = owner;
        self.factoryAddress = factory;
    }

    receive(msg: RegisterDeployment) {
        self.requireOwner(); // Backend calls this

        // Forward to factory
        send(SendParameters{
            to: self.factoryAddress,
            value: ton("0.05"),
            body: msg.toCell()
        });
    }
}

// Factory contract
contract SubscriptionFactory {
    operatorContract: Address; // Authorized operator

    receive(msg: SetOperator) {
        self.requireOwner();
        self.operatorContract = msg.operator;
    }

    receive(msg: RegisterDeployment) {
        let ctx: Context = context();
        require(ctx.sender == self.operatorContract, "Unauthorized");
        // ... store registration
    }
}
```

### Setup Procedure

```bash
# 1. Deploy factory (owner)
# 2. Deploy operator contract (backend wallet as owner)
# 3. Factory owner calls SetOperator(operatorAddress)
# 4. Backend interacts with operator contract
```

### Pros
✅ **Separation of Concerns:** Backend controls operator, not factory
✅ **Revocable:** Owner can revoke operator authorization
✅ **Flexibility:** Can add more operators easily

### Cons
❌ **Extra Contract:** Deployment cost (~0.1 TON)
❌ **Gas Overhead:** Message forwarding adds gas cost
❌ **Complexity:** Two contracts to maintain instead of one
❌ **Still Hot Wallet:** Backend must store operator contract owner key
❌ **Over-Engineering:** Adds complexity without significant benefit
❌ **Same Security Model:** Functionally equivalent to deployer role (Option 1)

### Comparison to Option 1

| Aspect | Deployer Role | Operator Contract |
|--------|---------------|-------------------|
| Security | Same | Same |
| Gas Cost | Lower | Higher (forwarding) |
| Complexity | Simpler | More complex |
| Deployment Cost | $0 | ~0.1 TON |
| Maintenance | Lower | Higher |

**Verdict:** Operator contract is over-engineered. Deployer role achieves same security with less complexity.

### Recommended? ❌ **NO - Deployer role is simpler and equally secure**

---

## Option 5: Hardware Security Module (HSM) Integration

### Description
Use enterprise Hardware Security Module to store deployer key. Backend makes signing requests to HSM without ever accessing key directly.

### Architecture

```
Backend → HSM API → Signs Transaction → Blockchain
          (key isolated)
```

### Implementation

```typescript
// Backend code
import { HSMClient } from '@some-hsm-provider/sdk';

async requestDeploymentFromUser(...) {
    const hsmClient = new HSMClient({
        keyId: 'DEPLOYER_KEY_ID',
        credentials: process.env.HSM_CREDENTIALS
    });

    // HSM signs transaction without exposing key
    const signature = await hsmClient.sign(transactionData);

    await this.tonService.sendSignedTransaction(signature);
}
```

### HSM Options

**Cloud HSM Services:**
- AWS CloudHSM: $1/hour + $1-5 per key
- Google Cloud HSM: Similar pricing
- Azure Key Vault: $0.03 per 10k operations

**Hardware HSM:**
- YubiHSM 2: $650 one-time purchase
- Ledger Enterprise: Custom pricing
- Thales Luna: $5000+

### Pros
✅ **Maximum Key Protection:** Private key never leaves HSM
✅ **Tamper-Resistant:** Hardware-enforced security
✅ **Compliance:** Meets enterprise security standards
✅ **Audit Trail:** All signing operations logged

### Cons
❌ **High Cost:** $30-100/month (cloud) or $650+ (hardware)
❌ **Complexity:** HSM integration, key management, monitoring
❌ **Dependency:** Relies on third-party service
❌ **Latency:** Network calls to HSM add delay
❌ **Overkill:** Deployer role with basic security sufficient for this use case
❌ **TON Support:** Not all HSMs support TON signing (would need custom implementation)

### When to Use HSM
- Managing millions of dollars in assets
- Enterprise/institutional deployment
- Regulatory compliance requirements (SOC2, ISO 27001)
- Managing owner key (NOT deployer key)

### For This Project
**Deployer Role:** Basic encrypted environment variables sufficient
**Owner Key:** HSM or hardware wallet RECOMMENDED (if managing many channels)

### Recommended? ⚠️ **OPTIONAL - Only if managing high-value owner key, not needed for deployer**

---

## Option 6: Threshold Cryptography (Shamir Secret Sharing)

### Description
Split deployer key into N shares, require M shares to reconstruct (e.g., 2-of-3). Distribute shares across multiple servers/people.

### Implementation

```typescript
// Split key into 3 shares, require 2 to reconstruct
const shares = shamirSecretSharing.split(deployerMnemonic, {
    shares: 3,
    threshold: 2
});

// Distribute:
// Share 1 → Server A
// Share 2 → Server B
// Share 3 → Cold storage backup

// To sign transaction (requires 2 shares):
const share1 = getShareFromServerA();
const share2 = getShareFromServerB();
const reconstructed = shamirSecretSharing.combine([share1, share2]);
await signTransaction(reconstructed);
```

### Pros
✅ **No Single Point of Failure:** No single server has full key
✅ **Resilience:** Can lose M-1 shares and still operate
✅ **Distributed Trust:** Multiple parties must collude to steal key

### Cons
❌ **High Complexity:** Share distribution, coordination, reconstruction
❌ **Latency:** Must fetch shares from multiple sources
❌ **Deployment Overhead:** Requires multiple secure servers
❌ **Not Truly More Secure:** If 2 servers compromised, key is compromised
❌ **Overkill:** Deployer has limited privileges anyway

### When to Use
- Multi-party organizations (multiple stakeholders)
- High-security environments (nation-state threat model)
- Owner key management (NOT deployer)

### Recommended? ❌ **NO - Excessive complexity for limited-privilege deployer key**

---

## Comprehensive Comparison Matrix

| Criteria | Option 1: Deployer Role | Option 2: Multi-Sig | Option 3: Public | Option 4: Operator Contract | Option 5: HSM | Option 6: Threshold |
|----------|------------------------|---------------------|------------------|----------------------------|---------------|---------------------|
| **Security** | ⭐⭐⭐⭐ High | ⭐⭐⭐⭐⭐ Maximum | ⭐⭐ Low | ⭐⭐⭐⭐ High | ⭐⭐⭐⭐⭐ Maximum | ⭐⭐⭐⭐⭐ Maximum |
| **Complexity** | ⭐⭐⭐⭐ Low | ⭐⭐ High | ⭐⭐⭐⭐⭐ Minimal | ⭐⭐⭐ Medium | ⭐⭐ High | ⭐ Very High |
| **Cost** | ⭐⭐⭐⭐⭐ Free | ⭐⭐⭐ Low | ⭐⭐⭐⭐ Free | ⭐⭐⭐⭐ Low | ⭐⭐ Medium-High | ⭐⭐⭐ Medium |
| **Autonomy** | ⭐⭐⭐⭐⭐ Full | ⭐ None | ⭐⭐⭐⭐⭐ Full | ⭐⭐⭐⭐⭐ Full | ⭐⭐⭐⭐⭐ Full | ⭐⭐⭐⭐ High |
| **UX** | ⭐⭐⭐⭐⭐ Excellent | ⭐ Poor | ⭐⭐⭐ Adds friction | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐ Good |
| **Auditability** | ⭐⭐⭐⭐ Clear | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐ Unclear | ⭐⭐⭐⭐ Clear | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐ Good |
| **Revocability** | ⭐⭐⭐⭐⭐ Instant | ⭐⭐⭐⭐⭐ Instant | ❌ N/A | ⭐⭐⭐⭐⭐ Instant | ⭐⭐⭐⭐⭐ Instant | ⭐⭐⭐⭐ Delayed |
| **Setup Time** | ⭐⭐⭐⭐ 15 min | ⭐⭐ Hours | ⭐⭐⭐⭐⭐ 5 min | ⭐⭐⭐ 30 min | ⭐⭐ Days | ⭐ Weeks |
| **TON Native** | ⭐⭐⭐⭐⭐ Yes | ⭐⭐⭐ Partial | ⭐⭐⭐⭐⭐ Yes | ⭐⭐⭐⭐⭐ Yes | ⭐⭐ Limited | ⭐⭐⭐ Custom |

---

## Final Recommendation

### 🏆 Implement Option 1: Deployer Role Pattern

**Rationale:**

1. **Right Security Level:**
   - Owner key in cold storage (maximum security for critical operations)
   - Deployer key on server (acceptable risk for limited operations)
   - Clear separation of privileges

2. **Practical Operation:**
   - Backend can operate autonomously
   - No manual approval bottlenecks
   - User experience remains smooth

3. **Industry Standard:**
   - Used by major DeFi protocols (Uniswap, Compound, Aave)
   - Proven pattern in blockchain ecosystems
   - Easy for auditors to understand

4. **Cost-Effective:**
   - No ongoing service fees
   - Minimal gas overhead
   - One-time setup effort

5. **Maintainable:**
   - Simple code (easy to audit)
   - Clear emergency procedures
   - Well-documented pattern

6. **Scalable:**
   - No performance bottlenecks
   - Can handle thousands of channels
   - Easy to add more roles if needed

### Implementation Timeline

**Week 1:**
- [ ] Update factory contract with deployer role
- [ ] Write setup script
- [ ] Write revocation script
- [ ] Test on local sandbox

**Week 2:**
- [ ] Deploy to testnet
- [ ] Run setup procedure
- [ ] Test full channel setup flow
- [ ] Update backend code

**Week 3:**
- [ ] Security review
- [ ] Documentation
- [ ] Emergency procedure testing

**Week 4:**
- [ ] Mainnet deployment (if testnet successful)

### Security Checklist Before Mainnet

- [ ] Owner mnemonic NOT on any server
- [ ] Owner mnemonic in hardware wallet or paper backup
- [ ] Deployer wallet funded with 1-2 TON
- [ ] Factory `getDeployer()` returns correct address
- [ ] Test registration with deployer wallet succeeds
- [ ] Test fee update with deployer wallet fails (should reject)
- [ ] Test revocation procedure on testnet
- [ ] Backup of deployer mnemonic in secure location
- [ ] Monitoring alert for deployer wallet balance < 0.5 TON

### Alternative Paths

**If Budget Allows (>$10k/month):**
- Use HSM for owner key storage (Option 5)
- Keep deployer role for operational tasks
- Best of both worlds: Maximum security + operational flexibility

**If Multi-Party Ownership:**
- Consider threshold cryptography for OWNER key (Option 6)
- Keep deployer role for backend operations
- Multiple stakeholders share owner control

**If Extremely High Security Needs:**
- Combine deployer role + HSM + threshold
- Owner key: Threshold HSM (requires 2-of-3 board members)
- Deployer key: Single HSM (automated operations)
- Cost: ~$100-200/month + hardware
- Only justified for managing >$1M in assets

---

## Conclusion

**The deployer role pattern (Option 1) provides the optimal balance of security, usability, cost, and complexity for this project.**

It reduces the risk of storing owner keys on the server while maintaining operational autonomy. This pattern is battle-tested in production blockchain systems and is the industry standard for separating ownership from operational control.

**Do NOT use:**
- Multi-sig (defeats automation)
- Public registration (security holes)
- Operator contract (over-engineered)

**Optional enhancements:**
- HSM for owner key (if high value)
- Threshold for owner key (if multi-party)

**Start simple, scale security with value.**
