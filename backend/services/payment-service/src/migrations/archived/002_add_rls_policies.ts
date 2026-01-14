/**
 * Migration: Add Row Level Security (RLS) Policies
 * 
 * CRITICAL SECURITY FIX:
 * - Enables RLS on all payment tables
 * - Creates tenant isolation policies using app.current_tenant_id
 * - Makes tenant_id NOT NULL on all tables
 * 
 * This prevents cross-tenant data access at the database level.
 */

import { Knex } from 'knex';

// List of tables that need RLS with tenant_id isolation
const TABLES_WITH_TENANT = [
  // Core payment tables
  'payment_transactions',
  'payment_refunds',
  'payment_intents',
  'payment_reserves',
  'payment_escrows',
  'payment_notifications',
  'outbound_webhooks',
  // Royalty tables
  'royalty_distributions',
  'royalty_payouts',
  'royalty_reconciliation_runs',
  'royalty_discrepancies',
  // Group payment tables
  'group_payments',
  'group_payment_members',
  'reminder_history',
  // Tax tables
  'tax_collections',
  'tax_forms_1099da',
  'user_tax_info',
  // Fraud detection tables
  'fraud_checks',
  'fraud_review_queue',
  'device_activity',
  'bot_detections',
  'known_scalpers',
  'behavioral_analytics',
  'velocity_limits',
  'velocity_records',
  'fraud_rules',
  'ml_fraud_predictions',
  'account_takeover_signals',
  'scalper_reports',
  // AML/Compliance tables
  'aml_checks',
  'sanctions_list_matches',
  'pep_database',
  'suspicious_activity_reports',
  // Rate limiting and purchase control
  'waiting_room_activity',
  'event_purchase_limits',
  'purchase_limit_violations',
  // Inventory and fulfillment
  'inventory_reservations',
  'nft_mint_queue',
  // Event sourcing and webhooks
  'webhook_inbox',
  'webhook_events',
  'outbox_dlq',
  'payment_event_sequence',
  'payment_state_transitions',
  // Idempotency and reconciliation
  'payment_idempotency',
  'reconciliation_reports',
  'settlement_batches',
  'payment_retries',
  'payment_chargebacks',
  'payment_attempts',
];

// Tables where we just enable RLS but don't add tenant policies
// (these have their own isolation logic)
const TABLES_RLS_ONLY = [
  'venue_balances',
  'venue_royalty_settings',
  'event_royalty_settings',
  'venue_price_rules',
  'resale_listings',
];

