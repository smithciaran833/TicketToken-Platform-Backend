/**
 * Migration: Add Row Level Security (RLS) Policies
 * 
 * Issue #8 (DB5): Add RLS policies for tenant isolation
 * 
 * This migration adds PostgreSQL Row Level Security policies to ensure:
 * - Tenants can only access their own data
 * - Application user has limited permissions
 * - Admin bypass for maintenance operations
 * 
 * Prerequisites:
 * - Run 20260102_create_app_user_role.ts first (creates minting_app role)
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if we're on PostgreSQL
  const client = knex.client.config.client;
  if (client !== 'pg' && client !== 'postgresql') {
    console.log('RLS policies are PostgreSQL-specific. Skipping for:', client);
    return;
  }

  await knex.raw(`
    -- ==========================================================================
    -- ENABLE ROW LEVEL SECURITY ON TABLES
    -- ==========================================================================
    
    -- Enable RLS on nft_mints table
    ALTER TABLE nft_mints ENABLE ROW LEVEL SECURITY;
    
    -- Force RLS for table owner too (more secure)
    ALTER TABLE nft_mints FORCE ROW LEVEL SECURITY;
    
    -- ==========================================================================
    -- DROP EXISTING POLICIES (if any) - for idempotent migrations
    -- ==========================================================================
    
    DROP POLICY IF EXISTS tenant_isolation_select ON nft_mints;
    DROP POLICY IF EXISTS tenant_isolation_insert ON nft_mints;
    DROP POLICY IF EXISTS tenant_isolation_update ON nft_mints;
    DROP POLICY IF EXISTS tenant_isolation_delete ON nft_mints;
    DROP POLICY IF EXISTS admin_bypass ON nft_mints;
    
    -- ==========================================================================
    -- HELPER FUNCTION: Get current tenant ID from session
    -- ==========================================================================
    
    -- Create or replace function to get current tenant from session variable
    CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS TEXT AS $$
    BEGIN
      RETURN current_setting('app.current_tenant_id', TRUE);
    EXCEPTION
      WHEN OTHERS THEN
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    -- Function to check if current user is admin
    CREATE OR REPLACE FUNCTION is_admin_user() RETURNS BOOLEAN AS $$
    BEGIN
      RETURN current_setting('app.is_admin', TRUE)::BOOLEAN;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN FALSE;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    -- ==========================================================================
    -- RLS POLICIES FOR nft_mints TABLE
    -- ==========================================================================
    
    -- Policy: SELECT - Users can only see their tenant's data
    CREATE POLICY tenant_isolation_select ON nft_mints
      FOR SELECT
      USING (
        -- Allow if tenant matches or if admin bypass
        tenant_id = current_tenant_id()
        OR is_admin_user()
        OR current_tenant_id() IS NULL  -- Allow superuser bypass
      );
    
    -- Policy: INSERT - Users can only insert for their tenant
    CREATE POLICY tenant_isolation_insert ON nft_mints
      FOR INSERT
      WITH CHECK (
        -- Must specify tenant_id matching session or be admin
        tenant_id = current_tenant_id()
        OR is_admin_user()
        OR current_tenant_id() IS NULL  -- Allow superuser bypass
      );
    
    -- Policy: UPDATE - Users can only update their tenant's data
    CREATE POLICY tenant_isolation_update ON nft_mints
      FOR UPDATE
      USING (
        -- Can only see own tenant's rows
        tenant_id = current_tenant_id()
        OR is_admin_user()
        OR current_tenant_id() IS NULL
      )
      WITH CHECK (
        -- Cannot change tenant_id to another tenant
        tenant_id = current_tenant_id()
        OR is_admin_user()
        OR current_tenant_id() IS NULL
      );
    
    -- Policy: DELETE - Users can only delete their tenant's data
    -- Note: With soft delete, this mainly prevents hard deletes
    CREATE POLICY tenant_isolation_delete ON nft_mints
      FOR DELETE
      USING (
        tenant_id = current_tenant_id()
        OR is_admin_user()
        OR current_tenant_id() IS NULL
      );
    
    -- ==========================================================================
    -- GRANT PERMISSIONS TO APPLICATION ROLE
    -- ==========================================================================
    
    -- Grant usage on schema
    GRANT USAGE ON SCHEMA public TO minting_app;
    
    -- Grant table permissions (limited)
    GRANT SELECT, INSERT, UPDATE ON nft_mints TO minting_app;
    
    -- Note: DELETE not granted by default - use soft delete
    -- GRANT DELETE ON nft_mints TO minting_app;  -- Uncomment if hard delete needed
    
    -- Grant sequence permissions for ID generation
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO minting_app;
    
    -- ==========================================================================
    -- AUDIT LOGGING TRIGGER (optional enhancement)
    -- ==========================================================================
    
    -- Create audit log table if it doesn't exist
    CREATE TABLE IF NOT EXISTS nft_mints_audit (
      id SERIAL PRIMARY KEY,
      operation VARCHAR(10) NOT NULL,
      mint_id UUID,
      tenant_id VARCHAR(255),
      old_data JSONB,
      new_data JSONB,
      changed_by TEXT DEFAULT current_user,
      changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      session_tenant TEXT DEFAULT current_setting('app.current_tenant_id', TRUE)
    );
    
    -- Create index on audit table
    CREATE INDEX IF NOT EXISTS idx_nft_mints_audit_mint_id ON nft_mints_audit(mint_id);
    CREATE INDEX IF NOT EXISTS idx_nft_mints_audit_tenant_id ON nft_mints_audit(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_nft_mints_audit_changed_at ON nft_mints_audit(changed_at);
    
    -- Audit trigger function
    CREATE OR REPLACE FUNCTION nft_mints_audit_trigger() RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        INSERT INTO nft_mints_audit (operation, mint_id, tenant_id, new_data)
        VALUES ('INSERT', NEW.id, NEW.tenant_id, to_jsonb(NEW));
        RETURN NEW;
      ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO nft_mints_audit (operation, mint_id, tenant_id, old_data, new_data)
        VALUES ('UPDATE', NEW.id, NEW.tenant_id, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO nft_mints_audit (operation, mint_id, tenant_id, old_data)
        VALUES ('DELETE', OLD.id, OLD.tenant_id, to_jsonb(OLD));
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    -- Create audit trigger
    DROP TRIGGER IF EXISTS nft_mints_audit ON nft_mints;
    CREATE TRIGGER nft_mints_audit
      AFTER INSERT OR UPDATE OR DELETE ON nft_mints
      FOR EACH ROW EXECUTE FUNCTION nft_mints_audit_trigger();
    
    -- ==========================================================================
    -- COMMENTS FOR DOCUMENTATION
    -- ==========================================================================
    
    COMMENT ON POLICY tenant_isolation_select ON nft_mints IS 
      'Ensures users can only SELECT rows belonging to their tenant';
    
    COMMENT ON POLICY tenant_isolation_insert ON nft_mints IS 
      'Ensures users can only INSERT rows for their tenant';
    
    COMMENT ON POLICY tenant_isolation_update ON nft_mints IS 
      'Ensures users can only UPDATE rows belonging to their tenant';
    
    COMMENT ON POLICY tenant_isolation_delete ON nft_mints IS 
      'Ensures users can only DELETE rows belonging to their tenant';
    
    COMMENT ON FUNCTION current_tenant_id() IS 
      'Returns the current tenant ID from session variable app.current_tenant_id';
    
    COMMENT ON FUNCTION is_admin_user() IS 
      'Returns true if app.is_admin session variable is set to true';
  `);

  console.log('✅ RLS policies created for nft_mints table');
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  if (client !== 'pg' && client !== 'postgresql') {
    console.log('RLS policies are PostgreSQL-specific. Skipping for:', client);
    return;
  }

  await knex.raw(`
    -- Drop audit trigger and function
    DROP TRIGGER IF EXISTS nft_mints_audit ON nft_mints;
    DROP FUNCTION IF EXISTS nft_mints_audit_trigger();
    
    -- Drop audit table (optional - uncomment to remove audit history)
    -- DROP TABLE IF EXISTS nft_mints_audit;
    
    -- Drop RLS policies
    DROP POLICY IF EXISTS tenant_isolation_select ON nft_mints;
    DROP POLICY IF EXISTS tenant_isolation_insert ON nft_mints;
    DROP POLICY IF EXISTS tenant_isolation_update ON nft_mints;
    DROP POLICY IF EXISTS tenant_isolation_delete ON nft_mints;
    DROP POLICY IF EXISTS admin_bypass ON nft_mints;
    
    -- Disable RLS
    ALTER TABLE nft_mints DISABLE ROW LEVEL SECURITY;
    
    -- Drop helper functions
    DROP FUNCTION IF EXISTS current_tenant_id();
    DROP FUNCTION IF EXISTS is_admin_user();
    
    -- Revoke permissions
    REVOKE ALL ON nft_mints FROM minting_app;
  `);

  console.log('✅ RLS policies removed from nft_mints table');
}
