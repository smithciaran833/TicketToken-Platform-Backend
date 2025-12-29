# Payment Service - 12 Health Checks Audit

**Service:** payment-service
**Document:** 12-health-checks.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 43% (22/51 checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | Stripe API in readiness probe (cascading failure risk) |
| HIGH | 2 | No startup probe, No query timeouts |
| MEDIUM | 1 | No event loop monitoring |
| LOW | 1 | /health should be /health/live |

---

## Health Endpoints

| Endpoint | Status | Issue |
|----------|--------|-------|
| GET /health | EXISTS | Should be /health/live |
| GET /health/db | EXISTS | No timeout |
| GET /health/redis | EXISTS | No timeout |
| GET /health/stripe | EXISTS | Calls external API! |
| GET /health/ready | EXISTS | Contains Stripe call! |
| GET /health/live | MISSING | K8s convention |
| GET /health/startup | MISSING | K8s requirement |

---

## Required Endpoints (2/6)

| Check | Status | Evidence |
|-------|--------|----------|
| /health/live | FAIL | Not found |
| /health/ready | PASS | health.routes.ts:90 |
| /health/startup | FAIL | Not found |
| Liveness < 100ms | PARTIAL | /health is simple |
| Readiness checks DB+Redis | PASS | Lines 100-116 |
| Proper HTTP status codes | PASS | 200/503 |

---

## Liveness Probe (3/6)

| Check | Status | Evidence |
|-------|--------|----------|
| Dedicated /health/live | FAIL | Uses /health |
| Event loop monitoring | FAIL | No @fastify/under-pressure |
| Returns < 100ms | PARTIAL | Simple but untimed |
| No external checks | PASS | Static data only |
| No database checks | PASS | Doesn't check DB |
| Shallow health | PASS | Status + timestamp |

---

## Readiness Probe (5/8)

| Check | Status | Evidence |
|-------|--------|----------|
| Dedicated endpoint | PASS | /health/ready |
| Database check | PASS | SELECT 1 |
| Redis check | PASS | redis.ping() |
| Returns 503 on failure | PASS | Lines 123-129 |
| Component status | PASS | checks object |
| Timeout configured | FAIL | No timeout |
| No external services | FAIL | Checks Stripe! |

**CRITICAL: Stripe in readiness causes cascading failures!**

---

## Startup Probe (0/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Dedicated endpoint | FAIL | Not found |
| Config validation | FAIL | Not implemented |
| DB connection | FAIL | Not implemented |
| Redis connection | FAIL | Not implemented |
| Migrations complete | FAIL | Not implemented |

---

## PostgreSQL Health (4/6)

| Check | Status | Evidence |
|-------|--------|----------|
| SELECT 1 query | PASS | health.routes.ts:23 |
| Response time measured | PASS | Date.now() timing |
| Query timeout | FAIL | No timeout |
| Uses connection pool | PASS | pool.query() |
| Pool exhaustion detection | FAIL | No pool stats |
| No credentials in response | PASS | Only status |

---

## Redis Health (3/4)

| Check | Status | Evidence |
|-------|--------|----------|
| PING command | PASS | redis.ping() |
| Response time measured | PASS | Date.now() timing |
| Timeout configured | FAIL | No timeout |
| No credentials | PASS | Only status |

---

## Stripe Health (1/5)

| Check | Status | Evidence |
|-------|--------|----------|
| NOT in liveness | PASS | Separate endpoint |
| NOT in readiness | FAIL | Included! |
| Circuit breaker | FAIL | Direct API call |
| Config check only | FAIL | Calls balance.retrieve() |
| Timeout configured | FAIL | No timeout |

---

## Event Loop (0/5)

| Check | Status | Evidence |
|-------|--------|----------|
| @fastify/under-pressure | FAIL | Not registered |
| maxEventLoopDelay | FAIL | Not configured |
| maxHeapUsedBytes | FAIL | Not configured |
| maxRssBytes | FAIL | Not configured |
| pressureHandler | FAIL | Not configured |

---

## Strengths

- Comprehensive readiness (DB + Redis)
- Response time tracking
- Proper HTTP status codes (200/503)
- Lightweight health queries
- Service identification in responses
- Graceful Stripe handling (dev mode)

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Remove Stripe from readiness:**
```typescript
// REMOVE from /health/ready:
// await stripe.balance.retrieve();

// Only check config:
checks.stripe = !!process.env.STRIPE_SECRET_KEY;
```

### HIGH (This Week)
1. **Add /health/startup:**
```typescript
fastify.get('/health/startup', async (req, reply) => {
  if (!process.env.DATABASE_URL) {
    return reply.status(503).send({ status: 'error' });
  }
  await pool.query('SELECT 1');
  await redis.ping();
  return { status: 'ok' };
});
```

2. **Add query timeouts:**
```typescript
await Promise.race([
  pool.query('SELECT 1'),
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
]);
```

### MEDIUM (This Month)
1. Add @fastify/under-pressure:
```typescript
await fastify.register(underPressure, {
  maxEventLoopDelay: 1000,
  maxHeapUsedBytes: 1000000000
});
```

### LOW (Backlog)
1. Add /health/live alias for K8s convention
