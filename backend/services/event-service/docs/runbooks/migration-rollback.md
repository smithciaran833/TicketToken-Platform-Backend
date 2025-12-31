# Migration & Rollback Runbook

**Service:** event-service  
**Last Updated:** December 31, 2024

---

## Overview

This runbook covers database migration best practices, rollback procedures, and safety patterns for the event-service.

---

## Migration Best Practices

### 1. Always Use lock_timeout

**Audit Finding:** 21-DB-2 - Prevent indefinite lock waits during migrations

Every migration should set `lock_timeout` at the start to prevent indefinite blocking:

```typescript
export async function up(knex: Knex): Promise<void> {
  // REQUIRED: Fail fast if locks cannot be acquired
  await knex.raw("SET lock_timeout = '5s'");
  
  // ... rest of migration
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET lock_timeout = '5s'");
  
  // ... rollback logic
}
```

**Why?** Without lock_timeout:
- DDL operations (ALTER TABLE) acquire exclusive locks
- If another transaction holds a lock, migration waits indefinitely
- This can block deployments for hours
- With lock_timeout, migration fails fast and can be retried

**Recommended values:**
- Development: `5s`
- Staging: `10s`
- Production: `5s` (fail fast, retry later)

---

### 2. Index Creation with CONCURRENTLY

**Audit Finding:** 21-DB-1 - Non-blocking index creation

⚠️ **Limitation:** `CREATE INDEX CONCURRENTLY` cannot be used inside a transaction.

Knex migrations run inside transactions by default, which means:
- Standard `CREATE INDEX` blocks reads/writes on large tables
- `CREATE INDEX CONCURRENTLY` fails inside transaction

**Solutions:**

#### Option A: Create indexes outside migrations (Recommended for large tables)

For tables with >1M rows, create indexes separately:

```bash
# Connect to database directly
psql -h $DB_HOST -U $DB_USER -d $DB_NAME

# Create index without blocking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_search_new 
  ON events USING gin(to_tsvector('english', name || ' ' || description));
```

Then document the index in migration comments:

```typescript
/**
 * NOTE: Large index created separately with CONCURRENTLY
 * See: CREATE INDEX CONCURRENTLY idx_events_search_new ...
 * Created manually on: 2024-12-31
 */
```

#### Option B: Use disable_transactional migrations (Knex-specific)

For smaller tables, you can disable transaction:

```typescript
export const config = {
  transaction: false  // Allows CONCURRENTLY but no rollback safety
};

export async function up(knex: Knex): Promise<void> {
  await knex.raw('SET lock_timeout = \'5s\'');
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name 
    ON table_name(column)
  `);
}
```

**Warning:** Without transaction, partial migrations are possible on failure.

#### Option C: Accept blocking for small tables

For tables with <100K rows, standard index creation is usually fast enough:

```typescript
// OK for small tables - completes in milliseconds
await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id)');
```

---

### 3. CHECK Constraints Pattern

Use DO blocks to safely add constraints without failing if they exist:

```typescript
await knex.raw(`
  DO $$ BEGIN
    ALTER TABLE table_name 
      ADD CONSTRAINT constraint_name 
      CHECK (column >= 0);
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
`);
```

---

### 4. Safe ALTER TABLE Operations

**Non-blocking operations (safe):**
- `ADD COLUMN` with nullable or default value (PostgreSQL 11+)
- `DROP CONSTRAINT`
- `RENAME COLUMN`

**Blocking operations (use caution):**
- `ADD COLUMN NOT NULL` without default
- `ALTER COLUMN TYPE`
- `ADD CONSTRAINT` (CHECK, FK)

For blocking operations:
1. Set `lock_timeout`
2. Run during low-traffic periods
3. Have rollback ready

---

## Rollback Procedures

### Automatic Rollback

If a migration fails mid-way (with transaction enabled), Knex automatically rolls back:

```bash
# View failed migration status
npx knex migrate:status

# Failed migrations don't record in knex_migrations table
```

### Manual Rollback

```bash
# Roll back last migration batch
npx knex migrate:rollback

# Roll back all migrations (DANGER - drops tables)
npx knex migrate:rollback --all

# Roll back specific number of batches
npx knex migrate:rollback --step 2
```

### Emergency Rollback (Direct SQL)

If Knex rollback fails, use direct SQL:

```sql
-- Find the constraint/index causing issues
SELECT constraint_name FROM information_schema.constraint_table_usage 
WHERE table_name = 'events';

-- Drop directly
ALTER TABLE events DROP CONSTRAINT IF EXISTS problematic_constraint;

-- Update knex migration table
DELETE FROM knex_migrations_event WHERE name = '005_problematic_migration.ts';
```

---

## Pre-Deployment Checklist

Before running migrations in production:

- [ ] Migration tested in staging environment
- [ ] `lock_timeout` is set in migration
- [ ] Rollback (down) function is implemented and tested
- [ ] Estimated execution time documented
- [ ] Low-traffic window selected for blocking operations
- [ ] Database backup taken
- [ ] On-call engineer available

---

## Monitoring During Migrations

```sql
-- Check for blocking queries
SELECT blocked_locks.pid AS blocked_pid,
       blocked_activity.usename AS blocked_user,
       blocking_locks.pid AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocked_activity.query AS blocked_statement,
       blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.DATABASE IS NOT DISTINCT FROM blocked_locks.DATABASE
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.GRANTED;

-- Kill blocking query if needed (last resort)
SELECT pg_terminate_backend(blocking_pid);
```

---

## Common Issues

### Issue: Migration timeout

**Symptom:** Migration hangs, eventually fails with "lock timeout"

**Solution:**
1. Check for long-running transactions holding locks
2. Wait for quiet period
3. Increase lock_timeout temporarily if safe

### Issue: Constraint violation on ADD CONSTRAINT

**Symptom:** `ERROR: check constraint "x" is violated by some row`

**Solution:**
1. Clean up invalid data first:
   ```sql
   UPDATE events SET age_restriction = 0 WHERE age_restriction < 0;
   ```
2. Then add constraint

### Issue: Index creation too slow

**Symptom:** `CREATE INDEX` takes > 10 minutes

**Solution:**
1. Cancel migration
2. Create index with CONCURRENTLY outside migration
3. Update migration to skip if index exists

---

## Migration Audit Trail

All migrations should be logged in FIX_PROGRESS.md with:
- Date created
- Findings addressed
- Tables modified
- Estimated runtime
