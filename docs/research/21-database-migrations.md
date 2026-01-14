# Database Migration Best Practices Audit Guide

**Platform**: TicketToken (Blockchain Ticketing SaaS)  
**Stack**: Node.js/TypeScript, Knex.js, PostgreSQL  
**Date**: December 2024

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Verification Commands](#4-verification-commands)
5. [Sources](#5-sources)

---

## 1. Standards & Best Practices

### 1.1 Migration Versioning

Migration versioning is the practice of treating database schema changes like source code, with each change tracked, versioned, and reproducible across environments.

**Core Principles**:

| Principle | Description |
|-----------|-------------|
| Treat as Code | Store migrations in version control alongside application code |
| Immutability | Never modify a migration after it's been applied to any shared environment |
| Explicit Changes | Each modification should be a separate migration file with clear intent |
| Sequential Ordering | Migrations must be applied in a consistent, deterministic order |
| Environment Parity | Same migrations run in dev, staging, and production |

**Versioning Strategies**:

1. **Timestamp-based** (Recommended for Knex):
   - Format: `YYYYMMDDHHMMSS_migration_name.js`
   - Example: `20241220143022_add_tickets_table.js`
   - Pros: Avoids conflicts in distributed teams, clear chronological order
   - Knex default behavior

2. **Sequential numbering**:
   - Format: `001_migration_name.js`, `002_migration_name.js`
   - Pros: Simple to understand ordering
   - Cons: Merge conflicts when multiple developers create migrations

**Knex Migration Table** (`knex_migrations`):
```sql
-- Knex automatically creates this table to track applied migrations
CREATE TABLE knex_migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    batch INTEGER,
    migration_time TIMESTAMPTZ
);
```

**Best Practices**:
- Every developer should have their own database instance to avoid conflicts
- Run `knex migrate:latest` in CI/CD to verify all migrations apply cleanly
- Never delete or rename migration files that have been applied to shared environments
- Use descriptive names: `add_user_email_index.js` not `update_users.js`

### 1.2 Rollback Strategies

Rolling back database changes is fundamentally different from rolling back application code because databases are stateful. Dropping a column doesn't just remove the column—it deletes all data in that column.

**Rollback Approaches**:

| Strategy | Description | When to Use |
|----------|-------------|-------------|
| **Down Migration** | Pre-written rollback script | Development, testing, simple changes |
| **Forward Fix** | Deploy new migration to fix issue | Production (preferred) |
| **Point-in-Time Recovery** | Restore from backup | Catastrophic failures |
| **Blue-Green Database** | Switch traffic to old database | Zero-downtime requirements |

**The Reality of Down Migrations**:

According to Atlas and industry interviews, down migrations are rarely used in production despite being widely written. Key reasons:
- `DROP COLUMN` deletes all data in that column—re-applying the migration won't restore it
- Production databases contain real user data that cannot be lost
- Forward fixes maintain audit trails better than rollbacks

**Recommended Rollback Strategy**:

```javascript
// Knex migration with down function
exports.up = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.string('phone_number');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('phone_number');
  });
};
```

**When Down Migrations Are Safe**:
- Adding a new column (down = drop column with no data yet)
- Adding a new table (down = drop table)
- Adding an index (down = drop index)
- Development/testing environments

**When to Use Forward Fix Instead**:
- Column has accumulated production data
- Migration involves data transformation
- Any destructive change in production

**Production Rollback Checklist**:
- [ ] Full database backup taken before migration
- [ ] Backup tested and verified restorable
- [ ] Rollback procedure documented
- [ ] Recovery time estimated
- [ ] Communication plan for stakeholders

### 1.3 Zero-Downtime Migrations

Zero-downtime migrations allow database schema changes while the application continues serving traffic. This is critical for high-availability systems.

**The Expand-Contract Pattern**:

The expand-contract (or parallel change) pattern is the gold standard for zero-downtime migrations:

```
Phase 1: EXPAND
├── Add new column/table alongside existing
├── Application writes to BOTH old and new
├── Deploy application that handles both schemas
└── Backfill historical data

Phase 2: CONTRACT  
├── Verify all data migrated correctly
├── Deploy application using ONLY new schema
├── Remove old column/table
└── Clean up dual-write code
```

**Example: Renaming a Column**

```javascript
// WRONG: This breaks running applications instantly
exports.up = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.renameColumn('name', 'full_name'); // Breaks v1 apps immediately
  });
};

// RIGHT: Expand-Contract Pattern
// Migration 1: Add new column
exports.up = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.string('full_name');
  });
};

// Application code: dual-write to both columns
// Migration 2: Backfill data
exports.up = function(knex) {
  return knex.raw('UPDATE users SET full_name = name WHERE full_name IS NULL');
};

// Deploy new app version using full_name
// Migration 3: Remove old column (after all apps updated)
exports.up = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('name');
  });
};
```

**PostgreSQL Lock-Safe Operations**:

| Operation | Lock Type | Safe for Production? |
|-----------|-----------|---------------------|
| `ADD COLUMN` (nullable) | ACCESS EXCLUSIVE (brief) | ✅ Yes |
| `ADD COLUMN DEFAULT` (PG 11+) | ACCESS EXCLUSIVE (brief) | ✅ Yes |
| `ADD COLUMN DEFAULT` (PG <11) | ACCESS EXCLUSIVE (rewrites table) | ❌ No |
| `DROP COLUMN` | ACCESS EXCLUSIVE (brief) | ✅ Yes (marks invisible) |
| `ALTER COLUMN TYPE` | ACCESS EXCLUSIVE (may rewrite) | ⚠️ Depends |
| `CREATE INDEX` | SHARE (blocks writes) | ❌ No |
| `CREATE INDEX CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | ✅ Yes |
| `ADD CONSTRAINT` | SHARE ROW EXCLUSIVE | ⚠️ May block |

**Lock Timeout Protection**:

Always set `lock_timeout` to prevent migrations from blocking all queries:

```javascript
exports.up = async function(knex) {
  // Set lock timeout to 5 seconds
  await knex.raw('SET lock_timeout = \'5s\'');
  
  // If this can't acquire lock in 5s, it fails instead of blocking everything
  await knex.schema.alterTable('users', (table) => {
    table.string('new_column');
  });
};
```

**Tools for Zero-Downtime PostgreSQL Migrations**:
- **pgroll**: Automates expand-contract pattern, serves multiple schema versions
- **gh-ost**: Online schema migrations (originally for MySQL)
- **pt-online-schema-change**: Percona toolkit for online changes

### 1.4 Data Migrations vs Schema Migrations

Understanding the difference between schema and data migrations is critical for safe deployments.

| Aspect | Schema Migration | Data Migration |
|--------|------------------|----------------|
| **What changes** | Database structure (tables, columns, indexes) | Content within tables |
| **Duration** | Usually milliseconds-seconds | Can take minutes-hours |
| **Risk level** | Lower (structure only) | Higher (affects actual data) |
| **Reversibility** | Often reversible | May be irreversible |
| **Testing** | Schema comparison | Data validation required |
| **CI/CD** | Run automatically | Consider running separately |

**Why Separate Them**:

1. **Locking concerns**: Schema changes hold locks briefly; data migrations may hold locks for extended periods
2. **Failure modes**: Schema migration failures are cleaner to recover from
3. **Testing requirements**: Data migrations need validation against production-like data
4. **Timing control**: Data migrations may need to run during low-traffic periods
5. **Parameterization**: Data migrations may need to run in batches or for specific tenants

**Recommended Approach**:

```javascript
// Schema migration: add column
// File: 20241220_01_add_status_column.js
exports.up = function(knex) {
  return knex.schema.alterTable('orders', (table) => {
    table.string('status').defaultTo('pending');
  });
};

// Data migration: populate column (SEPARATE FILE or rake task)
// File: 20241220_02_populate_status_column.js
exports.up = async function(knex) {
  // Process in batches to avoid long-running transactions
  const batchSize = 1000;
  let processed = 0;
  
  while (true) {
    const result = await knex.raw(`
      UPDATE orders 
      SET status = CASE 
        WHEN shipped_at IS NOT NULL THEN 'shipped'
        WHEN cancelled_at IS NOT NULL THEN 'cancelled'
        ELSE 'pending'
      END
      WHERE status IS NULL
      LIMIT ${batchSize}
    `);
    
    if (result.rowCount === 0) break;
    processed += result.rowCount;
    console.log(`Processed ${processed} rows`);
  }
};
```

**Best Practice**: For large data migrations, consider:
- Running as a separate script/job (not in migration)
- Processing in batches
- Adding progress logging
- Running during maintenance windows
- Testing with production-sized data first

### 1.5 Testing Migrations

Migration testing is often overlooked but critical for preventing production incidents.

**Testing Layers**:

| Layer | What to Test | When |
|-------|-------------|------|
| **Syntax/Lint** | Migration file syntax | Pre-commit |
| **Up Migration** | Migration applies cleanly | CI/CD |
| **Down Migration** | Rollback works | CI/CD |
| **Idempotency** | Running twice doesn't break | CI/CD |
| **Data Integrity** | Existing data preserved | Staging |
| **Performance** | Lock time, execution duration | Pre-production |
| **Production-like** | Test against production clone | Pre-deployment |

**Testing Strategy for Knex**:

```javascript
// test/migrations.test.js
const knex = require('../db/knex');

describe('Migrations', () => {
  beforeEach(async () => {
    // Roll back all migrations
    await knex.migrate.rollback(null, true);
  });

  afterEach(async () => {
    // Clean up
    await knex.migrate.rollback(null, true);
  });

  it('should apply all migrations', async () => {
    await knex.migrate.latest();
    const [, migrations] = await knex.migrate.list();
    expect(migrations.length).toBe(0); // No pending migrations
  });

  it('should rollback all migrations', async () => {
    await knex.migrate.latest();
    await knex.migrate.rollback(null, true);
    // Verify clean state
  });

  it('should be idempotent', async () => {
    await knex.migrate.latest();
    // Running again should not error
    await knex.migrate.latest();
  });
});
```

**Production-Like Testing**:

The gold standard is testing against a clone of production data:

```bash
# Clone production database for testing
pg_dump production_db | psql test_migration_db

# Run migrations against clone
NODE_ENV=test knex migrate:latest

# Verify data integrity
psql test_migration_db -c "SELECT COUNT(*) FROM users"
```

**What to Verify**:
- [ ] Migration completes without errors
- [ ] Existing data is preserved
- [ ] Foreign key relationships intact
- [ ] Indexes created correctly
- [ ] Constraints enforced
- [ ] Application queries still work
- [ ] Migration completes within acceptable time

### 1.6 Migration in CI/CD

Integrating migrations into CI/CD ensures consistent, automated deployments.

**CI/CD Pipeline Stages**:

```yaml
# Example GitHub Actions workflow
name: Deploy with Migrations

on:
  push:
    branches: [main]

jobs:
  test-migrations:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: test_db
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      
      - name: Test migrations up
        run: npx knex migrate:latest --env test
        
      - name: Test migrations down
        run: npx knex migrate:rollback --all --env test
        
      - name: Test migrations up again (idempotency)
        run: npx knex migrate:latest --env test
        
      - name: Run application tests
        run: npm test

  deploy-staging:
    needs: test-migrations
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Run migrations on staging
        run: npx knex migrate:latest --env staging
        
      - name: Deploy application
        run: ./deploy.sh staging

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production  # Requires approval
    steps:
      - name: Backup database
        run: ./backup-db.sh production
        
      - name: Run migrations on production
        run: npx knex migrate:latest --env production
        
      - name: Deploy application
        run: ./deploy.sh production
```

**Best Practices for CI/CD**:

1. **Migrations before code**: Run migrations before deploying new application code
2. **Automated backups**: Always backup before production migrations
3. **Environment gates**: Require approval for production deployments
4. **Rollback plan**: Document rollback steps in deployment runbook
5. **Monitoring**: Watch error rates during and after deployment
6. **Feature flags**: Use flags to control new features independently of migrations

**Migration Ordering in Deployment**:

```
1. Take database backup
2. Run database migrations
3. Verify migrations successful
4. Deploy new application code
5. Verify application healthy
6. Monitor for errors
```

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Irreversible Migrations Without Planning

**The Problem**: Deploying destructive changes without a recovery plan.

**Examples**:
```javascript
// DANGEROUS: No way to recover data
exports.up = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('legacy_id'); // Data is gone forever
  });
};
```

**Real-World Impact**:
- 83% of data migration projects either fail or exceed their budgets and timelines
- Data loss incidents can cause significant financial and reputational damage

**Prevention**:
- [ ] Always backup before destructive operations
- [ ] Archive data to separate table before dropping
- [ ] Use soft-delete patterns instead of hard deletes
- [ ] Test recovery procedure before deploying

**Safe Pattern**:
```javascript
// Archive before dropping
exports.up = async function(knex) {
  // 1. Archive the data
  await knex.raw(`
    CREATE TABLE archived_legacy_ids AS 
    SELECT id, legacy_id, NOW() as archived_at 
    FROM users WHERE legacy_id IS NOT NULL
  `);
  
  // 2. Now safe to drop
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('legacy_id');
  });
};
```

### 2.2 Locking Tables During Migration

**The Problem**: Long-running migrations block all queries to the table.

**How Locks Cause Outages**:
```
1. Migration requests ACCESS EXCLUSIVE lock
2. Long-running SELECT holds ACCESS SHARE lock
3. Migration waits for SELECT to finish
4. ALL new queries queue behind migration
5. Application appears frozen → Outage
```

**Dangerous Operations**:
```javascript
// DANGEROUS: Creates index with SHARE lock (blocks all writes)
exports.up = function(knex) {
  return knex.schema.alterTable('orders', (table) => {
    table.index('customer_id'); // Blocks writes until complete
  });
};
```

**Prevention with CONCURRENTLY**:
```javascript
// SAFE: Create index concurrently
exports.up = function(knex) {
  return knex.raw(`
    CREATE INDEX CONCURRENTLY idx_orders_customer_id 
    ON orders(customer_id)
  `);
};

