# Event Service - 13 Graceful Degradation Audit

**Service:** event-service
**Document:** 13-graceful-degradation.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 51% (25/49 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 2 | No fallback strategies, No HTTP retry logic |
| MEDIUM | 3 | No statement timeout, Linear backoff without jitter, No LB drain delay |
| LOW | 2 | pool.min should be 0, Body limit not configured |

---

## Graceful Shutdown (7/9)

| Check | Status | Evidence |
|-------|--------|----------|
| SIGTERM handler | PASS | index.ts:185 |
| SIGINT handler | PASS | index.ts:186 |
| fastify.close() called | PASS | index.ts:152 |
| LB drain delay | FAIL | No preStop sleep |
| In-flight requests complete | PASS | fastify.close() handles |
| Database closed | PASS | index.ts:159-168 |
| Redis closed | PASS | index.ts:176 |
| Max shutdown timeout | FAIL | Not configured |

**Shutdown Order (Correct):**
1. Stop accepting requests (app.close())
2. Stop background jobs (cleanupService.stop())
3. Close database (pool.end(), db.destroy())
4. Close MongoDB
5. Close Redis

---

## Request Handling (4/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Request timeout | PASS | requestTimeout: 30000 |
| Connection timeout | PASS | connectionTimeout: 10000 |
| Keep-alive timeout | PASS | keepAliveTimeout: 72000 (> ALB 60s) |
| Body size limits | FAIL | bodyLimit not configured |
| Rate limiting | PASS | registerRateLimiting(app) |

---

## Circuit Breaker (3/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Wraps external calls | PASS | venue-service.client.ts:15 |
| Failure threshold | PASS | errorThresholdPercentage: 50 |
| Recovery timeout | PASS | resetTimeout: 30000 |
| Fallback defined | FAIL | No fallback - throws error |
| Metrics exposed | FAIL | No metrics integration |

---

## HTTP Timeout/Retry (1/6)

| Check | Status | Evidence |
|-------|--------|----------|
| Connection timeout | PARTIAL | Implicit via circuit breaker |
| Request timeout | PASS | timeout: 5000 |
| Timeout documented | FAIL | Not documented |
| Retries implemented | FAIL | No retry logic |
| Exponential backoff | FAIL | Not implemented |
| Jitter added | FAIL | Not implemented |

---

## PostgreSQL (5/10)

| Check | Status | Evidence |
|-------|--------|----------|
| pool.min set | PARTIAL | Set to 2 (should be 0) |
| pool.max appropriate | PASS | Set to 10 |
| Acquire timeout | PASS | acquireTimeoutMillis: 30000 |
| Idle timeout | PASS | idleTimeoutMillis: 30000 |
| Statement timeout | FAIL | Not configured |
| Create timeout | FAIL | Not configured |
| Retry on failure | PASS | 5 retries |
| Exponential backoff | PARTIAL | Linear backoff |
| Jitter | FAIL | Not implemented |
| knex.destroy() called | PASS | index.ts:168 |

---

## External Services (4/4)

| Check | Status | Evidence |
|-------|--------|----------|
| Stripe NOT in health | PASS | Not checked |
| Solana NOT in health | PASS | Not checked |
| Circuit breaker blockchain | PASS | Uses shared BlockchainClient |
| Retry logic blockchain | PASS | Handled by shared package |

---

## Fallback Strategies (0/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Cache fallback | FAIL | No cache fallback on venue-service failure |
| Default response fallback | FAIL | Throws errors |
| Degraded service mode | FAIL | Not implemented |
| Fail silent non-critical | FAIL | All failures thrown |
| Fallback metrics | FAIL | No tracking |

---

## Load Shedding (0/4)

| Check | Status | Evidence |
|-------|--------|----------|
| Priority-based shedding | FAIL | Not implemented |
| Rate-based shedding | PARTIAL | Rate limiting exists |
| Resource-based shedding | FAIL | No @fastify/under-pressure |
| 429/503 with Retry-After | PARTIAL | Rate limit returns 429 |

---

## Positive Findings

- Comprehensive graceful shutdown
- Circuit breaker on venue-service (Opossum)
- Database connection retry (5 retries)
- Proper request timeouts
- Separate background job shutdown
- Rate limiting enabled

---

## Remediation Priority

### HIGH (This Week)
1. **Add fallback for venue-service:**
```typescript
async validateVenueAccess(venueId, authToken) {
  try {
    const venue = await this.circuitBreaker.fire(...);
    await cache.set(`venue:${venueId}`, venue, 3600);
    return true;
  } catch (error) {
    const cached = await cache.get(`venue:${venueId}`);
    if (cached) return true;
    throw error;
  }
}
```

2. **Add HTTP retry with exponential backoff + jitter:**
```typescript
const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
```

### MEDIUM (This Month)
1. Add statement_timeout to database:
```typescript
pool: {
  afterCreate: (conn, done) => {
    conn.query('SET statement_timeout = 30000', done);
  }
}
```

2. Add jitter to database retry

3. Add 5-second LB drain delay before shutdown

### LOW (Backlog)
1. Set pool.min to 0
2. Configure bodyLimit
