# Payment Service - 06 Database Integrity Audit

**Service:** payment-service
**Document:** 06-database-integrity.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 76% (31/41 checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 1 | No serializable isolation for critical ops |
| MEDIUM | 2 | Missing RLS policies, No statement_timeout |
| LOW | 1 | No positive amount CHECK constraint |

---

## 3.1 Schema Definition (7/7 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Foreign keys defined | PASS | 30+ FK constraints |
| Appropriate ON DELETE | PASS | RESTRICT, CASCADE, SET NULL |
| Primary keys | PASS | UUID on all 60+ tables |
| Unique constraints | PASS | Idempotency keys, event_id+stripe_id |
| NOT NULL on required | PASS | venue_id, user_id, event_id |
| CHECK constraints | PASS | Status enums, royalty %, prices |
| Indexes | PASS | 50+ including partial indexes |

---

## 3.1 Multi-Tenant (2/4)

| Check | Status | Evidence |
|-------|--------|----------|
| tenant_id on tables | PARTIAL | Main tables yes, some auxiliary missing |
| tenant_id in unique | PASS | uq_payment_transactions_idempotency |
| tenant_id indexed | PASS | In composite indexes |
| RLS policies | FAIL | Not defined in migration |

---

## 3.2 Transaction Usage (3/4)

| Check | Status | Evidence |
|-------|--------|----------|
| Multi-step in transactions | PASS | db.transaction() |
| Transaction passed through | PASS | trx used consistently |
| Error handling with rollback | PASS | trx.rollback() |
| No external calls in txn | PARTIAL | Outbox pattern, some may violate |

---

## 3.2 Locking (1/2)

| Check | Status | Evidence |
|-------|--------|----------|
| FOR UPDATE on critical | PARTIAL | Some places, not consistent |
| FOR UPDATE SKIP LOCKED | PASS | outbox.processor.ts |

---

## 3.3 Connection Pool (5/6)

| Check | Status | Evidence |
|-------|--------|----------|
| Pool sized | PASS | max: 20 pg, max: 10 knex |
| Connection timeout | PASS | 2000ms |
| Idle timeout | PASS | 30000ms |
| Statement timeout | FAIL | Not configured |
| Pool error handler | PASS | pool.on('error') |
| Checkout warning | PASS | 60 second warning |

---

## 3.4 Idempotency (3/3 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Idempotency table | PASS | payment_idempotency |
| Unique constraint | PASS | uq_payment_transactions_idempotency |
| Key expiration | PASS | expires_at column |

---

## 3.4 Event Sourcing (4/4 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Outbox table | PASS | outbox_dlq |
| Dead letter queue | PASS | outbox_dlq |
| Sequence tracking | PASS | payment_event_sequence |
| State machine | PASS | payment_state_machine with transitions |

---

## 3.4 Audit Trail (3/3 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Audit trigger | PASS | audit_payment_transactions_changes |
| State transition logging | PASS | payment_state_transitions |
| Updated_at triggers | PASS | All major tables |

---

## 3.6 Race Condition (2/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Transactions for purchase | PASS | Transaction patterns |
| Atomic inventory decrement | PARTIAL | Not all paths |
| Serializable isolation | FAIL | None found |
| FOR UPDATE on inventory | PARTIAL | Some services |
| Idempotency prevents double | PASS | Keys enforced |

---

## Strengths

- 60+ tables comprehensive schema
- 30+ FK constraints with proper ON DELETE
- Extensive CHECK constraints
- 50+ indexes including partial
- Idempotency with unique constraints
- Event sourcing with outbox + DLQ
- State machine for payment transitions
- Audit triggers on payment_transactions
- Updated_at triggers
- FOR UPDATE SKIP LOCKED for queues
- Version column (optimistic locking)
- Sequence tracking for event ordering
- Connection pool with proper sizing
- Slow query logging (>1000ms)
- Client checkout warning (60s)

---

## Remediation Priority

### HIGH (This Week)
1. **Add serializable isolation for payments:**
```typescript
await knex.transaction({ isolationLevel: 'serializable' }, async (trx) => {
  // Critical payment processing
});
```

### MEDIUM (This Month)
1. **Add RLS policies:**
```sql
CREATE POLICY tenant_isolation ON payment_transactions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

2. **Add statement_timeout:**
```typescript
pool: {
  afterCreate: (conn, done) => {
    conn.query('SET statement_timeout = 30000', done);
  }
}
```

### LOW (Backlog)
1. Add CHECK (amount > 0) on payment_transactions
