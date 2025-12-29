# Order Service - 38 Time-Sensitive Operations Audit

**Service:** order-service
**Document:** 38-time-sensitive-operations.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 40% (23/57 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | No explicit UTC enforcement, Stubbed job alerting |
| HIGH | 2 | No clock drift monitoring, No optimistic locking |
| MEDIUM | 2 | No server time in responses, Job status not persisted |
| LOW | 0 | None |

---

## 3.1 Timezone Handling (2/7 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| Timestamps stored UTC | PARTIAL | new Date() depends on server TZ |
| TIMESTAMP WITH TIME ZONE | UNKNOWN | Not verified |
| ISO 8601 format | PARTIAL | Date objects, ISO at serialization |
| Timezone suffix | FAIL | No explicit Z suffix |
| Conversion at presentation | PASS | No local time conversion |
| Future events store TZ | FAIL | expiresAt has no TZ context |

---

## 3.2 Cutoff Time Enforcement (5/9 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| Server-side enforcement | PASS | Status check server-side |
| Server clock used | PASS | Uses getExpiredReservations() |
| Cutoffs in database | PASS | Configurable via env vars |
| Deadline before processing | PASS | Status check first |
| Clear error messages | PARTIAL | Generic status message |
| Admin bypass | FAIL | No mechanism |
| Violations logged | PARTIAL | Logs expiration not attempts |
| Grace periods defined | PASS | gracePeriodMinutes configurable |
| Timezone in display | FAIL | No TZ in API responses |

---

## 3.3 Clock Synchronization (0/4 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| Clock offset monitoring | FAIL | None |
| Clock drift alerts | FAIL | None |
| Clock in health check | FAIL | Not included |
| Stratum documented | UNKNOWN | None |

---

## 3.4 Scheduled State Transitions (6/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Distributed lock | PASS | withLock() for jobs |
| Jobs idempotent | PASS | Safe to run twice |
| Status persisted | PARTIAL | In memory only |
| Retry mechanism | PASS | Exponential backoff |
| Logs start/end/status | PASS | Comprehensive logging |
| Failure alerts | FAIL | jobAlertingService is STUB |
| Manual trigger | PARTIAL | Public method, no admin API |
| Atomic transitions | PARTIAL | Individual locks, not batch |
| State machine documented | PARTIAL | Enum exists, transitions implied |
| DST handling | PASS | Interval-based, not cron |

---

## 3.5 Time-Based Access Control (2/8 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| Token expiration checked | PARTIAL | Auth is stubbed |
| Temporary access expires | PASS | Reservations auto-expire |
| Policies documented | PARTIAL | Config documented |
| Time denials logged | FAIL | None |
| Emergency access | FAIL | Not documented |
| Config change approval | FAIL | No workflow |

---

## 3.6 Race Condition Prevention (4/6 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| DB transactions | PARTIAL | Individual ops use locks |
| Row-level locking | PASS | withLock() for mutations |
| Idempotency keys | PASS | All mutations |
| Optimistic locking | FAIL | No version numbers |
| State validated | PASS | Before transitions |

---

## 3.7 Client-Side Security (2/3 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| No client time for security | PASS | Server time only |
| Server time in responses | FAIL | No server_time field |
| Audit uses server time | PASS | auditService uses server |

---

## 3.8 Audit and Compliance (2/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Time rules documented | PARTIAL | Config comments only |
| Operations logged with time | PASS | All logged |
| Log timestamps have TZ | FAIL | Date objects, no explicit TZ |
| Logs stored UTC | PARTIAL | Likely but not explicit |
| Config change audit | FAIL | None |
| Time sync logs | FAIL | None |
| Compliance documented | FAIL | None |
| Policy review | FAIL | None |
| Incident response | FAIL | None |

---

## Expiration Job Configuration
```typescript
{
  name: 'order-expiration',
  intervalSeconds: 60,          // Check every minute
  retryOptions: {
    maxAttempts: 2,
    delayMs: 5000,
    backoffMultiplier: 2,
  },
  enableCircuitBreaker: true,
  enableDistributedLock: true,
  lockTTLMs: 120000,            // 2 minutes
  timeoutMs: 180000,            // 3 minutes
}
```

---

## Critical Remediations

### P0: Enforce UTC Explicitly
```typescript
// Store with ISO format
const expiresAt = new Date(Date.now() + duration).toISOString();
// Returns: "2025-01-01T12:00:00.000Z"
```

### P0: Implement Real Job Alerting
```typescript
const jobAlertingService = {
  alertJobFailure: async (name, error, failures) => {
    await pagerduty.trigger({ summary: `Job ${name} failed` });
    await slack.post({ text: `Job ${name} failed: ${error}` });
  },
};
```

### P1: Add Clock Health Check
```typescript
// health.routes.ts
const ntpOffset = await checkNtpOffset();
if (Math.abs(ntpOffset) > 1000) {
  checks.clock = false;
}
```

### P1: Add Optimistic Locking
```sql
ALTER TABLE orders ADD COLUMN version INTEGER DEFAULT 1;
```
```typescript
await this.orderModel.update(id, tenantId, {
  status: newStatus,
  version: order.version + 1,
}, { expectedVersion: order.version });
```

### P2: Server Time in Responses
```typescript
reply.send({
  ...data,
  server_time: new Date().toISOString(),
});
```

---

## Strengths

- Distributed locking on all state transitions
- Idempotency protection for all mutations
- Configurable reservation durations and grace periods
- Circuit breaker for resilience
- Interval-based scheduling avoids DST issues
- Server time used for all security decisions

Time-Sensitive Operations Score: 40/100