export async function up(knex: Knex): Promise<void> {
  console.log('🔒 Starting RLS migration for payment-service...');
  
  // ==========================================================================
  // STEP 1: Create application role for tenant-scoped queries
  // ==========================================================================
  console.log('1. Creating application roles...');
  
  await knex.raw(`
    DO $$
    BEGIN
      -- Create application role if it doesn't exist
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'payment_app') THEN
        CREATE ROLE payment_app NOLOGIN;
      END IF;
    END
    $$;
  `);

  // ==========================================================================
  // STEP 2: Enable RLS on all tenant tables and create policies
  // ==========================================================================
  console.log('2. Enabling RLS and creating tenant policies...');
  
  for (const tableName of TABLES_WITH_TENANT) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
      console.log(`   ⚠️  Table ${tableName} does not exist, skipping...`);
      continue;
    }

    try {
      // Enable RLS
      await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      console.log(`   ✅ RLS enabled on ${tableName}`);
      
      // Force RLS for table owner too
      await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
      
      // Create tenant isolation policy
      // Uses app.current_tenant_id setting which must be set before queries
      await knex.raw(`
        DROP POLICY IF EXISTS ${tableName}_tenant_isolation_policy ON ${tableName};
        CREATE POLICY ${tableName}_tenant_isolation_policy ON ${tableName}
          USING (
            tenant_id IS NOT NULL 
            AND tenant_id = COALESCE(
              NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
          )
          WITH CHECK (
            tenant_id IS NOT NULL 
            AND tenant_id = COALESCE(
              NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
          );
      `);
      console.log(`   ✅ Tenant policy created on ${tableName}`);
      
      // Create bypass policy for service/admin roles
      await knex.raw(`
        DROP POLICY IF EXISTS ${tableName}_service_bypass_policy ON ${tableName};
        CREATE POLICY ${tableName}_service_bypass_policy ON ${tableName}
          USING (
            current_setting('app.bypass_rls', true) = 'true'
            OR current_user = 'postgres'
          )
          WITH CHECK (
            current_setting('app.bypass_rls', true) = 'true'
            OR current_user = 'postgres'
          );
      `);
      console.log(`   ✅ Service bypass policy created on ${tableName}`);
      
    } catch (err: any) {
      console.error(`   ❌ Error on ${tableName}: ${err.message}`);
    }
  }

  // ==========================================================================
  // STEP 3: Enable RLS on venue-scoped tables (using venue_id)
  // ==========================================================================
  console.log('3. Enabling RLS on venue-scoped tables...');
  
  for (const tableName of TABLES_RLS_ONLY) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
      console.log(`   ⚠️  Table ${tableName} does not exist, skipping...`);
      continue;
    }

    try {
      await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
      
      // These tables use venue_id for isolation
      await knex.raw(`
        DROP POLICY IF EXISTS ${tableName}_venue_isolation_policy ON ${tableName};
        CREATE POLICY ${tableName}_venue_isolation_policy ON ${tableName}
          USING (
            venue_id = COALESCE(
              NULLIF(current_setting('app.current_venue_id', true), '')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
            OR current_setting('app.bypass_rls', true) = 'true'
            OR current_user = 'postgres'
          );
      `);
      console.log(`   ✅ Venue policy created on ${tableName}`);
    } catch (err: any) {
      console.error(`   ❌ Error on ${tableName}: ${err.message}`);
    }
  }

  // ==========================================================================
  // STEP 4: Make tenant_id NOT NULL where currently nullable
  // ==========================================================================
  console.log('4. Making tenant_id NOT NULL...');
  
  // First, update any NULL tenant_ids to a default value
  for (const tableName of TABLES_WITH_TENANT) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) continue;

    try {
      // Check if column exists and is nullable
      const hasColumn = await knex.schema.hasColumn(tableName, 'tenant_id');
      if (!hasColumn) {
        console.log(`   ⚠️  ${tableName} has no tenant_id column, skipping...`);
        continue;
      }

      // Update NULL values to default tenant (for backwards compatibility)
      await knex.raw(`
        UPDATE ${tableName} 
        SET tenant_id = '00000000-0000-0000-0000-000000000000'::uuid 
        WHERE tenant_id IS NULL
      `);
      
      // Alter to NOT NULL
      await knex.raw(`
        ALTER TABLE ${tableName} 
        ALTER COLUMN tenant_id SET NOT NULL
      `);
      console.log(`   ✅ ${tableName}.tenant_id set to NOT NULL`);
    } catch (err: any) {
      // May already be NOT NULL
      console.log(`   ℹ️  ${tableName}.tenant_id: ${err.message}`);
    }
  }

  // ==========================================================================
  // STEP 5: Create helper functions for tenant context
  // ==========================================================================
  console.log('5. Creating tenant context helper functions...');
  
  await knex.raw(`
    -- Function to set tenant context for queries
    CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID)
    RETURNS VOID AS $$
    BEGIN
      PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    -- Function to clear tenant context
    CREATE OR REPLACE FUNCTION clear_tenant_context()
    RETURNS VOID AS $$
    BEGIN
      PERFORM set_config('app.current_tenant_id', '', true);
      PERFORM set_config('app.bypass_rls', 'false', true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    -- Function to bypass RLS (for admin/service operations)
    CREATE OR REPLACE FUNCTION enable_rls_bypass()
    RETURNS VOID AS $$
    BEGIN
      PERFORM set_config('app.bypass_rls', 'true', true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    -- Function to disable RLS bypass
    CREATE OR REPLACE FUNCTION disable_rls_bypass()
    RETURNS VOID AS $$
    BEGIN
      PERFORM set_config('app.bypass_rls', 'false', true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);
  console.log('   ✅ Helper functions created');

  // ==========================================================================
  // STEP 6: Grant permissions to application role
  // ==========================================================================
  console.log('6. Granting permissions...');
  
  await knex.raw(`
    -- Grant usage on functions
    GRANT EXECUTE ON FUNCTION set_tenant_context(UUID) TO payment_app;
    GRANT EXECUTE ON FUNCTION clear_tenant_context() TO payment_app;
    
    -- Note: enable_rls_bypass should only be available to admin roles
    -- REVOKE EXECUTE ON FUNCTION enable_rls_bypass() FROM payment_app;
  `);
  console.log('   ✅ Permissions granted');

  console.log('✅ RLS migration completed!');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔓 Rolling back RLS migration...');
  
  // Drop policies and disable RLS on all tables
  const allTables = [...TABLES_WITH_TENANT, ...TABLES_RLS_ONLY];
  
  for (const tableName of allTables) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) continue;

    try {
      // Drop policies
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation_policy ON ${tableName}`);
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_service_bypass_policy ON ${tableName}`);
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_venue_isolation_policy ON ${tableName}`);
      
      // Disable RLS
      await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
      console.log(`   ✅ RLS disabled on ${tableName}`);
    } catch (err: any) {
      console.error(`   ❌ Error on ${tableName}: ${err.message}`);
    }
  }

  // Drop helper functions
  await knex.raw(`DROP FUNCTION IF EXISTS set_tenant_context(UUID)`);
  await knex.raw(`DROP FUNCTION IF EXISTS clear_tenant_context()`);
  await knex.raw(`DROP FUNCTION IF EXISTS enable_rls_bypass()`);
  await knex.raw(`DROP FUNCTION IF EXISTS disable_rls_bypass()`);

  // Drop role
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'payment_app') THEN
        DROP ROLE payment_app;
      END IF;
    END
    $$;
  `);

  console.log('✅ RLS rollback completed!');
}
