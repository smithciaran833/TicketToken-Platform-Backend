# Scanning Service Service-to-Service Auth Audit

**Standard:** Docs/research/05-service-to-service-auth.md  
**Service:** backend/services/scanning-service  
**Date:** 2024-12-27

---

## Files Reviewed

| Path | Status |
|------|--------|
| src/middleware/auth.middleware.ts | ✅ Reviewed |
| src/services/* | ✅ 6 files |
| src/config/* | ✅ 4 files |
| src/config/secrets.ts | ✅ Reviewed |

---

## Service Client Checklist (Calling Other Services)

### Authentication Configuration

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Uses mTLS OR signed tokens for outbound calls | ❌ FAIL | No outbound service calls implemented |
| 2 | Credentials NOT hardcoded | ✅ PASS | `env.validator.ts` - all from env vars |
| 3 | Credentials from secrets manager | ✅ PASS | `secrets.ts` uses shared secretsManager |
| 4 | Each service has unique credentials | ✅ PASS | Service-specific HMAC_SECRET |
| 5 | Short-lived credentials (<1hr) | ⚠️ PARTIAL | QR tokens 30s, but JWT not controlled |
| 6 | Credential rotation automated | ❌ FAIL | No rotation mechanism |
| 7 | Failed auth attempts logged | ✅ PASS | `auth.middleware.ts:70-75` logs failures |

---

## Summary

### Pass Rates by Section

| Section | Checks | Passed | Partial | Failed | N/A | Pass Rate |
|---------|--------|--------|---------|--------|-----|-----------|
| Service Client | 16 | 5 | 1 | 3 | 7 | 56% |
| Service Endpoint | 22 | 14 | 2 | 6 | 0 | 64% |
| Service Identity (JWT) | 7 | 2 | 1 | 4 | 0 | 29% |
| Service Identity (HMAC) | 6 | 6 | 0 | 0 | 0 | 100% |
| Secrets Management | 10 | 5 | 3 | 2 | 0 | 50% |
| **TOTAL** | **61** | **32** | **7** | **15** | **7** | **59%** |

---

### Critical Issues

| ID | Issue | File | Impact |
|----|-------|------|--------|
| AUTH-1 | 10+ routes without authentication | qr.ts, devices.ts, offline.ts, policies.ts | Unauthorized access |
| AUTH-2 | No JWT issuer/audience validation | auth.middleware.ts | Token forgery risk |
| AUTH-3 | Uses HS256 symmetric signing | auth.middleware.ts | Shared secret vulnerability |
| AUTH-4 | No service-level identity verification | Entire service | Cannot distinguish service callers |

### Positive Findings

1. **Excellent HMAC Security**: QR code validation uses SHA-256 HMAC with timing-safe comparison, nonces, and 30-second windows - exemplary implementation.

2. **Secrets Manager Integration**: Uses shared `secretsManager` module for credential retrieval, not hardcoded values.

3. **Tenant Isolation Enforcement**: Strong multi-tenant security with venue and tenant isolation checks in QRValidator.

4. **Role-Based Authorization**: `requireRole()` middleware properly restricts endpoint access by user role.

5. **No TLS Bypass**: No `NODE_TLS_REJECT_UNAUTHORIZED=0` or `rejectUnauthorized: false` found.

---

**Overall Assessment:** The scanning service has **strong HMAC security for QR codes** (100%) but **weak JWT identity verification** (29%) and **missing authentication on many routes**. The service-to-service authentication patterns need significant improvement before production deployment.
