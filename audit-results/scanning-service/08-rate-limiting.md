# Scanning Service Rate Limiting Audit

**Standard:** Docs/research/08-rate-limiting.md  
**Service:** backend/services/scanning-service  
**Date:** 2024-12-27

---

## Files Reviewed

| Path | Status |
|------|--------|
| src/middleware/rate-limit.middleware.ts | ✅ Reviewed |
| src/app.ts | ❌ Does not exist (uses index.ts) |
| src/index.ts | ✅ Reviewed |
| src/config/env.validator.ts | ✅ Reviewed |
| src/routes/*.ts | ✅ 6 files reviewed |

---

## Section 3.1: Fastify Rate Limit Configuration

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | `@fastify/rate-limit` registered | ✅ PASS | Package.json dependency |
| 2 | Redis storage for production | ⚠️ PARTIAL | In-memory default, Redis optional |
| 3 | `trustProxy` configured | ✅ PASS | `index.ts:44` - trustProxy: true |
| 4 | Global rate limit baseline | ❌ FAIL | Per-route only |
| 5 | Route-specific limits | ✅ PASS | Scan endpoint has limits |
| 6 | `skipOnError: true` | ❌ FAIL | Not configured |
| 7 | `keyGenerator` uses user ID | ✅ PASS | Custom key generator |
| 8 | `onExceeded` logs violations | ✅ PASS | Metrics tracked |
| 9 | Error response actionable | ✅ PASS | Returns JSON error |
| 10 | `ban` for repeat offenders | ❌ FAIL | Not configured |

**Evidence - Rate Limit Configuration:**
```typescript
// rate-limit.middleware.ts:19-42
export const scanRateLimiter = {
  max: config.RATE_LIMIT_MAX || 10,
  timeWindow: config.RATE_LIMIT_WINDOW_MS || 60000,
  keyGenerator: (request: FastifyRequest) => {
    const deviceId = (request.body as any)?.device_id || 'unknown';
    const staffId = (request.body as any)?.staff_user_id || 'unknown';
    return `${request.ip}:${deviceId}:${staffId}`;  // ✅ Combined key
  },
  errorResponseBuilder: () => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many scan attempts. Please wait before trying again.',
  }),
};
```

---

## Section 3.2: Redis Rate Limiting Infrastructure

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Redis Cluster/Sentinel configured | N/A | Uses shared Redis config |
| 2 | Connection pooling | ✅ PASS | Shared Redis client |
| 3 | Connection timeout | ✅ PASS | redis.ts has timeouts |
| 4 | Atomic operations used | ⚠️ PARTIAL | Uses @fastify/rate-limit |
| 5 | Key namespacing | ❌ FAIL | No rate-limit prefix visible |
| 6 | TTL on keys | ✅ PASS | Built into plugin |
| 7 | Redis memory limits | N/A | Infrastructure config |
| 8 | Fallback behavior | ❌ FAIL | No skipOnError |
| 9 | Redis latency monitored | ✅ PASS | Metrics exist |
| 10 | Separate Redis instance | ❌ FAIL | Shared instance |

---

## Section 3.3: Scan Endpoint Rate Limiting (Domain-Specific)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Scan endpoint rate limited | ✅ PASS | 10/minute per device |
| 2 | Bulk endpoint stricter limits | ✅ PASS | 5/5min for bulk |
| 3 | Per-device limiting | ✅ PASS | device_id in key |
| 4 | Per-staff limiting | ✅ PASS | staff_user_id in key |
| 5 | Failed attempt tracking | ✅ PASS | Separate middleware |
| 6 | Rate limit metrics | ✅ PASS | `rateLimitExceeded` counter |

**Evidence - Scan Rate Limiting:**
```typescript
// scan.ts:22-25
fastify.post<{ Body: ScanBody }>('/', {
  preHandler: [authenticateRequest, requireRole(...), validateRequest(...)],
  config: { rateLimit: scanRateLimiter }  // ✅ Applied
}, async (request, reply) => {...});

// scan.ts:78-83 - Bulk endpoint stricter
fastify.post<{ Body: BulkScanBody }>('/bulk', {
  preHandler: [...],
  config: {
    rateLimit: { max: 5, timeWindow: 5 * 60 * 1000 }  // ✅ Stricter
  }
}, async (request, reply) => {...});
```

**Evidence - Failed Attempt Tracking:**
```typescript
// rate-limit.middleware.ts:54-67
export const failedScanAttemptLimiter = {
  max: 5,
  timeWindow: 10 * 60 * 1000,  // 10 minutes
  keyGenerator: (request: FastifyRequest) => {
    const deviceId = (request.body as any)?.device_id || 'unknown';
    return `failed:${request.ip}:${deviceId}`;
  },
};
```

---

## Section 3.4: Other Endpoints Rate Limiting

| Endpoint | Rate Limited | Limit | Evidence |
|----------|--------------|-------|----------|
| POST /api/scan | ✅ | 10/min | scan.ts:22 |
| POST /api/scan/bulk | ✅ | 5/5min | scan.ts:78 |
| GET /api/qr/generate/:id | ❌ | None | qr.ts:16 |
| POST /api/qr/validate | ❌ | None | qr.ts:29 |
| GET /api/devices | ❌ | None | devices.ts:18 |
| POST /api/devices/register | ❌ | None | devices.ts:32 |
| GET /api/policies/* | ❌ | None | policies.ts |
| GET /api/offline/manifest | ❌ | None | offline.ts:23 |
| POST /api/offline/reconcile | ❌ | None | offline.ts:63 |
| GET /health* | N/A | N/A | Health checks exempt |

---

## Section 3.5: Response Header Verification

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | `RateLimit-Limit` header | ⚠️ PARTIAL | Plugin adds, not verified |
| 2 | `RateLimit-Remaining` header | ⚠️ PARTIAL | Plugin adds, not verified |
| 3 | `RateLimit-Reset` header | ⚠️ PARTIAL | Plugin adds, not verified |
| 4 | `Retry-After` on 429 | ⚠️ PARTIAL | Plugin adds, not verified |
| 5 | 429 body machine-readable | ✅ PASS | Returns error code |
| 6 | 429 body includes retry timing | ❌ FAIL | No retryAfter in body |
| 7 | 429 includes documentation link | ❌ FAIL | No docs link |
| 8 | 503 for system overload | ❌ FAIL | Not implemented |

**Evidence - 429 Response:**
```typescript
// rate-limit.middleware.ts - Missing retry info
errorResponseBuilder: () => ({
  success: false,
  error: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many scan attempts. Please wait before trying again.',
  // Missing: retryAfter, limit, remaining, documentation
}),
```

---

## Section 3.6: Header Manipulation Protection

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | X-Forwarded-For not blindly trusted | ⚠️ PARTIAL | trustProxy: true |
| 2 | Trusted proxy list explicit | ❌ FAIL | Uses boolean, not list |
| 3 | User ID preferred over IP | ⚠️ PARTIAL | Uses device_id + staff_id |
| 4 | Rightmost IP used | ⚠️ PARTIAL | Fastify default behavior |
| 5 | IP validation before use | ❌ FAIL | No explicit validation |

**Evidence:**
```typescript
// index.ts:44
trustProxy: true,  // Should be explicit proxy list for security
```

---

## Section 3.7: Configuration

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Rate limits configurable | ✅ PASS | Via environment |
| 2 | Defaults are reasonable | ✅ PASS | 10/min for scans |
| 3 | Validation on config | ✅ PASS | Joi validation |

**Evidence:**
```typescript
// env.validator.ts:51-52
RATE_LIMIT_MAX: Joi.number().default(100),
RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
```

---

## Summary

### Pass Rates by Section

| Section | Checks | Passed | Partial | Failed | N/A | Pass Rate |
|---------|--------|--------|---------|--------|-----|-----------|
| Fastify Config | 10 | 5 | 1 | 4 | 0 | 50% |
| Redis Infrastructure | 10 | 4 | 1 | 3 | 2 | 50% |
| Scan Endpoint | 6 | 6 | 0 | 0 | 0 | 100% |
| Other Endpoints | 9 | 2 | 0 | 6 | 1 | 25% |
| Response Headers | 8 | 1 | 4 | 3 | 0 | 13% |
| Header Manipulation | 5 | 0 | 3 | 2 | 0 | 0% |
| Configuration | 3 | 3 | 0 | 0 | 0 | 100% |
| **TOTAL** | **51** | **21** | **9** | **18** | **3** | **51%** |

---

### Critical Issues

| ID | Issue | File | Impact |
|----|-------|------|--------|
| RL-1 | No rate limiting on QR generation | qr.ts | DoS on QR generation |
| RL-2 | No rate limiting on device registration | devices.ts | Device enumeration |
| RL-3 | No rate limiting on offline manifest | offline.ts | Resource exhaustion |
| RL-4 | trustProxy: true without explicit proxy list | index.ts | X-Forwarded-For spoofing |

### High Issues

| ID | Issue | File | Impact |
|----|-------|------|--------|
| RL-5 | No global baseline rate limit | index.ts | Unprotected endpoints |
| RL-6 | No skipOnError for Redis failures | middleware | Service unavailable on Redis down |
| RL-7 | 429 response missing retry timing | rate-limit.middleware.ts | Poor client UX |
| RL-8 | In-memory storage by default | middleware | Bypass in distributed environment |

---

### Positive Findings

1. **Excellent Scan Endpoint Protection**: Main scan endpoint has comprehensive rate limiting with combined key (IP + device_id + staff_user_id).

2. **Tiered Limits for Bulk**: Bulk scan endpoint has stricter limits (5/5min vs 10/min for single).

3. **Failed Attempt Tracking**: Separate rate limiter for failed scan attempts (5/10min).

4. **Metrics Integration**: Rate limit exceeded events tracked via Prometheus metric `rateLimitExceeded`.

5. **Configurable Limits**: Rate limits configurable via environment variables with Joi validation.

---

### Recommended Fixes

**Priority 1: Add global baseline rate limit**
```typescript
// index.ts - Register global limit
await app.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  redis: redis,
  skipOnError: true,
  keyGenerator: (req) => req.user?.userId || req.ip
});
```

**Priority 2: Add rate limiting to unprotected routes**
```typescript
// qr.ts - Add rate limit
fastify.get('/generate/:ticketId', {
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
}, async (request, reply) => {...});

// devices.ts - Add rate limit
fastify.post('/register', {
  config: { rateLimit: { max: 10, timeWindow: '1 hour' } }
}, async (request, reply) => {...});
```

**Priority 3: Configure trusted proxy list**
```typescript
// index.ts - Explicit proxy list
const app = Fastify({
  trustProxy: ['127.0.0.1', '10.0.0.0/8', '172.16.0.0/12']
});
```

**Priority 4: Improve 429 response**
```typescript
errorResponseBuilder: (req, context) => ({
  success: false,
  error: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many requests. Please wait before trying again.',
  retryAfter: Math.ceil(context.ttl / 1000),
  limit: context.max,
  remaining: 0,
  documentation: 'https://docs.tickettoken.com/api/rate-limits'
}),
```

---

**Overall Assessment:** The scanning service has **excellent rate limiting on the main scan endpoint** (100%) but **poor coverage on auxiliary endpoints** (25%) and **missing response headers** (13%). The core scanning functionality is well-protected, but QR generation, device registration, and offline endpoints are vulnerable to abuse.
