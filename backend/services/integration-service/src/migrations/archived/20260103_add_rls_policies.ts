/**
 * AUDIT FIX: RLS-1, MT-1 - Row Level Security with FORCE and WITH CHECK
 * 
 * This migration adds Row Level Security policies to all integration tables.
 * - FORCE ensures RLS applies even to table owners
 * - WITH CHECK ensures inserted/updated rows must match the tenant
 */

import Knex = require('knex');

const TABLES_WITH_TENANT = [
  'integrations',
  'integration_configs',
  'integration_health',
  'field_mappings',
  'sync_logs',
  'sync_jobs',
  'oauth_tokens',
  'webhook_events',
  'webhook_configs',
  'provider_credentials',
  'mapping_templates',
  'sync_queue'
];

export async function up(knex: Knex): Promise<void> {
  // Ensure we have the required extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  for (const table of TABLES_WITH_TENANT) {
    // Check if table exists before applying RLS
    const tableExists = await knex.schema.hasTable(table);
    if (!tableExists) {
      console.log(`Skipping RLS for non-existent table: ${table}`);
      continue;
    }

    // Check if tenant_id column exists
    const hasTenantId = await knex.schema.hasColumn(table, 'tenant_id');
    if (!hasTenantId) {
      console.log(`Skipping RLS for table without tenant_id: ${table}`);
      continue;
    }

    console.log(`Applying RLS to table: ${table}`);

    // Enable Row Level Security on the table
    await knex.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    
    // FORCE RLS for table owner (CRITICAL: prevents owner from bypassing RLS)
    await knex.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    
    // Drop existing policy if it exists (for idempotency)
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation_policy ON "${table}"`);
    
    // Create tenant isolation policy with WITH CHECK clause
    // USING: Controls which rows can be read
    // WITH CHECK: Controls which rows can be inserted/updated
    await knex.raw(`
      CREATE POLICY tenant_isolation_policy ON "${table}"
      FOR ALL
      USING (tenant_id = COALESCE(
        current_setting('app.current_tenant_id', true)::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
      ))
      WITH CHECK (tenant_id = COALESCE(
        current_setting('app.current_tenant_id', true)::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
      ))
    `);

    // Create index on tenant_id for better RLS performance
    const indexName = `idx_${table}_tenant_id`;
    const indexExists = await knex.raw(`
      SELECT 1 FROM pg_indexes 
      WHERE tablename = ? AND indexname = ?
    `, [table, indexName]);
    
    if (indexExists.rows.length === 0) {
      await knex.raw(`CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" (tenant_id)`);
    }
  }

  // Create the service role that bypasses RLS (for background jobs)
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'integration_service_admin') THEN
        CREATE ROLE integration_service_admin NOLOGIN;
      END IF;
    END
    $$;
  `);

  // Grant BYPASSRLS to admin role (use with caution)
  await knex.raw(`ALTER ROLE integration_service_admin BYPASSRLS`);

  console.log('RLS policies applied successfully with FORCE and WITH CHECK');
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TABLES_WITH_TENANT) {
    const tableExists = await knex.schema.hasTable(table);
    if (!tableExists) {
      continue;
    }

    // Drop the policy
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation_policy ON "${table}"`);
    
    // Disable RLS (both regular and forced)
    await knex.raw(`ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);

    // Optionally drop the index
    await knex.raw(`DROP INDEX IF EXISTS "idx_${table}_tenant_id"`);
  }

  // Remove the admin role
  await knex.raw(`DROP ROLE IF EXISTS integration_service_admin`);

  console.log('RLS policies removed');
}
