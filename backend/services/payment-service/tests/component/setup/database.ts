/**
 * Database Setup & Helpers
 * 
 * Schema setup, table truncation, RLS context, and test utilities.
 */

import { Pool, PoolClient } from 'pg';
import { getPgPool } from './test-containers';
import * as path from 'path';
import * as fs from 'fs';

/**
 * All tables in dependency order (children first for truncation)
 */
const TABLES = [
  // Webhook/Outbox
  'outbound_webhooks',
  'webhook_inbox',
  'outbox_dlq',
  'outbox',
  
  // Reconciliation
  'royalty_reconciliation_runs',
  'royalty_discrepancies',
  'royalty_payouts',
  'balance_transaction_snapshots',
  'reconciliation_reports',
  
  // Fraud
  'fraud_review_queue',
  'fraud_checks',
  'ml_fraud_predictions',
  'ml_fraud_models',
  'bot_detections',
  'device_activity',
  'card_fingerprints',
  'ip_reputation',
  'velocity_records',
  'velocity_limits',
  'behavioral_analytics',
  'account_takeover_signals',
  'fraud_rules',
  
  // Compliance
  'suspicious_activity_reports',
  'aml_checks',
  'sanctions_list_matches',
  'pep_database',
  'tax_collections',
  'tax_forms_1099da',
  
  // Group Payments
  'reminder_history',
  'group_payment_members',
  'group_payments',
  
  // High Demand
  'waiting_room_activity',
  'event_purchase_limits',
  
  // Marketplace
  'royalty_distributions',
  'escrow_release_conditions',
  'payment_escrows',
  'resale_listings',
  'venue_royalty_settings',
  'event_royalty_settings',
  'venue_price_rules',
  
  // Escrow
  'escrow_events',
  'escrow_accounts',
  
  // Transfers
  'pending_transfers',
  'stripe_transfers',
  'stripe_connect_transfers',
  'payout_events',
  'connected_accounts',
  
  // Core Payment
  'payment_state_transitions',
  'payment_attempts',
  'payment_retries',
  'payment_notifications',
  'payment_idempotency',
  'payment_event_sequence',
  'payment_disputes',
  'payment_audit_log',
  'payment_reserves',
  'ticket_refunds',
  'payment_refunds',
  'payment_intents',
  'payment_transactions',
  
  // Balances
  'venue_balances',
  
  // Background Jobs
  'dead_letter_queue',
  'background_jobs',
  
  // Alert
  'alert_history',
  
  // Reference (usually seeded, careful with truncation)
  // 'tickets',
  // 'orders',
  // 'events',
  // 'venues',
  // 'users',
  // 'tenants',
];

/**
 * Run all migrations against the test database
 */
export async function runMigrations(): Promise<void> {
  const pool = await getPgPool();
  
  console.log('📦 Running migrations...');
  
  // Option 1: Use knex migrations
  // const knex = require('knex')({
  //   client: 'pg',
  //   connection: getPostgresConfig(),
  // });
  // await knex.migrate.latest();
  // await knex.destroy();
  
  // Option 2: Run SQL files directly
  const migrationsDir = path.join(__dirname, '../../../src/migrations');
  
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await pool.query(sql);
      console.log(`  ✓ ${file}`);
    }
  } else {
    // Option 3: Run schema.sql directly
    const schemaPath = path.join(__dirname, '../../../src/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(sql);
      console.log('  ✓ schema.sql');
    } else {
      console.warn('⚠️  No migrations or schema.sql found. Create tables manually.');
    }
  }
  
  // Set up RLS policies
  await setupRLS(pool);
  
  console.log('✅ Migrations complete');
}

/**
 * Set up Row Level Security for tenant isolation
 */
async function setupRLS(pool: Pool): Promise<void> {
  // Create the function to get current tenant
  await pool.query(`
    CREATE OR REPLACE FUNCTION current_tenant_id() 
    RETURNS UUID AS $$
      SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
    $$ LANGUAGE SQL STABLE;
  `);
  
  // Enable RLS on tenant-scoped tables
  const tenantTables = [
    'payment_transactions',
    'payment_refunds',
    'payment_intents',
    'venue_balances',
    'stripe_transfers',
    'escrow_accounts',
    'group_payments',
    'fraud_checks',
  ];
  
  for (const table of tenantTables) {
    try {
      await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await pool.query(`
        DROP POLICY IF EXISTS tenant_isolation ON ${table};
        CREATE POLICY tenant_isolation ON ${table}
          USING (tenant_id = current_tenant_id())
          WITH CHECK (tenant_id = current_tenant_id());
      `);
    } catch (err) {
      // Table might not exist yet, that's okay
    }
  }
}

/**
 * Truncate all tables (for cleanup between tests)
 */
export async function truncateAllTables(): Promise<void> {
  const pool = await getPgPool();
  
  // Disable triggers temporarily for faster truncation
  await pool.query('SET session_replication_role = replica');
  
  for (const table of TABLES) {
    try {
      await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
    } catch (err) {
      // Table might not exist, that's okay
    }
  }
  
  // Re-enable triggers
  await pool.query('SET session_replication_role = DEFAULT');
}

/**
 * Truncate specific tables
 */
export async function truncateTables(...tables: string[]): Promise<void> {
  const pool = await getPgPool();
  
  await pool.query('SET session_replication_role = replica');
  
  for (const table of tables) {
    await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
  }
  
  await pool.query('SET session_replication_role = DEFAULT');
}

/**
 * Set tenant context for RLS
 */
export async function setTenantContext(tenantId: string): Promise<void> {
  const pool = await getPgPool();
  await pool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId]);
}

/**
 * Set tenant context on a specific client (for transactions)
 */
export async function setTenantContextOnClient(client: PoolClient, tenantId: string): Promise<void> {
  await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
}

/**
 * Clear tenant context
 */
export async function clearTenantContext(): Promise<void> {
  const pool = await getPgPool();
  await pool.query(`SELECT set_config('app.current_tenant_id', '', false)`);
}

/**
 * Run a function within a tenant context
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (pool: Pool) => Promise<T>
): Promise<T> {
  const pool = await getPgPool();
  await setTenantContext(tenantId);
  try {
    return await fn(pool);
  } finally {
    await clearTenantContext();
  }
}

/**
 * Run a function within a transaction with tenant context
 */
export async function withTenantTransaction<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = await getPgPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    await setTenantContextOnClient(client, tenantId);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute raw SQL (for test setup)
 */
export async function executeSQL(sql: string, params?: any[]): Promise<any> {
  const pool = await getPgPool();
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Get row count for a table
 */
export async function getRowCount(table: string): Promise<number> {
  const pool = await getPgPool();
  const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Check if a table exists
 */
export async function tableExists(table: string): Promise<boolean> {
  const pool = await getPgPool();
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = $1
    )
  `, [table]);
  return result.rows[0].exists;
}

/**
 * Flush Redis (clear all keys)
 */
export async function flushRedis(): Promise<void> {
  const { getRedisClient } = await import('./test-containers');
  const redis = await getRedisClient();
  await redis.flushall();
}

/**
 * Combined cleanup for between tests
 */
export async function cleanupBetweenTests(): Promise<void> {
  await Promise.all([
    truncateAllTables(),
    flushRedis(),
  ]);
}
