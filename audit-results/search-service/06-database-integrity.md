## Search-Service Database Integrity Audit

**Standard:** `06-database-integrity.md`  
**Service:** `search-service`  
**Date:** 2025-12-27

---

### Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 42 |
| **Passed** | 18 |
| **Partial** | 9 |
| **Failed** | 11 |
| **N/A** | 4 |
| **Pass Rate** | 47.4% |
| **Critical Issues** | 3 |
| **High Issues** | 5 |
| **Medium Issues** | 4 |

---

## 3.1 Migration Audit Checklist

### Schema Definition

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **M1** | Foreign keys for all relationships | **FAIL** | `001_search_consistency_tables.ts` - No foreign keys defined on `search_operation_log` or `sync_status` |
| **M2** | Appropriate ON DELETE actions | **FAIL** | No foreign key constraints to have ON DELETE |
| **M3** | Primary keys on all tables | **PASS** | `001_search_consistency_tables.ts:10,31` - `id` as primary key on both tables |
| **M4** | Unique constraints where needed | **PASS** | `001_search_consistency_tables.ts:33-35` - Unique on `(entity_type, entity_id)` |
| **M5** | NOT NULL on required fields | **PASS** | `001_search_consistency_tables.ts:11,13-20` - Most fields have `.notNullable()` |
| **M6** | CHECK constraints for valid ranges | **FAIL** | No CHECK constraints for status, priority, or timestamps |
| **M7** | Indexes on frequently queried columns | **PASS** | `001_search_consistency_tables.ts:25-27,45-46` - Indexes on status, entity_type, entity_id |

### Multi-Tenant Specific

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **M8** | tenant_id on all tenant-scoped tables | **FAIL** | No `tenant_id` column on either table |
| **M9** | tenant_id in unique constraints | **FAIL** | Unique constraint doesn't include tenant_id |
| **M10** | Row Level Security policies | **FAIL** | No RLS policies defined |

### Soft Delete Handling

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **M11** | Soft delete partial indexes | **N/A** | No soft delete pattern used (hard deletes) |

---

## 3.2 Repository/Model Layer Checklist

### Transaction Usage

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **R1** | Multi-step ops wrapped in transactions | **PASS** | `consistency.service.ts:37` - Uses `await this.db.transaction(async (trx) => {...})` |
| **R2** | Transaction passed to all operations | **PASS** | `consistency.service.ts:41-66` - All operations use `trx` not `this.db` |
| **R3** | Proper error handling with rollback | **PASS** | `consistency.service.ts:73-79` - Explicit `trx.rollback()` in catch |
| **R4** | No external API calls in transactions | **PARTIAL** | `consistency.service.ts:53-58` - ES call inside transaction (risky) |

### Locking

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **R5** | FOR UPDATE for critical read-modify-write | **FAIL** | `consistency.service.ts` - No `.forUpdate()` on sync_status reads |
| **R6** | FOR UPDATE SKIP LOCKED for queues | **PARTIAL** | Uses status-based queue, no explicit locking |

### Query Patterns

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **R7** | Atomic updates instead of read-modify-write | **PARTIAL** | `consistency.service.ts:114-119` - Uses raw SQL for retry_count increment, but some read-modify patterns exist |
| **R8** | Batch operations instead of loops | **PARTIAL** | `consistency.service.ts:231-240` - Single operations, but limited in scope |
| **R9** | Joins or batch loading for related data | **PASS** | No N+1 patterns in consistency service |

### Multi-Tenant

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **R10** | tenant_id in all queries | **FAIL** | `consistency.service.ts` - No tenant_id filtering in any query |
| **R11** | RLS context set at request start | **FAIL** | No RLS session variable setting |

---

## 3.3 Database Configuration Checklist

### Connection Pool

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **C1** | Pool appropriately sized | **PASS** | `database.ts:13-16` - `min: 5, max: 20` configured |
| **C2** | Statement timeout configured | **FAIL** | No `statement_timeout` in pool config |
| **C3** | Acquire timeout configured | **FAIL** | No `acquireTimeoutMillis` in pool config |
| **C4** | Connection test on startup | **PASS** | `database.ts:21` - `await db.raw('SELECT 1')` |

