# Database Migration Guide

**AUDIT FIX #76: Document migration best practices**

This guide documents the migration standards and best practices for the blockchain-service.

## Table of Contents

1. [Migration File Structure](#migration-file-structure)
2. [Naming Convention](#naming-convention)
3. [Best Practices](#best-practices)
4. [Safety Settings](#safety-settings)
5. [Large Table Operations](#large-table-operations)
6. [Rollback Procedures](#rollback-procedures)
7. [Existing Migrations](#existing-migrations)
8. [Examples](#examples)

---

## Migration File Structure

Each migration file must export two functions:

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Apply migration
}

export async function down(knex: Knex): Promise<void> {
  // Rollback migration
}
```

## Naming Convention

**AUDIT FIX #65: Document migration naming convention**

### New Migrations: Timestamp-Based (Preferred)

**All new migrations should use timestamp-based naming:**

```
YYYYMMDDHHMMSS_description.ts
```

Where:
- `YYYYMMDDHHMMSS` = Full timestamp (year, month, day, hour, minute, second)
- `description` = Snake_case description of the change

**Examples:**
- `20260102120000_add_wallet_indexes.ts`
- `20260102143000_fix_foreign_key_actions.ts`
- `20260103091500_add_soft_delete_columns.ts`

### Generating Timestamps

Use this command to generate a properly formatted timestamp:

```bash
# Bash/Linux/Mac
date +%Y%m%d%H%M%S

# Node.js one-liner
node -e "console.log(new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14))"

# Or use the helper script (if available)
npm run migration:generate -- add_new_feature
```

### Helper Script for Generating Migrations

Create a file `scripts/generate-migration.sh`:

```bash
#!/bin/bash
# Generate a new migration file with timestamp
# Usage: ./scripts/generate-migration.sh description_name

TIMESTAMP=$(date +%Y%m%d%H%M%S)
NAME=${1:-new_migration}
FILENAME="src/migrations/${TIMESTAMP}_${NAME}.ts"

cat > "$FILENAME" << 'EOF'
/**
 * Migration: DESCRIPTION
 * 
 * Changes:
 * - TODO: Describe changes
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Set safety timeout
  await knex.raw('SET lock_timeout = \'10s\'');
  
  // TODO: Add migration logic
}

export async function down(knex: Knex): Promise<void> {
  // TODO: Add rollback logic
}
EOF

echo "Created migration: $FILENAME"
```

### Historical Migrations: Sequential Numbers

**Existing migrations use sequential numbering (001, 002, etc.):**

```
XXX_description.ts
```

Where:
- `XXX` = Sequential number (001, 002, 003...)
- `description` = Snake_case description of the change

**Historical Examples (DO NOT RENAME):**
- `001_baseline.ts` - Initial schema
- `002_add_rls_force_and_fix_tenant_defaults.ts` - RLS policies
- `003_add_check_constraints.ts` - CHECK constraints
- `004_add_migration_safety.ts` - Migration safety settings
- `005_add_wallet_soft_delete_columns.ts` - Soft delete support
- `006_add_partial_unique_indexes.ts` - Partial unique indexes
- `007_fix_foreign_key_actions.ts` - CASCADE → RESTRICT
- `008_ensure_extensions.ts` - uuid-ossp and pgcrypto

**⚠️ Important:** Never rename or modify historical migrations. They have already been deployed to production.

### Why Timestamp-Based?

1. **Prevents conflicts:** Multiple developers can create migrations simultaneously
2. **Clear ordering:** Timestamps ensure consistent execution order
3. **Git-friendly:** No merge conflicts on migration numbers
4. **Auditability:** Know exactly when a migration was created

## Best Practices

### 1. One Change Per Migration

**Do:**
```typescript
// 005_add_wallet_balance_index.ts
export async function up(knex: Knex) {
  await knex.schema.table('wallets', table => {
    table.index('balance');
  });
}
```

**Don't:**
```typescript
// BAD: Multiple unrelated changes
export async function up(knex: Knex) {
  await knex.schema.table('wallets', table => {
    table.index('balance');
  });
  await knex.schema.table('tickets', table => {
    table.index('status');
  });
  // Adding column to different table
  await knex.schema.table('events', table => {
    table.string('venue_address');
  });
}
```

### 2. Never Modify Existing Migrations

Once a migration has been run in any environment:
- **DO NOT** modify its content
- **DO NOT** rename it
- **DO NOT** delete it

If you need to change something, create a new migration.

### 3. Always Include Rollback Logic

```typescript
export async function down(knex: Knex) {
  // Undo exactly what up() did
  await knex.schema.table('wallets', table => {
    table.dropIndex('balance');
  });
}
```

### 4. Use RETURNING Clauses

All INSERT/UPDATE operations should return the affected rows:

```typescript
// Use db-operations.ts helper
import { insertReturning } from '../utils/db-operations';

const wallet = await insertReturning(knex, 'wallets', {
  address: 'abc123...',
  tenant_id: tenantId,
  balance: 0
});
```

### 5. Validate Data Before Migration

```typescript
export async function up(knex: Knex) {
  // Check preconditions
  const count = await knex('tickets')
    .whereNull('tenant_id')
    .count('* as count')
    .first();
  
  if (Number(count?.count) > 0) {
    throw new Error('Cannot add NOT NULL constraint: NULL tenant_id values exist');
  }
  
  // Now safe to add constraint
  await knex.schema.alterTable('tickets', table => {
    table.uuid('tenant_id').notNullable().alter();
  });
}
```

## Safety Settings

### Lock Timeout

Prevent migrations from hanging indefinitely waiting for locks:

```typescript
import { applyMigrationSafetySettings } from './004_add_migration_safety';

export async function up(knex: Knex) {
  // Apply safety settings
  await applyMigrationSafetySettings(knex);
  
  // Or manually:
  await knex.raw('SET lock_timeout = ?', ['10s']);
  await knex.raw('SET statement_timeout = ?', ['60s']);
  
  // Now run migration...
}
```

### knexfile.ts Configuration

Add default safety settings in knexfile.ts:

```typescript
// knexfile.ts
export default {
  client: 'postgresql',
  connection: { /* ... */ },
  pool: {
    min: 2,
    max: 10,
    afterCreate: (conn: any, done: Function) => {
      // Set session-level timeouts for migrations
      conn.query('SET lock_timeout = \'10s\'', (err: Error) => {
        if (err) done(err, conn);
        else {
          conn.query('SET statement_timeout = \'60s\'', (err: Error) => {
            done(err, conn);
          });
        }
      });
    }
  },
  migrations: {
    directory: './src/migrations',
    tableName: 'knex_migrations'
  }
};
```

## Large Table Operations

For tables with >1M rows, use these patterns:

### Creating Indexes CONCURRENTLY

```typescript
import { createIndexConcurrently } from './004_add_migration_safety';

export async function up(knex: Knex) {
  // This runs outside a transaction, doesn't block reads/writes
  await createIndexConcurrently(
    knex,
    'tickets',
    'idx_tickets_tenant_status',
    ['tenant_id', 'status']
  );
}

export async function down(knex: Knex) {
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_tickets_tenant_status');
}
```

### Adding NOT NULL Columns

```typescript
export async function up(knex: Knex) {
  // Step 1: Add nullable column
  await knex.schema.alterTable('tickets', table => {
    table.timestamp('verified_at').nullable();
  });
  
  // Step 2: Backfill in batches (for large tables)
  let updated = 0;
  do {
    const result = await knex.raw(`
      UPDATE tickets
      SET verified_at = created_at
      WHERE verified_at IS NULL
      AND id IN (
        SELECT id FROM tickets WHERE verified_at IS NULL LIMIT 10000
      )
    `);
    updated = result.rowCount;
    // Small delay to reduce lock pressure
    if (updated > 0) await new Promise(r => setTimeout(r, 100));
  } while (updated > 0);
  
  // Step 3: Add NOT NULL constraint
  await knex.schema.alterTable('tickets', table => {
    table.timestamp('verified_at').notNullable().alter();
  });
}
```

### Batch Updates

```typescript
// For updating millions of rows
async function batchUpdate(
  knex: Knex,
  table: string,
  batchSize: number = 10000
) {
  let totalUpdated = 0;
  let batchUpdated = 0;
  
  do {
    const result = await knex.raw(`
      WITH batch AS (
        SELECT id FROM ${table}
        WHERE needs_update = true
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ${table} SET
        needs_update = false,
        updated_at = NOW()
      WHERE id IN (SELECT id FROM batch)
      RETURNING id
    `);
    
    batchUpdated = result.rows.length;
    totalUpdated += batchUpdated;
    
    console.log(`Updated ${totalUpdated} rows...`);
    
    // Yield to other operations
    if (batchUpdated > 0) {
      await new Promise(r => setTimeout(r, 50));
    }
  } while (batchUpdated > 0);
  
  return totalUpdated;
}
```

## Rollback Procedures

### Standard Rollback

```bash
# Rollback last migration
npx knex migrate:down

# Rollback specific migration
npx knex migrate:down --name 003_add_check_constraints.ts

# Rollback all migrations
npx knex migrate:rollback --all
```

### Emergency Rollback

If a migration failed partway through:

```sql
-- 1. Check current state
SELECT * FROM knex_migrations ORDER BY id DESC LIMIT 5;

-- 2. Remove failed migration record (if transaction rolled back)
DELETE FROM knex_migrations WHERE name = '003_add_check_constraints.ts';

-- 3. Remove migration lock
DELETE FROM knex_migrations_lock WHERE is_locked = 1;

-- 4. Manually verify/clean up partial changes
-- (depends on what the migration did)
```

### Canary Deployments

For critical migrations:

```bash
# 1. Run on staging first
NODE_ENV=staging npx knex migrate:latest

# 2. Verify
psql -c "SELECT * FROM migration_config;"

# 3. Run on production with DRYRUN
NODE_ENV=production DRY_RUN=true npx knex migrate:latest

# 4. Actually run
NODE_ENV=production npx knex migrate:latest
```

## Existing Migrations

### 001_baseline.ts
**Note:** Contains 6 tables (not ideal but historical)

Tables created:
- `blockchain_transactions` - NFT minting/transfer records
- `wallets` - User/treasury wallet records  
- `nft_mints` - Detailed minting job records
- `idempotency_keys` - Request deduplication
- `rate_limits` - Per-tenant rate limiting
- `audit_logs` - Operation audit trail

**DO NOT MODIFY** - This migration has been deployed.

### 002_add_rls_force_and_fix_tenant_defaults.ts
- Adds RLS policies to all tables
- Enforces tenant isolation
- Sets FORCE ROW LEVEL SECURITY

### 003_add_check_constraints.ts
- Adds CHECK constraints for data validation
- Status enum validation
- Amount non-negativity
- Solana address length validation

### 004_add_migration_safety.ts
- Adds migration safety helper functions
- Creates migration_config table
- Documents recommended timeouts

## Examples

### Adding a New Column

```typescript
// 005_add_wallet_label.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('SET lock_timeout = ?', ['10s']);
  
  await knex.schema.alterTable('wallets', table => {
    table.string('label', 100).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('wallets', table => {
    table.dropColumn('label');
  });
}
```

### Adding an Index

```typescript
// 006_add_transaction_signature_index.ts
import { Knex } from 'knex';
import { createIndexConcurrently, dropIndexConcurrently } from './004_add_migration_safety';

export async function up(knex: Knex): Promise<void> {
  await createIndexConcurrently(
    knex,
    'blockchain_transactions',
    'idx_blockchain_tx_signature',
    'transaction_signature'
  );
}

export async function down(knex: Knex): Promise<void> {
  await dropIndexConcurrently(knex, 'idx_blockchain_tx_signature');
}
```

### Adding a CHECK Constraint

```typescript
// 007_add_balance_check.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('SET lock_timeout = ?', ['10s']);
  
  await knex.raw(`
    ALTER TABLE wallets
    ADD CONSTRAINT chk_wallets_balance_positive
    CHECK (balance >= 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE wallets
    DROP CONSTRAINT IF EXISTS chk_wallets_balance_positive
  `);
}
```

### Renaming a Column

```typescript
// 008_rename_user_wallet_to_owner_wallet.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('SET lock_timeout = ?', ['10s']);
  
  await knex.schema.alterTable('tickets', table => {
    table.renameColumn('user_wallet', 'owner_wallet');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tickets', table => {
    table.renameColumn('owner_wallet', 'user_wallet');
  });
}
```

---

## Quick Reference

| Operation | Lock Level | Time | Approach |
|-----------|-----------|------|----------|
| Add nullable column | ACCESS EXCLUSIVE | Fast | Direct |
| Add NOT NULL column | ACCESS EXCLUSIVE | Depends on data | Backfill first |
| Add index | SHARE | Can be slow | Use CONCURRENTLY |
| Add CHECK constraint | ACCESS EXCLUSIVE | Can be slow | Validate data first |
| Drop column | ACCESS EXCLUSIVE | Fast | Direct |
| Rename column | ACCESS EXCLUSIVE | Fast | Direct |
| Add foreign key | SHARE ROW EXCLUSIVE | Can be slow | NOT VALID first |

---

## Contact

For migration questions, contact the platform engineering team.
