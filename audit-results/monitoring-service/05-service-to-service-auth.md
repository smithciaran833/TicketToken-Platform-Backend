## Monitoring Service - Service-to-Service Auth Audit Report

**Audit Date:** December 28, 2025  
**Service:** monitoring-service  
**Standard:** Docs/research/05-service-to-service-auth.md

---

## 🔴 CRITICAL ISSUES

### No JWT Issuer/Audience Validation
**File:** `src/middleware/auth.middleware.ts:29`
```typescript
const decoded = jwt.verify(token, jwtSecret) as any;
```
**Issue:** No algorithms, issuer, or audience validation.

### No Service Identity Verification
**File:** `src/middleware/auth.middleware.ts:29-36`
**Issue:** Extracts user identity but NOT service identity. No service ACLs.

### JWT Secret from Environment Variable
**File:** `src/middleware/auth.middleware.ts:24-26`
**Issue:** Fallback to 'dev-secret' in non-production. Not from secrets manager.

---

## 🟠 HIGH SEVERITY ISSUES

| Issue | Location |
|-------|----------|
| Symmetric JWT signing (HS256) | auth.middleware.ts:29 |
| No mTLS implementation | No TLS config anywhere |
| Metrics auth uses Basic Auth from env | metrics-auth.middleware.ts:16-25 |
| No per-endpoint service ACLs | routes/*.ts |

---

## 🟡 MEDIUM SEVERITY ISSUES

| Issue | Location |
|-------|----------|
| Secrets manager underutilized | Only DB/Redis, not JWT |
| HTTP service URLs (not HTTPS) | config/integration.ts:6-20 |
| Database missing SSL | config/database.ts:4-12 |
| No audit logging of service calls | auth.middleware.ts |

---

## 🟢 PASSING CHECKS

| Check | Status |
|-------|--------|
| JWT verification (signature) | ✅ Uses jwt.verify() |
| Token expiration checked | ✅ jwt.verify() checks exp |
| Secrets manager exists | ✅ config/secrets.ts |
| Authorization middleware | ✅ authorize() function |

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 3 |
| 🟠 HIGH | 4 |
| 🟡 MEDIUM | 4 |
| ✅ PASS | 4 |

### Overall S2S Auth Score: **30/100**

**Risk Level:** CRITICAL
