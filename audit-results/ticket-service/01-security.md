# Ticket Service - 01 Security Audit

**Service:** ticket-service
**Document:** 01-security.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 68% (26/38 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | No secrets manager integration |
| HIGH | 3 | No blockchain spending limits, No multi-sig, No account lockout |
| MEDIUM | 2 | Database TLS not explicit, Authorization failures not logged |
| LOW | 1 | Blockchain keys from env vars (should use Vault) |

---

## 3.1 Route Layer - Authentication (6/6 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-R1: Protected routes use auth | PASS | preHandler: [authMiddleware] |
| SEC-R2: JWT signature verified | PASS | jwt.verify() with RS256 |
| SEC-R3: Algorithm whitelisted | PASS | algorithms: ['RS256'] |
| SEC-R4: Token expiration validated | PASS | TokenExpiredError handled |
| SEC-R5: Expired tokens rejected | PASS | Returns 401 |
| SEC-R6: No hardcoded secrets | PASS | Key from JWT_PUBLIC_KEY_PATH |

---

## 3.1 Route Layer - Rate Limiting (2/3)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-R10: Appropriate limits | PASS | Purchase 5/min, Write 10/min |
| SEC-R11: Account lockout | FAIL | Not implemented |
| SEC-R12: General rate limiting | PASS | 100/min global |

---

## 3.1 Route Layer - HTTPS (1/3)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-R13: HTTPS enforced | PARTIAL | trustProxy: true, relies on LB |
| SEC-R14: HSTS header | PASS | Helmet registered |
| SEC-R16: TLS 1.2+ | PARTIAL | Infrastructure concern |

---

## 3.2 Service Layer - Authorization (6/6 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-S1: Ownership verified | PASS | WHERE user_id = $1 AND tenant_id = $2 |
| SEC-S2: ID validation | PASS | ID + user ownership verified |
| SEC-S3: Admin role check | PASS | requireRole(['admin', 'venue_manager']) |
| SEC-S4: Role middleware | PASS | Checks user.role + admin:all bypass |
| SEC-S5: Multi-tenant isolation | PASS | tenant_id in all queries |
| SEC-S6: Deny by default | PASS | No token=401, no role=403 |

---

## 3.2 Service Layer - Input (2/2)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-S12: Input validated | PASS | validate(ticketSchemas.*) |
| SEC-S13: No SQL injection | PASS | Parameterized queries |

---

## 3.4 External - Webhooks (4/4 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-EXT2: Raw body for HMAC | PASS | deterministicStringify |
| SEC-EXT3: Secret from env | PASS | INTERNAL_WEBHOOK_SECRET required |
| SEC-EXT4: Idempotent processing | PASS | Nonce tracking in webhook_nonces |
| SEC-EXT5: Failed returns 401 | PASS | Invalid signature → 401 |

---

## 3.4 External - Blockchain (1/5)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-EXT7: No hardcoded keys | PASS | From env var |
| SEC-EXT8: Keys encrypted at rest | PARTIAL | Env vars, not Vault |
| SEC-EXT9: Secure key storage | PARTIAL | Env vars only |
| SEC-EXT11: Spending limits | FAIL | Not implemented |
| SEC-EXT12: Multi-sig | FAIL | Not implemented |

---

## 3.4 External - Secrets (2/4)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC-EXT13: No secrets in git | PASS | .gitignore configured |
| SEC-EXT14: .env in .gitignore | PASS | .env, .env.* excluded |
| SEC-EXT15: Secrets manager | FAIL | Env vars only |
| SEC-EXT16: Secret rotation | PARTIAL | Manual rotation only |

---

## Strengths

- Excellent JWT (RS256, whitelist, expiration)
- Strong multi-tenant isolation
- Tiered rate limiting
- Webhook replay protection (nonce + timestamp)
- Parameterized queries
- Role-based access control

---

## Remediation Priority

### CRITICAL (Immediate)
1. Integrate AWS Secrets Manager or HashiCorp Vault

### HIGH (This Week)
1. Implement blockchain spending limits
2. Consider multi-sig for treasury operations

### MEDIUM (This Month)
1. Ensure DATABASE_URL includes sslmode=require
2. Add logging for 403 authorization failures
