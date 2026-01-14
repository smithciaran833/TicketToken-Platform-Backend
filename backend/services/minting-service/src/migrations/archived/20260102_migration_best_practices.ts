/**
 * Migration Best Practices
 * 
 * This migration implements several best practices:
 * 1. CREATE INDEX CONCURRENTLY - doesn't lock the table
 * 2. SET lock_timeout - prevents long waits for locks
 * 3. Verify pgcrypto extension for UUID generation
 * 
 * IMPORTANT: CONCURRENTLY indexes cannot be run inside a transaction,
 * so this migration must be run with { transaction: false } in Knex config
 * or executed separately.
 */

import { Knex } from 'knex';

// Default lock timeout (5 seconds) - prevents migrations from waiting too long
const LOCK_TIMEOUT_MS = 5000;

export async function up(knex: Knex): Promise<void> {
  // Set lock_timeout to prevent long waits
  await knex.raw(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);

  // Verify pgcrypto extension is installed (required for gen_random_uuid())
  // This is idempotent - won't error if already exists
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  // Verify uuid-ossp extension (alternative UUID functions)
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Log that we're about to create indexes
  console.log('Creating indexes CONCURRENTLY (may take a moment on large tables)...');

  // NOTE: CONCURRENTLY indexes cannot be created inside a transaction.
  // If running this migration with Knex's default transaction wrapper,
  // these statements will fail. Options:
  // 1. Run this migration separately with { transaction: false }
  // 2. Execute these via raw SQL outside of Knex migrations
  // 3. Comment out and run manually in production

  // The following indexes improve query performance for common lookups.
  // They are created CONCURRENTLY to avoid locking the table during creation.
  
  try {
    // Index on tenant_id for multi-tenant queries (if not exists)
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_tenant_id
      ON mints (tenant_id)
    `);
  } catch (error: any) {
    // CONCURRENTLY indexes fail in transactions - log and continue
    if (error.message.includes('CONCURRENTLY cannot be run inside a transaction')) {
      console.log('Note: idx_mints_tenant_id must be created outside of transaction');
      console.log('Run: CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_tenant_id ON mints (tenant_id);');
    } else {
      console.log(`Index idx_mints_tenant_id: ${error.message}`);
    }
  }

  try {
    // Index on status for filtering by status
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_status
      ON mints (status)
    `);
  } catch (error: any) {
    if (error.message.includes('CONCURRENTLY cannot be run inside a transaction')) {
      console.log('Note: idx_mints_status must be created outside of transaction');
      console.log('Run: CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_status ON mints (status);');
    } else {
      console.log(`Index idx_mints_status: ${error.message}`);
    }
  }

  try {
    // Composite index for common query pattern: tenant + status
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_tenant_status
      ON mints (tenant_id, status)
    `);
  } catch (error: any) {
    if (error.message.includes('CONCURRENTLY cannot be run inside a transaction')) {
      console.log('Note: idx_mints_tenant_status must be created outside of transaction');
      console.log('Run: CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_tenant_status ON mints (tenant_id, status);');
    } else {
      console.log(`Index idx_mints_tenant_status: ${error.message}`);
    }
  }

  try {
    // Index on created_at for time-based queries
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_created_at
      ON mints (created_at DESC)
    `);
  } catch (error: any) {
    if (error.message.includes('CONCURRENTLY cannot be run inside a transaction')) {
      console.log('Note: idx_mints_created_at must be created outside of transaction');
      console.log('Run: CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_created_at ON mints (created_at DESC);');
    } else {
      console.log(`Index idx_mints_created_at: ${error.message}`);
    }
  }

  try {
    // Index on ticket_id for lookups
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_ticket_id
      ON mints (ticket_id)
    `);
  } catch (error: any) {
    if (error.message.includes('CONCURRENTLY cannot be run inside a transaction')) {
      console.log('Note: idx_mints_ticket_id must be created outside of transaction');
      console.log('Run: CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_ticket_id ON mints (ticket_id);');
    } else {
      console.log(`Index idx_mints_ticket_id: ${error.message}`);
    }
  }

  try {
    // Index on asset_id for blockchain lookups (partial - only where asset_id is not null)
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_asset_id
      ON mints (asset_id)
      WHERE asset_id IS NOT NULL
    `);
  } catch (error: any) {
    if (error.message.includes('CONCURRENTLY cannot be run inside a transaction')) {
      console.log('Note: idx_mints_asset_id must be created outside of transaction');
      console.log('Run: CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_asset_id ON mints (asset_id) WHERE asset_id IS NOT NULL;');
    } else {
      console.log(`Index idx_mints_asset_id: ${error.message}`);
    }
  }

  console.log('Index creation completed (check logs for any that need manual creation)');

  // Reset lock_timeout to default
  await knex.raw('SET lock_timeout = DEFAULT');
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes (CONCURRENTLY for safety, though drops are usually fast)
  try {
    await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_mints_tenant_id');
  } catch (error: any) {
    console.log(`idx_mints_tenant_id: ${error.message}`);
  }

  try {
    await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_mints_status');
  } catch (error: any) {
    console.log(`idx_mints_status: ${error.message}`);
  }

  try {
    await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_mints_tenant_status');
  } catch (error: any) {
    console.log(`idx_mints_tenant_status: ${error.message}`);
  }

  try {
    await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_mints_created_at');
  } catch (error: any) {
    console.log(`idx_mints_created_at: ${error.message}`);
  }

  try {
    await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_mints_ticket_id');
  } catch (error: any) {
    console.log(`idx_mints_ticket_id: ${error.message}`);
  }

  try {
    await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_mints_asset_id');
  } catch (error: any) {
    console.log(`idx_mints_asset_id: ${error.message}`);
  }

  // Note: We don't drop pgcrypto or uuid-ossp as other parts of the DB might use them
  console.log('Note: pgcrypto and uuid-ossp extensions not dropped - may be used by other schemas');
}

/**
 * SQL script for manual execution (in case CONCURRENTLY fails in transaction):
 * 
 * -- Run this outside of a transaction:
 * 
 * SET lock_timeout = '5000ms';
 * 
 * CREATE EXTENSION IF NOT EXISTS pgcrypto;
 * CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
 * 
 * CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_tenant_id ON mints (tenant_id);
 * CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_status ON mints (status);
 * CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_tenant_status ON mints (tenant_id, status);
 * CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_created_at ON mints (created_at DESC);
 * CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_ticket_id ON mints (ticket_id);
 * CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mints_asset_id ON mints (asset_id) WHERE asset_id IS NOT NULL;
 * 
 * SET lock_timeout = DEFAULT;
 */
