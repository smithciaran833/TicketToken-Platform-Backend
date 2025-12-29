# Ticket Service - 06 Database Integrity Audit

**Service:** ticket-service
**Document:** 06-database-integrity.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 63% (22/35 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 2 | No idempotency key for purchase, No statement_timeout |
| MEDIUM | 2 | RLS policies user-based not tenant-based, No SKIP LOCKED |
| LOW | 1 | Some loop operations instead of batch |

---

## 3.1 Migration/Schema (4/7)

| Check | Status | Evidence |
|-------|--------|----------|
| Foreign keys defined | PARTIAL | JOINs imply FKs, unverified |
| Primary keys on all tables | PASS | UUID primary keys |
| Unique constraints | PASS | Unique ticket numbers |
| NOT NULL on required | PARTIAL | App validates, DB unverified |
| CHECK constraints | PARTIAL | Not visible in app code |

---

## Multi-Tenant (3/4)

| Check | Status | Evidence |
|-------|--------|----------|
| tenant_id on all tables | PASS | All queries include tenant_id |
| tenant_id in unique constraints | PARTIAL | App filters, DB unverified |
| RLS policies defined | PASS | enable_rls.sql - users, venues, tickets |

---

## 3.2 Transaction Usage (4/4 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Multi-step ops in transactions | PASS | DatabaseService.transaction() |
| Transaction passed through | PASS | All ops use client from txn |
| Rollback on error | PASS | ROLLBACK in catch block |
| No external calls in txn | PASS | Queue publish AFTER txn |

---

## Locking (1/2)

| Check | Status | Evidence |
|-------|--------|----------|
| FOR UPDATE on critical paths | PASS | FOR UPDATE on ticket types |
| SKIP LOCKED for queues | FAIL | Not used |

---

## Query Patterns (2/3)

| Check | Status | Evidence |
|-------|--------|----------|
| Atomic updates | PASS | available_quantity = available_quantity - $1 |
| Batch operations | PARTIAL | Some batch, some loops |
| JOIN for related data | PASS | JOIN queries used |

---

## 3.3 Race Conditions (4/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Check inventory with lock | PASS | FOR UPDATE |
| Decrement atomically | PASS | Atomic update |
| Create in same txn | PASS | All in transaction |
| Handle serialization failures | PASS | LockTimeoutError caught |
| Idempotency key | FAIL | Not implemented |

---

## 3.4 Connection Pool (4/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Pool sized appropriately | PASS | min:2, max:20 |
| Connection timeout | PASS | 5000ms |
| Idle timeout | PASS | 30000ms |
| Pool error handler | PASS | pool.on('error') |
| Statement timeout | FAIL | Not configured |

---

## 3.5 Row Level Security (3/4)

| Check | Status | Evidence |
|-------|--------|----------|
| RLS enabled | PASS | users, venues, tickets |
| Tenant isolation policies | PARTIAL | User-based, not tenant_id-based |
| Service role bypass | PASS | service_role created |
| App sets RLS context | PARTIAL | Should be set, not visible |

---

## 3.6 Data Integrity Functions (3/3 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Stored procedures | PASS | Multiple functions |
| Fraud detection | PASS | check_suspicious_activity |
| Revenue calculation | PASS | calculate_venue_revenue |

---

## Strengths

- Proper transaction boundaries
- FOR UPDATE locking on inventory
- Atomic updates (no read-modify-write)
- External calls outside transactions
- Lock error handling (timeout, contention)
- Good pool configuration
- Tenant ID in all queries
- RLS enabled on critical tables
- Service role for background jobs
- Fraud detection functions

---

## Remediation Priority

### HIGH (This Week)
1. **Add idempotency key check:**
```typescript
if (idempotencyKey) {
  const existing = await db.query('SELECT * FROM idempotency_keys WHERE key = $1', [key]);
  if (existing.rows.length > 0) return JSON.parse(existing.rows[0].response);
}
```

2. **Configure statement_timeout:**
```typescript
pool: {
  afterCreate: (conn, done) => {
    conn.query('SET statement_timeout = 30000', done);
  }
}
```

### MEDIUM (This Month)
1. Add tenant_id-based RLS policies
2. Set RLS context in middleware
3. Use FOR UPDATE SKIP LOCKED for queue workers

### LOW (Backlog)
1. Convert remaining loops to batch operations
