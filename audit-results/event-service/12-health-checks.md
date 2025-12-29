# Event Service - 12 Health Checks Audit

**Service:** event-service
**Document:** 12-health-checks.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 57% (20/35 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | Health check calls other services (venue, auth) - cascading failure risk |
| HIGH | 2 | No separate liveness/readiness/startup probes, No event loop monitoring |
| MEDIUM | 2 | No timeout on DB/Redis checks, Detailed health without auth |
| LOW | 1 | Uptime exposed in response |

---

## Required Endpoints (2/5)

| Endpoint | Status | Evidence |
|----------|--------|----------|
| GET /health/live | FAIL | Not implemented |
| GET /health/ready | FAIL | Not implemented |
| GET /health/startup | FAIL | Not implemented |
| GET /health | PASS | index.ts:85-130 |
| GET /metrics | PASS | index.ts:132-135 |

---

## Fastify Health Check (4/8)

| Check | Status | Evidence |
|-------|--------|----------|
| Event loop monitoring | FAIL | No @fastify/under-pressure |
| Liveness < 100ms | PARTIAL | /health exists but checks deps |
| Readiness checks DB/cache | PARTIAL | /health checks them, no separate endpoint |
| No sensitive info | PASS | No credentials exposed |
| No auth required | PASS | Public endpoints |
| Proper HTTP status codes | PASS | 200 healthy, 503 unhealthy |
| Timeouts on dep checks | FAIL | No timeouts |
| Graceful degradation | PASS | Returns 'degraded' status |

---

## CRITICAL: Circular Dependency Anti-Pattern

**File:** healthCheck.service.ts lines 88-125
```typescript
// ❌ ANTI-PATTERN - DO NOT CHECK OTHER SERVICES
private async checkVenueService() {
  await fetch(`${url}/health`);  // WRONG!
}
private async checkAuthService() {
  await fetch(`${url}/health`);  // WRONG!
}
```

**Impact:**
- venue-service down → event-service unhealthy → Kubernetes restarts event-service
- auth-service down → event-service unhealthy → ALL event-service pods restart
- Single service failure causes complete system outage

**Fix:** Remove checkVenueService() and checkAuthService() from health endpoint

---

## PostgreSQL Health Check (4/6)

| Check | Status | Evidence |
|-------|--------|----------|
| Connection pooling | PASS | Uses pg Pool |
| Uses pool connection | PASS | db.query('SELECT 1') |
| Query timeout | FAIL | No timeout |
| Connection timeout | PASS | connectionTimeout: 10000 |
| Lightweight query | PASS | SELECT 1 |
| Pool exhaustion detected | FAIL | Not monitored |

---

## Redis Health Check (4/5)

| Check | Status | Evidence |
|-------|--------|----------|
| PING command used | PASS | redis.ping() |
| Timeout configured | FAIL | No timeout on PING |
| Connection pooling | PASS | ioredis singleton |
| Error handling | PASS | Try/catch with logging |
| No sensitive data | PASS | Clean error messages |

---

## External Services (2/4)

| Check | Status | Evidence |
|-------|--------|----------|
| Stripe NOT in health | PASS | Not checked |
| Solana NOT in health | PASS | Not checked |
| venue-service NOT in readiness | FAIL | Checked in /health |
| auth-service NOT in readiness | FAIL | Checked in /health |

---

## Graceful Shutdown

**Status:** PASS
```typescript
// index.ts - Correct shutdown order
1. Stop accepting new requests (app.close())
2. Stop background jobs (cleanupService.stop())
3. Close database connections (pool.end())
4. Close Knex connection (db.destroy())
5. Close MongoDB connection
6. Close Redis connections
```

---

## Positive Findings

- Comprehensive graceful shutdown
- Prometheus /metrics endpoint
- Correct status codes (200/503)
- Background job health included
- No sensitive data exposed

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Remove external service checks from health endpoint:**
```typescript
// DELETE these from performHealthCheck():
// - checkVenueService()
// - checkAuthService()
```

### HIGH (This Week)
1. **Implement separate probe endpoints:**
```typescript
// /health/live - No dependency checks
app.get('/health/live', () => ({ status: 'ok' }));

// /health/ready - Only owned infrastructure
app.get('/health/ready', async () => {
  const dbOk = await checkDatabase();
  const redisOk = await checkRedis();
  // DO NOT check other services!
});

// /health/startup - Config validation
app.get('/health/startup', async () => {
  const configured = validateRequiredEnvVars();
  const dbConnected = await checkDatabase();
});
```

2. **Add @fastify/under-pressure:**
```typescript
await app.register(underPressure, {
  maxEventLoopDelay: 1000,
  maxHeapUsedBytes: 1000000000,
  maxEventLoopUtilization: 0.98,
});
```

### MEDIUM (This Month)
1. Add timeout to all dependency checks (2s for DB, 1s for Redis)
2. Require auth for detailed health endpoint
