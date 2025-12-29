## Transfer-Service Rate Limiting Audit
### Standard: 08-rate-limiting.md

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 26 |
| **Passed** | 10 |
| **Failed** | 11 |
| **Partial** | 5 |
| **Pass Rate** | 38% |

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 2 |
| 🟠 HIGH | 5 |
| 🟡 MEDIUM | 6 |
| 🟢 LOW | 3 |

---

## Global Rate Limiting

### Fastify Rate Limit Plugin

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Rate limit plugin registered | **PASS** | `app.ts:27-30` |
| 2 | Global rate limit configured | **PASS** | `max: 100, timeWindow: '1 minute'` |
| 3 | Rate limit headers returned | **PASS** | Fastify plugin default behavior |
| 4 | 429 response on limit exceeded | **PASS** | Plugin default behavior |
| 5 | Retry-After header returned | **PASS** | Plugin default |

### Evidence from app.ts:
```typescript
// Lines 27-30
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});
```

---

## Custom Rate Limit Middleware Analysis

### rate-limit.middleware.ts Configuration

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 6 | Redis-backed rate limiting | **PASS** | `rate-limit.middleware.ts:13-51` |
| 7 | Sliding window algorithm | **PASS** | Uses INCR with TTL |
| 8 | User-scoped rate limiting | **PASS** | Key includes `userId` |
| 9 | IP fallback for unauthenticated | **PASS** | `identifier = userId || request.ip` |

### Rate Limit Presets Defined

| Preset | Max | Window | Status |
|--------|-----|--------|--------|
| `default` | 100 | 60s | ✅ Defined |
| `strict` | 10 | 60s | ✅ Defined |
| `relaxed` | 200 | 60s | ✅ Defined |
| `transferCreation` | 5 | 60s | ✅ Defined |
| `blockchainOperation` | 3 | 60s | ✅ Defined |
| `webhookDelivery` | 50 | 60s | ✅ Defined |

### Evidence from rate-limit.middleware.ts:
```typescript
// Lines 53-68
export const RateLimitPresets = {
  default: { max: 100, windowSeconds: 60 },
  strict: { max: 10, windowSeconds: 60 },
  relaxed: { max: 200, windowSeconds: 60 },
  transferCreation: { max: 5, windowSeconds: 60 },
  blockchainOperation: { max: 3, windowSeconds: 60 },
  webhookDelivery: { max: 50, windowSeconds: 60 }
};
```

---

## Endpoint-Specific Rate Limiting

### Critical Endpoints Analysis

| Endpoint | Required Limit | Applied? | Status |
|----------|---------------|----------|--------|
| POST `/transfers/gift` | `transferCreation` (5/min) | **NO** | 🔴 CRITICAL |
| POST `/transfers/:id/accept` | `strict` (10/min) | **NO** | 🔴 CRITICAL |
| Blockchain operations | `blockchainOperation` (3/min) | **NO** | 🟠 HIGH |

### Evidence from transfer.routes.ts:
```typescript
// Lines 16-46 - NO custom rate limiting applied
app.post<{...}>('/transfers/gift', {
  preHandler: [authenticate, validate({...})]  // Missing: rate limit middleware
}, transferController.giftTransfer.bind(transferController));

app.post<{...}>('/transfers/:transferId/accept', {
  preHandler: [authenticate, validate({...})]  // Missing: rate limit middleware
}, transferController.acceptTransfer.bind(transferController));
```

---

## Rate Limiting Configuration Checklist

### Global Configuration

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 10 | Rate limit store is Redis | **FAIL** 🟠 HIGH | Plugin uses in-memory by default |
| 11 | Distributed rate limiting | **FAIL** 🟠 HIGH | No Redis store configured |
| 12 | Rate limit key includes tenant | **FAIL** 🟡 | Not tenant-scoped |

