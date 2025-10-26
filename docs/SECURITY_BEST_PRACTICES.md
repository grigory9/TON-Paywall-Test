# Security Best Practices: TON Subscription Paywall

## Key Management Principles

### Three Types of Keys in This System

| Key Type | Purpose | Risk Level | Storage Location |
|----------|---------|------------|------------------|
| **Owner Key** | Full factory control | 🔴 CRITICAL | Cold storage (hardware wallet/paper) |
| **Deployer Key** | Register deployments | 🟡 MODERATE | Server encrypted env vars |
| **User Keys** | Own channel control | 🟢 LOW | User's wallet app |

---

## Critical Rules

### 🔴 NEVER

1. **NEVER** store owner mnemonic on any server
2. **NEVER** commit mnemonics to git
3. **NEVER** share mnemonics via Telegram/email/Slack
4. **NEVER** use the same mnemonic for multiple contracts
5. **NEVER** store mnemonics in plain text files
6. **NEVER** screenshot mnemonics
7. **NEVER** deploy to mainnet without testing on testnet first
8. **NEVER** skip security audit before mainnet launch

### ✅ ALWAYS

1. **ALWAYS** use deployer role pattern (not owner key on server)
2. **ALWAYS** keep owner mnemonic in cold storage
3. **ALWAYS** use encrypted environment variables on server
4. **ALWAYS** validate TON addresses before sending transactions
5. **ALWAYS** implement 1% payment tolerance for gas fluctuations
6. **ALWAYS** test emergency procedures (key revocation)
7. **ALWAYS** monitor deployer wallet balance
8. **ALWAYS** maintain audit logs of all blockchain transactions

---

## Deployer Role Architecture

### Security Model

```
┌─────────────────────────────────────────────────┐
│ FACTORY CONTRACT                                │
│                                                 │
│ owner: EQD...abc (cold storage)                │
│   ↳ Can: Update fee, withdraw, set deployer    │
│   ↳ Risk if compromised: TOTAL SYSTEM LOSS     │
│                                                 │
│ deployer: UQA...xyz (server hot wallet)        │
│   ↳ Can: Register deployments ONLY             │
│   ↳ Risk if compromised: Spam registrations    │
│   ↳ Revocable: Owner can revoke anytime        │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ KEY STORAGE                                     │
│                                                 │
│ Owner Mnemonic:                                 │
│   - Hardware wallet (Ledger, SafePal)          │
│   - Paper backup in safe                        │
│   - NEVER on any computer                       │
│                                                 │
│ Deployer Mnemonic:                              │
│   - Server .env (encrypted at rest)             │
│   - Backup in password manager                  │
│   - Rotated every 6-12 months                   │
└─────────────────────────────────────────────────┘
```

### Why This Works

**Separation of Privileges:**
- Owner = Strategic control (change fees, emergency actions)
- Deployer = Operational tasks (daily channel setups)

**Limited Blast Radius:**
- Deployer compromise = Annoying (spam) but not catastrophic
- Owner compromise = Catastrophic (require factory migration)

**Revocable Access:**
- Owner can revoke deployer in <5 minutes
- No factory redeployment needed

---

## Setup Checklist

### Initial Deployment (Requires Owner Key)

```bash
# ON SECURE OFFLINE MACHINE (not production server)

# 1. Deploy factory contract
cd contracts
npm run deploy:factory
# Save FACTORY_CONTRACT_ADDRESS to .env

# 2. Generate deployer wallet
npx ts-node scripts/setup-deployer-role.ts
# Outputs deployer mnemonic - save securely

# 3. Fund deployer wallet (send 1 TON to deployer address)

# 4. Authorize deployer (last time using owner key)
npx ts-node scripts/setup-deployer-role.ts
# (Re-run after funding)

# 5. Verify deployer set correctly
npx blueprint run get-deployer

# 6. REMOVE owner mnemonic from any computer
# Store in hardware wallet or write on paper
```

### Production Server Configuration

```bash
# .env on server (NO OWNER KEY)
DATABASE_URL=postgresql://...
ADMIN_BOT_TOKEN=...
PAYMENT_BOT_TOKEN=...
TON_NETWORK=mainnet
FACTORY_CONTRACT_ADDRESS=EQC...
DEPLOYER_MNEMONIC=word1 word2 ... word24  # Deployer only
```

### Backend Code

```typescript
// admin-bot/src/services/contract-deployment.ts

async requestDeploymentFromUser(...) {
    // Use DEPLOYER_MNEMONIC (not owner)
    const deployerMnemonic = process.env.DEPLOYER_MNEMONIC;
    if (!deployerMnemonic) {
        throw new Error('DEPLOYER_MNEMONIC not configured');
    }

    const mnemonic = deployerMnemonic.split(' ');
    await this.tonService.initWallet(mnemonic);

    // Deployer authorized for this operation
    await this.tonService.registerDeployment(...);
}
```

