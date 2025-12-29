# Minting Service - 37 Key Management Audit

**Service:** minting-service
**Document:** 37-key-management.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 84% (26/31 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | Wallet in plaintext file, Wallet not in secrets manager |
| HIGH | 2 | IPFS keys in env vars, Auth secrets in env vars |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## 1. Secrets Infrastructure (4/4 PASS)

- Centralized secrets manager - PASS
- Secrets loaded at runtime - PASS
- Service fails if unavailable - PASS
- Common secrets from config - PASS

## 2. Environment Variables (4/4 PASS)

- Placeholders, not real secrets - PASS
- Minimum length documented - PASS
- No credentials in .env.example - PASS
- Secrets not logged - PASS

## 3. Solana Key Management (3/5)

- Key not in env vars - PASS
- Loaded from file path - PASS
- File existence checked - PASS
- Stored in HSM/KMS - FAIL
- In secrets manager - FAIL

## 4. API Key Management (2/4)

- IPFS keys use placeholder - PASS
- IPFS keys in secrets manager - FAIL
- JWT secret placeholder - PASS
- JWT in secrets manager - PARTIAL

## 5. DB/Redis Credentials (6/6 PASS)

- DB password placeholder - PASS
- DB password in secrets manager - PASS
- Redis password placeholder - PASS
- Redis password in secrets manager - PASS
- DB URL placeholder - PASS
- Redis URL placeholder - PASS

## 6. Service Authentication (2/3)

- Internal secret min length - PASS
- Webhook secret min length - PASS
- Internal secrets in manager - PARTIAL

## 7. Configuration Security (5/5 PASS)

- Default RPC is devnet - PASS
- Commitment level documented - PASS
- Transaction timeout - PASS
- Priority fee configured - PASS
- Balance monitoring - PASS

## Missing Secrets Analysis

| Secret | Current Location | Risk |
|--------|------------------|------|
| Wallet private key | JSON file | CRITICAL |
| PINATA_API_KEY | Env var | HIGH |
| PINATA_SECRET_API_KEY | Env var | HIGH |
| PINATA_JWT | Env var | HIGH |
| JWT_SECRET | Env var | HIGH |
| INTERNAL_SERVICE_SECRET | Env var | HIGH |
| WEBHOOK_SECRET | Env var | HIGH |

## Critical Remediations

### P0: Migrate Wallet to Secrets Manager
```typescript
const serviceSecrets = [
  ...commonSecrets,
  'SOLANA_WALLET_PRIVATE_KEY',
];
const secrets = await secretsManager.getSecrets(serviceSecrets);
wallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(secrets.SOLANA_WALLET_PRIVATE_KEY)));
```

### P0: Implement HSM/KMS for Signing
Use AWS KMS or dedicated signing service

### P1: Add IPFS Keys to Secrets Manager
```typescript
const serviceSecrets = [
  ...commonSecrets,
  'PINATA_API_KEY',
  'PINATA_SECRET_API_KEY',
  'PINATA_JWT',
];
```

### P1: Add Auth Secrets to Manager
```typescript
const serviceSecrets = [
  ...commonSecrets,
  'JWT_SECRET',
  'INTERNAL_SERVICE_SECRET',
  'WEBHOOK_SECRET',
];
```

## Strengths

- Centralized secrets manager infrastructure
- Secrets loaded at runtime
- Service fails fast if secrets unavailable
- All placeholders use CHANGE_ME pattern
- Minimum length requirements documented
- Database/Redis credentials in secrets manager
- Wallet path (not key) in env vars
- Wallet file existence validated
- Safe devnet defaults
- Error messages don't leak secrets
- Transaction timeout configured

Key Management Score: 84/100