// Note: CONCURRENTLY cannot run inside a transaction
exports.config = { transaction: false };
```

**Lock Timeout Protection**:
```javascript
exports.up = async function(knex) {
  // Fail fast if can't get lock
  await knex.raw('SET lock_timeout = \'2s\'');
  
  try {
    await knex.schema.alterTable('users', (table) => {
      table.string('new_column');
    });
  } catch (error) {
    if (error.message.includes('lock timeout')) {
      console.log('Could not acquire lock, retry later');
      throw error;
    }
    throw error;
  }
};
```

### 2.3 Missing Down Migrations

**The Problem**: No rollback path when something goes wrong.

**Symptoms**:
- `knex migrate:rollback` fails
- Manual intervention required for recovery
- Inconsistent state between environments

**Common Causes**:
```javascript
// Missing down function
exports.up = function(knex) {
  return knex.schema.createTable('new_feature', (table) => {
    table.increments('id');
    table.string('name');
  });
};

// exports.down = ???  // Developer forgot this
```

**Best Practice**:
```javascript
// Always include down, even if it's a no-op
exports.up = function(knex) {
  return knex.schema.createTable('new_feature', (table) => {
    table.increments('id');
    table.string('name');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('new_feature');
};

// For truly irreversible migrations, document why:
exports.down = function(knex) {
  // This migration cannot be reversed because:
  // - Data transformation is not reversible
  // - Use database backup to restore if needed
  throw new Error('Irreversible migration - restore from backup');
};
```

### 2.4 Data Loss During Migration

**The Problem**: Migration logic destroys or corrupts existing data.

**Common Scenarios**:

1. **Column type change truncates data**:
```javascript
// DANGEROUS: VARCHAR(255) → VARCHAR(50) truncates data
exports.up = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.string('name', 50).alter(); // Silently truncates!
  });
};
```

2. **Default value overwrites data**:
```javascript
// DANGEROUS: May overwrite existing values
exports.up = function(knex) {
  return knex.raw(`
    ALTER TABLE users 
    ALTER COLUMN status SET DEFAULT 'active'
  `);
  // If combined with UPDATE, could overwrite intentional NULL values
};
```

3. **Cascading deletes**:
```javascript
// DANGEROUS: FK with CASCADE deletes child records
exports.up = function(knex) {
  return knex.schema.alterTable('orders', (table) => {
    table.foreign('user_id')
      .references('users.id')
      .onDelete('CASCADE'); // Deletes all orders if user deleted!
  });
};
```

**Prevention**:
- [ ] Test migrations against production-sized data
- [ ] Verify row counts before and after
- [ ] Check for NULL values and edge cases
- [ ] Use `RESTRICT` instead of `CASCADE` by default
- [ ] Archive data before transformations

### 2.5 Untested Migrations

**The Problem**: Migrations that work in development fail in production.

**Why Development ≠ Production**:
- Different data volumes (100 rows vs 100M rows)
- Different data patterns (clean vs dirty data)
- Different constraints (production has data that violates new constraints)
- Different performance characteristics

**Statistics**:
- According to a 2024 Stack Overflow survey, 64% of teams using migration tools encountered fewer production failures when testing properly
- PostgreSQL migrations can take milliseconds on small tables but hours on large ones

**Prevention**:
```bash
# Test against production-like data
pg_dump --schema-only production_db > schema.sql
pg_dump --data-only --table=sample_table production_db > sample.sql

