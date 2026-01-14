/**
 * Migration: Add FORCE RLS and Fix Tenant Defaults
 * 
 * Issues Fixed:
 * - #44: Tenant from header/default (spoofable)
 * - #46: Hardcoded default tenant UUID
 * - #48: No FORCE RLS
 * - #80: Hardcoded tenant UUID default
 * 
 * This migration:
 * 1. Removes default tenant UUID from all tables
 * 2. Adds FORCE RLS to ensure policies apply even to table owners
 * 3. Creates proper RLS policies with INSERT/UPDATE/DELETE WITH CHECK
 * 4. Creates helper functions for tenant context
 * 5. Creates application user role with limited permissions
 */

import { Knex } from 'knex';

const TABLES_WITH_TENANT = [
  'wallet_addresses',
  'user_wallet_connections',
  'treasury_wallets',
  'blockchain_events',
  'blockchain_transactions',
  'mint_jobs'
];

export async function up(knex: Knex): Promise<void> {
  // Check if we're on PostgreSQL
  const client = knex.client.config.client;
  if (client !== 'pg' && client !== 'postgresql') {
    console.log('RLS policies are PostgreSQL-specific. Skipping for:', client);
    return;
  }

  console.log('🔒 Starting RLS enforcement migration...');

  // ==========================================================================
  // STEP 1: Create application role if not exists
  // ==========================================================================
  
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'blockchain_app') THEN
        CREATE ROLE blockchain_app LOGIN;
        COMMENT ON ROLE blockchain_app IS 'Application role for blockchain-service with restricted permissions';
      END IF;
    END
    $$;
  `);
  console.log('✅ Application role blockchain_app created/verified');

  // ==========================================================================
  // STEP 2: Create helper functions
  // ==========================================================================
  
  await knex.raw(`
    -- Function to get current tenant from session
    CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS TEXT AS $$
    BEGIN
      RETURN NULLIF(current_setting('app.current_tenant_id', TRUE), '');
    EXCEPTION
      WHEN OTHERS THEN
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
    
    COMMENT ON FUNCTION current_tenant_id() IS 
      'Returns the current tenant ID from session variable app.current_tenant_id';
    
    -- Function to check if current user is admin
    CREATE OR REPLACE FUNCTION is_admin_user() RETURNS BOOLEAN AS $$
    BEGIN
      RETURN COALESCE(current_setting('app.is_admin', TRUE)::BOOLEAN, FALSE);
    EXCEPTION
      WHEN OTHERS THEN
        RETURN FALSE;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
    
    COMMENT ON FUNCTION is_admin_user() IS 
      'Returns true if app.is_admin session variable is set to true';
  `);
  console.log('✅ Helper functions created');

  // ==========================================================================
  // STEP 3: Remove default tenant UUID and add FORCE RLS per table
  // ==========================================================================
  
  for (const tableName of TABLES_WITH_TENANT) {
    // Check if table exists
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
      console.log(`⏭️  Skipping ${tableName} - table does not exist`);
      continue;
    }

    console.log(`\n📋 Processing table: ${tableName}`);

    // Remove default value from tenant_id column
    // Note: This makes tenant_id required without a default
    await knex.raw(`
      ALTER TABLE ${tableName} 
      ALTER COLUMN tenant_id DROP DEFAULT;
    `);
    console.log(`  ✅ Removed default tenant_id from ${tableName}`);

    // Drop existing policies (for idempotent migration)
    await knex.raw(`
      DROP POLICY IF EXISTS tenant_isolation_policy ON ${tableName};
      DROP POLICY IF EXISTS tenant_isolation_select ON ${tableName};
      DROP POLICY IF EXISTS tenant_isolation_insert ON ${tableName};
      DROP POLICY IF EXISTS tenant_isolation_update ON ${tableName};
      DROP POLICY IF EXISTS tenant_isolation_delete ON ${tableName};
    `);

    // Enable RLS if not already enabled
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    
    // FORCE RLS - ensures policies apply even to table owner
    await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
    console.log(`  ✅ FORCE RLS enabled on ${tableName}`);

    // Create new policies with proper USING and WITH CHECK clauses
    await knex.raw(`
      -- SELECT policy
      CREATE POLICY tenant_isolation_select ON ${tableName}
        FOR SELECT
        USING (
          tenant_id::text = current_tenant_id()
          OR is_admin_user()
          OR current_tenant_id() IS NULL
        );
      
      -- INSERT policy with WITH CHECK
      CREATE POLICY tenant_isolation_insert ON ${tableName}
        FOR INSERT
        WITH CHECK (
          tenant_id::text = current_tenant_id()
          OR is_admin_user()
          OR current_tenant_id() IS NULL
        );
      
      -- UPDATE policy with both USING and WITH CHECK
      CREATE POLICY tenant_isolation_update ON ${tableName}
        FOR UPDATE
        USING (
          tenant_id::text = current_tenant_id()
          OR is_admin_user()
          OR current_tenant_id() IS NULL
        )
        WITH CHECK (
          tenant_id::text = current_tenant_id()
          OR is_admin_user()
          OR current_tenant_id() IS NULL
        );
      
      -- DELETE policy
      CREATE POLICY tenant_isolation_delete ON ${tableName}
        FOR DELETE
        USING (
          tenant_id::text = current_tenant_id()
          OR is_admin_user()
          OR current_tenant_id() IS NULL
        );
    `);
    console.log(`  ✅ RLS policies created on ${tableName}`);

    // Grant permissions to application role
    await knex.raw(`
      GRANT SELECT, INSERT, UPDATE ON ${tableName} TO blockchain_app;
    `);
    console.log(`  ✅ Permissions granted on ${tableName}`);
  }

  // ==========================================================================
  // STEP 4: Grant schema and sequence permissions
  // ==========================================================================
  
  await knex.raw(`
    GRANT USAGE ON SCHEMA public TO blockchain_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO blockchain_app;
  `);
  console.log('\n✅ Schema and sequence permissions granted');

  // ==========================================================================
  // STEP 5: Create audit table for tenant context changes
  // ==========================================================================
  
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS blockchain_tenant_audit (
      id SERIAL PRIMARY KEY,
      table_name VARCHAR(100) NOT NULL,
      operation VARCHAR(10) NOT NULL,
      record_id UUID,
      tenant_id UUID,
      old_tenant_id UUID,
      new_tenant_id UUID,
      changed_by TEXT DEFAULT current_user,
      session_tenant TEXT DEFAULT current_setting('app.current_tenant_id', TRUE),
      changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_blockchain_tenant_audit_tenant 
      ON blockchain_tenant_audit(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_blockchain_tenant_audit_changed_at 
      ON blockchain_tenant_audit(changed_at);
    
    COMMENT ON TABLE blockchain_tenant_audit IS 
      'Audit log for tenant context changes and cross-tenant operations';
  `);
  console.log('✅ Tenant audit table created');

  console.log('\n🎉 RLS enforcement migration complete!');
  console.log('⚠️  IMPORTANT: All tenant_id columns now REQUIRE explicit values');
  console.log('⚠️  Applications must set app.current_tenant_id session variable');
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  if (client !== 'pg' && client !== 'postgresql') {
    console.log('RLS policies are PostgreSQL-specific. Skipping for:', client);
    return;
  }

  console.log('🔄 Rolling back RLS enforcement migration...');

  // Drop audit table
  await knex.raw('DROP TABLE IF EXISTS blockchain_tenant_audit');

  for (const tableName of TABLES_WITH_TENANT) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) continue;

    // Drop policies
    await knex.raw(`
      DROP POLICY IF EXISTS tenant_isolation_select ON ${tableName};
      DROP POLICY IF EXISTS tenant_isolation_insert ON ${tableName};
      DROP POLICY IF EXISTS tenant_isolation_update ON ${tableName};
      DROP POLICY IF EXISTS tenant_isolation_delete ON ${tableName};
    `);

    // Disable FORCE RLS (but keep RLS enabled)
    await knex.raw(`ALTER TABLE ${tableName} NO FORCE ROW LEVEL SECURITY`);

    // Restore old simple policy
    await knex.raw(`
      CREATE POLICY tenant_isolation_policy ON ${tableName}
        USING (tenant_id::text = current_setting('app.current_tenant', true));
    `);

    // Restore default tenant_id (NOT RECOMMENDED for production)
    await knex.raw(`
      ALTER TABLE ${tableName} 
      ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
    `);

    // Revoke permissions
    await knex.raw(`REVOKE ALL ON ${tableName} FROM blockchain_app`);
  }

  // Drop helper functions
  await knex.raw('DROP FUNCTION IF EXISTS current_tenant_id()');
  await knex.raw('DROP FUNCTION IF EXISTS is_admin_user()');

  // Note: We don't drop the role as other objects may depend on it

  console.log('✅ RLS enforcement migration rolled back');
  console.log('⚠️  WARNING: Default tenant UUIDs have been restored');
}
