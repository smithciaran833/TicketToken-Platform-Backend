# Minting Service - 36 Wallet Security Audit

**Service:** minting-service
**Document:** 36-wallet-security.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 9% (6/64 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | Keys in plaintext JSON, Single wallet, No multisig, No spending limits |
| HIGH | 4 | No key rotation, No external alerting, No tx monitoring, No address allowlist |
| MEDIUM | 4 | No hardware wallet, No incident response, No DR plan, No approval workflows |
| LOW | 0 | None |

## 1. Private Key Storage (2/9)

- Keys not in source - PASS
- Keys not in env vars - PASS
- Keys in HSM/KMS - FAIL
- FIPS 140-3 Level 3 - FAIL
- Key material encrypted - FAIL
- Encrypted backups - REQUIRES VERIFICATION
- Recovery procedures - FAIL
- MFA for key access - FAIL
- Key operations logged - PASS

## 2. Wallet Architecture (0/8)

- Tiered structure (hot/warm/cold) - FAIL
- Hot wallet ≤5% - REQUIRES VERIFICATION
- Cold storage ≥80% - FAIL
- Multiple hot wallets - FAIL
- Wallets segregated - FAIL
- Per-transaction limits - FAIL
- Daily limits - FAIL
- Time-delayed transactions - FAIL

## 3. Multi-Sig/MPC (0/10)

- Multisig required - FAIL
- Threshold not N-of-N - N/A
- 3-of-5 operational - FAIL
- 4-of-7 treasury - N/A
- Separate signer devices - FAIL
- Geographic distribution - FAIL
- Rotation procedure - FAIL
- Timelocks - FAIL
- RBAC - PARTIAL
- Disaster recovery - FAIL

## 4. Transaction Signing (2/10)

- Hardened signing devices - FAIL
- Air-gapped devices - FAIL
- Simulation before signing - PARTIAL
- Recipient verified - FAIL
- Raw tx verified - FAIL
- OOB verification - FAIL
- Signing error scrutiny - PARTIAL
- Hardware wallet displays - FAIL
- All signed tx logged - PASS

## 5. Key Rotation (0/7)

- Rotation designed in - FAIL
- Procedures documented - FAIL
- Regular schedule - FAIL
- Procedures tested - FAIL
- Emergency rotation - FAIL
- Old keys destroyed - FAIL
- Rotation logged - FAIL

## 6. Monitoring & Alerting (1/8)

- Real-time tx monitoring - PARTIAL
- Balance alerts - PASS
- Large tx alerts - FAIL
- Outgoing tx alerts - FAIL
- Multiple notification channels - FAIL
- 24/7 monitoring - PARTIAL
- Incident response docs - FAIL
- Threat actor tracking - FAIL

## 7. Access Controls (1/8)

- Approval workflows - FAIL
- Multiple reviewers - FAIL
- Spending limits enforced - FAIL
- 2FA for wallet access - FAIL
- Hardware security keys - FAIL
- Audit logs - PASS
- Regular access reviews - REQUIRES VERIFICATION
- Offboarding revocation - FAIL

## Critical Evidence

### Plaintext Key Storage (CRITICAL)
```typescript
// config/solana.ts
const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
```

### Single Wallet (CRITICAL)
```typescript
let wallet: Keypair | null = null; // One wallet for everything
```

### No Spending Limits (CRITICAL)
No per-transaction or daily limit checks before minting

## Critical Remediations

### P0: Migrate to AWS KMS
```typescript
import { KMSClient, SignCommand } from '@aws-sdk/client-kms';

async function signWithKMS(message: Buffer): Promise<Buffer> {
  const kms = new KMSClient({ region: 'us-east-1' });
  const response = await kms.send(new SignCommand({
    KeyId: process.env.KMS_KEY_ID,
    Message: message,
    SigningAlgorithm: 'ECDSA_SHA_256'
  }));
  return Buffer.from(response.Signature);
}
```

### P0: Add Spending Limits
```typescript
const TX_LIMIT_SOL = 0.5;
const DAILY_LIMIT_SOL = 5.0;

async function checkSpendingLimits(amount: number) {
  if (amount > TX_LIMIT_SOL) throw new Error('Per-tx limit exceeded');
  const dailySpend = await getDailySpend();
  if (dailySpend + amount > DAILY_LIMIT_SOL) throw new Error('Daily limit exceeded');
}
```

### P1: Add External Alerting
```typescript
import PagerDuty from 'node-pagerduty';

async function sendCriticalAlert(message: string) {
  await pagerduty.events.sendEvent({
    routing_key: process.env.PAGERDUTY_KEY,
    event_action: 'trigger',
    payload: { summary: message, severity: 'critical' }
  });
}
```

### P1: Add Address Allowlist
```typescript
const ALLOWED_RECIPIENTS = new Set(process.env.ALLOWED_ADDRESSES?.split(','));

function validateRecipient(address: string) {
  if (!ALLOWED_RECIPIENTS.has(address)) {
    throw new Error('Recipient not in allowlist');
  }
}
```

## Strengths

- Keys not hardcoded in source
- Keys not in env vars (path only)
- Wallet public key logged
- Balance monitoring implemented
- Alert cooldown (1 hour)
- Preflight checks enabled
- Transaction signatures logged
- Comprehensive error logging

Wallet Security Score: 9/100
