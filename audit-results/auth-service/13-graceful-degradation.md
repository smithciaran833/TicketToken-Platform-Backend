# Auth Service - 13 Graceful Degradation Audit

**Service:** auth-service
**Document:** 13-graceful-degradation.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 45% (17/38)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | No circuit breakers |
| HIGH | 4 | No retry/backoff, no DB timeouts, no bulkheads |
| MEDIUM | 6 | No fallbacks, no load shedding, no close-with-grace |
| LOW | 10 | Minor config, missing metrics |

---

## Section 3.1: Fastify Server

### GD-F1-F3: Signal handlers, fastify.close()
**Status:** PASS

### GD-F4: Delay before close
**Status:** FAIL
**Issue:** No LB drain delay.

### GD-F5: In-flight requests complete
**Status:** PARTIAL

### GD-F6-F7: DB/Redis closed
**Status:** PASS

### GD-F8: close-with-grace
**Status:** FAIL

### GD-F9: Request timeout
**Status:** FAIL
**Issue:** No connectionTimeout, keepAliveTimeout, requestTimeout.

### GD-F10: Body size limits
**Status:** FAIL

---

## Section 3.2: HTTP Clients

### GD-HC1-HC2: Timeouts
**Status:** N/A (no external HTTP calls)

### GD-HC3-HC4: Retry with backoff/jitter
**Status:** FAIL

### GD-HC5: Circuit breaker
**Status:** FAIL

---

## Section 3.3: Redis

### GD-RD1-RD4: Timeouts/retry
**Status:** PARTIAL (delegated to shared config)

### GD-RD5: Error handler
**Status:** FAIL

### GD-RD6: quit() on shutdown
**Status:** PASS

### GD-RD7: Fallback when unavailable
**Status:** FAIL
**Issue:** CacheService exists but not used as fallback.

---

## Section 3.4: PostgreSQL

### GD-PG1-PG2: Pool config
**Status:** PASS
**Evidence:** max: 5, connectionTimeoutMillis: 10000.

### GD-PG3: Statement timeout
**Status:** FAIL

### GD-PG4: Idle timeout
**Status:** PASS

### GD-PG5: pool.end() on shutdown
**Status:** PASS

### GD-PG6: Transaction timeout
**Status:** FAIL

### GD-PG7: Error handling
**Status:** PASS

---

## Section 3.5: Fallback Strategies

### GD-FB1: Cached response fallback
**Status:** FAIL

### GD-FB2: Default response fallback
**Status:** PARTIAL
**Evidence:** Logout returns success on error.

### GD-FB3: Fail silent non-critical
**Status:** PASS
**Evidence:** Email sending doesn't block.

---

## Section 3.6: Circuit Breaker

### GD-CB1-CB5: All checks
**Status:** FAIL
**Issue:** No circuit breaker implementation.

---

## Section 3.7: Bulkhead

### GD-BH1-BH2: All checks
**Status:** FAIL

---

## Section 3.8: Load Shedding

### GD-LS1: Priority-based
**Status:** FAIL

### GD-LS2: Rate-based per client
**Status:** PASS

### GD-LS3: Resource-based
**Status:** FAIL

---

## Remediation Priority

### CRITICAL
1. **Implement circuit breaker** - Install opossum, wrap OAuth/email calls

### HIGH
1. **Add statement_timeout** - `SET statement_timeout = 30000`
2. **Configure Fastify timeouts** - connectionTimeout, requestTimeout
3. **Add retry with backoff** - For transient failures
4. **Implement bulkhead** - Isolate OAuth calls

### MEDIUM
1. **Install close-with-grace**
2. **Add pre-shutdown delay** - 5s for LB drain
3. **Add Redis error handler**
4. **Add bodyLimit**

---

## Quick Fixes
```typescript
// app.ts
const app = Fastify({
  connectionTimeout: 10000,
  keepAliveTimeout: 72000,
  requestTimeout: 30000,
  bodyLimit: 1048576,
});

// database.ts
pool.on('connect', async (client) => {
  await client.query('SET statement_timeout = 30000');
});

// index.ts
await new Promise(r => setTimeout(r, 5000)); // LB drain
await app.close();
```