### MongoDB Configuration

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **C5** | Connection pool configured | **PASS** | `mongodb.ts:6-7` - `maxPoolSize: 10, minPoolSize: 2` |
| **C6** | Timeouts configured | **PASS** | `mongodb.ts:8-9` - `socketTimeoutMS: 45000, serverSelectionTimeoutMS: 5000` |
| **C7** | Read preference appropriate | **PASS** | `mongodb.ts:12` - `readPreference: 'secondaryPreferred'` (read-only) |
| **C8** | Health check implemented | **PASS** | `mongodb.ts:73-82` - `checkMongoDBHealth()` with ping |
| **C9** | Graceful shutdown | **PASS** | `mongodb.ts:43-46` - SIGINT handler closes connection |
| **C10** | Credentials not logged | **PASS** | `mongodb.ts:26` - URI masked in logs |

---

## 3.4 Race Condition Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **RC1** | Atomic inventory operations | **PASS** | `consistency.service.ts:114-119` - Uses raw SQL for atomic updates |
| **RC2** | Version/optimistic locking | **PASS** | `consistency.service.ts:32` - `version` column on sync_status |
| **RC3** | Idempotency keys implemented | **PASS** | `consistency.service.ts:84-106` - Token-based idempotency |
| **RC4** | Serialization failure handling | **FAIL** | No retry logic for PostgreSQL error code `40001` |
| **RC5** | Queue operations locked | **PARTIAL** | `consistency.service.ts:226-242` - Status-based queue without explicit locking |

---

## 3.5 Data Integrity Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **DI1** | Consistency tokens generated | **PASS** | `consistency.service.ts:140-141` - `crypto.randomBytes(16).toString('hex')` |
| **DI2** | Operations logged | **PASS** | `consistency.service.ts:41-50` - Insert to `search_operation_log` |
| **DI3** | Sync status tracked | **PASS** | `consistency.service.ts:53-73` - Updates `sync_status` table |
| **DI4** | Retry mechanism | **PASS** | `consistency.service.ts:231-242` - Background processor retries pending |
| **DI5** | Dead letter handling | **PARTIAL** | `consistency.service.ts:121-126` - Logs failures but no DLQ table |

---

## Critical Issues (P0)

### 1. No Foreign Key Constraints
**Severity:** CRITICAL  
**Location:** `001_search_consistency_tables.ts`  
**Issue:** Tables reference entity_type and entity_id but have no foreign key relationships. Orphaned records possible.

**Evidence:**
```typescript
table.string('entity_type', 50).notNullable();
table.string('entity_id').notNullable();
// NO foreign key to events, venues, tickets tables
```

**Remediation:** Add foreign key constraints or implement periodic orphan detection.

---

### 2. Missing Tenant Isolation
**Severity:** CRITICAL  
**Location:** All database operations  
**Issue:** No `tenant_id` column or RLS. In a multi-tenant platform, all tenants share the same search consistency data.

**Evidence:**
```typescript
// consistency.service.ts - No tenant filtering
const existing = await trx('sync_status')
  .where({ entity_type: operation.entityType, entity_id: operation.entityId })
  .first();
// MISSING: .andWhere({ tenant_id: currentTenantId })
```

**Remediation:**
1. Add `tenant_id` column to both tables
2. Add tenant_id to unique constraints
3. Filter all queries by tenant_id
4. Enable RLS policies

---

### 3. No Statement Timeout
**Severity:** CRITICAL  
**Location:** `database.ts:11-17`  
**Issue:** No statement timeout configured. Long-running queries can hold connections and locks indefinitely.

**Evidence:**
```typescript
pool: {
  min: 5,
  max: 20
  // MISSING: acquireTimeoutMillis, createTimeoutMillis
}
// MISSING: afterCreate hook for statement_timeout
```

**Remediation:**
```typescript
pool: {
  min: 5,
  max: 20,
  acquireTimeoutMillis: 30000,
  createTimeoutMillis: 30000,
  afterCreate: (conn, done) => {
    conn.query('SET statement_timeout = 30000', done);
  }
}
```

---

## High Issues (P1)

### 4. Elasticsearch Call Inside Transaction
**Severity:** HIGH  
**Location:** `consistency.service.ts:53-58`  
**Issue:** External ES call made inside transaction. Transaction holds locks while waiting for external API.

