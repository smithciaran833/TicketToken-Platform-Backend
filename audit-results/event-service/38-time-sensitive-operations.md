# Event Service - 38 Time-Sensitive Operations Audit

**Service:** event-service
**Document:** 38-time-sensitive-operations.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 43% (24/56 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | No scheduled jobs for state transitions |
| HIGH | 1 | No cutoff time enforcement |
| MEDIUM | 2 | No clock drift monitoring, No idempotency keys |
| LOW | 1 | No server_time in API responses |

---

## Timezone Handling (9/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Timestamps in UTC | PASS | useTz: true |
| TIMESTAMPTZ columns | PASS | All timestamp columns |
| ISO 8601 format | PASS | JS Date serializes |
| IANA identifiers | PASS | Luxon IANAZone validates |
| User timezone stored | PASS | event_schedules.timezone |
| Conversion at presentation | PARTIAL | Timezone stored |
| Future events store TZ | PASS | timezone column |
| IANA database current | PASS | Luxon uses system |

**Timezone Utilities:**
- validateTimezone() - Luxon IANAZone.isValidZone()
- validateTimezoneOrThrow() - Throws on invalid
- getTimezoneInfo() - Returns timezone details

---

## Cutoff Enforcement (3/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Cutoffs server-side | FAIL | No enforcement |
| Server clock used | PASS | new Date() |
| Cutoffs in database | PASS | sales_start_at, sales_end_at |
| Deadline check | FAIL | No check before ops |
| Clear error messages | FAIL | No deadline errors |
| Admin bypass | FAIL | Not implemented |
| Violations logged | FAIL | No logging |
| Grace periods | FAIL | Not implemented |
| TZ-aware deadlines | PASS | TIMESTAMPTZ |
| Notifications | FAIL | No system |

---

## Scheduled State Transitions (2/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Distributed lock | FAIL | No jobs directory |
| Jobs idempotent | FAIL | No jobs exist |
| Execution persisted | FAIL | No tracking |
| Failed job retry | FAIL | No jobs |
| Job logs | FAIL | No jobs |
| Failure alerts | FAIL | No jobs |
| Manual trigger | FAIL | No jobs |
| Atomic transitions | PASS | DB transactions |
| State machine docs | FAIL | Not documented |
| DST handled | PASS | TIMESTAMPTZ |

**Critical Gap - No Jobs for:**
- SCHEDULED → ON_SALE at sales_start_at
- ON_SALE → IN_PROGRESS at event start
- IN_PROGRESS → COMPLETED at event end

---

## Race Condition Prevention (2/7)

| Check | Status | Evidence |
|-------|--------|----------|
| Time-checks in transactions | PARTIAL | Transactions exist, no time checks |
| Isolation level | PASS | PostgreSQL default |
| Row-level locking | PASS | Transactions with FK |
| Idempotency keys | FAIL | Not implemented |
| Optimistic locking | FAIL | No version field |
| State validated during op | FAIL | No validation |

---

## Client-Side Security (3/4)

| Check | Status | Evidence |
|-------|--------|----------|
| No security on client time | PASS | Server uses own clock |
| Server time in responses | FAIL | No server_time field |
| Audit logs use server time | PASS | new Date() server-side |
| Certificate validation | PASS | Standard TLS |

---

## Audit & Compliance (4/8)

| Check | Status | Evidence |
|-------|--------|----------|
| Time rules documented | FAIL | No policy docs |
| Time ops logged | PASS | Audit logger |
| Log timestamps with TZ | PASS | TIMESTAMPTZ |
| Logs in UTC | PASS | PostgreSQL default |
| Audit trail for changes | PASS | Audit trigger |
| Compliance docs | FAIL | Not documented |
| Policy review | FAIL | No policy |
| Incident response | FAIL | No procedure |

---

## Positive Findings

- Excellent timezone validation (Luxon IANAZone)
- TIMESTAMPTZ on all timestamp columns
- Timezone stored with events
- Server-side time for all operations
- Audit logging with UTC
- Atomic transactions for state changes
- Comprehensive timezone utilities

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Create scheduled job service:**
```typescript
// src/jobs/state-transition.job.ts
const stateTransitionJob = new CronJob('* * * * *', async () => {
  // SCHEDULED → ON_SALE
  await db('events')
    .whereIn('id', subquery_sales_start_reached)
    .where('status', 'SCHEDULED')
    .update({ status: 'ON_SALE' });
  
  // ON_SALE → IN_PROGRESS
  // IN_PROGRESS → COMPLETED
});
```

### HIGH (This Week)
1. **Add sales window validation:**
```typescript
async function validateSalesWindow(eventId) {
  const pricing = await getPricing(eventId);
  const now = new Date();
  if (now < pricing.sales_start_at) throw 'Sales not started';
  if (now > pricing.sales_end_at) throw 'Sales ended';
}
```

### MEDIUM (This Month)
1. Add clock drift monitoring to health checks
2. Implement idempotency keys for create operations

### LOW (Backlog)
1. Add server_time to API responses
2. Document time-based business rules
