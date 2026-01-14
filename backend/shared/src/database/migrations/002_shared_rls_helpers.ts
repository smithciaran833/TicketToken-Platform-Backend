/**
 * Shared RLS Helper Functions Migration
 * 
 * This migration creates helper functions for implementing Row Level Security (RLS)
 * across all services. Provides consistent patterns for tenant isolation.
 * 
 * Functions:
 * - create_tenant_rls_policy(): Creates standard RLS policy for a table
 * - drop_tenant_rls_policy(): Removes RLS policy from a table
 * - enable_rls_on_table(): Enables and forces RLS on a table
 * - disable_rls_on_table(): Disables RLS on a table
 * 
 * These are procedural functions that can be called during migrations
 * to apply consistent RLS patterns.
 */

import { Knex } from 'knex';

export const MIGRATION_NAME = '002_shared_rls_helpers';
export const MIGRATION_VERSION = '1.0.0';

// Standard tenant context setting name - must match 001_shared_functions.ts
const TENANT_CONTEXT_SETTING = 'app.current_tenant_id';

export async function up(knex: Knex): Promise<void> {
  console.log('[Shared Migration] Creating shared RLS helper functions...');

  // ==========================================
  // FUNCTION: enable_rls_on_table
  // ==========================================
  // Enables RLS on a table (both ENABLE and FORCE)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION enable_rls_on_table(table_name TEXT)
    RETURNS void AS $$
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: disable_rls_on_table
  // ==========================================
  // Disables RLS on a table
  await knex.raw(`
    CREATE OR REPLACE FUNCTION disable_rls_on_table(table_name TEXT)
    RETURNS void AS $$
    BEGIN
      EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', table_name);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: create_tenant_rls_policy
  // ==========================================
  // Creates a standard tenant isolation RLS policy
  // Policy name will be: {table_name}_tenant_isolation
  await knex.raw(`
    CREATE OR REPLACE FUNCTION create_tenant_rls_policy(
      table_name TEXT,
      tenant_column TEXT DEFAULT 'tenant_id'
    )
    RETURNS void AS $$
    DECLARE
      policy_name TEXT;
    BEGIN
      policy_name := table_name || '_tenant_isolation';
      
      -- Drop existing policy if it exists
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I',
        policy_name,
        table_name
      );
      
      -- Create new policy
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (%I = current_setting(''${TENANT_CONTEXT_SETTING}'', true)::UUID) WITH CHECK (%I = current_setting(''${TENANT_CONTEXT_SETTING}'', true)::UUID)',
        policy_name,
        table_name,
        tenant_column,
        tenant_column
      );
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: create_tenant_rls_policy_with_null
  // ==========================================
  // Creates RLS policy that allows NULL tenant_id (for global/shared records)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION create_tenant_rls_policy_with_null(
      table_name TEXT,
      tenant_column TEXT DEFAULT 'tenant_id'
    )
    RETURNS void AS $$
    DECLARE
      policy_name TEXT;
    BEGIN
      policy_name := table_name || '_tenant_isolation';
      
      -- Drop existing policy if it exists
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I',
        policy_name,
        table_name
      );
      
      -- Create new policy that allows NULL tenant_id
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (%I IS NULL OR %I = current_setting(''${TENANT_CONTEXT_SETTING}'', true)::UUID) WITH CHECK (%I IS NULL OR %I = current_setting(''${TENANT_CONTEXT_SETTING}'', true)::UUID)',
        policy_name,
        table_name,
        tenant_column,
        tenant_column,
        tenant_column,
        tenant_column
      );
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: create_read_only_rls_policy
  // ==========================================
  // Creates RLS policy that allows reading but blocks writes from other tenants
  await knex.raw(`
    CREATE OR REPLACE FUNCTION create_read_only_rls_policy(
      table_name TEXT,
      tenant_column TEXT DEFAULT 'tenant_id'
    )
    RETURNS void AS $$
    DECLARE
      policy_name_read TEXT;
      policy_name_write TEXT;
    BEGIN
      policy_name_read := table_name || '_tenant_read';
      policy_name_write := table_name || '_tenant_write';
      
      -- Drop existing policies
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name_read, table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name_write, table_name);
      
      -- Allow reading all records (no tenant filter)
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT USING (true)',
        policy_name_read,
        table_name
      );
      
      -- Only allow writing to own tenant's records
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (%I = current_setting(''${TENANT_CONTEXT_SETTING}'', true)::UUID) WITH CHECK (%I = current_setting(''${TENANT_CONTEXT_SETTING}'', true)::UUID)',
        policy_name_write,
        table_name,
        tenant_column,
        tenant_column
      );
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: drop_tenant_rls_policy
  // ==========================================
  // Drops the standard tenant isolation RLS policy
  await knex.raw(`
    CREATE OR REPLACE FUNCTION drop_tenant_rls_policy(table_name TEXT)
    RETURNS void AS $$
    DECLARE
      policy_name TEXT;
    BEGIN
      policy_name := table_name || '_tenant_isolation';
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: drop_read_only_rls_policy
  // ==========================================
  // Drops the read-only RLS policies (both _tenant_read and _tenant_write)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION drop_read_only_rls_policy(table_name TEXT)
    RETURNS void AS $$
    DECLARE
      policy_name_read TEXT;
      policy_name_write TEXT;
    BEGIN
      policy_name_read := table_name || '_tenant_read';
      policy_name_write := table_name || '_tenant_write';
      
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name_read, table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name_write, table_name);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: setup_table_rls
  // ==========================================
  // All-in-one function to enable RLS and create tenant policy
  await knex.raw(`
    CREATE OR REPLACE FUNCTION setup_table_rls(
      table_name TEXT,
      tenant_column TEXT DEFAULT 'tenant_id'
    )
    RETURNS void AS $$
    BEGIN
      PERFORM enable_rls_on_table(table_name);
      PERFORM create_tenant_rls_policy(table_name, tenant_column);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: teardown_table_rls
  // ==========================================
  // All-in-one function to disable RLS and drop tenant policy
  await knex.raw(`
    CREATE OR REPLACE FUNCTION teardown_table_rls(table_name TEXT)
    RETURNS void AS $$
    BEGIN
      PERFORM drop_tenant_rls_policy(table_name);
      PERFORM disable_rls_on_table(table_name);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: list_tables_without_rls
  // ==========================================
  // Utility function to find tables missing RLS
  await knex.raw(`
    CREATE OR REPLACE FUNCTION list_tables_without_rls()
    RETURNS TABLE(schema_name TEXT, table_name TEXT) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        n.nspname::TEXT as schema_name,
        c.relname::TEXT as table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'  -- regular table
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND NOT c.relrowsecurity
      ORDER BY n.nspname, c.relname;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: list_tables_with_rls
  // ==========================================
  // Utility function to find tables with RLS enabled
  await knex.raw(`
    CREATE OR REPLACE FUNCTION list_tables_with_rls()
    RETURNS TABLE(schema_name TEXT, table_name TEXT, force_enabled BOOLEAN) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        n.nspname::TEXT as schema_name,
        c.relname::TEXT as table_name,
        c.relforcerowsecurity as force_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND c.relrowsecurity
      ORDER BY n.nspname, c.relname;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: list_rls_policies
  // ==========================================
  // Lists all RLS policies in the database
  await knex.raw(`
    CREATE OR REPLACE FUNCTION list_rls_policies()
    RETURNS TABLE(
      schema_name TEXT,
      table_name TEXT,
      policy_name TEXT,
      policy_cmd TEXT,
      policy_roles TEXT[],
      policy_qual TEXT,
      policy_with_check TEXT
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        n.nspname::TEXT,
        c.relname::TEXT,
        p.polname::TEXT,
        p.polcmd::TEXT,
        p.polroles::TEXT[],
        pg_get_expr(p.polqual, p.polrelid)::TEXT,
        pg_get_expr(p.polwithcheck, p.polrelid)::TEXT
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      ORDER BY n.nspname, c.relname, p.polname;
    END;
    $$ LANGUAGE plpgsql;
  `);

  console.log('[Shared Migration] RLS helper functions created successfully');
}

export async function down(knex: Knex): Promise<void> {
  console.log('[Shared Migration] Removing shared RLS helper functions...');

  // Drop utility functions
  await knex.raw('DROP FUNCTION IF EXISTS list_rls_policies()');
  await knex.raw('DROP FUNCTION IF EXISTS list_tables_with_rls()');
  await knex.raw('DROP FUNCTION IF EXISTS list_tables_without_rls()');
  
  // Drop helper functions
  await knex.raw('DROP FUNCTION IF EXISTS teardown_table_rls(TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS setup_table_rls(TEXT, TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS drop_read_only_rls_policy(TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS drop_tenant_rls_policy(TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS create_read_only_rls_policy(TEXT, TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS create_tenant_rls_policy_with_null(TEXT, TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS create_tenant_rls_policy(TEXT, TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS disable_rls_on_table(TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS enable_rls_on_table(TEXT)');

  console.log('[Shared Migration] RLS helper functions removed successfully');
}
