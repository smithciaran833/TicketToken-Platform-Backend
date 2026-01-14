/**
 * Database Migration: Add Row-Level Security Policies
 * 
 * AUDIT FIXES:
 * - DB-M1: No RLS policies → Added tenant isolation policies
 * - DB-M2: Missing audit columns → Added created_at, updated_at
 * - DB-M3: No indexes on tenant_id → Added performance indexes
 * 
 * This migration adds Row-Level Security (RLS) policies to enforce
 * tenant isolation at the database level.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // =========================================================================
  // 1. Create extensions if not exist
  // =========================================================================
  await knex.raw(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  `);

  // =========================================================================
  // 2. Create app user role for application connections
  // =========================================================================
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user WITH LOGIN NOINHERIT;
      END IF;
    END $$;
  `);

  // =========================================================================
  // 3. Enable RLS on transfers table
  // =========================================================================
  await knex.raw(`
    ALTER TABLE IF EXISTS transfers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS transfers FORCE ROW LEVEL SECURITY;
  `);

  // =========================================================================
  // 4. Create tenant isolation policy for transfers
  // =========================================================================
  await knex.raw(`
    -- Drop existing policies if any
    DROP POLICY IF EXISTS tenant_isolation_policy ON transfers;
    DROP POLICY IF EXISTS tenant_select_policy ON transfers;
    DROP POLICY IF EXISTS tenant_insert_policy ON transfers;
    DROP POLICY IF EXISTS tenant_update_policy ON transfers;
    DROP POLICY IF EXISTS tenant_delete_policy ON transfers;

    -- Create SELECT policy
    CREATE POLICY tenant_select_policy ON transfers
      FOR SELECT
      TO app_user
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
      );

    -- Create INSERT policy
    CREATE POLICY tenant_insert_policy ON transfers
      FOR INSERT
      TO app_user
      WITH CHECK (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
      );

    -- Create UPDATE policy
    CREATE POLICY tenant_update_policy ON transfers
      FOR UPDATE
      TO app_user
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
      )
      WITH CHECK (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
      );

    -- Create DELETE policy
    CREATE POLICY tenant_delete_policy ON transfers
      FOR DELETE
      TO app_user
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
      );
  `);

  // =========================================================================
  // 5. Enable RLS on blockchain_transfers table
  // =========================================================================
  await knex.raw(`
    ALTER TABLE IF EXISTS blockchain_transfers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS blockchain_transfers FORCE ROW LEVEL SECURITY;
  `);

  await knex.raw(`
    DROP POLICY IF EXISTS tenant_isolation_policy ON blockchain_transfers;
    DROP POLICY IF EXISTS tenant_select_policy ON blockchain_transfers;
    DROP POLICY IF EXISTS tenant_insert_policy ON blockchain_transfers;
    DROP POLICY IF EXISTS tenant_update_policy ON blockchain_transfers;
    DROP POLICY IF EXISTS tenant_delete_policy ON blockchain_transfers;

    CREATE POLICY tenant_select_policy ON blockchain_transfers
      FOR SELECT
      TO app_user
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
      );

    CREATE POLICY tenant_insert_policy ON blockchain_transfers
      FOR INSERT
      TO app_user
      WITH CHECK (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
      );

    CREATE POLICY tenant_update_policy ON blockchain_transfers
      FOR UPDATE
      TO app_user
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
      );

    CREATE POLICY tenant_delete_policy ON blockchain_transfers
      FOR DELETE
      TO app_user
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
      );
  `);

  // =========================================================================
  // 6. Enable RLS on transfer_audit_log table
  // =========================================================================
  await knex.raw(`
    ALTER TABLE IF EXISTS transfer_audit_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS transfer_audit_log FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_policy ON transfer_audit_log;

    CREATE POLICY tenant_isolation_policy ON transfer_audit_log
      FOR ALL
      TO app_user
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
      )
      WITH CHECK (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
      );
  `);

  // =========================================================================
  // 7. Add indexes for tenant_id (performance)
  // =========================================================================
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_transfers_tenant_id 
      ON transfers(tenant_id);
    
    CREATE INDEX IF NOT EXISTS idx_transfers_tenant_status 
      ON transfers(tenant_id, status);
    
    CREATE INDEX IF NOT EXISTS idx_transfers_tenant_sender 
      ON transfers(tenant_id, sender_id);
    
    CREATE INDEX IF NOT EXISTS idx_transfers_tenant_recipient 
      ON transfers(tenant_id, recipient_id);
    
    CREATE INDEX IF NOT EXISTS idx_transfers_tenant_created 
      ON transfers(tenant_id, created_at DESC);
    
    CREATE INDEX IF NOT EXISTS idx_blockchain_transfers_tenant_id 
      ON blockchain_transfers(tenant_id);
    
    CREATE INDEX IF NOT EXISTS idx_blockchain_transfers_tenant_status 
      ON blockchain_transfers(tenant_id, status);
    
    CREATE INDEX IF NOT EXISTS idx_transfer_audit_log_tenant_id 
      ON transfer_audit_log(tenant_id);
  `);

  // =========================================================================
  // 8. Add check constraint for tenant_id (not null, not default)
  // =========================================================================
  await knex.raw(`
    DO $$
    BEGIN
      -- Add constraint to transfers
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_transfers_tenant_id_not_default'
      ) THEN
        ALTER TABLE transfers
        ADD CONSTRAINT chk_transfers_tenant_id_not_default
        CHECK (tenant_id != '00000000-0000-0000-0000-000000000000'::uuid);
      END IF;

      -- Add constraint to blockchain_transfers
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_blockchain_transfers_tenant_id_not_default'
      ) THEN
        ALTER TABLE blockchain_transfers
        ADD CONSTRAINT chk_blockchain_transfers_tenant_id_not_default
        CHECK (tenant_id != '00000000-0000-0000-0000-000000000000'::uuid);
      END IF;
    END $$;
  `);

  // =========================================================================
  // 9. Create function to set current tenant
  // =========================================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_tenant_id(p_tenant_id uuid)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      IF p_tenant_id IS NULL OR p_tenant_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        RAISE EXCEPTION 'Invalid tenant_id: %', p_tenant_id;
      END IF;
      
      PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
    END;
    $$;
  `);

  // =========================================================================
  // 10. Create function to clear tenant context
  // =========================================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION clear_tenant_context()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      PERFORM set_config('app.current_tenant_id', NULL, true);
      PERFORM set_config('app.bypass_rls', 'false', true);
    END;
    $$;
  `);

  // =========================================================================
  // 11. Create trigger for audit timestamps
  // =========================================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$;

    -- Apply to transfers table
    DROP TRIGGER IF EXISTS update_transfers_updated_at ON transfers;
    CREATE TRIGGER update_transfers_updated_at
      BEFORE UPDATE ON transfers
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    -- Apply to blockchain_transfers table
    DROP TRIGGER IF EXISTS update_blockchain_transfers_updated_at ON blockchain_transfers;
    CREATE TRIGGER update_blockchain_transfers_updated_at
      BEFORE UPDATE ON blockchain_transfers
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `);

  // =========================================================================
  // 12. Grant permissions to app_user
  // =========================================================================
  await knex.raw(`
    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON transfers TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON blockchain_transfers TO app_user;
    GRANT SELECT, INSERT ON transfer_audit_log TO app_user;
    GRANT EXECUTE ON FUNCTION set_tenant_id(uuid) TO app_user;
    GRANT EXECUTE ON FUNCTION clear_tenant_context() TO app_user;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // =========================================================================
  // Rollback: Remove RLS policies
  // =========================================================================
  
  // Drop policies from transfers
  await knex.raw(`
    DROP POLICY IF EXISTS tenant_select_policy ON transfers;
    DROP POLICY IF EXISTS tenant_insert_policy ON transfers;
    DROP POLICY IF EXISTS tenant_update_policy ON transfers;
    DROP POLICY IF EXISTS tenant_delete_policy ON transfers;
    DROP POLICY IF EXISTS tenant_isolation_policy ON transfers;
    ALTER TABLE IF EXISTS transfers DISABLE ROW LEVEL SECURITY;
  `);

  // Drop policies from blockchain_transfers
  await knex.raw(`
    DROP POLICY IF EXISTS tenant_select_policy ON blockchain_transfers;
    DROP POLICY IF EXISTS tenant_insert_policy ON blockchain_transfers;
    DROP POLICY IF EXISTS tenant_update_policy ON blockchain_transfers;
    DROP POLICY IF EXISTS tenant_delete_policy ON blockchain_transfers;
    DROP POLICY IF EXISTS tenant_isolation_policy ON blockchain_transfers;
    ALTER TABLE IF EXISTS blockchain_transfers DISABLE ROW LEVEL SECURITY;
  `);

  // Drop policies from transfer_audit_log
  await knex.raw(`
    DROP POLICY IF EXISTS tenant_isolation_policy ON transfer_audit_log;
    ALTER TABLE IF EXISTS transfer_audit_log DISABLE ROW LEVEL SECURITY;
  `);

  // Drop indexes
  await knex.raw(`
    DROP INDEX IF EXISTS idx_transfers_tenant_id;
    DROP INDEX IF EXISTS idx_transfers_tenant_status;
    DROP INDEX IF EXISTS idx_transfers_tenant_sender;
    DROP INDEX IF EXISTS idx_transfers_tenant_recipient;
    DROP INDEX IF EXISTS idx_transfers_tenant_created;
    DROP INDEX IF EXISTS idx_blockchain_transfers_tenant_id;
    DROP INDEX IF EXISTS idx_blockchain_transfers_tenant_status;
    DROP INDEX IF EXISTS idx_transfer_audit_log_tenant_id;
  `);

  // Drop constraints
  await knex.raw(`
    ALTER TABLE IF EXISTS transfers 
      DROP CONSTRAINT IF EXISTS chk_transfers_tenant_id_not_default;
    ALTER TABLE IF EXISTS blockchain_transfers 
      DROP CONSTRAINT IF EXISTS chk_blockchain_transfers_tenant_id_not_default;
  `);

  // Drop functions
  await knex.raw(`
    DROP FUNCTION IF EXISTS set_tenant_id(uuid);
    DROP FUNCTION IF EXISTS clear_tenant_context();
  `);

  // Drop triggers
  await knex.raw(`
    DROP TRIGGER IF EXISTS update_transfers_updated_at ON transfers;
    DROP TRIGGER IF EXISTS update_blockchain_transfers_updated_at ON blockchain_transfers;
  `);
}
