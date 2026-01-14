# Security Operations Guide

This document covers security-critical operations for the minting service, including wallet management, incident response, disaster recovery, and approval workflows.

## Table of Contents

1. [Hardware Wallet Setup](#hardware-wallet-setup)
2. [Key Management](#key-management)
3. [Incident Response](#incident-response)
4. [Disaster Recovery](#disaster-recovery)
5. [Approval Workflows](#approval-workflows)

---

## Hardware Wallet Setup

### Overview

The minting service uses a tiered wallet architecture. Critical wallets (Master, Treasury) MUST use hardware wallets for maximum security.

### Supported Hardware Wallets

| Wallet | Model | Use Case |
|--------|-------|----------|
| Ledger | Nano X, Nano S Plus | Master wallet, Treasury signing |
| Trezor | Model T, Model One | Backup master wallet |

### Ledger Setup for Master Wallet

#### 1. Initial Setup

```bash
# 1. Initialize Ledger (factory reset if used before)
# - Connect Ledger to secure offline computer
# - Follow on-device setup instructions
# - Write down 24-word recovery phrase on metal backup

# 2. Install Solana app on Ledger
# - Open Ledger Live on air-gapped computer
# - Install "Solana" app from Manager

# 3. Get public key
# Connect to computer with Solana CLI
solana-keygen pubkey usb://ledger
# Output: 8xK3...ABC (your master wallet address)
```

#### 2. Configure as Collection Authority

```bash
# Transfer collection authority to hardware wallet
# This requires current authority to sign

# On machine with current authority
solana program invoke \
  --program-id metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
  --data "set_collection_authority" \
  --account collection_mint \
  --account new_authority:8xK3...ABC \  # Ledger pubkey
  --signer current_authority.json

# Verify transfer
solana account 8xK3...ABC
```

#### 3. Signing Transactions with Ledger

```bash
# For emergency operations requiring master wallet
# Connect Ledger and unlock with PIN

# Sign a transaction
solana transfer \
  --from usb://ledger \
  --to DESTINATION_ADDRESS \
  --amount 1 \
  --fee-payer fee-payer.json  # Hot wallet pays fees
  
# Ledger will prompt for confirmation on device
# ALWAYS verify transaction details on Ledger screen
```

### Multi-Signature Treasury Setup (Squads)

```bash
# 1. Create Squads multisig
# Visit: https://app.squads.so/

# 2. Configure signers (2-of-3 recommended)
# - Signer 1: Hardware wallet (Ledger)
# - Signer 2: Hardware wallet (Trezor, different person)
# - Signer 3: Software wallet (emergency only)

# 3. Set threshold: 2 signatures required

# 4. Fund the multisig vault
solana transfer SQUADS_VAULT_ADDRESS 10 --from funding-wallet.json
```

### Hardware Wallet Security Checklist

- [ ] Recovery phrase stored in fireproof safe (2 locations)
- [ ] Recovery phrase NEVER photographed or digitized
- [ ] Hardware wallet stored in secure location
- [ ] PIN changed from default
- [ ] Firmware up to date
- [ ] Verify receive addresses on device screen
- [ ] Test recovery process annually

---

## Key Management

### Key Types and Storage

| Key Type | Storage | Rotation | Access |
|----------|---------|----------|--------|
| Master | Hardware wallet (Ledger) | Never (recovery only) | Physical access only |
| Treasury | Multi-sig (Squads) | Annually | 2 of 3 signers |
| Fee Payer | AWS KMS / Vault | Quarterly | Service account |
| Collection Authority | AWS KMS / Vault | Quarterly | Service account |

### AWS KMS Configuration

```bash
# Create KMS key for wallet encryption
aws kms create-key \
  --description "Minting service wallet key" \
  --key-usage ENCRYPT_DECRYPT \
  --customer-master-key-spec SYMMETRIC_DEFAULT

# Store wallet private key in Secrets Manager
aws secretsmanager create-secret \
  --name minting-service/fee-payer-wallet \
  --secret-string '{"private_key": "[ENCRYPTED_KEY]"}' \
  --kms-key-id alias/minting-wallet-key
```

### HashiCorp Vault Configuration

```bash
# Enable KV secrets engine
vault secrets enable -path=minting kv-v2

# Store wallet key
vault kv put minting/fee-payer \
  private_key="[BASE58_ENCODED_KEY]"

# Create policy for service access
vault policy write minting-service - <<EOF
path "minting/data/fee-payer" {
  capabilities = ["read"]
}
EOF

# Create app role for service
vault auth enable approle
vault write auth/approle/role/minting-service \
  secret_id_ttl=24h \
  token_ttl=1h \
  token_max_ttl=4h \
  policies="minting-service"
```

### Key Rotation Procedure

See [BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md#key-rotation-procedures) for detailed rotation steps.

---

## Incident Response

### Security Incident Classification

| Severity | Description | Response Time | Example |
|----------|-------------|---------------|---------|
| P0 | Active compromise | Immediate | Wallet drained, key leaked |
| P1 | Potential compromise | < 1 hour | Suspicious transactions |
| P2 | Security vulnerability | < 24 hours | Unpatched CVE |
| P3 | Security improvement | < 1 week | Missing audit trail |

### P0: Wallet Compromise Response

**Immediate Actions (0-15 minutes):**

```bash
# 1. STOP ALL SERVICES IMMEDIATELY
kubectl scale deployment/minting-service --replicas=0
kubectl scale deployment/minting-worker --replicas=0

# 2. Revoke all API access
kubectl delete secret minting-service-secrets

# 3. Document current wallet balance
solana balance $COMPROMISED_WALLET_ADDRESS

# 4. If funds remain, attempt emergency transfer to treasury
# (Only if you still have control)
solana transfer $TREASURY_MULTISIG ALL \
  --from compromised-wallet.json
```

**Short-term Actions (15 min - 2 hours):**

```bash
# 1. Generate new wallet on air-gapped machine
solana-keygen new --outfile new-fee-payer.json

# 2. Fund new wallet from treasury (requires multi-sig)
# Coordinate with treasury signers

# 3. Update secrets
aws secretsmanager update-secret \
  --secret-id minting-service/fee-payer-wallet \
  --secret-string "$(cat new-fee-payer.json)"

# 4. If collection authority compromised, transfer it
# This requires master wallet (hardware wallet)
```

**Recovery Actions (2+ hours):**

1. Forensic analysis of logs
2. Identify attack vector
3. Patch vulnerability
4. Redeploy services with new credentials
5. Monitor for further suspicious activity
6. File incident report

### P1: Suspicious Activity Response

```bash
# 1. Review recent transactions
solana transaction-history $WALLET_ADDRESS --limit 20

# 2. Check for unauthorized signing
# Look for transactions not matching expected patterns

# 3. Review access logs
kubectl logs -l app=minting-service --since=1h | grep -i "sign\|transfer\|authority"

# 4. If confirmed malicious:
# Escalate to P0 and follow compromise procedure
```

### Incident Communication Template

```
SECURITY INCIDENT REPORT

Severity: P0/P1/P2/P3
Status: Active/Contained/Resolved
Incident ID: SEC-2026-001

Summary:
[Brief description of incident]

Timeline:
- YYYY-MM-DD HH:MM: Incident detected
- YYYY-MM-DD HH:MM: Response initiated
- YYYY-MM-DD HH:MM: [Current status]

Impact:
- Affected systems:
- Data exposure:
- Financial impact:

Actions Taken:
1. [Action 1]
2. [Action 2]

Root Cause:
[To be determined / Description]

Remediation:
[Steps taken/planned to prevent recurrence]

Contacts:
- Incident Commander: [Name]
- Security Lead: [Name]
```

---

## Disaster Recovery

### Recovery Time Objectives

| Component | RTO | RPO | Priority |
|-----------|-----|-----|----------|
| API Service | 15 min | N/A | Critical |
| Queue Workers | 30 min | 0 (queue persisted) | Critical |
| Database | 1 hour | 5 min | Critical |
| Wallet Access | 4 hours | N/A | High |

### DR Scenarios

#### Scenario 1: Complete Cloud Region Failure

```bash
# 1. Activate DR region
kubectl config use-context dr-region

# 2. Update DNS to DR region
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch file://dr-dns-failover.json

# 3. Verify database replica is promoted
aws rds promote-read-replica \
  --db-instance-identifier minting-dr-replica

# 4. Update Redis to DR cluster
kubectl set env deployment/minting-service \
  REDIS_HOST=$DR_REDIS_HOST

# 5. Start services
kubectl scale deployment/minting-service --replicas=3
kubectl scale deployment/minting-worker --replicas=3
```

#### Scenario 2: Database Corruption

```bash
# 1. Stop services to prevent further corruption
kubectl scale deployment/minting-service --replicas=0

# 2. Identify last good backup
aws rds describe-db-snapshots \
  --db-instance-identifier minting-db \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]'

# 3. Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier minting-db-restored \
  --db-snapshot-identifier minting-db-snapshot-20260101

# 4. Update connection string
kubectl set env deployment/minting-service \
  DATABASE_HOST=$RESTORED_DB_HOST

# 5. Restart services
kubectl scale deployment/minting-service --replicas=3
```

#### Scenario 3: Wallet Key Loss

```bash
# This is why we have hardware wallet backup!

# 1. Retrieve master wallet (hardware wallet)
# Physically access secure storage location

# 2. Connect Ledger and verify access
solana-keygen pubkey usb://ledger

# 3. If master wallet also lost:
# Use recovery phrase to restore hardware wallet
# - Factory reset Ledger
# - Choose "Restore from recovery phrase"
# - Enter 24 words

# 4. Generate new fee payer wallet
solana-keygen new --outfile new-fee-payer.json

# 5. Transfer authority if needed
# (Requires master wallet signature)
```

### DR Testing Schedule

| Test | Frequency | Last Test | Next Test |
|------|-----------|-----------|-----------|
| Database restore | Quarterly | 2025-10-15 | 2026-01-15 |
| Region failover | Semi-annual | 2025-07-01 | 2026-01-01 |
| Wallet recovery | Annual | 2025-06-01 | 2026-06-01 |
| Full DR drill | Annual | 2025-09-01 | 2026-09-01 |

---

## Approval Workflows

### High-Risk Operation Approvals

| Operation | Approvers | Required | Method |
|-----------|-----------|----------|--------|
| Key rotation | Security + DevOps | 2 of 2 | GitHub PR + Slack |
| Treasury transfer (>10 SOL) | CFO + CTO | 2 of 2 | Multi-sig |
| Production deployment | Engineering Lead | 1 of 1 | GitHub PR |
| Emergency access | On-call + Security | 2 of 2 | PagerDuty |

### Key Rotation Approval Process

```
1. Engineer creates rotation request
   └─> GitHub Issue with [KEY-ROTATION] tag

2. Security team reviews
   └─> Verifies new key generated securely
   └─> Approves in GitHub

3. DevOps schedules maintenance window
   └─> Updates calendar, notifies team
   └─> Approves in GitHub

4. Rotation executed during window
   └─> Both approvers present (Zoom/on-site)

5. Verification and sign-off
   └─> Both approvers confirm success
   └─> Close issue with summary
```

### Treasury Transfer Workflow

```
1. Request initiated in Squads
   └─> Requestor enters amount, destination, reason

2. First approval (CFO)
   └─> Reviews transaction details
   └─> Signs with hardware wallet

3. Second approval (CTO)  
   └─> Reviews transaction details
   └─> Signs with hardware wallet

4. Transaction executes automatically
   └─> Multi-sig threshold met

5. Confirmation sent to all parties
   └─> Slack notification
   └─> Email confirmation
```

### Emergency Access Procedure

```
1. On-call engineer requests emergency access
   └─> PagerDuty incident created
   └─> Reason documented

2. Security team member approves
   └─> Verifies incident severity
   └─> Approves in PagerDuty

3. Temporary credentials issued
   └─> 4-hour TTL
   └─> Logged in audit trail

4. Access revoked automatically
   └─> Or manually after incident resolved

5. Post-incident review
   └─> Access usage reviewed
   └─> Documented in incident report
```

### Approval Audit Trail

All approvals are logged:

```json
{
  "operation": "key_rotation",
  "requestor": "alice@example.com",
  "approvers": ["security@example.com", "devops@example.com"],
  "timestamp": "2026-01-02T16:00:00Z",
  "approved_at": "2026-01-02T16:30:00Z",
  "executed_at": "2026-01-02T17:00:00Z",
  "result": "success",
  "audit_hash": "sha256:abc123..."
}
```

---

## Security Contacts

| Role | Contact | Phone |
|------|---------|-------|
| Security Lead | security@tickettoken.io | +1-xxx-xxx-xxxx |
| On-call | pager@tickettoken.io | PagerDuty |
| CFO (Treasury) | cfo@tickettoken.io | +1-xxx-xxx-xxxx |
| CTO (Emergency) | cto@tickettoken.io | +1-xxx-xxx-xxxx |

## External Resources

- [Ledger Support](https://support.ledger.com/)
- [Squads Multi-sig](https://squads.so/docs)
- [Solana Security Best Practices](https://docs.solana.com/developing/programming-model/security)
- [AWS Security Hub](https://aws.amazon.com/security-hub/)
