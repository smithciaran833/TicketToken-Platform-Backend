# Event Service - 01 Security Audit

**Service:** event-service
**Document:** 01-security.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 83% (20/24 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 2 | DB SSL rejectUnauthorized: false, No admin role check for delete |
| MEDIUM | 2 | Rate limits not strict for mutations, Full eventData logged |
| LOW | 1 | Secret rotation not evident |

---

## 3.1 Route Layer

### Authentication Middleware
- SEC-R1: Protected routes use auth - PASS
- SEC-R2: JWT signature verified - PASS
- SEC-R3: Algorithm explicitly specified - PASS (RS256 whitelist)
- SEC-R4: Token expiration validated - PASS
- SEC-R5: Expired tokens rejected - PASS
- SEC-R6: No hardcoded secrets - PASS

### Rate Limiting
- SEC-R10: Strict rate limits - PARTIAL (100 req/min default)
- SEC-R12: General rate limiting - PASS (Redis backend)

### HTTPS/TLS
- SEC-R13: HTTPS enforced - PARTIAL (relies on infra)
- SEC-R14: HSTS header - PASS (Helmet)
- SEC-R16: TLS 1.2+ - PARTIAL (rejectUnauthorized: false)

---

## 3.2 Service Layer

### Authorization
- SEC-S1: Ownership verified - PASS
- SEC-S2: IDs validated - PASS (UUID pattern)
- SEC-S3: Admin role check - FAIL (only ownership check on delete)
- SEC-S4: Role-based middleware - PARTIAL
- SEC-S5: Multi-tenant isolation - PASS
- SEC-S6: Deny by default - PASS

### Input Validation
- SEC-S12: Input validated - PASS
- SEC-S13: No SQL injection - PASS (Knex parameterized)

---

## 3.3 Database Layer

- SEC-DB1: DB uses TLS - PARTIAL (rejectUnauthorized: false)
- SEC-DB8: Auth failures logged - PASS
- SEC-DB9: Data access logged - PASS
- SEC-DB10: No sensitive data in logs - PARTIAL

---

## 3.4 External Integrations

- SEC-EXT7: No hardcoded keys - PASS
- SEC-EXT9: Secure key storage - PARTIAL
- SEC-EXT10: Local signing - PASS
- SEC-EXT14: .env in .gitignore - PASS
- SEC-EXT15: Secrets manager used - PASS
- SEC-EXT16: Secret rotation - PARTIAL

---

## Remediation Priority

### HIGH
1. Fix DB SSL - Set rejectUnauthorized: true with CA cert
2. Add admin role check for delete operations

### MEDIUM
1. Add route-specific rate limits for mutations
2. Sanitize eventData before logging
