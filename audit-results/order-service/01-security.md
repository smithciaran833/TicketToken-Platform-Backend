# Order Service - 01 Security Audit

**Service:** order-service
**Document:** 01-security.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 31% (16/52 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | Auth is no-op stub, Hardcoded JWT secret default |
| HIGH | 2 | No database TLS, No re-auth for sensitive ops |
| MEDIUM | 0 | None |
| LOW | 0 | None |

---

## 3.1 Route Layer - Authentication Middleware (0/6)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-R1: Protected routes use auth | FAIL | `routes/order.routes.ts` lines 5-7: `// TODO: Implement authentication` - STUB |
| SEC-R2: JWT signature verified | FAIL | `plugins/jwt-auth.plugin.ts` exists but NEVER REGISTERED in app.ts |
| SEC-R3: Algorithm whitelisted | PARTIAL | Uses @fastify/jwt but no explicit algorithm whitelist |
| SEC-R4: Token expiration validated | PARTIAL | `expiresIn: '24h'` configured but plugin not registered |
| SEC-R5: Expired tokens rejected | FAIL | JWT plugin not active - no validation occurs |
| SEC-R6: No hardcoded secrets | FAIL | `plugins/jwt-auth.plugin.ts` line 28: `'your-secret-key-change-in-production'` |

**CRITICAL: Authentication Completely Broken**
```typescript
// routes/order.routes.ts lines 5-7
const authenticate = async (request: any, reply: any) => {
  // TODO: Implement authentication
};
```

---

## 3.1 Route Layer - Rate Limiting (2/2 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-R10: Appropriate limits | PASS | POST / = 10/min, reserve = 5/min, cancel = 5/min, refund = 3/min |
| SEC-R12: General rate limiting | PASS | `app.ts` line 88: max 100 per minute |

---

## 3.1 Route Layer - HTTPS/TLS (2/4)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-R13: HTTPS enforced | PARTIAL | Infrastructure dependent |
| SEC-R14: HSTS header | PASS | `config/security.config.ts` lines 86-90, helmet registered |
| SEC-R15: Secure cookies | PASS | `secureCookie: true, httpOnly: true, sameSite: 'strict'` |
| SEC-R16: TLS 1.2+ | PARTIAL | Infrastructure dependent |

---

## 3.2 Service Layer - Authorization (4/6)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-S1: Ownership verified | PASS | `controllers/order.controller.ts` line 90: checks userId |
| SEC-S2: ID validation | PARTIAL | Checks exist but depend on broken auth |
| SEC-S3: Admin checks | PASS | `request.user?.role === 'admin'` |
| SEC-S4: Role middleware | FAIL | Depends on request.user which is never set |
| SEC-S5: Multi-tenant isolation | PASS | All queries use tenantId, RLS context set |
| SEC-S6: Deny by default | PASS | All methods check `if (!userId) return 401` |

---

## 3.2 Service Layer - Input Validation (2/3)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-S12: Services validate input | PASS | `validators/order.schemas.ts`: Comprehensive Joi schemas |
| SEC-S13: No SQL injection | PASS | `models/order.model.ts`: Parameterized queries `$1, $2, $3` |
| SEC-S14: Re-auth for sensitive ops | FAIL | No re-authentication for refunds/cancellations |

---

## 3.3 Database Layer - Encryption (1/4)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-DB1: Database TLS | FAIL | `config/database.ts` lines 35-44: No ssl configuration |
| SEC-DB2: Encryption at rest | PARTIAL | Infrastructure dependent |
| SEC-DB5: Sensitive fields encrypted | PASS | No SSN/sensitive PII stored |
| SEC-DB6: API keys hashed | PARTIAL | paymentIntentId in plaintext (acceptable for Stripe) |

**Issue: No Database TLS**
```typescript
// config/database.ts - MISSING ssl config
pool = new Pool({
  host: dbIp,
  port: parseInt(process.env.DB_PORT || '6432', 10),
  // NO ssl: { rejectUnauthorized: true }
});
```

---

## 3.3 Database Layer - Audit Logging (3/4)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-DB8: Auth failures logged | PASS | `middleware/tenant.middleware.ts` line 13 |
| SEC-DB9: Data access logged | PASS | `auditService.logAction()` for create, cancel, refund |
| SEC-DB10: No sensitive data in logs | PASS | Structured logging without PII |
| SEC-DB11: Log retention | PARTIAL | Infrastructure concern |

---

## 3.4 External Integrations (2/5 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-EXT4: Events idempotent | PASS | `events/event-subscriber.ts` handles with idempotency |
| SEC-EXT14: .env in .gitignore | PASS | .gitignore exists |
| SEC-EXT15: Secrets manager | PASS | `config/secrets.ts` uses secretsManager |
| SEC-EXT16: Secret rotation | PARTIAL | Manager exists, rotation not documented |

---

## Critical Remediations Required

### 1. CRITICAL: Register JWT Plugin
```typescript
// app.ts - ADD THIS
import jwtAuthPlugin from './plugins/jwt-auth.plugin';
await app.register(jwtAuthPlugin);
```

### 2. CRITICAL: Remove Default Secret
```typescript
// plugins/jwt-auth.plugin.ts - CHANGE
secret: process.env.JWT_SECRET || 'your-secret-key...'
// TO
secret: process.env.JWT_SECRET  // Fail if not set
```

### 3. HIGH: Add Database TLS
```typescript
// config/database.ts - ADD
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
```

---

## Positive Findings

- Strong input validation with Joi schemas
- SQL injection prevention via parameterized queries
- Multi-tenant isolation with RLS
- Ownership checks in controllers
- Audit logging for critical operations
- Rate limiting on state-changing endpoints
- Security headers via Helmet
