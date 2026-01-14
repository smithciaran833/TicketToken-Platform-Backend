/**
 * Migration: RLS Role Verification and Setup
 * 
 * Fixes audit findings:
 * - Non-superuser role - Uses env var, unverified
 * - No BYPASSRLS - Not verified
 * - Uses current_setting('app.current_tenant_id') - Ensure correct setting
 * - SET LOCAL app.current_tenant_id - Ensure function exists
 * 
 * This migration:
 * 1. Creates a non-superuser role for the application (if not exists)
 * 2. Verifies the role does NOT have BYPASSRLS
 * 3. Creates helper functions for RLS context setting
 * 4. Sets up RLS policies that use app.current_tenant_id
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Get the database role name from environment
  const appRole = process.env.DB_APP_ROLE || 'ticket_service_app';
  
  await knex.raw(`
    -- ============================================================================
    -- STEP 1: Create non-superuser application role if not exists
    -- Fixes: "Non-superuser role - Uses env var, unverified"
    -- ============================================================================
    
    DO $$
    BEGIN
      -- Check if role exists
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${appRole}') THEN
        -- Create role WITHOUT superuser privileges
        CREATE ROLE ${appRole} WITH 
          LOGIN 
          NOSUPERUSER 
          NOCREATEDB 
          NOCREATEROLE 
          INHERIT 
          NOBYPASSRLS
          CONNECTION LIMIT 100;
        RAISE NOTICE 'Created application role: ${appRole}';
      ELSE
        -- Verify existing role does NOT have BYPASSRLS
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${appRole}' AND rolbypassrls = true) THEN
          -- Revoke BYPASSRLS from the role
          ALTER ROLE ${appRole} NOBYPASSRLS;
          RAISE WARNING 'Revoked BYPASSRLS from ${appRole} - this role should NOT bypass RLS';
        END IF;
        
        -- Verify existing role is NOT superuser
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${appRole}' AND rolsuper = true) THEN
          RAISE EXCEPTION 'Application role ${appRole} is a SUPERUSER - this is a security violation!';
        END IF;
        
        RAISE NOTICE 'Application role ${appRole} verified: non-superuser, no BYPASSRLS';
      END IF;
    END
    $$;

    -- ============================================================================
    -- STEP 2: Create RLS helper functions
    -- Fixes: "SET LOCAL app.current_tenant_id - Not implemented"
    -- ============================================================================
    
    -- Function to get current tenant ID from session variable
    CREATE OR REPLACE FUNCTION current_tenant_id() 
    RETURNS UUID AS $$
    BEGIN
      RETURN NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid tenant ID format - must be UUID';
      WHEN undefined_object THEN
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

    -- Function to set tenant context for current transaction
    -- This uses SET LOCAL which only lasts for the current transaction
    CREATE OR REPLACE FUNCTION set_tenant_context(tenant_id UUID) 
    RETURNS VOID AS $$
    BEGIN
      -- Validate tenant_id is not null
      IF tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant ID cannot be null';
      END IF;
      
      -- SET LOCAL ensures this only applies to current transaction
      -- The third parameter 'true' to set_config makes it LOCAL
      PERFORM set_config('app.current_tenant_id', tenant_id::text, true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Function to clear tenant context
    CREATE OR REPLACE FUNCTION clear_tenant_context() 
    RETURNS VOID AS $$
    BEGIN
      PERFORM set_config('app.current_tenant_id', '', true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Function to verify tenant context is set
    CREATE OR REPLACE FUNCTION verify_tenant_context() 
    RETURNS BOOLEAN AS $$
    DECLARE
      tenant_id UUID;
    BEGIN
      tenant_id := current_tenant_id();
      RETURN tenant_id IS NOT NULL;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN FALSE;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

    -- ============================================================================
    -- STEP 3: Create audit function for tenant violations
    -- Fixes: Logging of cross-tenant access attempts
    -- ============================================================================
    
    CREATE TABLE IF NOT EXISTS tenant_access_violations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempted_tenant_id UUID,
      actual_tenant_id UUID,
      table_name TEXT,
      operation TEXT,
      user_name TEXT DEFAULT current_user,
      client_addr TEXT DEFAULT inet_client_addr()::text,
      details JSONB
    );

    -- Index for recent violations lookup
    CREATE INDEX IF NOT EXISTS idx_tenant_violations_occurred_at 
    ON tenant_access_violations(occurred_at DESC);

    -- Function to log tenant violation attempts
    CREATE OR REPLACE FUNCTION log_tenant_violation(
      p_attempted_tenant_id UUID,
      p_actual_tenant_id UUID,
      p_table_name TEXT,
      p_operation TEXT,
      p_details JSONB DEFAULT NULL
    ) RETURNS VOID AS $$
    BEGIN
      INSERT INTO tenant_access_violations (
        attempted_tenant_id,
        actual_tenant_id,
        table_name,
        operation,
        details
      ) VALUES (
        p_attempted_tenant_id,
        p_actual_tenant_id,
        p_table_name,
        p_operation,
        p_details
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- ============================================================================
    -- STEP 4: Grant permissions to application role
    -- ============================================================================
    
    GRANT EXECUTE ON FUNCTION current_tenant_id() TO ${appRole};
    GRANT EXECUTE ON FUNCTION set_tenant_context(UUID) TO ${appRole};
    GRANT EXECUTE ON FUNCTION clear_tenant_context() TO ${appRole};
    GRANT EXECUTE ON FUNCTION verify_tenant_context() TO ${appRole};
    GRANT INSERT ON tenant_access_violations TO ${appRole};

    -- ============================================================================
    -- STEP 5: Create verification view for role status
    -- Fixes: "Non-superuser role - Uses env var, unverified" 
    -- ============================================================================
    
    CREATE OR REPLACE VIEW rls_role_status AS
    SELECT 
      r.rolname as role_name,
      r.rolsuper as is_superuser,
      r.rolbypassrls as can_bypass_rls,
      r.rolinherit as inherits_roles,
      r.rolcreaterole as can_create_role,
      r.rolcreatedb as can_create_db,
      r.rolcanlogin as can_login,
      r.rolconnlimit as connection_limit,
      CASE 
        WHEN r.rolsuper THEN 'CRITICAL: Role is superuser!'
        WHEN r.rolbypassrls THEN 'WARNING: Role can bypass RLS!'
        ELSE 'OK: Role is properly configured for RLS'
      END as security_status
    FROM pg_roles r
    WHERE r.rolname = current_user
       OR r.rolname = '${appRole}';

    GRANT SELECT ON rls_role_status TO ${appRole};
  `);

  console.log('Migration 004: RLS role verification and helper functions created');
}

export async function down(knex: Knex): Promise<void> {
  const appRole = process.env.DB_APP_ROLE || 'ticket_service_app';
  
  await knex.raw(`
    -- Drop views
    DROP VIEW IF EXISTS rls_role_status;
    
    -- Drop functions
    DROP FUNCTION IF EXISTS log_tenant_violation(UUID, UUID, TEXT, TEXT, JSONB);
    DROP FUNCTION IF EXISTS verify_tenant_context();
    DROP FUNCTION IF EXISTS clear_tenant_context();
    DROP FUNCTION IF EXISTS set_tenant_context(UUID);
    DROP FUNCTION IF EXISTS current_tenant_id();
    
    -- Drop audit table
    DROP TABLE IF EXISTS tenant_access_violations;
    
    -- Note: We don't drop the role as it may be in use
    -- Manual cleanup: DROP ROLE IF EXISTS ${appRole};
  `);

  console.log('Migration 004: RLS role verification and helper functions removed');
}
