/**
 * MIGRATION HELPERS
 * 
 * Fixes Batch 11 audit findings:
 * - CONCURRENTLY: Safe index creation without blocking
 * - Idempotent operations
 * - Proper error handling
 */

import { Pool, PoolClient } from 'pg';
import { logger } from './logger';

const log = logger.child({ component: 'MigrationHelpers' });

// =============================================================================
// INDEX CREATION WITH CONCURRENTLY (Batch 11 Fix #3)
// =============================================================================

export interface CreateIndexOptions {
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
  where?: string;           // Partial index condition
  using?: string;           // Index type (btree, hash, gin, gist, etc.)
  concurrently?: boolean;   // Use CONCURRENTLY (recommended for production)
  ifNotExists?: boolean;    // Skip if index already exists
}

/**
 * Create an index with CONCURRENTLY option for zero-downtime migrations.
 * 
 * IMPORTANT: CONCURRENTLY cannot be run inside a transaction.
 * This function should be called outside of the main migration transaction.
 * 
 * @param pool - Database connection pool
 * @param options - Index creation options
 */
export async function createIndex(
  pool: Pool,
  options: CreateIndexOptions
): Promise<void> {
  const {
    name,
    table,
    columns,
    unique = false,
    where,
    using = 'btree',
    concurrently = true,
    ifNotExists = true,
  } = options;

  // Check if index already exists
  if (ifNotExists) {
    const checkResult = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
      [name]
    );
    if (checkResult.rows.length > 0) {
      log.info(`Index ${name} already exists, skipping`, { table, columns });
      return;
    }
  }

  // Build CREATE INDEX statement
  const parts = ['CREATE'];
  
  if (unique) {
    parts.push('UNIQUE');
  }
  
  parts.push('INDEX');
  
  if (concurrently) {
    parts.push('CONCURRENTLY');
  }
  
  if (ifNotExists && !concurrently) {
    // IF NOT EXISTS cannot be used with CONCURRENTLY, so we check manually above
    parts.push('IF NOT EXISTS');
  }
  
  parts.push(name);
  parts.push('ON');
  parts.push(table);
  
  if (using !== 'btree') {
    parts.push(`USING ${using}`);
  }
  
  parts.push(`(${columns.join(', ')})`);
  
  if (where) {
    parts.push(`WHERE ${where}`);
  }

  const sql = parts.join(' ');
  
  log.info(`Creating index: ${name}`, { 
    table, 
    columns, 
    unique, 
    concurrently,
    sql,
  });

  try {
    // CONCURRENTLY cannot be run inside a transaction
    // It also cannot be canceled easily, so we set a longer timeout
    await pool.query(`SET statement_timeout = '600000'`);  // 10 minutes
    await pool.query(sql);
    await pool.query(`RESET statement_timeout`);
    
    log.info(`Index ${name} created successfully`);
  } catch (error) {
    log.error(`Failed to create index ${name}`, { error });
    
    // If CONCURRENTLY failed, it may have left an invalid index
    // Check and drop if needed
    if (concurrently) {
      const invalidCheck = await pool.query(
        `SELECT 1 FROM pg_index WHERE NOT indisvalid AND indexrelid = $1::regclass`,
        [`${table}_${name}`]
      ).catch(() => ({ rows: [] }));
      
      if (invalidCheck.rows.length > 0) {
        log.warn(`Dropping invalid index ${name}`);
        await pool.query(`DROP INDEX IF EXISTS ${name}`);
      }
    }
    
    throw error;
  }
}

/**
 * Drop an index safely
 */
export async function dropIndex(
  pool: Pool,
  name: string,
  options: { concurrently?: boolean; ifExists?: boolean } = {}
): Promise<void> {
  const { concurrently = true, ifExists = true } = options;
  
  const parts = ['DROP INDEX'];
  
  if (concurrently) {
    parts.push('CONCURRENTLY');
  }
  
  if (ifExists) {
    parts.push('IF EXISTS');
  }
  
  parts.push(name);
  
  const sql = parts.join(' ');
  
  log.info(`Dropping index: ${name}`, { sql });
  await pool.query(sql);
  log.info(`Index ${name} dropped`);
}

// =============================================================================
// SAFE MIGRATION UTILITIES
// =============================================================================

/**
 * Execute SQL only if a table exists
 */
export async function ifTableExists(
  client: PoolClient,
  tableName: string,
  sql: string
): Promise<void> {
  const result = await client.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )`,
    [tableName]
  );
  
  if (result.rows[0].exists) {
    await client.query(sql);
  } else {
    log.debug(`Table ${tableName} does not exist, skipping SQL`);
  }
}

/**
 * Execute SQL only if a table does NOT exist
 */
export async function ifTableNotExists(
  client: PoolClient,
  tableName: string,
  sql: string
): Promise<void> {
  const result = await client.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )`,
    [tableName]
  );
  
  if (!result.rows[0].exists) {
    await client.query(sql);
  } else {
    log.debug(`Table ${tableName} already exists, skipping SQL`);
  }
}

/**
 * Execute SQL only if a column exists
 */
export async function ifColumnExists(
  client: PoolClient,
  tableName: string,
  columnName: string,
  sql: string
): Promise<void> {
  const result = await client.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND column_name = $2
    )`,
    [tableName, columnName]
  );
  
  if (result.rows[0].exists) {
    await client.query(sql);
  } else {
    log.debug(`Column ${tableName}.${columnName} does not exist, skipping SQL`);
  }
}

/**
 * Execute SQL only if a column does NOT exist
 */
export async function ifColumnNotExists(
  client: PoolClient,
  tableName: string,
  columnName: string,
  sql: string
): Promise<void> {
  const result = await client.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND column_name = $2
    )`,
    [tableName, columnName]
  );
  
  if (!result.rows[0].exists) {
    await client.query(sql);
  } else {
    log.debug(`Column ${tableName}.${columnName} already exists, skipping SQL`);
  }
}

