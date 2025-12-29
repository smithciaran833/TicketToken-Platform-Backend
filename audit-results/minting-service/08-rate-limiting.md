# Minting Service - 08 Rate Limiting Audit

**Service:** minting-service
**Document:** 08-rate-limiting.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 10% (5/52 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 6 | No endpoint-specific limits, No Redis store, No queue concurrency, No Solana throttling, No metrics, No batch limit |
| HIGH | 3 | No tenant-based key, No health endpoint bypass, No RPC fallback |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## 3.1 Global Rate Limiting (4/8)

- GL1: Plugin registered - PASS
- GL2: Default limit - PASS (100)
- GL3: Time window - PASS (60s)
- GL4: Limit by IP - PARTIAL
- GL5: X-RateLimit headers - PARTIAL
- GL6: 429 response - PASS
- GL7: Error message - PARTIAL
- GL8: Reasonable limit - PASS

## 3.2 Endpoint-Specific (0/7)

- ES1-7: All FAIL - No endpoint-specific limits

## 3.3 Key Strategy (0/5)

- KS1: IP-based - PARTIAL
- KS2: User/Tenant-based - FAIL
- KS3: Service-based - FAIL
- KS5: Custom keyGenerator - FAIL
- KS6: Composite keys - FAIL

## 3.4 Storage (0/4)

- ST1: Redis store - FAIL
- ST2: Store connection - FAIL
- ST3: Store failover - FAIL
- ST4: Sliding window - PARTIAL

## 3.5 Headers (0/5)

- RH1-4: PARTIAL (default behavior)
- RH5: Headers customizable - FAIL

## 3.6 Bypass (0/3)

- BY1: Internal IP allowlist - FAIL
- BY2: Health check bypass - FAIL
- BY3: Trusted service bypass - FAIL

## 3.7 Queue (0/5)

- QR1: Concurrency limited - FAIL
- QR2: Job rate limited - FAIL
- QR3: Per-tenant limits - FAIL
- QR4: Backpressure - FAIL
- QR5: Job addition limit - FAIL

## 3.8 Blockchain (0/6)

- BR1: RPC rate limit - FAIL
- BR2: Transaction throttled - FAIL
- BR3: Limits documented - FAIL
- BR4: 429 handling - FAIL
- BR5: Fallback RPC - FAIL
- BR6: IPFS rate limited - FAIL

## 3.9 Error Response (1/5)

- ER1: 429 status - PASS
- ER2: Error body - PARTIAL
- ER3: Retry-After - PARTIAL
- ER4: Error logged - FAIL
- ER5: Metrics incremented - FAIL

## 3.10 Monitoring (0/4)

- MA1-4: All FAIL - No rate limit metrics

## Critical Remediations

### P0: Add Endpoint-Specific Limits
```typescript
fastify.post('/internal/mint', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
}, handler);
```

### P0: Add Redis Store
```typescript
await app.register(rateLimit, {
  max: 100,
  timeWindow: 60000,
  redis: redisClient
});
```

### P0: Add Queue Concurrency
```typescript
mintQueue.process('mint-ticket', 5, async (job) => {...});
```

### P0: Add Batch Size Limit
```typescript
if (tickets.length > 100) {
  return reply.code(400).send({ error: 'Max 100 tickets per batch' });
}
```

### P1: Add Tenant-Based Key
```typescript
keyGenerator: (request) => {
  return request.headers['x-tenant-id'] || request.ip;
}
```

### P1: Add Rate Limit Metrics
```typescript
const rateLimitHits = new Counter({
  name: 'rate_limit_hits_total',
  labelNames: ['endpoint', 'tenant_id']
});
```

## Strengths

- Global rate limit enabled
- Reasonable 100 req/min baseline
- 1-minute rolling window
- 429 response on limit
- Default headers included

Rate Limiting Score: 10/100
