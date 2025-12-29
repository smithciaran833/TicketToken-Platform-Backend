## Rate Limiting Audit: analytics-service

### Audit Against: `Docs/research/08-rate-limiting.md`

---

## Rate Limiting Configuration

| Check | Status | Evidence |
|-------|--------|----------|
| Rate limiting middleware exists | ✅ PASS | `rate-limit.middleware.ts` |
| Uses Redis for distributed limiting | ✅ PASS | `getRedis()` used |
| Health checks excluded | ✅ PASS | `/health`, `/ws-health` skipped |
| Rate limit headers returned | ✅ PASS | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| Graceful degradation on Redis failure | ✅ PASS | Falls through on error |
| Configurable limits | ❌ FAIL | **Hardcoded** `limit = 100` |
| Per-user rate limiting | ❌ FAIL | IP-based only, no user/tenant |
| Endpoint-specific limits | ❌ FAIL | Same limit for all endpoints |
| Retry-After header | ❌ FAIL | **Not implemented** |
| Proper HTTP status code | ❌ FAIL | Uses `UnauthorizedError` (401), should be 429 |

---

## Current Implementation Analysis

**rate-limit.middleware.ts:**
```typescript
export async function rateLimitMiddleware(req, res, next) {
  // ✅ Skip health checks
  if (req.path === '/health' || req.path === '/ws-health') {
    return next();
  }

  const redis = getRedis();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = `rate_limit:${ip}:${req.path}`;  // ⚠️ Path included but same limit
  
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 60);  // ✅ 1 minute window
  }
  
  const limit = 100;  // ❌ Hardcoded, not configurable
  
  if (count > limit) {
    return next(new UnauthorizedError('Rate limit exceeded'));  // ❌ Wrong error type
  }
  
  // ✅ Rate limit headers
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', (limit - count).toString());
  // ❌ Missing: X-RateLimit-Reset
  // ❌ Missing: Retry-After on 429
  
  next();
}
```

---

## Critical Issues

### 1. Wrong HTTP Status Code
```typescript
// ❌ CURRENT - Returns 401 Unauthorized
if (count > limit) {
  return next(new UnauthorizedError('Rate limit exceeded'));
}

// ✅ SHOULD BE - Return 429 Too Many Requests
if (count > limit) {
  return next(new TooManyRequestsError('Rate limit exceeded'));
}
```

### 2. Missing Retry-After Header
```typescript
// ❌ Not returning when limit will reset
if (count > limit) {
  const ttl = await redis.ttl(key);
  res.setHeader('Retry-After', ttl.toString());  // Missing
}
```

### 3. No Multi-Tier Rate Limiting
```typescript
// ❌ CURRENT - All endpoints same limit
const limit = 100;

// ✅ SHOULD BE - Different limits per endpoint type
const limits = {
  'POST:/metrics': 1000,      // Write operations
  'POST:/metrics/bulk': 100,  // Bulk operations
  'GET:/reports': 50,         // Heavy queries
  'POST:/exports': 10,        // Resource-intensive
  default: 100
};
```

### 4. No User/Tenant-Based Limiting
```typescript
// ❌ CURRENT - IP only
const key = `rate_limit:${ip}:${req.path}`;

// ✅ SHOULD BE - User + Tenant for authenticated requests
const userId = req.user?.id || 'anonymous';
const tenantId = req.user?.tenantId || 'public';
const key = `rate_limit:${tenantId}:${userId}:${req.path}`;
```

---

## Rate Limiting Coverage

| Route Category | Rate Limited? | Appropriate Limit? |
|----------------|---------------|-------------------|
| `POST /metrics` | ✅ Yes | ⚠️ 100/min may be too low for metrics ingestion |
| `POST /metrics/bulk` | ✅ Yes | ⚠️ Same as single, should be lower |
| `GET /metrics/*` | ✅ Yes | ✅ 100/min OK for reads |
| `POST /reports/generate` | ✅ Yes | ⚠️ Should be lower (10-20/min) |
| `POST /exports` | ✅ Yes | ⚠️ Should be much lower (5/min) |
| `WebSocket /ws` | ❌ No | ❌ No WS rate limiting visible |
| Health endpoints | ✅ Excluded | ✅ Correct |

---

## Algorithm Analysis

| Check | Status | Evidence |
|-------|--------|----------|
| Sliding window algorithm | ❌ FAIL | Uses fixed window |
| Token bucket algorithm | ❌ FAIL | Not implemented |
| Leaky bucket algorithm | ❌ FAIL | Not implemented |
| Atomic operations | ✅ PASS | Redis INCR is atomic |

**Current: Fixed Window Counter**
```typescript
const count = await redis.incr(key);
if (count === 1) {
  await redis.expire(key, 60);  // Fixed 1-minute window
}
```

**Issue:** Fixed windows can allow burst at window boundaries (up to 2x limit in 1 second if timed at window reset).

---

## Summary

### Critical Issues (Must Fix)
| Issue | Location | Risk |
|-------|----------|------|
| Wrong status code (401 vs 429) | `rate-limit.middleware.ts` | Non-standard API response |
| Missing Retry-After header | `rate-limit.middleware.ts` | Poor client experience |
| Hardcoded limits | `rate-limit.middleware.ts` | Inflexible configuration |
| No user/tenant-based limits | `rate-limit.middleware.ts` | Shared limits across users |
| No endpoint-specific limits | `rate-limit.middleware.ts` | Heavy endpoints under-protected |

### High Issues (Should Fix)
| Issue | Location | Risk |
|-------|----------|------|
| Fixed window algorithm | `rate-limit.middleware.ts` | Burst attacks at window boundary |
| Missing X-RateLimit-Reset | Headers | Client cannot calculate wait time |
| No WebSocket rate limiting | WebSocket handlers | DoS vulnerability |

### Compliance Score: 50% (6/12 checks passed)

- ✅ PASS: 6
- ❌ FAIL: 6

### Priority Fixes

1. **Use correct error type:**
```typescript
import { TooManyRequestsError } from '../utils/errors';

if (count > limit) {
  const ttl = await redis.ttl(key);
  res.setHeader('Retry-After', ttl.toString());
  res.setHeader('X-RateLimit-Reset', Math.floor(Date.now()/1000) + ttl);
  return next(new TooManyRequestsError('Rate limit exceeded'));
}
```

2. **Make limits configurable:**
```typescript
const limits = {
  writeOps: parseInt(process.env.RATE_LIMIT_WRITE || '100'),
  readOps: parseInt(process.env.RATE_LIMIT_READ || '200'),
  bulkOps: parseInt(process.env.RATE_LIMIT_BULK || '20'),
  exports: parseInt(process.env.RATE_LIMIT_EXPORT || '5'),
};
```

3. **Add sliding window using Redis sorted sets** for more accurate rate limiting

4. **Add user/tenant-aware rate limiting** for authenticated endpoints