# Or use Database Lab Engine for instant clones
dle clone --source production --target test_migration
```

### 2.6 Running Migrations Manually in Production

**The Problem**: Manual execution bypasses safety checks and audit trails.

**Risks of Manual Execution**:
- No audit trail of who ran what when
- Inconsistent with CI/CD pipeline
- Typos and human error
- Skipped testing stages
- No automated rollback trigger

**What Happens**:
```bash
# DON'T DO THIS
ssh production-server
cd /app
NODE_ENV=production npx knex migrate:latest
# Fingers crossed...
```

**Problems**:
- If it fails, no automatic rollback
- No notification to team
- Not recorded in deployment history
- May conflict with CI/CD deployment

**Best Practice**: All production migrations through CI/CD:
```yaml
# Only way to run production migrations
deploy-production:
  environment: production
  needs: [test, staging-verify]
  steps:
    - name: Backup
      run: ./backup.sh
    - name: Migrate
      run: npx knex migrate:latest
    - name: Verify
      run: ./verify-migration.sh
    - name: Notify
      run: ./notify-team.sh "Migration complete"
```

---

## 3. Audit Checklist

### 3.1 Migration File Checklist

#### File Structure & Naming
- [ ] Migration files use timestamp prefix (e.g., `20241220143022_`)
- [ ] File names are descriptive (`add_user_email_index` not `update_1`)
- [ ] One logical change per migration file
- [ ] Files are in correct directory (`migrations/` or configured path)

#### Up Function
- [ ] `exports.up` function exists and returns a Promise
- [ ] Uses `knex.schema` methods (not raw SQL unless necessary)
- [ ] Handles errors appropriately
- [ ] Does not contain hardcoded environment-specific values

```javascript
// ✅ Good
exports.up = function(knex) {
  return knex.schema.createTable('tickets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_name').notNullable();
    table.timestamps(true, true);
  });
};

