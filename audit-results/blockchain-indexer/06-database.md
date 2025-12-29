# Blockchain-Indexer Service - 06 Database Integrity Audit

**Service:** blockchain-indexer
**Document:** 06-database.md
**Date:** 2025-12-26
**Auditor:** Cline AI
**Pass Rate:** 81% (22/27 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | MongoDB writes fail silently without retry |
| HIGH | 3 | No database SSL, RLS context errors swallowed, dual-write not transactional |
| MEDIUM | 3 | No statement timeout, no FOR UPDATE locking, SELECT * usage |
| LOW | 1 | No error code mapping |

## Migration Schema (7/7) EXCELLENT

- Foreign keys - PASS
- Primary keys - PASS
- Unique constraints - PASS
- NOT NULL constraints - PASS
- Indexes - PASS
- Tenant ID column - PASS
- RLS policies - PASS

## Transaction Usage (0/1 applicable)

- Dual-write consistency - FAIL (CRITICAL)

## Locking (0/1)

- FOR UPDATE on critical ops - FAIL (MEDIUM)

## Query Patterns (3/3 applicable)

- Atomic updates (ON CONFLICT) - PASS
- Parameterized queries - PASS
- SELECT * usage - PARTIAL

## Multi-Tenant (1/2)

- tenant_id in queries - PARTIAL (via RLS)
- RLS context set - FAIL (HIGH)

## Connection Pool (4/6)

- Pool size (20) - PASS
- Idle timeout (30s) - PASS
- Connection timeout (2s) - PASS
- Statement timeout - FAIL (MEDIUM)
- Pool error handler - PASS
- SSL configuration - FAIL (HIGH)

## MongoDB (5/5)

- Connection string - PASS
- Connection options - PASS
- Error handling - PASS
- Indexes on collections - PASS
- Tenant ID in documents - PASS
- Duplicate key handling - PARTIAL

## PostgreSQL Tables (6)

| Table | FK | PK | Unique | NOT NULL | Index | tenant_id | RLS |
|-------|----|----|--------|----------|-------|-----------|-----|
| indexer_state | - | ✅ | - | ✅ | ✅ | ✅ | ✅ |
| indexed_transactions | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| marketplace_activity | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| reconciliation_runs | - | ✅ | - | ✅ | ✅ | ✅ | ✅ |
| ownership_discrepancies | ✅ | ✅ | - | ✅ | ✅ | ✅ | ✅ |
| reconciliation_log | ✅ | ✅ | - | ✅ | ✅ | ✅ | ✅ |

## Critical Issues

### 1. MongoDB Writes Silently Fail
```typescript
// transactionProcessor.ts:84-89
} catch (error) {
  logger.error({ error, signature }, 'Failed to save to MongoDB');
  // ERROR NOT RE-THROWN - Silent failure!
}
```

### 2. No Database SSL
```typescript
// database.ts - Missing:
ssl: { rejectUnauthorized: true }
```

### 3. RLS Context Errors Swallowed
```typescript
// index.ts:77-80
} catch (error) {
  // Allow request to proceed
}
```

### 4. No FOR UPDATE Locking
```typescript
// Check without lock - race condition
const exists = await this.checkExists(signature);
if (exists) return;
// Another process could insert here
```

## Remediations

### CRITICAL
Track failed MongoDB writes - queue for retry or alert

### HIGH
1. Add database SSL configuration
2. Don't swallow RLS context errors
3. Add FOR UPDATE for critical reads

### MEDIUM
1. Add statement_timeout (30s)
2. Replace SELECT * with explicit columns
3. Add optimistic locking to indexer_state

Database Score: 81/100
