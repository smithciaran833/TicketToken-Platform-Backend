# Marketplace Service - 01 Security Audit

**Service:** marketplace-service
**Document:** 01-security.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 51% (23/45 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 3 | Hardcoded JWT secret, Unprotected cache endpoints, No DB TLS |
| HIGH | 3 | No JWT algorithm, Tenant context silent fail, Private keys in env |
| MEDIUM | 0 | None |
| LOW | 0 | None |

---

## Route Layer Authentication (4/6)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-R1: Protected routes | PARTIAL | Cache endpoints unprotected |
| SEC-R2: JWT verification | PASS | jwt.verify() in auth.middleware.ts |
| SEC-R3: Algorithm specified | FAIL | No algorithms option |
| SEC-R4: Expiration validated | PASS | jwt.verify() handles |
| SEC-R5: 401 on invalid | PASS | Returns 401 |
| SEC-R6: No hardcoded secrets | FAIL | Fallback secret in code |

---

## Rate Limiting (1/3 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-R10: Sensitive ops limits | PARTIAL | No stricter limits |
| SEC-R12: Global rate limit | PASS | 100 req/min |

---

## Service Authorization (8/10)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-S1: Ownership verification | PASS | verifyListingOwnership middleware |
| SEC-S2: Auth follows ID access | PASS | Implemented |
| SEC-S3: Admin checks | PASS | requireAdmin on admin routes |
| SEC-S4: Role checking | PASS | Implemented |
| SEC-S5: Tenant context | PARTIAL | Failures silently ignored |
| SEC-S6: Default deny | PASS | 401 if no token |
| SEC-S11: Wallet ownership | PASS | Cryptographic verification |
| SEC-S12: Input validation | PASS | Joi schemas |
| SEC-S13: SQL injection | PASS | Parameterized queries |
| SEC-S14: Re-auth high value | PARTIAL | Not implemented |

---

## Database Security (1/6 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-DB1: TLS/SSL | FAIL | No ssl config |
| SEC-DB7-9: Audit logging | PARTIAL | Limited |
| SEC-DB10: Password masking | PASS | [HIDDEN] |
| SEC-DB11: Log retention | PARTIAL | No config |

---

## Stripe Integration (5/6)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-EXT1: Signature verified | PASS | verifyWebhookSignature() |
| SEC-EXT2: Raw body | PARTIAL | May need config |
| SEC-EXT3: Secret from env | PASS | process.env |
| SEC-EXT4: Idempotency | PASS | processedEvents Set |
| SEC-EXT5: Invalid signature | PASS | Returns 400 |
| SEC-EXT6: API key from env | PASS | process.env.STRIPE_SECRET_KEY |

---

## Blockchain Keys (2/6)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-EXT7: Not hardcoded | PASS | Not in source |
| SEC-EXT8: Encrypted at rest | FAIL | Plain env var |
| SEC-EXT9: Secrets manager | FAIL | Not used |
| SEC-EXT10: Local signing | PASS | Only local |
| SEC-EXT11: Spending limits | PARTIAL | None |
| SEC-EXT12: Multi-sig | FAIL | Not implemented |

---

## Secrets Management (2/5)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-EXT13: No secrets in git | PASS | Clean |
| SEC-EXT14: .env in gitignore | PASS | Ignored |
| SEC-EXT15: Secrets manager | PARTIAL | Partial use |
| SEC-EXT16: Rotation | PARTIAL | No mechanism |
| SEC-EXT17: Access audit | PARTIAL | Not fully verified |

---

## Critical Remediations

### P0: Remove JWT Secret Fallback
```typescript
// auth.middleware.ts
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET required');
```

### P0: Protect Cache Endpoints
```typescript
// routes/index.ts
fastify.get('/cache/stats', { preHandler: [authMiddleware, requireAdmin] }, ...)
fastify.post('/cache/flush', { preHandler: [authMiddleware, requireAdmin] }, ...)
```

### P0: Add Database TLS
```typescript
// config/database.ts
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
```

### P1: Specify JWT Algorithm
```typescript
jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
```

---

## Strengths

- JWT verification implemented
- Ownership verification middleware
- Parameterized SQL queries
- Stripe webhook signature verification
- Webhook idempotency with processed events Set
- Global rate limiting

Security Score: 51/100