// ❌ Bad - hardcoded values, raw SQL without reason
exports.up = function(knex) {
  return knex.raw(`
    INSERT INTO settings VALUES ('api_key', 'sk-live-abc123')
  `);
};
```

#### Down Function
- [ ] `exports.down` function exists
- [ ] Down function reverses the up function
- [ ] Irreversible migrations throw descriptive error
- [ ] Down function tested

```javascript
// ✅ Good - reversible
exports.down = function(knex) {
  return knex.schema.dropTable('tickets');
};

// ✅ Good - documented irreversible
exports.down = function(knex) {
  throw new Error(
    'Cannot reverse: data transformation from legacy_status to status enum. ' +
    'Restore from backup if rollback needed.'
  );
};

// ❌ Bad - empty down
exports.down = function(knex) {};
```

#### Data Safety
- [ ] No `DROP TABLE` without archiving important data
- [ ] No `DROP COLUMN` on columns with important data
- [ ] Column type changes don't truncate data
- [ ] `NOT NULL` constraints have defaults or data backfill
- [ ] Foreign keys use `RESTRICT` not `CASCADE` (unless intentional)

#### Performance & Locking
- [ ] Large table operations use `CONCURRENTLY` where available
- [ ] Data migrations process in batches
- [ ] `lock_timeout` set for operations on busy tables
- [ ] Index creation uses `CREATE INDEX CONCURRENTLY`

```javascript
// ✅ Good - concurrent index
exports.up = function(knex) {
  return knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_id 
    ON orders(user_id)
  `);
};
exports.config = { transaction: false };

// ❌ Bad - blocks writes
exports.up = function(knex) {
  return knex.schema.table('orders', (t) => t.index('user_id'));
};
```

### 3.2 Migration Process Checklist

#### Version Control
- [ ] All migrations committed to git
- [ ] Migrations included in code review process
- [ ] No migrations modified after being applied to shared environments
- [ ] Migration order matches expected deployment order

#### Testing
- [ ] Migrations tested in CI pipeline
- [ ] Up migration tested
- [ ] Down migration tested
- [ ] Idempotency tested (running twice doesn't error)
- [ ] Tested with production-like data volume
- [ ] Tested with production-like data patterns

#### CI/CD Integration
- [ ] Migrations run automatically in pipeline
- [ ] Pipeline fails if migration fails
- [ ] Staging migrations run before production
- [ ] Production requires approval gate
- [ ] Deployment order: migrate → deploy code

```yaml
# Verify CI config includes:
- Migration test stage
- Staging deployment with migrations
- Production approval requirement
- Rollback procedure documented
```

#### Environment Configuration
- [ ] `knexfile.js` has correct configuration per environment
- [ ] Connection strings use environment variables
- [ ] No credentials hardcoded
- [ ] Migration directory correctly specified

```javascript
// ✅ Good knexfile.js
module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: 'localhost',
      database: 'tickettoken_dev',
    },
    migrations: { directory: './migrations' },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: { directory: './migrations' },
    pool: { min: 2, max: 10 },
  },
};
```

### 3.3 Safeguards Checklist

#### Backup & Recovery
- [ ] Automated backup before production migrations
- [ ] Backup tested and verified restorable
- [ ] Point-in-time recovery enabled (PostgreSQL WAL archiving)
- [ ] Backup retention policy documented
- [ ] Recovery time objective (RTO) defined

```bash
# Verify backup exists and is recent
pg_dump -Fc production_db > backup_$(date +%Y%m%d_%H%M%S).dump

# Test restore
pg_restore -d test_restore backup.dump
```

#### Monitoring & Alerting
- [ ] Database monitoring in place (connections, locks, query time)
- [ ] Alerts for long-running queries during migration
- [ ] Error rate monitoring after deployment
- [ ] Deployment notification to team

#### Access Control
- [ ] Migration credentials are separate from application credentials
- [ ] Production database access limited to CI/CD service account
- [ ] No developer direct access to production database
- [ ] Audit logging enabled for DDL statements

```sql
-- PostgreSQL: Check for DDL audit logging
SHOW log_statement;  -- Should be 'ddl' or 'all'
```

#### Rollback Readiness
- [ ] Rollback procedure documented
- [ ] Rollback tested in staging
- [ ] Team knows who can authorize rollback
- [ ] Communication plan for rollback scenario

### 3.4 Knex-Specific Checks

#### Configuration
```bash
# Verify knex is properly configured
npx knex migrate:status

# Expected output shows all migrations and their status
```

- [ ] `knex_migrations` table exists in database
- [ ] `knex_migrations_lock` table exists
- [ ] Migration directory matches knexfile.js configuration
- [ ] TypeScript configuration correct (if using TS)

#### Commands Knowledge
```bash
# Essential commands team should know:
npx knex migrate:make <name>    # Create new migration
npx knex migrate:latest         # Run pending migrations
npx knex migrate:rollback       # Rollback last batch
npx knex migrate:rollback --all # Rollback all
npx knex migrate:status         # Show migration status
npx knex migrate:list           # List migrations
```

#### Transaction Handling
- [ ] Migrations run in transactions by default
- [ ] `CREATE INDEX CONCURRENTLY` migrations disable transactions
- [ ] Long-running data migrations consider transaction scope

```javascript
// Disable transaction for concurrent operations
exports.up = function(knex) {
  return knex.raw('CREATE INDEX CONCURRENTLY ...');
};
exports.config = { transaction: false };
```

### 3.5 PostgreSQL-Specific Checks

#### Lock Safety
- [ ] `lock_timeout` configured for DDL operations
- [ ] No `ACCESS EXCLUSIVE` locks held for extended periods
- [ ] Index creation uses `CONCURRENTLY`
- [ ] Long-running queries monitored during migrations

```sql
-- Check for blocking queries before migration
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '5 minutes';

-- Check for locks during migration
SELECT relation::regclass, mode, granted
FROM pg_locks
WHERE NOT granted;
```

#### Data Types
- [ ] Use appropriate PostgreSQL types (UUID, JSONB, TIMESTAMPTZ)
- [ ] Consider using `SERIAL` vs `IDENTITY` (PG 10+)
- [ ] Enum types created via `CREATE TYPE` not CHECK constraints
- [ ] Arrays and JSONB indexed appropriately

```javascript
// ✅ Good - PostgreSQL-native types
exports.up = function(knex) {
  return knex.schema.createTable('events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.specificType('tags', 'text[]');
    table.jsonb('metadata');
    table.timestamp('event_date', { useTz: true });
  });
};
```

#### Extensions
- [ ] Required extensions enabled (`uuid-ossp`, `pgcrypto`, etc.)
- [ ] Extension availability verified before migration

```javascript
// Enable required extension
exports.up = async function(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  // Now can use gen_random_uuid()
};
```

---

## 4. Verification Commands

### Migration Status
```bash
# Check current migration status
npx knex migrate:status

# List pending migrations
npx knex migrate:list

# Check migration table directly
psql $DATABASE_URL -c "SELECT * FROM knex_migrations ORDER BY id;"
```

### Test Migrations
```bash
# Test full migration cycle
npx knex migrate:rollback --all
npx knex migrate:latest
npx knex migrate:rollback --all

# Run in test environment
NODE_ENV=test npx knex migrate:latest
```

### Database Locks (PostgreSQL)
```sql
-- Check for active locks
SELECT 
  pg_stat_activity.pid,
  pg_locks.mode,
  pg_locks.granted,
  pg_stat_activity.query,
  pg_stat_activity.query_start
FROM pg_locks
JOIN pg_stat_activity ON pg_locks.pid = pg_stat_activity.pid
WHERE NOT pg_locks.granted;

-- Check blocking queries
SELECT 
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_locks blocked_locks ON blocked.pid = blocked_locks.pid
JOIN pg_locks blocking_locks ON blocked_locks.locktype = blocking_locks.locktype
  AND blocked_locks.relation = blocking_locks.relation
  AND blocked_locks.pid != blocking_locks.pid
JOIN pg_stat_activity blocking ON blocking_locks.pid = blocking.pid
WHERE NOT blocked_locks.granted;
```

### Data Integrity Verification
```sql
-- Check row counts before/after migration
SELECT schemaname, relname, n_live_tup 
FROM pg_stat_user_tables 
ORDER BY n_live_tup DESC;

-- Check for NULL values in NOT NULL columns
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'your_table';

-- Check foreign key integrity
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE contype = 'f';
```

### Backup Verification
```bash
# Create backup
pg_dump -Fc $DATABASE_URL > backup.dump

# Verify backup is valid
pg_restore -l backup.dump

# Test restore to separate database
createdb restore_test
pg_restore -d restore_test backup.dump
```

---

## 5. Sources

### Official Documentation

1. **Knex.js Migrations Documentation**  
   https://knexjs.org/guide/migrations

2. **PostgreSQL Explicit Locking Documentation**  
   https://www.postgresql.org/docs/current/explicit-locking.html

3. **Martin Fowler: Evolutionary Database Design**  
   https://martinfowler.com/articles/evodb.html

### Migration Versioning & Best Practices

4. **Liquibase: Database Version Control Guide**  
   https://www.liquibase.com/resources/guides/database-version-control

5. **Enterprise Craftsmanship: Database Versioning Best Practices**  
   https://enterprisecraftsmanship.com/posts/database-versioning-best-practices/

6. **Prisma: What Are Database Migrations**  
   https://www.prisma.io/dataguide/types/relational/what-are-database-migrations

7. **Liquibase: Database Schema Migration Guide**  
   https://www.liquibase.com/resources/guides/database-schema-migration

### Zero-Downtime Migrations

8. **pgroll: PostgreSQL Zero-Downtime Migrations (GitHub)**  
   https://github.com/xataio/pgroll

9. **Xata: Introducing pgroll for Zero-Downtime Migrations**  
   https://xata.io/blog/pgroll-schema-migrations-postgres

10. **Xata: Expand-Contract Pattern with pgroll**  
    https://xata.io/blog/pgroll-expand-contract

11. **Neon: Zero Downtime Migrations with pgroll**  
    https://neon.com/guides/pgroll

12. **DEV Community: Expand and Contract Pattern**  
    https://dev.to/jp_fontenele4321/the-expand-and-contract-pattern-for-zero-downtime-migrations-445m

### PostgreSQL Locking & Performance

13. **Citus Data: 7 Tips for Dealing with Postgres Locks**  
    https://www.citusdata.com/blog/2018/02/22/seven-tips-for-dealing-with-postgres-locks/

14. **Citus Data: PostgreSQL Rocks, Except When It Blocks**  
    https://www.citusdata.com/blog/2018/02/15/when-postgresql-blocks/

15. **Xata: Schema Changes and the Postgres Lock Queue**  
    https://xata.io/blog/migrations-and-exclusive-locks

16. **PostgresAI: Zero-Downtime Migrations Need lock_timeout**  
    https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries

17. **depesz: How to Run Short ALTER TABLE Without Long Locking**  
    https://www.depesz.com/2019/09/26/how-to-run-short-alter-table-without-long-locking-concurrent-queries/

### Rollback Strategies

18. **Atlas: The Hard Truth About GitOps and Database Rollbacks**  
    https://atlasgo.io/blog/2024/11/14/the-hard-truth-about-gitops-and-db-rollbacks

19. **Atlas: The Myth of Down Migrations**  
    https://atlasgo.io/blog/2024/04/01/migrate-down

20. **Liquibase: Database Rollbacks in DevOps**  
    https://www.liquibase.com/blog/database-rollbacks-the-devops-approach-to-rolling-back-and-fixing-forward

21. **Harness: Database Rollback Strategies in DevOps**  
    https://www.harness.io/harness-devops-academy/database-rollback-strategies-in-devops

22. **Flyway: Implementing a Rollback Strategy**  
    https://documentation.red-gate.com/fd/implementing-a-roll-back-strategy-138347142.html

### Testing & CI/CD

23. **PostgresAI: Database Migration Testing in CI/CD**  
    https://postgres.ai/products/database-migration-testing

24. **DEV Community: Automate Database Migration Testing in CI/CD**  
    https://dev.to/joeauty/how-to-automate-database-migration-testingdry-runs-in-your-cicd-pipelines-549d

25. **Stonetusker: Automating Database Migrations in CI/CD**  
    https://stonetusker.com/automating-database-migrations-in-your-ci-cd-pipeline/

### Data Loss Prevention

26. **Quartilex: Minimising Data Loss During Database Migration**  
    https://www.quartilex.com/blog/minimising-data-loss-database-migration-essential-steps

27. **Monte Carlo Data: Data Migration Risks Checklist**  
    https://www.montecarlodata.com/blog-data-migration-risks-checklist/

28. **Cloudficient: How To Handle Data Loss During Migration**  
    https://www.cloudficient.com/blog/how-to-handle-data-loss-during-migration

### Knex.js Specific

29. **Heady.io: Knex Migration with PostgreSQL**  
    https://www.heady.io/blog/knex-migration-for-schema-and-seeds-with-postgresql

30. **Traveling Coderman: Knex.js Schema Migrations**  
    https://traveling-coderman.net/code/node-architecture/schema-migrations/

31. **Michael Herman: Test Driven Development with Knex**  
    https://mherman.org/blog/test-driven-development-with-node/

---

## Implementation Priority

### Phase 1: Foundation (Week 1)
- [ ] Audit existing migration files for down functions
- [ ] Set up migration testing in CI/CD
- [ ] Document rollback procedures
- [ ] Enable database backups before migrations
- [ ] Configure `lock_timeout` in migrations

### Phase 2: Safety (Week 2)
- [ ] Add pre-migration backup step to deployment
- [ ] Implement migration testing against staging data
- [ ] Add deployment approval gates for production
- [ ] Create migration review checklist for PRs
- [ ] Document expand-contract pattern for team

### Phase 3: Monitoring (Week 3-4)
- [ ] Set up lock monitoring during migrations
- [ ] Add migration duration tracking
- [ ] Create alerting for failed migrations
- [ ] Implement post-deployment verification checks
- [ ] Train team on zero-downtime migration patterns

---

*Document Version: 1.0*  
*Last Updated: December 2024*  
*Next Review: March 2025*