## Compliance Service Rate Limiting Audit Report
### Audited Against: Docs/research/08-rate-limiting.md

---

## 🔴 CRITICAL FINDINGS

### setupRateLimiting Function Exists But NOT Called in Server
**Severity:** CRITICAL  
**File:** `src/middleware/rate-limit.middleware.ts` vs `src/server.ts`  
**Evidence:**

**rate-limit.middleware.ts** defines:
```typescript
// Line 62-95: setupRateLimiting function exists
export async function setupRateLimiting(fastify: FastifyInstance) {
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: rateLimitConfig.standard.max,
    // ... excellent configuration
  });
}
```

**server.ts (from earlier review)** - setupRateLimiting is NOT imported or called:
```typescript
// server.ts imports:
import { authenticate, requireAdmin } from './middleware/auth.middleware';
import { validateTenantId } from './middleware/tenant.middleware';
// ❌ setupRateLimiting NOT imported!

// No call to setupRateLimiting anywhere in server.ts
```
**Impact:** Rate limiting is completely disabled - NO protection against abuse!

---

### Custom Rate Limit Configs Defined But Never Applied to Routes
**Severity:** CRITICAL  
**File:** `src/middleware/rate-limit.middleware.ts:14-59`  
**Evidence:**

Excellent tiered configs defined:
```typescript
export const rateLimitConfig = {
  auth: { max: 20, timeWindow: '1 minute' },     // ✅ Defined
  ofac: { max: 50, timeWindow: '1 minute' },     // ✅ Defined  
  upload: { max: 10, timeWindow: '1 minute' },   // ✅ Defined
  batch: { max: 5, timeWindow: '1 minute' },     // ✅ Defined
  webhook: { max: 1000, timeWindow: '1 minute' }, // ✅ Defined
};
```

BUT search across routes shows NO usage:
```bash
# Search results: Only 9 matches, all in rate-limit.middleware.ts
# Zero matches in routes/*.ts or controllers/*.ts
```

**Route files (reviewed earlier):**
```typescript
// batch.routes.ts - NO rate limit config
fastify.post('/batch/kyc', batchController.runDailyChecks);
// ❌ Should use: { config: { rateLimit: rateLimitConfig.batch } }

// webhook.routes.ts - NO rate limit config  
fastify.post('/webhooks/compliance/tax-update', ...);
// ❌ Should use: { config: { rateLimit: rateLimitConfig.webhook } }
```

---

### Authentication Endpoints Have NO Special Protection
**Severity:** CRITICAL  
**File:** Routes don't exist in compliance-service, but if JWT validation is bypassed:
```typescript
// Line 20-24 of rate-limit.middleware.ts defines auth config:
auth: {
  max: 20,
  timeWindow: '1 minute',
  // But this is NEVER applied!
}
```
**Note:** While compliance-service doesn't have auth endpoints, its API could be targeted for brute force token guessing.

---

## 🟠 HIGH FINDINGS

### Redis Connection is Conditional (May Use In-Memory)
**Severity:** HIGH  
**File:** `src/middleware/rate-limit.middleware.ts:66-68`  
**Evidence:**
```typescript
const redisClient = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL)
  : null;  // ❌ Falls back to null!

// Line 71
redis: redisClient || undefined,  // undefined = in-memory!
```
**Issue:** If `REDIS_URL` not set, falls back to in-memory storage which:
- Doesn't work in distributed systems
- Resets on server restart
- Can be bypassed with multiple server instances

---

### Rate Limit Headers Not Consistently Applied
**Severity:** HIGH  
**File:** `src/middleware/rate-limit.middleware.ts:121-126`  
**Evidence:**
```typescript
// Helper function exists:
export function addRateLimitHeaders(reply: any, limit: number, remaining: number, reset: number) {
  reply.header('X-RateLimit-Limit', limit);
  reply.header('X-RateLimit-Remaining', remaining);
  reply.header('X-RateLimit-Reset', reset);
}
// BUT this is never called anywhere!
```
**Note:** @fastify/rate-limit adds headers automatically, but since it's not registered, no headers are added.

---

### No Retry-After Header on 429 Responses
**Severity:** HIGH  
**Evidence:** Since rate limiting not enabled, 429 responses won't be sent. When enabled, the errorResponseBuilder doesn't set `Retry-After` header:
```typescript
// Line 87-93
errorResponseBuilder: (request, context) => {
  return {
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    retryAfter: context.ttl,  // In body but...
  };
  // ❌ No reply.header('Retry-After', context.ttl)!
}
```

---

### Bypass Logic Has Security Concern
**Severity:** HIGH  
**File:** `src/middleware/rate-limit.middleware.ts:107-118`  
**Evidence:**
```typescript
export function bypassRateLimit(request: any): boolean {
  // Bypass for internal services
  if (request.headers['x-internal-service'] === process.env.INTERNAL_SERVICE_SECRET) {
    return true;  // ⚠️ Header-based bypass can be spoofed!
  }
  
  // Bypass for specific IPs
  const bypassIPs = (process.env.RATE_LIMIT_BYPASS_IPS || '').split(',');
  if (bypassIPs.includes(request.ip)) {
    return true;
  }
}
// BUT this function is never actually used anywhere!
```

