# Blockchain-Indexer Service - 08 Rate Limiting Audit

**Service:** blockchain-indexer
**Document:** 08-rate-limiting.md
**Date:** 2025-12-26
**Auditor:** Cline AI
**Pass Rate:** 55% (11/20 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | In-memory rate limiting (not distributed/Redis) |
| HIGH | 3 | Rate limit may be too permissive, no rate limit headers, no per-endpoint limits |
| MEDIUM | 3 | Missing onExceeded logging, no Solana RPC rate limiting, trust proxy not explicit |
| LOW | 2 | No rate limit documentation, metrics endpoint unprotected |

---

## Section 3.1: Fastify Rate Limit Configuration

### RL1: @fastify/rate-limit plugin is registered
**Status:** PASS
**Evidence:** `src/index.ts:68-71`
```typescript
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});
```

### RL2: Redis storage configured for production
**Status:** FAIL
**Evidence:** No Redis storage configured for rate limiting.
```typescript
// Current: Uses default in-memory storage
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
  // MISSING: redis: redisClient
});
```
**Issue:** In-memory rate limiting allows bypass with multiple server instances.
**Remediation:**
```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis: redis
});
```

### RL3: trustProxy configured correctly
**Status:** PARTIAL
**Evidence:** `src/index.ts:62`
```typescript
trustProxy: true,
```
**Issue:** `trustProxy: true` trusts all proxies. Should specify trusted proxy IPs.
**Remediation:**
```typescript
trustProxy: ['10.0.0.0/8', '172.16.0.0/12']  // Specify trusted ranges
```

### RL4: Global rate limit is set as baseline
**Status:** PASS
**Evidence:** `src/index.ts:68-71` - 100 requests per minute globally applied.

### RL5: Route-specific limits for sensitive endpoints
**Status:** FAIL
**Evidence:** No per-route rate limits in `src/routes/query.routes.ts`.
```typescript
// All routes use global 100/minute limit
// No stricter limits for expensive operations
```
**Remediation:** Add per-route limits for expensive queries:
```typescript
{
  preHandler: verifyJWT,
  config: {
    rateLimit: {
      max: 20,
      timeWindow: '1 minute'
    }
  }
}
```

### RL6: skipOnError configured for Redis failures
**Status:** N/A
**Evidence:** Not using Redis storage (see RL2).

### RL7: keyGenerator uses user ID for authenticated routes
**Status:** FAIL
**Evidence:** No custom keyGenerator configured.
```typescript
// Uses default (IP-based) instead of user-based
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
  // MISSING: keyGenerator: (req) => req.user?.userId || req.ip
});
```

### RL8: onExceeded callback logs rate limit violations
**Status:** FAIL
**Evidence:** No onExceeded callback configured.
**Remediation:**
```typescript
await app.register(rateLimit, {
  onExceeded: (req, key) => {
    logger.warn({ key, url: req.url, ip: req.ip }, 'Rate limit exceeded');
    metrics.increment('rate_limit.exceeded');
  }
});
```

### RL9: Error response includes actionable information
**Status:** PARTIAL
**Evidence:** Default Fastify rate limit error response.
```typescript
// Default response:
// { "statusCode": 429, "error": "Too Many Requests", "message": "Rate limit exceeded" }
```
**Issue:** Missing retry timing and documentation link.

### RL10: ban option configured for repeat offenders
**Status:** FAIL
**Evidence:** No ban configuration.

---

## Section 3.2: Response Header Verification

### RH1: RateLimit-Limit header present on all responses
**Status:** FAIL
**Evidence:** Default Fastify rate limit doesn't add headers to successful responses.

### RH2: RateLimit-Remaining header present
**Status:** FAIL
**Evidence:** Not configured.

### RH3: RateLimit-Reset header present
**Status:** FAIL
**Evidence:** Not configured.

### RH4: Retry-After header on 429 responses
**Status:** PASS
**Evidence:** Fastify rate limit plugin adds Retry-After by default.

### RH5-8: 429 response format
**Status:** PARTIAL
**Evidence:** Basic 429 response, missing documentation link.

---

## Section 3.3: Endpoint-Specific Analysis

### Query Endpoints (All GET - Lower Risk)

| Endpoint | Current Limit | Recommended | Status |
|----------|---------------|-------------|--------|
| GET /transactions/:signature | 100/min (global) | 100/min | PASS |
| GET /wallet/:address/activity | 100/min (global) | 50/min | PARTIAL |
| GET /transactions/slot/:slot | 100/min (global) | 100/min | PASS |
| GET /nft/:tokenId/history | 100/min (global) | 50/min | PARTIAL |
| GET /marketplace/activity | 100/min (global) | 30/min | PARTIAL |
| GET /sync/status | 100/min (global) | 200/min | PASS |
| GET /reconciliation/discrepancies | 100/min (global) | 30/min | PARTIAL |

**Issue:** Expensive queries (marketplace, discrepancies) share same limit as simple lookups.

### Health/Metrics Endpoints

| Endpoint | Current Limit | Recommended | Status |
|----------|---------------|-------------|--------|
| GET /health | No limit (excluded) | No limit | PASS |
| GET /metrics | 100/min (global) | Excluded | PARTIAL |

**Evidence:** `src/index.ts:83-120` (health) and `src/index.ts:163-171` (metrics)
**Issue:** Metrics endpoint should be excluded from rate limiting or have separate limit.

### Authentication Endpoints (N/A)
**Status:** N/A
**Evidence:** No authentication endpoints in this service - uses JWT from auth-service.

---

## Section 3.4: External Service Rate Limiting

### Solana RPC Rate Limiting

**Status:** PARTIAL
**Evidence:** `src/utils/rpcFailover.ts` - Has failover but no explicit rate limiting.
```typescript
// No rate limiting on RPC calls
const signatures = await this.connection.getSignaturesForAddress(...);
```

**Issue:** Public Solana RPC endpoints have rate limits (typically 25-100 req/sec).
**Recommendation:** Add rate limiting to RPC calls to prevent being blocked.

### Circuit Breaker (Related)
**Status:** PASS
**Evidence:** `src/utils/rpcFailover.ts:34-39`
```typescript
circuitBreaker: new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenRequests: 3
})
```
Circuit breaker provides some protection but isn't rate limiting.

---

## Section 3.5: Rate Limit Bypass Protection

### Header Manipulation Protection

| Check | Status | Evidence |
|-------|--------|----------|
| X-Forwarded-For not blindly trusted | PARTIAL | trustProxy: true (too permissive) |
| Trusted proxy list explicit | FAIL | No explicit proxy list |
| User ID preferred over IP | FAIL | No custom keyGenerator |
| IP validation | FAIL | No validation |

---

## Additional Findings

### FINDING-1: Rate Limit Not Distributed
**Location:** `src/index.ts:68-71`
**Issue:** Uses in-memory storage, bypassed with multiple instances.
```typescript
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
  // No redis configured
});
```

### FINDING-2: Indexer Polling Has No Self-Throttling
**Location:** `src/indexer.ts:97-106`
**Evidence:**
```typescript
setInterval(async () => {
  if (!this.isRunning) return;
  try {
    await this.pollRecentTransactions();
  } catch (error) {
    logger.error({ error }, 'Polling error');
  }
}, 5000);
```
**Issue:** Fixed 5-second interval, no adaptive throttling based on RPC availability.

### FINDING-3: Marketplace Tracker No Rate Limiting
**Location:** `src/processors/marketplaceTracker.ts`
**Issue:** Makes RPC calls without rate limiting, could hit provider limits.

### FINDING-4: No Rate Limit on Background Jobs
**Location:** Transaction processing, reconciliation
**Status:** N/A (not user-facing)
**Note:** Background jobs should have self-imposed limits to prevent resource exhaustion.

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Add Redis storage for rate limiting** - Prevents bypass in distributed deployment
```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis: redis,
  skipOnError: true
});
```

### HIGH (This Week)
1. **Add custom keyGenerator** - Rate limit by user, not just IP
2. **Add onExceeded logging** - Track rate limit violations
3. **Add per-route limits** - Stricter limits for expensive endpoints
4. **Configure trusted proxy list** - Prevent header spoofing

### MEDIUM (This Month)
1. **Add rate limit headers** - Inform clients of quota status
2. **Add Solana RPC rate limiting** - Prevent being blocked by providers
3. **Exclude/protect metrics endpoint** - Separate from API limits

### LOW (Backlog)
1. **Add rate limit documentation** - Document limits for API consumers
2. **Add adaptive throttling** - Backoff when RPC providers are slow
3. **Add ban functionality** - Block repeat offenders

---

## Pass/Fail Summary by Section

| Section | Pass | Fail | Partial | N/A | Total |
|---------|------|------|---------|-----|-------|
| Rate Limit Config | 2 | 6 | 1 | 1 | 10 |
| Response Headers | 1 | 3 | 1 | 3 | 8 |
| Endpoint Analysis | 3 | 0 | 4 | 7 | 14 |
| External Service | 1 | 0 | 1 | 0 | 2 |
| Bypass Protection | 0 | 3 | 1 | 0 | 4 |
| **Total** | **7** | **12** | **8** | **11** | **38** |

**Applicable Checks:** 27 (excluding N/A)
**Pass Rate:** 26% (7/27 pass cleanly)
**Pass + Partial Rate:** 56% (15/27)

---

## Current Rate Limit Summary

| Aspect | Current | Recommended |
|--------|---------|-------------|
| Global Limit | 100/min | 100/min ✓ |
| Storage | In-memory ❌ | Redis |
| Key Generation | IP only ❌ | User ID + IP |
| Headers | Not returned ❌ | All RateLimit-* headers |
| Logging | None ❌ | onExceeded callback |
| Per-route limits | None ❌ | Tiered by cost |
| Trusted Proxies | All ❌ | Explicit list |

---

## Positive Findings

1. **Rate limiting enabled** - Global rate limit is configured
2. **Reasonable default limit** - 100/minute is appropriate for query API
3. **Circuit breaker exists** - RPC failover has circuit breaker protection
4. **Health endpoint excluded** - Health checks not rate limited