/**
 * Add a column if it doesn't exist
 */
export async function addColumnIfNotExists(
  client: PoolClient,
  tableName: string,
  columnName: string,
  columnDef: string
): Promise<void> {
  await ifColumnNotExists(
    client,
    tableName,
    columnName,
    `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`
  );
}

/**
 * Drop a column if it exists
 */
export async function dropColumnIfExists(
  client: PoolClient,
  tableName: string,
  columnName: string
): Promise<void> {
  await ifColumnExists(
    client,
    tableName,
    columnName,
    `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`
  );
}

// =============================================================================
// CONSTRAINT HELPERS
// =============================================================================

/**
 * Check if a constraint exists
 */
export async function constraintExists(
  client: PoolClient,
  tableName: string,
  constraintName: string
): Promise<boolean> {
  const result = await client.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.table_constraints 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND constraint_name = $2
    )`,
    [tableName, constraintName]
  );
  return result.rows[0].exists;
}

/**
 * Add a constraint if it doesn't exist
 */
export async function addConstraintIfNotExists(
  client: PoolClient,
  tableName: string,
  constraintName: string,
  constraintDef: string
): Promise<void> {
  const exists = await constraintExists(client, tableName, constraintName);
  if (!exists) {
    await client.query(
      `ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} ${constraintDef}`
    );
    log.info(`Added constraint ${constraintName} to ${tableName}`);
  } else {
    log.debug(`Constraint ${constraintName} already exists on ${tableName}`);
  }
}

/**
 * Drop a constraint if it exists
 */
export async function dropConstraintIfExists(
  client: PoolClient,
  tableName: string,
  constraintName: string
): Promise<void> {
  const exists = await constraintExists(client, tableName, constraintName);
  if (exists) {
    await client.query(
      `ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName}`
    );
    log.info(`Dropped constraint ${constraintName} from ${tableName}`);
  }
}

// =============================================================================
// RLS POLICY HELPERS
// =============================================================================

/**
 * Create RLS policy if it doesn't exist
 */
export async function createPolicyIfNotExists(
  client: PoolClient,
  tableName: string,
  policyName: string,
  using: string,
  withCheck?: string,
  command: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' = 'ALL'
): Promise<void> {
  // Check if policy exists
  const result = await client.query(
    `SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = $2`,
    [tableName, policyName]
  );
  
  if (result.rows.length === 0) {
    let sql = `CREATE POLICY ${policyName} ON ${tableName} FOR ${command} USING (${using})`;
    if (withCheck) {
      sql += ` WITH CHECK (${withCheck})`;
    }
    await client.query(sql);
    log.info(`Created policy ${policyName} on ${tableName}`);
  } else {
    log.debug(`Policy ${policyName} already exists on ${tableName}`);
  }
}

/**
 * Drop RLS policy if it exists
 */
export async function dropPolicyIfExists(
  client: PoolClient,
  tableName: string,
  policyName: string
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = $2`,
    [tableName, policyName]
  );
  
  if (result.rows.length > 0) {
    await client.query(`DROP POLICY ${policyName} ON ${tableName}`);
    log.info(`Dropped policy ${policyName} from ${tableName}`);
  }
}

// =============================================================================
// ENUM HELPERS
// =============================================================================

/**
 * Add value to enum if it doesn't exist
 */
export async function addEnumValueIfNotExists(
  client: PoolClient,
  enumName: string,
  value: string,
  after?: string
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM pg_enum 
     WHERE enumtypid = $1::regtype 
     AND enumlabel = $2`,
    [enumName, value]
  );
  
  if (result.rows.length === 0) {
    let sql = `ALTER TYPE ${enumName} ADD VALUE '${value}'`;
    if (after) {
      sql += ` AFTER '${after}'`;
    }
    await client.query(sql);
    log.info(`Added value '${value}' to enum ${enumName}`);
  } else {
    log.debug(`Value '${value}' already exists in enum ${enumName}`);
  }
}

// =============================================================================
// MIGRATION TRACKING
// =============================================================================

export interface MigrationInfo {
  name: string;
  version: number;
  appliedAt: Date;
  checksum: string;
}

/**
 * Ensure migrations table exists
 */
export async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      version INTEGER NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum VARCHAR(64)
    )
  `);
}

/**
 * Record a migration as applied
 */
export async function recordMigration(
  client: PoolClient,
  name: string,
  version: number,
  checksum?: string
): Promise<void> {
  await client.query(
    `INSERT INTO schema_migrations (name, version, checksum) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (name) DO UPDATE SET applied_at = NOW()`,
    [name, version, checksum]
  );
  log.info(`Recorded migration: ${name} (v${version})`);
}

/**
 * Check if a migration has been applied
 */
export async function isMigrationApplied(
  client: PoolClient,
  name: string
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM schema_migrations WHERE name = $1`,
    [name]
  );
  return result.rows.length > 0;
}

export default {
  createIndex,
  dropIndex,
  ifTableExists,
  ifTableNotExists,
  ifColumnExists,
  ifColumnNotExists,
  addColumnIfNotExists,
  dropColumnIfExists,
  constraintExists,
  addConstraintIfNotExists,
  dropConstraintIfExists,
  createPolicyIfNotExists,
  dropPolicyIfExists,
  addEnumValueIfNotExists,
  ensureMigrationsTable,
  recordMigration,
  isMigrationApplied,
};