---

## 🟡 MEDIUM FINDINGS

### Rate Limit Logging Exists But Ineffective
**Severity:** MEDIUM  
**File:** `src/middleware/rate-limit.middleware.ts:89-95`  
**Evidence:**
```typescript
onExceeding: (request, key) => {
  fastify.log.warn(`Rate limit approaching for key: ${key}`);
},
onExceeded: (request, key) => {
  fastify.log.error(`Rate limit exceeded for key: ${key}`);
},
// Good logging configured, but rate limiting isn't enabled!
```

---

### keyGenerator Uses User ID but Falls Back to IP
**Severity:** MEDIUM  
**File:** `src/middleware/rate-limit.middleware.ts:82-84`  
**Evidence:**
```typescript
keyGenerator: (request) => {
  return (request as any).user?.id || request.ip;
},
// Good pattern, but request.user may not be populated before rate limit check
```

---

## ✅ PASSING CHECKS (Would Pass IF Enabled)

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **Package** | @fastify/rate-limit installed | ✅ PASS | package.json:10 |
| **Config** | Global limit set | ✅ PASS | Line 72-75: max:100, 1 minute |
| **Tiered** | Different limits per type | ✅ PASS | Lines 14-59: auth, batch, upload configs |
| **Redis** | Redis support coded | ✅ PARTIAL | Conditional on REDIS_URL |
| **KeyGen** | User ID preferred over IP | ✅ PASS | Line 82-84 |
| **Logging** | Limit events logged | ✅ PASS | Lines 89-95 |
| **Error** | Custom error response | ✅ PASS | Lines 86-93 |
| **Allowlist** | Localhost excluded | ✅ PASS | Line 19 |
| **skipOnError** | Fail open configured | ✅ PASS | Line 77 |

---

## 📊 SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 3 | Rate limiting not registered, configs not applied to routes, no auth protection |
| 🟠 HIGH | 4 | Redis conditional, no headers, no Retry-After, bypass not used |
| 🟡 MEDIUM | 2 | Logging ineffective, keyGenerator timing |
| ✅ PASS | 9 | Good implementation exists but is dormant |

---

## 🛠️ REQUIRED FIXES

### IMMEDIATE (CRITICAL)

**1. Register rate limiting in server.ts:**
```typescript
// Add to src/server.ts imports:
import { setupRateLimiting } from './middleware/rate-limit.middleware';

// Add in createServer() after other middleware:
export async function createServer() {
  const app = Fastify({ ... });
  
  // Register rate limiting FIRST
  await setupRateLimiting(app);
  
  // Then other middleware...
  await app.register(cors);
}
```

**2. Apply custom rate limits to routes:**
```typescript
// src/routes/batch.routes.ts
import { rateLimitConfig } from '../middleware/rate-limit.middleware';

fastify.post('/batch/kyc', {
  config: { rateLimit: rateLimitConfig.batch }
}, batchController.runDailyChecks);

fastify.post('/batch/1099-generation', {
  config: { rateLimit: rateLimitConfig.batch }
}, batchController.generate1099Forms);
```
```typescript
// src/routes/webhook.routes.ts
fastify.post('/webhooks/compliance/tax-update', {
  config: { rateLimit: rateLimitConfig.webhook },
  onRequest: webhookAuth(WEBHOOK_SECRET)
}, handler);
```
```typescript
// src/routes/document.routes.ts
fastify.post('/documents/upload', {
  config: { rateLimit: rateLimitConfig.upload }
}, documentController.uploadDocument);
```

**3. Require REDIS_URL in production:**
```typescript
// src/middleware/rate-limit.middleware.ts:62-68
export async function setupRateLimiting(fastify: FastifyInstance) {
  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
    throw new Error('REDIS_URL required for rate limiting in production');
  }
  
  const redisClient = process.env.REDIS_URL 
    ? new Redis(process.env.REDIS_URL)
    : null;
```

### 24-48 HOURS (HIGH)

**4. Add Retry-After header:**
```typescript
errorResponseBuilder: (request, context) => {
  // Set Retry-After header
  request.raw.res?.setHeader('Retry-After', Math.ceil(context.ttl / 1000));
  
  return {
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    retryAfter: context.ttl,
  };
}
```

**5. Integrate bypass function properly:**
```typescript
// In setupRateLimiting:
allowList: (request) => bypassRateLimit(request),
```

### 1 WEEK (MEDIUM)

6. Add metrics for rate limit events (Prometheus counters)
7. Add alerting when rate limits are frequently hit
8. Document rate limits in API documentation
9. Test X-Forwarded-For bypass protection
