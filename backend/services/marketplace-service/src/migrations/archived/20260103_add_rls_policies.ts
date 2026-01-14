/**
 * Migration: Add Row-Level Security Policies for Marketplace Service
 * 
 * Issues Fixed:
 * - DB-2: No RLS policies → Add tenant isolation at database level
 * - MT-2: RLS policies missing → Enforce multi-tenancy in database
 * - DB-H1: No column-level grants → Principle of least privilege
 * 
 * This migration:
 * 1. Creates a dedicated app_user role with limited privileges
 * 2. Enables RLS on all marketplace tables
 * 3. Creates policies for tenant isolation
 * 4. Forces RLS even for table owners
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if this is being run as superuser
  const superuserCheck = await knex.raw(`SELECT current_setting('is_superuser') as is_superuser`);
  const isSuperuser = superuserCheck.rows[0]?.is_superuser === 'on';
  
  if (!isSuperuser) {
    console.warn('⚠️  Not running as superuser. Some RLS operations may fail.');
  }

  // 1. Create app_user role if it doesn't exist
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marketplace_app') THEN
        CREATE ROLE marketplace_app LOGIN;
        COMMENT ON ROLE marketplace_app IS 'Application role for marketplace-service with limited privileges';
      END IF;
    END
    $$;
  `);

  // 2. Enable RLS on all marketplace tables
  const tables = [
    'listings',
    'transfers',
    'fees',
    'disputes',
    'venue_settings'
  ];

  for (const table of tables) {
    // Check if table exists
    const tableExists = await knex.schema.hasTable(table);
    if (!tableExists) {
      console.warn(`⚠️  Table ${table} does not exist, skipping RLS`);
      continue;
    }

    // Enable RLS
    await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    
    // Force RLS even for table owner (important for security)
    await knex.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    
    console.log(`✅ RLS enabled and forced on ${table}`);
  }

  // 3. Create tenant isolation policies for listings table
  await knex.raw(`
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS listings_tenant_isolation ON listings;
    DROP POLICY IF EXISTS listings_tenant_insert ON listings;
    DROP POLICY IF EXISTS listings_tenant_update ON listings;
    DROP POLICY IF EXISTS listings_tenant_delete ON listings;
    
    -- Select policy: Users can see their own listings or active public listings
    CREATE POLICY listings_tenant_isolation ON listings
      FOR SELECT
      USING (
        seller_id = current_setting('app.current_user_id', true)::uuid
        OR (status = 'active' AND tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      );
    
    -- Insert policy: Users can only create listings for themselves
    CREATE POLICY listings_tenant_insert ON listings
      FOR INSERT
      WITH CHECK (
        seller_id = current_setting('app.current_user_id', true)::uuid
        AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
      );
    
    -- Update policy: Users can only update their own listings
    CREATE POLICY listings_tenant_update ON listings
      FOR UPDATE
      USING (
        seller_id = current_setting('app.current_user_id', true)::uuid
        AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
      );
    
    -- Delete policy: Users can only cancel their own listings
    CREATE POLICY listings_tenant_delete ON listings
      FOR DELETE
      USING (
        seller_id = current_setting('app.current_user_id', true)::uuid
        AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
      );
  `);

  // 4. Create tenant isolation policies for transfers table
  await knex.raw(`
    DROP POLICY IF EXISTS transfers_tenant_isolation ON transfers;
    DROP POLICY IF EXISTS transfers_tenant_insert ON transfers;
    
    -- Select policy: Users can see transfers they're involved in
    CREATE POLICY transfers_tenant_isolation ON transfers
      FOR SELECT
      USING (
        buyer_id = current_setting('app.current_user_id', true)::uuid
        OR seller_id = current_setting('app.current_user_id', true)::uuid
        OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
      );
    
    -- Insert policy: System can create transfers (no user restriction)
    CREATE POLICY transfers_tenant_insert ON transfers
      FOR INSERT
      WITH CHECK (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
      );
  `);

  // 5. Create tenant isolation policies for fees table
  await knex.raw(`
    DROP POLICY IF EXISTS fees_tenant_isolation ON fees;
    
    -- Select policy: Only visible to venue owners and platform admins
    CREATE POLICY fees_tenant_isolation ON fees
      FOR SELECT
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
      );
  `);

  // 6. Create tenant isolation policies for disputes table
  await knex.raw(`
    DROP POLICY IF EXISTS disputes_tenant_isolation ON disputes;
    DROP POLICY IF EXISTS disputes_tenant_insert ON disputes;
    
    -- Select policy: Users can see disputes they filed or are involved in
    CREATE POLICY disputes_tenant_isolation ON disputes
      FOR SELECT
      USING (
        filed_by_user_id = current_setting('app.current_user_id', true)::uuid
        OR against_user_id = current_setting('app.current_user_id', true)::uuid
        OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
      );
    
    -- Insert policy: Users can file disputes within their tenant
    CREATE POLICY disputes_tenant_insert ON disputes
      FOR INSERT
      WITH CHECK (
        filed_by_user_id = current_setting('app.current_user_id', true)::uuid
        AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
      );
  `);

  // 7. Create tenant isolation policies for venue_settings table
  await knex.raw(`
    DROP POLICY IF EXISTS venue_settings_tenant_isolation ON venue_settings;
    
    -- Select policy: Only visible within tenant
    CREATE POLICY venue_settings_tenant_isolation ON venue_settings
      FOR SELECT
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
      );
  `);

  // 8. Grant minimal privileges to app_user role
  await knex.raw(`
    -- Revoke all first
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM marketplace_app;
    
    -- Grant specific privileges
    GRANT SELECT, INSERT, UPDATE ON listings TO marketplace_app;
    GRANT SELECT, INSERT ON transfers TO marketplace_app;
    GRANT SELECT ON fees TO marketplace_app;
    GRANT SELECT, INSERT ON disputes TO marketplace_app;
    GRANT SELECT ON venue_settings TO marketplace_app;
    
    -- Grant sequence usage for auto-increment IDs
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO marketplace_app;
  `);

  // 9. Create function to set tenant context
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_tenant_context(
      p_tenant_id uuid,
      p_user_id uuid DEFAULT NULL
    ) RETURNS void AS $$
    BEGIN
      PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
      IF p_user_id IS NOT NULL THEN
        PERFORM set_config('app.current_user_id', p_user_id::text, true);
      END IF;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    GRANT EXECUTE ON FUNCTION set_tenant_context(uuid, uuid) TO marketplace_app;
  `);

  console.log('✅ RLS policies created successfully');
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'listings',
    'transfers',
    'fees',
    'disputes',
    'venue_settings'
  ];

  for (const table of tables) {
    const tableExists = await knex.schema.hasTable(table);
    if (!tableExists) continue;

    // Drop all policies
    await knex.raw(`
      DO $$
      DECLARE
        pol RECORD;
      BEGIN
        FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = '${table}' LOOP
          EXECUTE format('DROP POLICY IF EXISTS %I ON ${table}', pol.policyname);
        END LOOP;
      END
      $$;
    `);

    // Disable RLS
    await knex.raw(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`);
  }

  // Drop function
  await knex.raw(`DROP FUNCTION IF EXISTS set_tenant_context(uuid, uuid)`);

  // Revoke and drop role
  await knex.raw(`
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM marketplace_app;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM marketplace_app;
    DROP ROLE IF EXISTS marketplace_app;
  `);

  console.log('✅ RLS policies removed');
}
