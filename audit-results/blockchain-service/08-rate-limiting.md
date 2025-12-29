# Blockchain Service - 08 Rate Limiting Audit

**Service:** blockchain-service
**Document:** 08-rate-limiting.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 16% (4/25 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | In-memory rate limiting, No Redis, No route-specific limits, No custom keyGenerator |
| HIGH | 4 | No skipOnError, No onExceeded logging, trustProxy too permissive, No outbound RPC limiting |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## Fastify Rate Limit Config (3/10)

- Plugin registered - PASS
- Redis storage - FAIL
- trustProxy configured - PASS
- Global limit set - PASS
- Route-specific limits - FAIL
- skipOnError - FAIL
- Custom keyGenerator - FAIL
- onExceeded logging - FAIL
- Error response - FAIL
- Ban repeat offenders - FAIL

## Response Headers (1/7)

- RateLimit-Limit - PARTIAL
- RateLimit-Remaining - PARTIAL
- RateLimit-Reset - PARTIAL
- Retry-After on 429 - PASS
- Machine-readable code - FAIL
- Documentation link - FAIL

## Header Manipulation (0/3)

- X-Forwarded-For not blindly trusted - PARTIAL
- User ID over IP when auth'd - FAIL
- IP validation - FAIL

## Blockchain-Specific (0/2)

- RPC calls rate limited - PARTIAL (reactive only)
- Outbound RPC limiting - FAIL

## Internal Services (0/1)

- Internal endpoint limits - FAIL

## Critical Remediations

### P0: Add Redis Storage
```typescript
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis: new Redis({
    host: process.env.REDIS_HOST,
    password: process.env.REDIS_PASSWORD
  })
});
```

### P0: Add Custom keyGenerator
```typescript
keyGenerator: (request) => {
  return request.headers['x-internal-service']
    || request.userId
    || request.ip;
}
```

### P0: Add Route-Specific Limits
```typescript
fastify.post('/internal/mint-tickets', {
  config: { rateLimit: { max: 50, timeWindow: '1 minute' } }
});
```

### P1: Add skipOnError
```typescript
skipOnError: true // Fail open if Redis unavailable
```

### P1: Add onExceeded Logging
```typescript
onExceeded: (request, key) => {
  logger.warn({ key, path: request.url }, 'Rate limit exceeded');
}
```

### P1: Restrict trustProxy
```typescript
trustProxy: ['127.0.0.1', '10.0.0.0/8']
```

## Strengths

- @fastify/rate-limit plugin installed
- Global rate limit of 100/min
- trustProxy enabled
- Retry-After header on 429
- Circuit breaker for RPC (reactive)
- Retry logic handles 429 errors

Rate Limiting Score: 16/100
