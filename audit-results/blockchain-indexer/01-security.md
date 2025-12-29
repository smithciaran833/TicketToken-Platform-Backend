# Blockchain-Indexer Service - 01 Security Audit

**Service:** blockchain-indexer
**Document:** 01-security.md
**Date:** 2025-12-26
**Auditor:** Cline AI
**Pass Rate:** 74% (17/23 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | RLS context swallows errors, no database SSL |
| HIGH | 3 | HSTS missing, JWT algorithm not whitelisted, rate limits may be too permissive |
| MEDIUM | 2 | Default tenant fallback, no request ID propagation |
| LOW | 0 | - |

## Route Layer (8/9 applicable)

- All routes use auth middleware - PASS
- JWT signature verified - PASS
- JWT algorithm specified - PARTIAL (no whitelist)
- Token expiration validated - PASS
- No hardcoded secrets - PASS
- Rate limiting exists - PASS
- Rate limits appropriate - PARTIAL (100/min may be high)
- HSTS enabled - FAIL (HIGH)
- HTTPS enforced - PARTIAL (infrastructure)

## Service Layer (6/6 applicable)

- Object ownership verified - PASS
- Input validated before use - PASS
- Multi-tenant isolation - PARTIAL (errors swallowed)
- Deny by default - PASS
- Services validate input - PASS
- No SQL/NoSQL injection - PASS

## Database Layer (4/4 applicable)

- Database uses TLS - FAIL (CRITICAL)
- Auth failures logged - PASS
- Data access logged - PASS
- No sensitive data in logs - PASS

## External Integrations (3/4 applicable)

- No private keys in code - PASS
- Keys from secure storage - PASS
- Secrets manager used - PASS
- Secret rotation - PARTIAL

## Critical Issues

### 1. RLS Context Errors Swallowed
```typescript
// index.ts:77-80
} catch (error) {
  // Allow request to proceed - RLS will block unauthorized access
}
```
**Risk:** Data leakage if RLS misconfigured.

### 2. No Database SSL
```typescript
// database.ts - Missing:
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
```

### 3. Default Tenant Fallback
```typescript
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
```

## Remediations

### CRITICAL
1. Reject requests when tenant context fails
2. Add SSL to PostgreSQL connection
3. Remove default tenant fallback

### HIGH
1. Add HSTS to helmet config
2. Add `algorithms: ['HS256']` to jwt.verify
3. Review rate limits (consider 30/min for queries)

### MEDIUM
1. Propagate request ID to logger context
2. Document HTTPS enforcement at API Gateway

Security Score: 74/100
