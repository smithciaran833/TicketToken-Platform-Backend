# Minting Service - 01 Security Audit

**Service:** minting-service
**Document:** 01-security.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 33% (14/42 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 5 | Admin routes unauthenticated, Hardcoded DB password, Unencrypted wallet, Wallet in git, No DB SSL |
| HIGH | 3 | No RBAC, No webhook idempotency, No key rotation |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## Route Layer - Authentication (4/6)

- SEC-R1: Protected routes use auth - FAIL (admin routes open)
- SEC-R2: Auth verifies signature - PARTIAL (HMAC not JWT)
- SEC-R4: Token expiration - PASS (5 min window)
- SEC-R5: Rejects expired - PASS
- SEC-R6: No hardcoded secrets - FAIL (DB password fallback)

## Route Layer - Rate Limiting (1/1)

- SEC-R12: General rate limiting - PASS (100/min)

## Route Layer - HTTPS/TLS (1/3)

- SEC-R13: HTTPS enforced - FAIL
- SEC-R14: HSTS header - PASS (helmet)
- SEC-R16: TLS 1.2+ - FAIL

## Service Layer - Authorization (3/10)

- SEC-S1: Object ownership - FAIL
- SEC-S2: IDs validated - PASS (Zod uuid)
- SEC-S3: Admin role check - FAIL
- SEC-S4: RBAC middleware - FAIL
- SEC-S5: Multi-tenant - PARTIAL
- SEC-S6: Deny by default - FAIL
- SEC-S11: Wallet ownership - FAIL (shared wallet)
- SEC-S12: Input validation - PASS
- SEC-S13: SQL injection - PASS (Knex)
- SEC-S14: Re-auth sensitive - FAIL

## Database Layer (2/4)

- SEC-DB1: DB uses TLS - FAIL
- SEC-DB7: Auth events logged - PASS
- SEC-DB8: Authz failures logged - PASS
- SEC-DB11: Log retention - FAIL

## External - Webhooks (4/5)

- SEC-EXT1: Webhook signature - PASS (HMAC-SHA256)
- SEC-EXT2: Raw body verify - PARTIAL
- SEC-EXT3: Secret from env - PASS
- SEC-EXT4: Idempotent - FAIL
- SEC-EXT5: 4xx on fail - PASS

## External - Solana Keys (2/7)

- SEC-EXT7: Keys not in code - PASS
- SEC-EXT8: Keys encrypted - FAIL
- SEC-EXT9: Secure storage - FAIL (file path)
- SEC-EXT10: Local signing - PASS
- SEC-EXT11: Spending limits - PARTIAL
- SEC-EXT12: Multi-sig - FAIL
- SEC-EXT13: No secrets in git - FAIL (devnet-wallet.json)

## Critical Remediations

### P0: Add Auth to Admin Routes
```typescript
// admin.ts
fastify.addHook('preHandler', authMiddleware);
fastify.addHook('preHandler', requireAdmin);
```

### P0: Remove Hardcoded DB Password
```typescript
// database.ts - Remove fallback
password: process.env.DB_PASSWORD
// Fail if not set in production
```

### P0: Remove Wallet from Git
```bash
git rm --cached devnet-wallet.json
echo "devnet-wallet.json" >> .gitignore
# Rotate the compromised key
```

### P0: Use KMS for Wallet
```typescript
// Load from AWS Secrets Manager or HashiCorp Vault
const walletKey = await secretsManager.getSecret('solana-minting-wallet');
```

### P0: Enable Database SSL
```typescript
ssl: { rejectUnauthorized: true }
```

## Strengths

- Webhook signature verification with HMAC-SHA256
- Rate limiting configured
- Helmet for security headers
- Zod input validation
- Parameterized SQL queries

Security Score: 33/100