---

## Emergency Procedures

### Scenario 1: Backend Server Compromised

**Immediate Actions:**

```bash
# 1. Shut down bots
pm2 stop all

# 2. Retrieve owner mnemonic from cold storage
# (hardware wallet or paper backup)

# 3. Revoke deployer access
cd contracts
export FACTORY_OWNER_MNEMONIC="word1 word2 ... word24"
npx ts-node scripts/revoke-deployer.ts

# 4. Generate new deployer wallet
npx ts-node scripts/setup-deployer-role.ts

# 5. Update server .env with new DEPLOYER_MNEMONIC

# 6. Return owner mnemonic to cold storage

# 7. Restart bots
pm2 restart all

# 8. Monitor logs for suspicious activity
```

**Impact:**
- Channel setup disabled for ~30 minutes during revocation
- Existing subscriptions continue working normally
- No fund loss

**Post-Incident:**
- Review server logs
- Identify breach vector
- Patch vulnerability
- Consider HSM for future

---

### Scenario 2: Owner Key Compromised (CRITICAL)

**Immediate Actions:**

```bash
# 1. ASSUME TOTAL COMPROMISE
# Attacker has full factory control

# 2. Deploy NEW factory contract with NEW owner key
cd contracts
npm run deploy:factory
# Use COMPLETELY NEW mnemonic (generate fresh)

# 3. Update all bots to use new factory address
# Update .env on all servers

# 4. Notify all channel owners
# They must update payment addresses
# Old channels still work but isolated from new factory

# 5. Gradually migrate channels to new factory
# Create migration script (user-by-user opt-in)
```

**Impact:**
- Major service disruption (hours to days)
- All channels must migrate
- Potential fund loss from old factory

**Prevention:**
- NEVER store owner key on server (this is why we use deployer!)
- Use hardware wallet for owner key
- Multi-signature for owner key if high value

---

### Scenario 3: Deployer Wallet Out of Gas

**Symptoms:**
- Channel setup fails with "insufficient gas" error
- Logs show transaction rejection

**Resolution:**

```bash
# 1. Check deployer balance
npx blueprint run get-deployer-balance

# 2. Send TON to deployer address
# (Use owner wallet or any wallet)

# 3. Verify balance updated
# Re-run get-deployer-balance

# 4. Test channel setup
```

**Prevention:**
- Set up monitoring alert: deployer balance < 0.5 TON
- Automate refill (send 1 TON when balance low)

---

## Monitoring and Alerts

### Critical Metrics

```typescript
// Prometheus metrics to track

// Deployer wallet balance (gauge)
deployer_wallet_balance_ton{network="mainnet"} 1.2

// Registration operations (counter)
deployment_registrations_total{status="success"} 145
deployment_registrations_total{status="failed"} 2

// Gas consumption (histogram)
registration_gas_cost_ton{le="0.01"} 100
registration_gas_cost_ton{le="0.02"} 140
registration_gas_cost_ton{le="0.05"} 145
```

### Alert Rules

```yaml
# alerts.yml

- alert: DeployerWalletLowBalance
  expr: deployer_wallet_balance_ton < 0.5
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Deployer wallet running low on TON"
    description: "Balance: {{ $value }} TON. Refill soon."

- alert: DeployerWalletCritical
  expr: deployer_wallet_balance_ton < 0.1
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Deployer wallet critically low"
    description: "Balance: {{ $value }} TON. Immediate refill required."

- alert: RegistrationFailureRate
  expr: rate(deployment_registrations_total{status="failed"}[5m]) > 0.1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High deployment registration failure rate"

- alert: UnauthorizedDeployerChange
  expr: changes(factory_deployer_address[1h]) > 0
  labels:
    severity: critical
  annotations:
    summary: "Factory deployer address changed"
    description: "Investigate immediately - potential security incident"
```

---

## Security Audit Checklist

### Pre-Mainnet Launch

- [ ] Owner mnemonic stored in hardware wallet or paper backup
- [ ] Owner mnemonic VERIFIED not on any server
- [ ] Deployer wallet funded with 1-2 TON
- [ ] Deployer role correctly set in factory contract
- [ ] Test channel setup flow on testnet (5+ successful setups)
- [ ] Test payment flow on testnet (5+ successful payments)
- [ ] Emergency revocation tested on testnet
- [ ] Monitoring alerts configured and tested
- [ ] Backup of deployer mnemonic in secure location
- [ ] Rate limiting configured for API endpoints
- [ ] Database queries use parameterized statements (no SQL injection)
- [ ] TON address validation on all user inputs
- [ ] Payment tolerance set to 1% (not more)
- [ ] Overpayment refund logic tested
- [ ] Third-party security audit completed
- [ ] Penetration testing completed
- [ ] Documentation up to date
- [ ] Team trained on emergency procedures
- [ ] Incident response plan documented
- [ ] Insurance or bug bounty program considered

