## Integration Service - Rate Limiting Audit Report

**Audit Date:** December 28, 2025  
**Service:** integration-service  
**Standard:** Docs/research/08-rate-limiting.md

---

## 🔴 CRITICAL ISSUES

### In-Memory Rate Limiting Storage (Inbound)
**File:** `src/middleware/rate-limit.middleware.ts:5-11`
**Issue:** No Redis storage. Each server instance has own counter. Bypassed with horizontal scaling.

### In-Memory Rate Limiting Storage (Outbound)
**File:** `src/services/rate-limiter.service.ts:17-18`
**Issue:** Uses Map() for storage. Same provider called 4x limit with 4 instances.

### Missing keyGenerator (IP-Only)
**Issue:** Defaults to IP-based. Should use userId for authenticated requests.

### No Retry-After Header in 429 Response
**Issue:** Error response doesn't include retryAfter field.

### No RateLimit Headers on Success Responses
**Issue:** Missing RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset.

### No onExceeded Logging
**Issue:** Rate limit violations not logged for security monitoring.

---

## 🟠 HIGH SEVERITY ISSUES

| Issue | Location |
|-------|----------|
| No tiered limits per route | Only general (100/min) and webhook (1000/min) |
| No trustProxy configuration | X-Forwarded-For not validated |
| Webhook rate limiting before signature | Should be after verification |
| No ban for repeat offenders | Missing ban configuration |
| skipOnError not configured | Will fail closed if Redis added |

---

## 🟢 PASSING CHECKS

| Check | Status |
|-------|--------|
| @fastify/rate-limit plugin used | ✅ PASS |
| Separate webhook rate limiter | ✅ PASS |
| Provider-specific outbound limits | ✅ PASS |
| waitIfNeeded function | ✅ PASS |
| Environment variable config | ✅ PASS |
| Cleanup for outbound limiter | ✅ PASS |

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 6 |
| 🟠 HIGH | 5 |
| 🟡 MEDIUM | 3 |
| ✅ PASS | 6 |

### Overall Rate Limiting Score: **30/100**

**Risk Level:** CRITICAL
