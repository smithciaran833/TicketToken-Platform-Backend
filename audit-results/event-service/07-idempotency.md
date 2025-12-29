# Event Service - 07 Idempotency Audit

**Service:** event-service
**Document:** 07-idempotency.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 45% (17/38 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | No idempotency key support - retried POSTs create duplicates |
| HIGH | 2 | No optimistic locking, No compensating transactions |
| MEDIUM | 3 | Check-then-insert race condition, No external call idempotency, No response caching |
| LOW | 2 | Request ID not in success responses, No Cache-Control headers |

---

## 3.1 Route Layer (3/10)

| Check | Status | Evidence |
|-------|--------|----------|
| RL1: Idempotency-Key on POST | FAIL | No idempotency middleware |
| RL2: Idempotency-Key on PUT | FAIL | Not implemented |
| RL3: Key validated | FAIL | N/A |
| RL4: Key storage | FAIL | No storage |
| RL5: Key TTL | FAIL | N/A |
| RL6: Concurrent same-key | FAIL | No locking |
| RL7: GET/DELETE idempotent | PASS | Soft delete |
| RL8: Request ID generated | PASS | Fastify auto-generates |
| RL9: Request ID in response | PARTIAL | Only in error responses |
| RL10: Request ID logged | PASS | Logged in error handler |

---

## 3.2 Service Layer (3/8)

| Check | Status | Evidence |
|-------|--------|----------|
| SL1: Duplicate event prevented | PASS | checkForDuplicateEvent by venue/name/date |
| SL2: State checks before mutation | PASS | Checks if already cancelled |
| SL3: Natural idempotency | PARTIAL | Cancellation yes, creation no |
| SL4: Retry-safe operations | PARTIAL | Row locks prevent corruption |
| SL5: Upsert pattern | PASS | event-metadata.model.ts has upsert |
| SL6: Version conflict detection | FAIL | No optimistic locking |
| SL7: Reservation idempotent | PARTIAL | Lock prevents double, release not idempotent |
| SL8: External ID deduplication | PARTIAL | Field exists, not used |

---

## 3.3 Database Layer (5/8)

| Check | Status | Evidence |
|-------|--------|----------|
| DB1: Unique constraints | PASS | Unique on venue_id+slug |
| DB2: Upsert ON CONFLICT | FAIL | Uses check-then-insert (race condition) |
| DB3: Soft delete re-processing | PASS | deleted_at column |
| DB4: Transactions prevent partial | PASS | Multi-table in transactions |
| DB5: Atomic counter updates | PASS | trx.raw() for counters |
| DB6: Row-level locking | PASS | .forUpdate() |
| DB7: Idempotency key table | FAIL | No table exists |
| DB8: Constraint violation → 409 | PASS | 23505 → 409 |

---

## 3.4 Background Jobs (5/6)

| Check | Status | Evidence |
|-------|--------|----------|
| BJ1: Jobs safely retried | PASS | Fresh query each run |
| BJ2: Jobs use atomic ops | PASS | db.raw() for release |
| BJ3: Jobs handle partial | PASS | Sections released independently |
| BJ4: Job state tracked | PARTIAL | isRunning flag, no persistent state |
| BJ5: Duplicate job prevention | PASS | if (this.isRunning) return |
| BJ6: Job completion logged | PASS | Logs released count |

---

## 3.5 External Calls (1/6)

| Check | Status | Evidence |
|-------|--------|----------|
| EC1: External calls idempotent | FAIL | No idempotency headers |
| EC2: Blockchain calls idempotent | PARTIAL | PDA derivation yes, create no |
| EC3: Retry with idempotency key | FAIL | No retry logic |
| EC4: Failed calls logged | PASS | Errors logged |
| EC5: Results cached | FAIL | No caching |
| EC6: Compensating transactions | FAIL | No saga pattern |

---

## 3.6 HTTP Response (0/5)

| Check | Status | Evidence |
|-------|--------|----------|
| HR1: Same response for replay | FAIL | No response caching |
| HR2: Idempotency-Replayed header | FAIL | Not implemented |
| HR3: Idempotency failures → 409 | PARTIAL | Constraint only |
| HR4: Request ID in all responses | PARTIAL | Only errors |
| HR5: Cache-Control headers | FAIL | Not set |

---

## Strengths

- Duplicate event detection by venue/name/date
- State checks before mutations
- Atomic counter updates with raw SQL
- Row-level locking for reservations
- Idempotent background job design

---

## Remediation Priority

### CRITICAL (Immediate)
1. Implement Idempotency-Key middleware for POST/PUT
2. Create idempotency_keys table for response caching

### HIGH (This Week)
1. Add optimistic locking with version column
2. Implement saga pattern for multi-service operations

### MEDIUM (This Month)
1. Convert check-then-insert to ON CONFLICT upsert
2. Add idempotency keys to external service calls
3. Include requestId in all responses

### LOW (Backlog)
1. Add Cache-Control headers to mutation responses
2. Add Idempotency-Replayed response header
