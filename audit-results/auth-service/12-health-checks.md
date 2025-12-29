# Auth Service - 12 Health Checks Audit

**Service:** auth-service
**Document:** 12-health-checks.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 58% (22/38)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 3 | MonitoringService not registered, no /startup endpoint, no @fastify/under-pressure |
| MEDIUM | 5 | No timeouts on health queries, no statement_timeout |
| LOW | 8 | Response format, memory monitoring |

---

## Section 3.1: Fastify Health Checks

### HC-F1: /health/live (liveness)
**Status:** PARTIAL
**Evidence:** `/health` exists in app.ts, `/live` in monitoring.service.ts.
**Issue:** MonitoringService.setupMonitoring() NOT called - endpoints not registered.

### HC-F2: /health/ready (readiness)
**Status:** PARTIAL
**Issue:** Same - exists but not registered.

### HC-F3: /health/startup
**Status:** FAIL
**Issue:** No startup probe endpoint.

### HC-F4: Liveness < 100ms
**Status:** PASS

### HC-F5-F6: Readiness checks DB/Redis
**Status:** PASS (if registered)
**Evidence:** `db.raw('SELECT 1')`, `redis.ping()` in monitoring.service.ts.

### HC-F7: @fastify/under-pressure
**Status:** FAIL
**Issue:** Not installed.

### HC-F8: No sensitive info
**Status:** PASS

### HC-F9: No auth required
**Status:** PASS

### HC-F10: Proper status codes
**Status:** PASS
**Evidence:** 200 healthy, 503 unhealthy.

### HC-F11: Timeouts on checks
**Status:** FAIL
**Issue:** No Promise.race timeout.

### HC-F12: Graceful degradation
**Status:** PASS

---

## Section 3.2: PostgreSQL Health

### HC-PG1: Connection pooling
**Status:** PASS
**Evidence:** max: 5, connectionTimeoutMillis: 10000.

### HC-PG2: Uses pool
**Status:** PASS

### HC-PG3: statement_timeout
**Status:** FAIL

### HC-PG4: Connection timeout
**Status:** PASS

### HC-PG5: Lightweight query
**Status:** PASS
**Evidence:** SELECT 1.

### HC-PG6: Pool exhaustion detected
**Status:** PASS
**Evidence:** waitingCount monitored.

### HC-PG7: No creds in errors
**Status:** PASS

### HC-PG8: SSL configured
**Status:** PASS

---

## Section 3.3: Redis Health

### HC-RD1: PING check
**Status:** PASS

### HC-RD2: Timeout
**Status:** FAIL

### HC-RD3-RD5: Pooling, error handling, no sensitive data
**Status:** PASS

### HC-RD6: Memory monitoring
**Status:** PARTIAL

---

## Section 3.4: External Services

### HC-EXT1-2: Not in liveness/readiness
**Status:** PASS

---

## Section 3.5: Graceful Shutdown

### HC-GS1-4: SIGTERM, app, DB, Redis closed
**Status:** PASS

---

## Section 3.6: Startup Verification

### HC-ST1-3: DB, Redis verified, fail-fast
**Status:** PASS

---

## Remediation Priority

### HIGH
1. **Register MonitoringService** - Call setupMonitoring(app) in app.ts
2. **Add /health/startup** - For Kubernetes startup probe
3. **Install @fastify/under-pressure** - Event loop monitoring

### MEDIUM
1. **Add timeouts** - Promise.race on all health queries
2. **Add statement_timeout** - PostgreSQL config

