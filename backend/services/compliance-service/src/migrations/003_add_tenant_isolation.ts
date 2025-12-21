import { Knex } from 'knex';

/**
 * Migration: Add tenant_id columns for multi-tenant data isolation
 *
 * CRITICAL: This migration adds tenant_id to all tables to prevent data leaks
 * between different organizations using the platform.
 *
 * Security Impact: HIGH - Prevents cross-tenant data access
 * 
 * NOTE: compliance_audit_log already has tenant_id from migration 001
 */

export async function up(knex: Knex): Promise<void> {
  const tables = [
    // Original tables from 001_baseline_compliance (excluding compliance_audit_log)
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

    // New tables from 002_add_missing_tables
    'gdpr_deletion_requests',
    'pci_access_logs',
    'state_compliance_rules',
    'customer_profiles',
    'customer_preferences',
    'customer_analytics'
  ];

  // Add tenant_id column to each table
  for (const table of tables) {
    await knex.schema.alterTable(table, (t) => {
      t.uuid('tenant_id').nullable();
      t.index('tenant_id');
    });
    console.log(`✅ Added tenant_id to ${table}`);
  }

  // Set default tenant_id for existing records
  const defaultTenantId = '00000000-0000-0000-0000-000000000001';

  for (const table of tables) {
    await knex(table).update({ tenant_id: defaultTenantId });
    console.log(`✅ Set default tenant_id for existing records in ${table}`);
  }

  // Now make tenant_id NOT NULL
  for (const table of tables) {
    await knex.schema.alterTable(table, (t) => {
      t.uuid('tenant_id').notNullable().alter();
    });
    console.log(`✅ Made tenant_id NOT NULL in ${table}`);
  }

  // Create composite indexes for common queries
  await knex.schema.alterTable('venue_verifications', (t) => {
    t.index(['tenant_id', 'venue_id'], 'idx_venue_verifications_tenant_venue');
    t.index(['tenant_id', 'status'], 'idx_venue_verifications_tenant_status');
  });

  await knex.schema.alterTable('tax_records', (t) => {
    t.index(['tenant_id', 'venue_id'], 'idx_tax_records_tenant_venue');
    t.index(['tenant_id', 'year'], 'idx_tax_records_tenant_year');
  });

  await knex.schema.alterTable('ofac_checks', (t) => {
    t.index(['tenant_id', 'venue_id'], 'idx_ofac_checks_tenant_venue');
    t.index(['tenant_id', 'created_at'], 'idx_ofac_checks_tenant_created');
  });

  await knex.schema.alterTable('compliance_documents', (t) => {
    t.index(['tenant_id', 'venue_id'], 'idx_compliance_documents_tenant_venue');
    t.index(['tenant_id', 'document_type'], 'idx_compliance_documents_tenant_type');
  });

  await knex.schema.alterTable('customer_profiles', (t) => {
    t.index(['tenant_id', 'customer_id'], 'idx_customer_profiles_tenant_customer');
    t.index(['tenant_id', 'email'], 'idx_customer_profiles_tenant_email');
  });

  console.log('✅ Created composite indexes for tenant isolation');
  console.log('✅ Multi-tenant isolation migration complete');
  console.log('⚠️  Remember to enable RLS policies in production');
  console.log('⚠️  All queries MUST filter by tenant_id');
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
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
    'customer_analytics'
  ];

  // Drop composite indexes first
  await knex.schema.alterTable('venue_verifications', (t) => {
    t.dropIndex([], 'idx_venue_verifications_tenant_venue');
    t.dropIndex([], 'idx_venue_verifications_tenant_status');
  });

  await knex.schema.alterTable('tax_records', (t) => {
    t.dropIndex([], 'idx_tax_records_tenant_venue');
    t.dropIndex([], 'idx_tax_records_tenant_year');
  });

  await knex.schema.alterTable('ofac_checks', (t) => {
    t.dropIndex([], 'idx_ofac_checks_tenant_venue');
    t.dropIndex([], 'idx_ofac_checks_tenant_created');
  });

  await knex.schema.alterTable('compliance_documents', (t) => {
    t.dropIndex([], 'idx_compliance_documents_tenant_venue');
    t.dropIndex([], 'idx_compliance_documents_tenant_type');
  });

  await knex.schema.alterTable('customer_profiles', (t) => {
    t.dropIndex([], 'idx_customer_profiles_tenant_customer');
    t.dropIndex([], 'idx_customer_profiles_tenant_email');
  });

  // Drop tenant_id column from each table
  for (const table of tables) {
    await knex.schema.alterTable(table, (t) => {
      t.dropColumn('tenant_id');
    });
  }

  console.log('✅ Rolled back multi-tenant isolation');
}
