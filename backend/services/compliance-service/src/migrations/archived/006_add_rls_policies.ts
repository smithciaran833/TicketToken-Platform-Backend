import { Knex } from 'knex';

/**
 * Migration: Add Row Level Security (RLS) Policies to Compliance Service
 * 
 * CRITICAL SECURITY FIX:
 * - Enables RLS on all compliance tables with tenant_id
 * - Creates tenant isolation policies with FORCE
 * - This was flagged as missing in migration 003_add_tenant_isolation.ts
 * 
 * This prevents cross-tenant data access at the database level.
 */

// All tables that have tenant_id from migrations 001-005
const TABLES_WITH_TENANT = [
  // From 001_baseline_compliance (compliance_audit_log already had tenant_id)
  'compliance_audit_log',
  
  // From 003_add_tenant_isolation
  'venue_verifications',
  'tax_records',
  'ofac_checks',
  'risk_assessments',
  'risk_flags',
  'compliance_documents',
  'bank_verifications',
  'payout_methods',
  'notification_log',
  'compliance_batch_jobs',
  'form_1099_records',
  'webhook_logs',
  'ofac_sdn_list',
  'gdpr_deletion_requests',
  'pci_access_logs',
  'state_compliance_rules',
  'customer_profiles',
  'customer_preferences',
  'customer_analytics',
];

export async function up(knex: Knex): Promise<void> {
  console.log('🔒 Starting RLS migration for compliance-service...');

  for (const tableName of TABLES_WITH_TENANT) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
      console.log(`   ⚠️  Table ${tableName} does not exist, skipping...`);
      continue;
    }

    const hasTenantId = await knex.schema.hasColumn(tableName, 'tenant_id');
    if (!hasTenantId) {
      console.log(`   ⚠️  Table ${tableName} has no tenant_id, skipping...`);
      continue;
    }

    try {
      // Enable RLS
      await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);

      // Drop existing policy if any
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);

      // Create tenant isolation policy with WITH CHECK
      await knex.raw(`
        CREATE POLICY ${tableName}_tenant_isolation ON ${tableName}
          FOR ALL
          USING (
            tenant_id = COALESCE(
              NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
            OR current_setting('app.bypass_rls', true) = 'true'
            OR current_user = 'postgres'
          )
          WITH CHECK (
            tenant_id = COALESCE(
              NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
            OR current_setting('app.bypass_rls', true) = 'true'
            OR current_user = 'postgres'
          );
      `);

      console.log(`   ✅ RLS enabled on ${tableName}`);
    } catch (err: any) {
      console.error(`   ❌ Error on ${tableName}: ${err.message}`);
    }
  }

  // Create helper function for setting tenant context
  await knex.raw(`
    CREATE OR REPLACE FUNCTION compliance_set_tenant_context(p_tenant_id UUID)
    RETURNS VOID AS $$
    BEGIN
      PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  console.log('   ✅ Helper function created');
  console.log(`✅ RLS migration completed for compliance-service! (${TABLES_WITH_TENANT.length} tables)`);
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔓 Rolling back RLS migration for compliance-service...');

  for (const tableName of TABLES_WITH_TENANT) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) continue;

    try {
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
      await knex.raw(`ALTER TABLE ${tableName} NO FORCE ROW LEVEL SECURITY`);
      await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
      console.log(`   ✅ RLS disabled on ${tableName}`);
    } catch (err: any) {
      console.error(`   ❌ Error on ${tableName}: ${err.message}`);
    }
  }

  await knex.raw('DROP FUNCTION IF EXISTS compliance_set_tenant_context(UUID)');

  console.log('✅ RLS rollback completed for compliance-service!');
}
