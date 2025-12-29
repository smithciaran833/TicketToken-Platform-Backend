# Auth Service - 08 Rate Limiting Audit

**Service:** auth-service
**Document:** 08-rate-limiting.md
**Date:** 2025-12-22
**Auditor:** Cline + Human Review
**Pass Rate:** 58% (18/31)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | No rate limit response headers |
| HIGH | 2 | No CAPTCHA, no OTP-specific rate limiting |
| MEDIUM | 3 | No skipOnError, no violation logging, no Retry-After header |

---

## Section 3.1: Fastify Configuration (8/10 PASS)

### @fastify/rate-limit registered
**Status:** PASS
**Evidence:** Plugin registered in app.ts with baseline config.

### Redis storage
**Status:** PASS
**Evidence:** `rateLimiter.ts` uses Redis via `getRedis()`.

### trustProxy configured
**Status:** PASS
**Evidence:** `trustProxy: true` in Fastify config.

### Global rate limit baseline
**Status:** PASS
**Evidence:** `max: 100, timeWindow: '15 minutes'` (disabled globally, per-route preferred).

### Route-specific limits
**Status:** PASS
**Evidence:** Login 5/15min, Registration 3/hr, Password Reset 3/hr.

### skipOnError for fail-open
**Status:** PARTIAL
**Issue:** Not configured - undefined behavior if Redis down.
**Remediation:** Add `skipOnError: true`.

### keyGenerator uses user ID
**Status:** PASS
**Evidence:** `lockout.service.ts` tracks both user ID and IP.

### onExceeded logging
**Status:** PARTIAL
**Issue:** No logging when rate limit exceeded.
**Remediation:** Add `logger.warn()` before throwing.

### Error response actionable
**Status:** PASS
**Evidence:** Includes retry time in message.

### Ban for repeat offenders
**Status:** PASS
**Evidence:** Block key with `blockDuration: duration * 2`.

---

## Section 3.3: Auth Endpoints (7/10 PASS)

### /auth/login strict limit
**Status:** PASS
**Evidence:** 5 attempts per 15 minutes.

### /auth/register spam prevention
**Status:** PASS
**Evidence:** 3 registrations per hour.

### /auth/forgot-password limited
**Status:** PASS
**Evidence:** 3 attempts per hour.

### /auth/reset-password limited
**Status:** PASS

### /auth/verify-otp strict limits
**Status:** PARTIAL
**Issue:** No OTP-specific rate limiter.
**Remediation:** Add 5 attempts per 5 minutes for OTP.

### Rate by username/email not just IP
**Status:** PASS
**Evidence:** Both user and IP tracked in lockout service.

### Failed vs successful tracking
**Status:** PASS
**Evidence:** `recordFailedAttempt()` and `clearFailedAttempts()`.

### Account lockout
**Status:** PASS
**Evidence:** 5 attempts, 15-minute lockout (configurable).

### CAPTCHA after N failures
**Status:** FAIL
**Issue:** No CAPTCHA integration.
**Remediation:** Add CAPTCHA after 3 failed attempts.

### GraphQL batching
**Status:** N/A (REST only)

---

## Section 3.5: Response Headers (1/8 PASS)

### RateLimit-Limit header
**Status:** FAIL

### RateLimit-Remaining header
**Status:** FAIL

### RateLimit-Reset header
**Status:** FAIL

### Retry-After on 429
**Status:** PARTIAL
**Issue:** TTL available in error but not set as header.
**Remediation:**
```typescript
if (error instanceof RateLimitError && error.ttl) {
  reply.header('Retry-After', error.ttl);
}
```

### 429 body quality
**Status:** PARTIAL
**Issue:** Human-readable but no machine-readable code.

---

## Section 3.7: Header Protection (2/3 PASS)

### X-Forwarded-For handling
**Status:** PASS
**Evidence:** Fastify handles via trustProxy.

### Trusted proxy list
**Status:** PARTIAL
**Issue:** `trustProxy: true` trusts all.
**Remediation:** Explicit IP list in production.

### User ID preferred over IP
**Status:** PASS
**Evidence:** User threshold lower than IP threshold.

---

## Remediation Priority

### CRITICAL
1. **Add rate limit headers** - RateLimit-Limit/Remaining/Reset on all responses

### HIGH
1. **Add CAPTCHA** - After 3 failed login attempts
2. **Add OTP rate limiter** - 5 attempts per 5 minutes

### MEDIUM
1. **Configure skipOnError** - Fail open if Redis unavailable
2. **Log rate limit violations** - Security monitoring
3. **Set Retry-After header** - On 429 responses
4. **Restrict trustProxy** - Explicit IP list

