/**
 * Migration: Add Migration Safety Settings
 * 
 * AUDIT FIX #77: Add lock_timeout to migrations
 * 
 * This migration sets up safe defaults for all future migrations:
 * - lock_timeout: Prevents migrations from hanging waiting for locks
 * - statement_timeout: Prevents runaway queries from blocking
 * 
 * These settings are applied per-session when migrations run.
 * 
 * NOTE: This migration doesn't create any tables - it's a template
 * showing how to apply safety settings. The actual settings should
 * be applied in knexfile.ts pool configuration.
 */

import { Knex } from 'knex';

/**
 * Apply migration safety timeouts
 * 
 * IMPORTANT: These should be called at the start of any migration
 * that modifies schema or adds indexes on large tables.
 */
export async function applyMigrationSafetySettings(knex: Knex): Promise<void> {
  // Prevent migrations from waiting more than 10 seconds for locks
  // AUDIT FIX #77: Add lock_timeout
  await knex.raw('SET lock_timeout = ?', ['10s']);
  
  // Prevent any single statement from running more than 60 seconds
  // This catches runaway index builds or table scans
  await knex.raw('SET statement_timeout = ?', ['60s']);
  
  // Use NOWAIT by default to fail fast if lock not available
  // This can be overridden per-query if needed
  // await knex.raw('SET lock_timeout TO 0'); // NOWAIT mode
}

/**
 * Remove safety settings (restore defaults)
 */
export async function removeMigrationSafetySettings(knex: Knex): Promise<void> {
  await knex.raw('SET lock_timeout = DEFAULT');
  await knex.raw('SET statement_timeout = DEFAULT');
}

export async function up(knex: Knex): Promise<void> {
  // Apply safety settings for this migration
  await applyMigrationSafetySettings(knex);

  // Create a migration_config table to store migration metadata
  const tableExists = await knex.schema.hasTable('migration_config');
  
  if (!tableExists) {
    await knex.schema.createTable('migration_config', (table) => {
      table.increments('id').primary();
      table.string('key', 100).notNullable().unique();
      table.text('value').notNullable();
      table.text('description');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    // Insert default migration settings
    await knex('migration_config').insert([
      {
        key: 'lock_timeout',
        value: '10s',
        description: 'Maximum time to wait for database locks during migrations'
      },
      {
        key: 'statement_timeout',
        value: '60s',
        description: 'Maximum execution time for a single migration statement'
      },
      {
        key: 'one_change_per_migration',
        value: 'true',
        description: 'Best practice: Each migration should do one logical change'
      },
      {
        key: 'concurrent_index_threshold',
        value: '1000000',
        description: 'Row count above which indexes should be created CONCURRENTLY'
      }
    ]);
  }

  // Log that migration safety is now configured
  // eslint-disable-next-line no-console
  console.log('Migration safety settings configured');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('migration_config');
  
  // eslint-disable-next-line no-console
  console.log('Migration safety settings removed');
}

/**
 * Helper: Safe ALTER TABLE with timeout
 * 
 * Use this wrapper when altering tables that may have active connections
 */
export async function safeAlterTable(
  knex: Knex,
  tableName: string,
  alterFn: (table: Knex.AlterTableBuilder) => void,
  options: { lockTimeout?: string; statementTimeout?: string } = {}
): Promise<void> {
  const lockTimeout = options.lockTimeout || '5s';
  const statementTimeout = options.statementTimeout || '30s';

  // Save current settings
  const [lockResult] = await knex.raw('SHOW lock_timeout');
  const [stmtResult] = await knex.raw('SHOW statement_timeout');
  const originalLock = lockResult?.lock_timeout;
  const originalStmt = stmtResult?.statement_timeout;

  try {
    // Apply safe timeouts
    await knex.raw('SET lock_timeout = ?', [lockTimeout]);
    await knex.raw('SET statement_timeout = ?', [statementTimeout]);

    // Perform the alteration
    await knex.schema.alterTable(tableName, alterFn);
  } finally {
    // Restore original settings
    if (originalLock) {
      await knex.raw('SET lock_timeout = ?', [originalLock]);
    }
    if (originalStmt) {
      await knex.raw('SET statement_timeout = ?', [originalStmt]);
    }
  }
}

/**
 * Helper: Create index CONCURRENTLY (non-blocking)
 * 
 * Use this for adding indexes to large tables in production
 * NOTE: Cannot be run inside a transaction
 */
export async function createIndexConcurrently(
  knex: Knex,
  tableName: string,
  indexName: string,
  columns: string | string[],
  options: { unique?: boolean; where?: string } = {}
): Promise<void> {
  const cols = Array.isArray(columns) ? columns.join(', ') : columns;
  const unique = options.unique ? 'UNIQUE' : '';
  const where = options.where ? `WHERE ${options.where}` : '';

  // Check if index already exists
  const indexExists = await knex.raw(`
    SELECT 1 FROM pg_indexes 
    WHERE tablename = ? AND indexname = ?
  `, [tableName, indexName]);

  if (indexExists.rows.length === 0) {
    // CREATE INDEX CONCURRENTLY cannot run inside transaction
    await knex.raw(`
      CREATE ${unique} INDEX CONCURRENTLY IF NOT EXISTS "${indexName}"
      ON "${tableName}" (${cols})
      ${where}
    `);
  }
}

/**
 * Helper: Drop index CONCURRENTLY (non-blocking)
 */
export async function dropIndexConcurrently(
  knex: Knex,
  indexName: string
): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"`);
}