### Monthly Security Review

- [ ] Review access logs for anomalies
- [ ] Check deployer wallet balance and refill if needed
- [ ] Verify no unauthorized transactions on factory
- [ ] Review failed registration attempts for patterns
- [ ] Update dependencies (npm audit fix)
- [ ] Test backup and recovery procedures
- [ ] Rotate deployer credentials (every 6-12 months)

---

## Threat Model

### Threat Actors

1. **Script Kiddies:**
   - Capability: Low
   - Motivation: Curiosity, reputation
   - Attack: SQL injection, XSS, known vulnerabilities
   - Defense: Input validation, parameterized queries, updated dependencies

2. **Financial Attackers:**
   - Capability: Medium-High
   - Motivation: Steal funds
   - Attack: Smart contract exploits, backend compromise, phishing
   - Defense: Contract audit, deployer role, cold storage owner key

3. **Competitors:**
   - Capability: Medium
   - Motivation: Service disruption
   - Attack: DDoS, spam attacks, griefing
   - Defense: Rate limiting, anti-spam fees, monitoring

4. **Insider Threats:**
   - Capability: High (has system access)
   - Motivation: Financial gain, sabotage
   - Attack: Key exfiltration, unauthorized transactions
   - Defense: Access logs, principle of least privilege, separation of duties

### Attack Vectors (Ranked by Likelihood)

| Attack | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Backend SQL injection | Medium | High | Parameterized queries |
| DDoS on API | Medium | Medium | Rate limiting, CDN |
| Deployer key theft | Low | Medium | Encrypted env vars, rotation |
| Smart contract exploit | Low | Critical | Security audit, testnet testing |
| Owner key compromise | Very Low | Critical | Cold storage, never on server |
| Social engineering | Medium | Medium | Security training, verification |

---

## Compliance and Best Practices

### Industry Standards

**TON Ecosystem:**
- Follow TON security guidelines: https://docs.ton.org/develop/security
- Use official TON SDK (no third-party forks)
- Test on testnet for minimum 2 weeks before mainnet

**Blockchain Best Practices:**
- Principle of least privilege (deployer role)
- Separation of duties (owner vs deployer)
- Defense in depth (multiple security layers)
- Fail securely (reject invalid inputs, don't process)

**Smart Contract Security:**
- Reentrancy guards on payment functions
- Integer overflow/underflow protection
- Access control modifiers
- Input validation
- Event logging for audit trails

### Recommended Resources

**TON Documentation:**
- https://docs.ton.org/develop/smart-contracts/security
- https://docs.ton.org/develop/smart-contracts/guidelines

**Security Tools:**
- TON Sandbox for testing
- Tact language analyzer
- Slither (if adapting Solidity patterns)

**Third-Party Auditors:**
- CertiK (blockchain security)
- Trail of Bits (smart contracts)
- OpenZeppelin (if using their patterns)

---

## Key Rotation Schedule

### Recommended Rotation Frequency

| Key Type | Rotation Frequency | Reason |
|----------|-------------------|--------|
| **Owner Key** | Never (unless compromised) | Cold storage, minimal use |
| **Deployer Key** | Every 6-12 months | Hot wallet, regular use |
| **Bot Tokens** | Yearly or if leaked | API credentials |
| **Database Passwords** | Quarterly | Good practice |
| **API Keys** | Quarterly | Good practice |

### Deployer Key Rotation Procedure

```bash
# Every 6 months (or after security incident)

# 1. Owner revokes old deployer
npx ts-node scripts/revoke-deployer.ts

# 2. Generate new deployer
npx ts-node scripts/setup-deployer-role.ts

# 3. Fund new deployer wallet

# 4. Authorize new deployer
# (Script handles this)

# 5. Update server .env

# 6. Test channel setup

# 7. Delete old deployer mnemonic
```

---

## Summary: Security Layers

```
Layer 1: Smart Contract Security
  ↳ Deployer role pattern (limited privileges)
  ↳ Access control modifiers
  ↳ Input validation
  ↳ Reentrancy guards

Layer 2: Key Management
  ↳ Owner key in cold storage
  ↳ Deployer key on server (encrypted)
  ↳ Separate keys for separate purposes
  ↳ Revocable deployer access

Layer 3: Backend Security
  ↳ Parameterized SQL queries
  ↳ Input sanitization
  ↳ Rate limiting
  ↳ HTTPS only

Layer 4: Monitoring and Alerts
  ↳ Balance monitoring
  ↳ Transaction monitoring
  ↳ Failed operation alerts
  ↳ Unauthorized access detection

Layer 5: Incident Response
  ↳ Documented procedures
  ↳ Tested emergency actions
  ↳ Team training
  ↳ Regular drills
```

**Remember:** Security is not a one-time task. It's an ongoing process of monitoring, updating, and improving.

**The deployer role pattern is your first line of defense against key compromise. Use it wisely.**