### Evidence - Missing Redis Store:
```typescript
// app.ts:27-30 - Missing store configuration
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
  // Missing: store: new FastifyRateLimitRedis({ redis })
});
```

### Per-Endpoint Configuration

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 13 | Sensitive endpoints have stricter limits | **FAIL** 🔴 | All use global 100/min |
| 14 | Write endpoints more restrictive | **FAIL** 🔴 | POST uses same as GET |
| 15 | Health endpoints excluded | **PARTIAL** 🟢 | Not explicitly excluded |

---

## Error Response Handling

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 16 | 429 status code used | **PASS** | `rate-limit.middleware.ts:39` |
| 17 | Clear error message | **PASS** | `'Rate limit exceeded'` |
| 18 | Retry-After header | **PASS** | `rate-limit.middleware.ts:40` |
| 19 | Rate limit exceeded logged | **FAIL** 🟡 | No logging in middleware |

### Evidence from rate-limit.middleware.ts:
```typescript
// Lines 38-44
reply.header('Retry-After', options.windowSeconds);
reply.code(429).send({
  statusCode: 429,
  error: 'Too Many Requests',
  message: 'Rate limit exceeded. Please try again later.'
});
// Missing: logger.warn({ userId, ip, endpoint }, 'Rate limit exceeded');
```

---

## Abuse Prevention

### DDoS Protection

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 20 | IP-based rate limiting | **PARTIAL** 🟡 | Only in custom middleware |
| 21 | Connection limiting | **FAIL** 🟡 | Not configured |
| 22 | Slow request protection | **FAIL** 🟡 | No request timeout |

### Brute Force Protection

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 23 | Auth endpoint strict limits | **N/A** | Auth handled by auth-service |
| 24 | Transfer endpoint limits | **FAIL** 🔴 CRITICAL | Not applied |
| 25 | Exponential backoff on failures | **FAIL** 🟡 | Not implemented |

### Resource Exhaustion

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 26 | Blockchain rate limited | **FAIL** 🟠 HIGH | Preset defined but not used |

---

## Critical Findings

### 🔴 CRITICAL-1: Transfer Creation Not Rate Limited
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `transfer.routes.ts:16-30` |
| Issue | POST `/transfers/gift` uses global 100/min limit |
| Risk | Abuse: 100 transfers/minute possible |
| Impact | Spam transfers, NFT manipulation, resource exhaustion |
| Remediation | Apply `transferCreation` preset (5/min) |

### 🔴 CRITICAL-2: Transfer Acceptance Not Rate Limited
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `transfer.routes.ts:33-46` |
| Issue | POST `/transfers/:id/accept` uses global limit |
| Risk | Automated acceptance abuse |
| Remediation | Apply `strict` preset (10/min) |

### 🟠 HIGH: In-Memory Rate Limit Store
| Severity | 🟠 HIGH |
|----------|---------|
| Evidence | `app.ts:27-30` |
| Issue | Fastify rate-limit uses in-memory store by default |
| Risk | Rate limits not shared across instances |
| Impact | Multi-instance deployments bypass limits |
| Remediation | Configure Redis store |

### 🟠 HIGH: Blockchain Operations Not Limited
| Severity | 🟠 HIGH |
|----------|---------|
| Evidence | `blockchain-transfer.service.ts` |
| Issue | `blockchainOperation` preset not applied |
| Risk | Expensive blockchain calls unbounded |
| Remediation | Apply rate limit to blockchain operations |

---

## Middleware Application Gap

### Defined but Unused Middleware
```typescript
// rate-limit.middleware.ts - DEFINED ✅
export function createRateLimitMiddleware(
  redis: Redis,
  options: RateLimitOptions = RateLimitPresets.default
)

export const RateLimitPresets = {
  transferCreation: { max: 5, windowSeconds: 60 },  // 5/min for transfers
  blockchainOperation: { max: 3, windowSeconds: 60 } // 3/min for blockchain
};
```
```typescript
// transfer.routes.ts - NOT APPLIED ❌
app.post('/transfers/gift', {
  preHandler: [authenticate, validate({...})]
  // Missing: createRateLimitMiddleware(redis, RateLimitPresets.transferCreation)
});
```

