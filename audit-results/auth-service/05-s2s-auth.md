# Auth Service - 05 Service-to-Service Auth Audit

**Service:** auth-service
**Document:** 05-service-to-service-auth.md
**Date:** 2025-12-22
**Auditor:** Cline + Human Review
**Pass Rate:** 61% (31/51)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 4 | No S2S identity verification, no service allowlist, no correlation propagation, JWT keys not in secrets manager |
| MEDIUM | 4 | No S2S client auth, shared JWT keys, no rotation, env var secrets |

**Context:** auth-service is primarily an authentication provider (endpoint), not a client calling other services. Many client-side checks are N/A.

---

## Service Client Checklist (4/12 applicable PASS)

### Check 1: mTLS or signed tokens for outbound calls
**Status:** PARTIAL
**Issue:** No explicit S2S client auth for potential downstream calls.
**Note:** Auth-service primarily serves requests, doesn't call other services.

### Check 2: Credentials not hardcoded
**Status:** PASS
**Evidence:** Keys from files/secrets manager, not source code.

### Check 3: Credentials from secrets manager
**Status:** PASS

### Check 4: Unique credentials per service
**Status:** PARTIAL
**Issue:** JWT signing keys used for both user and potentially service tokens.
**Remediation:** Separate key pairs for user vs service tokens.

### Check 5: Short-lived tokens
**Status:** PASS
**Evidence:** Access tokens 15min, configurable.

### Check 6: Automated credential rotation
**Status:** PARTIAL
**Issue:** `keyid: '1'` prepared but no automation.
**Remediation:** Implement JWKS endpoint + rotation.

### Check 7: Failed auth attempts logged
**Status:** PASS

### Check 8-9: HTTPS/Service identity in requests
**Status:** N/A (no outbound calls)

### Check 10: Correlation ID propagation
**Status:** FAIL
**Issue:** No correlation ID forwarding in any HTTP client.
**Remediation:** Add correlation ID to all outbound requests.

### Check 11-12: Timeouts/Circuit breaker
**Status:** FAIL (no circuit breaker)

---

## Service Endpoint Checklist (15/22 PASS)

### Check 1: All endpoints require auth
**Status:** PARTIAL
**Evidence:** Public routes exist (login, register, etc.) - intentional.
**Issue:** No separate internal endpoint protection.
**Remediation:** Add S2S middleware for internal-only endpoints if any exist.

### Check 2: Auth middleware applied globally
**Status:** PARTIAL
**Evidence:** Applied to route group, public routes outside.

### Check 3: Cryptographic token verification
**Status:** PASS
**Evidence:** RS256 with public key verification.

### Check 4: Signature check (not just decode)
**Status:** PASS
**Evidence:** `jwt.verify()` not `jwt.decode()`.

### Check 5: Token expiration checked
**Status:** PASS
**Evidence:** `TokenExpiredError` handled.

### Check 6: Issuer validated
**Status:** PASS
**Evidence:** `issuer: this.issuer` in verify options.

### Check 7: Audience validated
**Status:** PASS
**Evidence:** `audience: this.issuer` in verify options.

### Check 8: Service identity verified
**Status:** FAIL
**Issue:** No S2S service identity verification middleware.
**Remediation:**
```typescript
async function verifyServiceToken(request, reply) {
  const serviceToken = request.headers['x-service-token'];
  const decoded = jwt.verify(serviceToken, servicePublicKey);
  if (!allowedServices.includes(decoded.sub)) {
    throw new Error('Unauthorized service');
  }
  request.callerService = decoded.sub;
}
```

### Check 9: Per-endpoint authorization
**Status:** PASS
**Evidence:** `requirePermission('roles:manage')` on sensitive routes.

### Check 10: Service allowlist
**Status:** FAIL
**Issue:** No service ACL for internal endpoints.
**Remediation:** Implement service-level allowlists.

### Check 11: Unauthorized attempts logged
**Status:** PASS

### Check 12: No default-allow
**Status:** PASS
**Evidence:** Explicit permission check, throws if not found.

### Checks 13-17: Audit logging
**Status:** PASS

### Check 18: JWT library used correctly
**Status:** PASS

### Check 19: JWT secret from secrets manager
**Status:** PARTIAL
**Issue:** Keys loaded from files, not secrets manager.
**Remediation:** Migrate JWT keys to secrets manager.

### Check 20: preHandler hook used
**Status:** PASS

### Check 21: Caller ID in logs
**Status:** PASS

### Check 22: onError logs auth failures
**Status:** PASS

---

## JWT Identity Verification (6/7 PASS)

### Check 7: RS256/ES256 algorithm
**Status:** PASS

### Check 8: Public key retrieved securely
**Status:** PARTIAL
**Issue:** From file, not key vault.

### Checks 9-13: Claims validation
**Status:** PASS
**Evidence:** sub, iss, aud, exp all properly handled.

---

## Secrets Management (6/10 PASS)

### Check 1: Secrets manager in use
**Status:** PASS

### Check 2: No secrets in source
**Status:** PASS

### Check 3: No secrets in env vars (prod)
**Status:** PARTIAL
**Issue:** `JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production'`
**Remediation:** Remove defaults, require secrets manager in prod.

### Checks 4-5: No secrets in CI/CD, not logged
**Status:** PASS

### Check 6: Unique secrets per service
**Status:** PASS

### Check 7: Automatic rotation
**Status:** FAIL
**Remediation:** Implement automated rotation.

### Check 8: Secret access audited
**Status:** PARTIAL

### Check 9: Least privilege
**Status:** PASS

### Check 10: Emergency rotation docs
**Status:** N/A

---

## Remediation Priority

### HIGH
1. **Add S2S identity verification** - Middleware for internal endpoints
2. **Implement service allowlist** - ACLs for which services can call which endpoints
3. **Migrate JWT keys to secrets manager** - Remove file-based key loading
4. **Add correlation ID propagation** - Forward to any downstream calls

### MEDIUM
1. **Separate user/service JWT keys** - Different key pairs
2. **Implement credential rotation** - JWKS endpoint + automation
3. **Remove env var secret defaults** - Require secrets manager in prod
4. **Add circuit breaker** - For any external service calls

