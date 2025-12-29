# Minting Service - 21 Database Migrations Audit

**Service:** minting-service
**Document:** 21-database-migrations.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 52% (11/21 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 3 | No backup before migration, No CI/CD testing, SSL rejectUnauthorized:false |
| HIGH | 3 | No lock_timeout, pgcrypto not verified, Sequential naming |
| MEDIUM | 2 | Pool min:2, No CONCURRENTLY on indexes |
| LOW | 0 | None |

## 1. File Structure & Naming (3/5)

- Timestamp prefix - FAIL (uses 001_)
- Descriptive names - PASS
- One logical change - PARTIAL (baseline acceptable)
- Correct directory - PASS
- Up returns Promise - PASS

## 2. Up/Down Functions (3/3 PASS)

- exports.up returns Promise - PASS
- exports.down reverses up - PASS
- NOT NULL with defaults - PASS

## 3. Performance & Locking (0/2)

- Index uses CONCURRENTLY - FAIL
- lock_timeout configured - FAIL

## 4. Knexfile Configuration (3/5)

- Per-environment config - PASS
- Env vars for credentials - PASS
- SSL in production - PARTIAL (rejectUnauthorized:false)
- Service-specific table - PASS
- Pool min: 0 - FAIL (min:2)

## 5. PostgreSQL-Specific (2/3)

- PostgreSQL-native types - PASS
- pgcrypto extension - FAIL
- Row Level Security - PASS

## 6. Rollback & CI/CD (0/3)

- Backup before migration - FAIL
- CI/CD migration testing - FAIL
- Rollback documented - FAIL

## Critical Remediations

### P0: Add Backup Before Migration
```bash
# entrypoint.sh
pg_dump $DATABASE_URL > /backup/pre-migration-$(date +%Y%m%d%H%M%S).sql
npm run migrate
```

### P0: Enable SSL Certificate Validation
```typescript
ssl: {
  rejectUnauthorized: true,
  ca: fs.readFileSync('/path/to/ca.pem')
}
```

### P0: Add CI/CD Migration Testing
```yaml
- name: Test migrations
  run: |
    npm run migrate
    npm run migrate:rollback
    npm run migrate
```

### P1: Add lock_timeout
```typescript
await knex.raw("SET lock_timeout = '5s'");
```

### P1: Verify pgcrypto Extension
```typescript
await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
```

### P1: Use Timestamp Naming
```
20241226120000_baseline_minting.ts
```

### P2: Set Pool Min to 0
```typescript
pool: { min: 0, max: 10 }
```

## Strengths

- Down migration fully reverses up
- Service-specific migration table (knex_migrations_minting)
- Row Level Security implemented on all tables
- PostgreSQL-native types (UUID, JSONB, TIMESTAMPTZ)
- Environment-specific configuration
- NOT NULL columns have defaults
- Uses dropTableIfExists for idempotency
- Tenant isolation policies defined

Database Migrations Score: 52/100