---

## Required Implementation

### 1. Apply Transfer Rate Limiting
```typescript
// transfer.routes.ts - Add rate limiting
import { createRateLimitMiddleware, RateLimitPresets } from '../middleware/rate-limit.middleware';

export default function transferRoutes(app: FastifyInstance, pool: Pool, redis: Redis) {
  const transferRateLimit = createRateLimitMiddleware(redis, RateLimitPresets.transferCreation);
  const strictRateLimit = createRateLimitMiddleware(redis, RateLimitPresets.strict);
  
  app.post('/transfers/gift', {
    preHandler: [
      transferRateLimit,  // Add rate limit FIRST
      authenticate,
      validate({...})
    ]
  }, ...);
  
  app.post('/transfers/:id/accept', {
    preHandler: [
      strictRateLimit,  // Add strict limit
      authenticate,
      validate({...})
    ]
  }, ...);
}
```

### 2. Configure Redis Store for Global Plugin
```typescript
// app.ts - Add Redis store
import FastifyRateLimitRedis from '@fastify/rate-limit/store/redis';

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis: redisClient,  // Enable distributed rate limiting
  keyGenerator: (request) => {
    // Include tenant for multi-tenant isolation
    return `${request.user?.tenant_id || 'global'}:${request.user?.id || request.ip}`;
  },
  onExceeded: (request, key) => {
    request.log.warn({ key, ip: request.ip }, 'Rate limit exceeded');
  }
});
```

### 3. Add Rate Limit Logging
```typescript
// rate-limit.middleware.ts - Add logging
if (current > options.max) {
  logger.warn({
    event: 'rate_limit_exceeded',
    userId: identifier,
    ip: request.ip,
    endpoint: request.url,
    current,
    max: options.max
  }, 'Rate limit exceeded');
  
  // ... return 429
}
```

---

## Prioritized Remediations

### 🔴 CRITICAL (Fix Immediately)

1. **Apply Transfer Creation Rate Limit**
   - File: `transfer.routes.ts`
   - Action: Add `createRateLimitMiddleware(redis, RateLimitPresets.transferCreation)` to POST `/transfers/gift`

2. **Apply Transfer Acceptance Rate Limit**
   - File: `transfer.routes.ts`
   - Action: Add rate limit to POST `/transfers/:id/accept`

### 🟠 HIGH (Fix Within 24-48 Hours)

3. **Configure Redis Store for Global Rate Limit**
   - File: `app.ts`
   - Action: Add Redis store to `@fastify/rate-limit` plugin

4. **Apply Blockchain Rate Limit**
   - File: `blockchain-transfer.service.ts` or route level
   - Action: Use `blockchainOperation` preset

5. **Add Tenant-Scoped Rate Limiting**
   - Action: Include tenant_id in rate limit key

6. **Add Rate Limit Exceeded Logging**
   - File: `rate-limit.middleware.ts`
   - Action: Log all rate limit violations

### 🟡 MEDIUM (Fix Within 1 Week)

7. **Add Rate Limit Metrics**
   - Track rate limit hits in Prometheus

8. **Configure Connection Limiting**
   - Prevent socket exhaustion attacks

9. **Add Request Timeout**
   - Protect against slowloris attacks

---

## Rate Limit Comparison

| Endpoint | Current | Required | Gap |
|----------|---------|----------|-----|
| POST `/transfers/gift` | 100/min | 5/min | **20x too high** |
| POST `/transfers/:id/accept` | 100/min | 10/min | **10x too high** |
| Blockchain ops | Unlimited | 3/min | **Unlimited gap** |
| Webhook delivery | 100/min | 50/min | 2x too high |

---

## End of Rate Limiting Audit Report
