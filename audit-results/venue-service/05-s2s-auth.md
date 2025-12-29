# Venue Service - 05 Service-to-Service Authentication Audit

**Service:** venue-service
**Document:** 05-service-to-service-auth.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 62% (23/37 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | Default HMAC secret in code, HTTP client missing service identity |
| HIGH | 4 | No mTLS, No TLS cert validation, No correlation ID propagation, Non-constant-time signature comparison |
| MEDIUM | 3 | Dev bypass for signatures, No per-endpoint authorization, No service allowlist |
| LOW | 2 | No circuit breaker logging, Missing audit for internal calls |

---

## Service Client Checklist (Calling Other Services)

### Authentication Configuration (4/7 PASS)

### SC1: Service uses mTLS OR signed tokens for outbound calls
**Status:** FAIL
**Evidence:** httpClient.ts - No authentication headers added to outbound requests.

### SC2: Service credentials NOT hardcoded
**Status:** FAIL
**Evidence:** Default secret in code: 'internal-service-secret-change-in-production'
**Remediation:** Remove default value, fail startup if secret missing.

### SC3: Credentials retrieved from secrets manager
**Status:** PASS

### SC4: Each service has unique credentials
**Status:** PARTIAL
**Evidence:** INTERNAL_SERVICE_SECRET appears shared across services.

### SC6: Credential rotation automated
**Status:** FAIL

### SC7: Failed authentication attempts logged
**Status:** PASS

---

### Request Security (3/5 PASS)

### RS8: All internal HTTP calls use HTTPS/TLS
**Status:** PARTIAL
**Evidence:** Depends on baseURL param, no explicit HTTPS enforcement.

### RS9: Service identity included in every request
**Status:** FAIL

### RS10: Correlation ID propagated to downstream
**Status:** FAIL
**Remediation:** Add interceptor to include correlation ID.

### RS11: Request timeout configured
**Status:** PASS
**Evidence:** timeout: 10000

### RS12: Circuit breaker implemented
**Status:** PASS
**Evidence:** CircuitBreaker with 50% error threshold, 30s reset.

---

### Node.js Specific (1/4 PASS)

### NS13: HTTP client configured with TLS cert validation
**Status:** FAIL

### NS14: undici or got used (not deprecated request)
**Status:** PASS
**Evidence:** Uses axios.

### NS15: No NODE_TLS_REJECT_UNAUTHORIZED=0
**Status:** PASS

### NS16: Client includes service identity header
**Status:** FAIL

---

## Service Endpoint Checklist (Receiving Requests)

### Authentication Enforcement (6/7 PASS)

### AE1: ALL endpoints require authentication
**Status:** PARTIAL
**Evidence:** Stripe routes missing auth.

### AE3-AE5: Token/certificate verification, signature check, expiration
**Status:** PASS
**Evidence:** HMAC with SHA-256, 5-minute timestamp window.

### AE6: Token issuer validated
**Status:** PARTIAL
**Evidence:** x-internal-service header checked but no allowlist.

---

### Authorization (2/5 PASS)

### AZ8: Service identity extracted from request
**Status:** PASS

### AZ9-AZ10: Per-endpoint authorization, service allowlist
**Status:** FAIL
**Evidence:** Any authenticated service can access any internal endpoint.
**Remediation:** Add service allowlist per endpoint.

### AZ11: Unauthorized access attempts logged
**Status:** PASS

### AZ12: No default-allow authorization
**Status:** FAIL

---

### Audit Logging (3/5 PASS)

### AL13: Caller service identity logged
**Status:** PASS

### AL14: Correlation ID logged
**Status:** FAIL

### AL15-AL17: Request logging, context, centralized
**Status:** PASS

---

## HMAC Verification (4/6 PASS)

### HM14: SHA-256 or stronger
**Status:** PASS

### HM15-HM16: Timestamp included, clock skew tolerance
**Status:** PASS
**Evidence:** 5-minute window.

### HM17: Request body included in signature
**Status:** FAIL
**Evidence:** Body not included in signature payload.

### HM18: Constant-time comparison
**Status:** FAIL
**Evidence:** Uses string comparison, vulnerable to timing attacks.
**Remediation:** Use crypto.timingSafeEqual()

### HM19: Per-service secrets
**Status:** FAIL
**Evidence:** Single shared secret.

---

## Secrets Management (5/10 PASS)

### SM1: Secrets manager in use
**Status:** PASS

### SM2: No secrets in source code
**Status:** FAIL
**Evidence:** Default secret value in code.

### SM5: Secrets not logged
**Status:** PASS

### SM6: Each service has unique secrets
**Status:** FAIL

### SM7: Automatic rotation configured
**Status:** FAIL

### SM9: Least privilege
**Status:** PASS

---

## Development Bypass (Security Note)

**Issue:** Dev signature bypass allows 'temp-signature' in non-production.
**Risk:** MEDIUM - Could leak to staging.
**Recommendation:** Remove or use dedicated dev flag.

---

## Remediation Priority

### CRITICAL (Immediate)
1. Remove default HMAC secret - fail startup if missing
2. Add service identity to HTTP client

### HIGH (This Week)
1. Use crypto.timingSafeEqual() for signature comparison
2. Include body in HMAC signature
3. Add TLS certificate validation
4. Add correlation ID propagation

### MEDIUM (This Month)
1. Add per-endpoint service allowlist
2. Use per-service HMAC secrets
3. Remove dev signature bypass
