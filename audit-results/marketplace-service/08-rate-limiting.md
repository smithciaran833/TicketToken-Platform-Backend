# Marketplace Service - 08 Rate Limiting Audit

**Service:** marketplace-service
**Document:** 08-rate-limiting.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 30% (6/20 checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | In-memory only, No route-specific, Hardcoded values, Webhooks limited |
| HIGH | 3 | No user-based limits, Non-standard error, Feature flag unused |
| MEDIUM | 0 | None |
| LOW | 0 | None |

---

## 3.1 Global Rate Limiting (3/6)

| Check | Status | Evidence |
|-------|--------|----------|
| RL1: Plugin registered | PASS | @fastify/rate-limit |
| RL2: Max requests | PASS | max: 100 |
| RL3: Time window | PASS | 1 minute |
| RL4: Uses env config | FAIL | Hardcoded values |
| RL5: Key generator | PARTIAL | Defaults to IP |
| RL6: Redis store | FAIL | In-memory only |

---

## 3.2 Route-Specific Limits (0/6)

| Check | Status | Evidence |
|-------|--------|----------|
| RS1: Listing creation | FAIL | Global only |
| RS2: Transfer initiation | FAIL | Global only |
| RS3: Search | FAIL | Global only |
| RS4: Webhooks higher | FAIL | Subject to global |
| RS5: Admin higher | FAIL | Global only |
| RS6: Per-user mutations | FAIL | Not implemented |

---

## 3.3 Configuration (1/4)

| Check | Status | Evidence |
|-------|--------|----------|
| CFG1: Env configurable | PARTIAL | Vars defined, not used |
| CFG2: Feature flag | PARTIAL | Defined, not checked |
| CFG3: Per-environment | FAIL | Same for all |
| CFG4: Allowlist | PASS | Available in plugin |

---

## 3.4 Headers/Responses (2/4)

| Check | Status | Evidence |
|-------|--------|----------|
| HDR1: X-RateLimit-Limit | PASS | Built-in |
| HDR2: X-RateLimit-Remaining | PASS | Built-in |
| HDR3: Retry-After | FAIL | Not configured |
| HDR4: Custom error | FAIL | Default response |

---

## Recommended Limits by Route

| Route | Current | Recommended |
|-------|---------|-------------|
| POST /listings | 100/min | 10/hour |
| POST /transfers/purchase | 100/min | 5/min |
| GET /search | 100/min | 30/min |
| POST /webhooks/stripe | 100/min | Exempt |
| GET /health | 100/min | Exempt |

---

## Critical Remediations

### P0: Add Redis Store
```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

await app.register(rateLimit, {
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  timeWindow: process.env.RATE_LIMIT_WINDOW_MS || '60000',
  redis: redis,
});
```

### P0: Add Route-Specific Limits
```typescript
// transfers.routes.ts
fastify.post('/purchase', {
  config: {
    rateLimit: { max: 5, timeWindow: '1 minute' }
  }
}, controller.purchase);
```

### P0: Exempt Webhooks
```typescript
fastify.post('/stripe', {
  config: { rateLimit: false },
}, controller.handleStripeWebhook);
```

### P1: User-Based Key Generator
```typescript
keyGenerator: (request) => {
  if (request.user?.id) return `user:${request.user.id}`;
  return `ip:${request.ip}`;
}
```

### P1: Custom Error Response
```typescript
errorResponseBuilder: (request, context) => ({
  success: false,
  error: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests',
    retryAfter: Math.ceil(context.ttl / 1000)
  }
})
```

---

## Strengths

- Rate limit plugin registered
- Basic global limit configured
- Plugin supports all needed features
- Standard rate limit headers sent

Rate Limiting Score: 30/100
