# Auth Service - 06 Database Integrity Audit

**Service:** auth-service
**Document:** 06-database-integrity.md
**Date:** 2025-12-22
**Auditor:** Cline + Human Review
**Pass Rate:** 79% (19/24)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 2 | Soft delete partial index missing, RLS context not set |
| MEDIUM | 2 | FOR UPDATE missing, no statement timeout |
| LOW | 1 | Read-modify pattern instead of atomic updates |

---

## Section 3.1: Migration Schema (7/7 PASS)

### Foreign Keys
**Status:** PASS
**Evidence:** All `_id` columns have FK references with appropriate ON DELETE actions.

### Primary Keys
**Status:** PASS
**Evidence:** All 12 tables have UUID primary keys.

### Unique Constraints
**Status:** PASS
**Evidence:** email, username, slug, referral_code all unique.

### NOT NULL
**Status:** PASS
**Evidence:** email, password_hash, tenant_id, created_at all NOT NULL.

### CHECK Constraints
**Status:** PASS
**Evidence:** email_lowercase, username_format, age_minimum, status enum, etc.

### Indexes
**Status:** PASS
**Evidence:** Comprehensive indexes on email, username, role, status, plus GIN indexes for metadata/search.

---

## Section 3.1: Multi-Tenant Schema (2/2 PASS)

### tenant_id Column
**Status:** PASS
**Evidence:** Users table has tenant_id with FK to tenants.

### RLS Policies
**Status:** PASS
**Evidence:** `users_tenant_isolation` policy with USING and WITH CHECK clauses.

---

## Section 3.1: Soft Delete (0/1 PASS)

### Partial Unique Index
**Status:** FAIL
**Issue:** Email unique constraint is full, not partial. Soft-deleted users block email reuse.
**Remediation:**
```sql
DROP INDEX users_email_unique;
CREATE UNIQUE INDEX idx_users_email_active ON users (email) WHERE deleted_at IS NULL;
```

---

## Section 3.2: Transaction Usage (4/4 PASS)

### Multi-step in Transactions
**Status:** PASS
**Evidence:** Registration uses BEGIN/COMMIT/ROLLBACK with client.

### Transaction Passed Through
**Status:** PASS
**Evidence:** Same client used for all operations.

### Error Handling with Rollback
**Status:** PASS
**Evidence:** catch block calls ROLLBACK, finally releases client.

### No External Calls in Transaction
**Status:** PASS
**Evidence:** Email sent after commit.

---

## Section 3.2: Locking (0/1 PASS)

### FOR UPDATE on Critical Operations
**Status:** PARTIAL
**Issue:** Session revocation and similar operations don't use FOR UPDATE.
**Remediation:**
```typescript
const sessionResult = await pool.query(
  `SELECT * FROM user_sessions WHERE id = $1 FOR UPDATE`,
  [sessionId]
);
```

---

## Section 3.2: Query Patterns (2/3 PASS)

### Atomic Updates
**Status:** PARTIAL
**Evidence:** `failed_login_attempts + 1` is atomic, but `login_count = $1` uses read-modify.
**Remediation:** Use `login_count = login_count + 1`.

### Batch Operations
**Status:** PASS

### Joins for Related Data
**Status:** PASS
**Evidence:** Sessions joined with users, no N+1 patterns.

---

## Section 3.2: Multi-Tenant Queries (1/2 PASS)

### tenant_id in All Queries
**Status:** PASS
**Evidence:** All queries include tenant_id filter.

### RLS Context Set
**Status:** FAIL
**Issue:** RLS policies exist but `app.current_tenant_id` not set in middleware.
**Remediation:**
```typescript
// In tenant middleware
await pool.query(`SET app.current_tenant_id = '${tenantId}'`);
await pool.query(`SET app.current_user_id = '${userId}'`);
```

---

## Section 3.5: Knex.js Config (3/4 PASS)

### Connection Pool Size
**Status:** PASS
**Evidence:** max: 5-10, appropriate for service.

### Statement Timeout
**Status:** PARTIAL
**Issue:** No query timeout configured.
**Remediation:**
```typescript
pool.on('connect', async (client) => {
  await client.query('SET statement_timeout = 30000');
});
```

### Down Migrations
**Status:** PASS
**Evidence:** Comprehensive down() with drops in reverse order.

### Error Codes Handled
**Status:** PASS
**Evidence:** 23505 (unique violation) mapped to 409.

---

## Remediation Priority

### HIGH
1. **Create partial unique index** - Allow email reuse after soft delete
2. **Set RLS context in middleware** - Enable RLS policy enforcement

### MEDIUM
1. **Add FOR UPDATE** - Critical read-modify-write operations
2. **Configure statement timeout** - 30s default

### LOW
1. **Use atomic increments** - Replace read-modify patterns