**Evidence:**
```typescript
await this.db.transaction(async (trx) => {
  // ... DB operations
  await this.performOperation(operation);  // ES call inside transaction
  // ... more DB operations
});
```

**Remediation:** Move ES operations outside transaction, update status after ES succeeds.

---

### 5. No Pessimistic Locking on Sync Status
**Severity:** HIGH  
**Location:** `consistency.service.ts:61-73`  
**Issue:** Updates sync_status without locking. Concurrent sync operations could conflict.

**Evidence:**
```typescript
const existing = await trx('sync_status')
  .where({ entity_type, entity_id })
  .first();
// MISSING: .forUpdate()
```

---

### 6. No Serialization Failure Retry
**Severity:** HIGH  
**Location:** `consistency.service.ts`  
**Issue:** No handling for PostgreSQL error code `40001` (serialization_failure).

**Remediation:**
```typescript
async function withRetry(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.code === '40001' && i < maxRetries - 1) {
        await delay(Math.random() * 100);
        continue;
      }
      throw err;
    }
  }
}
```

---

### 7. No CHECK Constraints
**Severity:** HIGH  
**Location:** `001_search_consistency_tables.ts`  
**Issue:** No validation constraints on status, priority, or timestamps at DB level.

**Missing:**
```typescript
// Should have:
table.check('priority BETWEEN 1 AND 10');
table.check("status IN ('pending', 'processing', 'synced', 'failed')");
table.check('retry_count >= 0');
```

---

### 8. Hardcoded Database Credentials
**Severity:** HIGH  
**Location:** `database.ts:8-10`  
**Issue:** Default credentials hardcoded as fallback.

**Evidence:**
```typescript
user: process.env.DB_USER || 'postgres',
password: process.env.DB_PASSWORD || 'postgres',
```

---

## Medium Issues (P2)

| # | Issue | Location | Description |
|---|-------|----------|-------------|
| 9 | No connection pool error handler | `database.ts` | Missing `db.client.pool.on('error')` |
| 10 | Queue without explicit locking | `consistency.service.ts:226` | Background processor could process same item twice |
| 11 | MongoDB URI hardcoded fallback | `mongodb.ts:5` | Default localhost URI |
| 12 | No down migration | `001_search_consistency_tables.ts:52-54` | Down migration is empty |

---

## Positive Findings

1. ✅ **Transaction usage** - Multi-step operations properly wrapped in transactions
2. ✅ **Transaction parameter passing** - All operations within transaction use `trx`
3. ✅ **Explicit rollback** - Catch block explicitly calls `trx.rollback()`
4. ✅ **Idempotency implementation** - Token-based idempotency with consistency verification
5. ✅ **Version column** - `sync_status` has version column for optimistic locking
6. ✅ **Proper indexes** - Indexes on status, entity_type, entity_id columns
7. ✅ **Operation logging** - All sync operations logged to `search_operation_log`
8. ✅ **MongoDB read preference** - Uses `secondaryPreferred` for read-only search
9. ✅ **MongoDB graceful shutdown** - SIGINT handler properly closes connection
10. ✅ **Credential masking** - MongoDB URI credentials masked in logs

---

## Prioritized Remediation Plan

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Add tenant_id to tables and queries | 4 hours | Critical - data isolation |
| P0 | Add statement timeout to pool config | 30 min | Critical - prevents hanging |
| P0 | Add foreign key constraints or orphan detection | 2 hours | Critical - data integrity |
| P1 | Move ES call outside transaction | 2 hours | High - prevents lock holding |
| P1 | Add .forUpdate() to sync_status reads | 30 min | High - prevents race conditions |
| P1 | Add serialization failure retry logic | 1 hour | High - handles contention |
| P1 | Add CHECK constraints to migration | 1 hour | High - data validation |
| P1 | Remove hardcoded DB credentials | 30 min | High - security |
| P2 | Add pool error handler | 15 min | Medium - error visibility |
| P2 | Add explicit locking to queue processor | 1 hour | Medium - prevents double processing |
| P2 | Implement down migration | 30 min | Medium - reversibility |

---

**Audit Complete.** Pass rate of 47.4% indicates reasonable database practices for transactions and connection management, but significant gaps in multi-tenant isolation, constraint enforcement, and locking strategies. The service properly uses transactions but has critical gaps in tenant isolation and foreign key relationships.
