# Blockchain Service - 21 Database Migrations Audit

**Service:** blockchain-service
**Document:** 21-database-migrations.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 54% (14/26 verified checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 5 | Single migration 6 tables, No lock_timeout, No pool settings, No SSL, Hardcoded tenant UUID |
| HIGH | 4 | CASCADE on user FKs, Missing uuid-ossp check, Sequential naming, No error handling |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## File Structure (2/4)

- Timestamp prefix - FAIL (uses sequential)
- Descriptive names - PASS
- One change per file - FAIL (6 tables in one)
- Correct directory - PASS

## Up Function (2/4)

- Returns Promise - PASS
- Uses knex.schema - PARTIAL
- Error handling - FAIL
- No hardcoded values - FAIL

## Down Function (2/2 verified)

- Exists - PASS
- Reverses up - PASS

## Data Safety (1/2)

- No DROP without archive - PASS
- RESTRICT not CASCADE - PARTIAL

## Performance (0/2 verified)

- lock_timeout set - FAIL
- CONCURRENTLY indexes - FAIL

## Knex Config (4/6)

- Separate migration table - PASS
- Environment-specific - PASS
- Uses env vars - PASS
- No hardcoded creds - PARTIAL
- Correct directory - PASS
- Pool settings - FAIL

## Pool/SSL (0/2)

- Pool configured - FAIL
- SSL for production - FAIL

## PostgreSQL (2/3)

- Appropriate types - PASS
- Extensions handled - PARTIAL
- RLS implemented - PASS

## Critical Evidence

### 6 Tables in One Migration
```typescript
// All in 001_baseline_blockchain_service.ts:
// wallet_addresses, user_wallet_connections, treasury_wallets,
// blockchain_events, blockchain_transactions, mint_jobs
```

### Hardcoded Tenant UUID
```typescript
table.uuid('tenant_id').notNullable()
  .defaultTo('00000000-0000-0000-0000-000000000001')
```

### CASCADE on User FKs
```typescript
table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
```

## Critical Remediations

### P0: Add lock_timeout
```typescript
await knex.raw("SET lock_timeout = '5s'");
```

### P0: Add Pool Settings
```typescript
pool: { min: 2, max: 10, acquireTimeoutMillis: 30000 }
```

### P0: Add SSL for Production
```typescript
ssl: { rejectUnauthorized: true }
```

### P0: Remove Hardcoded Tenant
```typescript
table.uuid('tenant_id').notNullable(); // No default
```

### P1: Change CASCADE to RESTRICT
```typescript
table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL');
```

### P1: Add Extension Check
```typescript
await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
```

## Strengths

- Service-specific migration table name
- Down migration reverses up correctly
- RLS enabled on all tables
- Good PostgreSQL types (UUID, JSONB, TIMESTAMPTZ)
- Environment-aware paths
- migrate:rollback script available

Database Migrations Score: 54/100
