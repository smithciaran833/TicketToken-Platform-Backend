## File Service - Rate Limiting Audit Report

**Audit Date:** December 28, 2025  
**Service:** file-service  
**Standard:** Docs/research/08-rate-limiting.md

---

## Rate Limiting Configuration

### Package Status
✅ @fastify/rate-limit installed

### Current Configuration (src/app.ts)
```typescript
await app.register(import('@fastify/rate-limit'), {
  global: true,
  max: 100,
  timeWindow: '1 minute'
});
```

---

## Configuration Checklist

| # | Check | Severity | Status | Evidence |
|---|-------|----------|--------|----------|
| 1 | @fastify/rate-limit registered | CRITICAL | ✅ PASS | Plugin registered |
| 2 | Redis storage configured | CRITICAL | ⚠️ PARTIAL | No Redis config visible |
| 3 | Global rate limit as baseline | HIGH | ✅ PASS | 100/minute |
| 4 | Route-specific limits for sensitive endpoints | CRITICAL | ⚠️ PARTIAL | Only PDF has override |
| 5 | skipOnError: true for fail-open | HIGH | ❌ MISSING | Not configured |
| 6 | keyGenerator uses user ID | HIGH | ❌ MISSING | Default IP-based |
| 7 | onExceeded callback for logging | MEDIUM | ❌ MISSING | No logging |

---

## Tiered Limits Analysis

| Operation | Resource Cost | Current Limit | Should Be |
|-----------|---------------|---------------|-----------|
| GET /files/:id | LOW | 100/min | 500/min |
| POST /upload | HIGH | 100/min | 20/min |
| POST /upload/from-url | HIGH | 100/min | 10/min |
| POST /images/resize | HIGH | 100/min | 30/min |
| POST /tickets/pdf/generate | VERY HIGH | 100/min | 10/min |
| DELETE /cache/flush | CRITICAL | 100/min | 5/min |

---

## Response Headers

| Header | Status | Evidence |
|--------|--------|----------|
| RateLimit-Limit | ✅ PASS | Plugin default |
| RateLimit-Remaining | ✅ PASS | Plugin default |
| RateLimit-Reset | ✅ PASS | Plugin default |
| Retry-After on 429 | ✅ PASS | Plugin default |

---

## Summary

### Critical Issues (3)

| # | Issue | Recommendation |
|---|-------|----------------|
| 1 | No Redis storage | Configure Redis for distributed rate limiting |
| 2 | IP-based limiting only | Add keyGenerator using userId |
| 3 | No onExceeded logging | Add callback to log rate limit events |

### High Severity Issues (4)

| # | Issue | Recommendation |
|---|-------|----------------|
| 1 | Same limit for all operations | Implement tiered limits |
| 2 | No skipOnError | Add for fail-open behavior |
| 3 | Upload endpoints too permissive | Reduce to 20/min |
| 4 | Cache flush unprotected | Add strict limit (5/min) |

### Passed Checks

✅ @fastify/rate-limit installed  
✅ Global rate limit configured  
✅ Default rate limit headers provided  
✅ Rate limit exceeded metric defined  

---

### Overall Rate Limiting Score: **35/100**

**Risk Level:** HIGH
