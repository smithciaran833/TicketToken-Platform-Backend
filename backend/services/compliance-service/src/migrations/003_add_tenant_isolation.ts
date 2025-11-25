import { Knex } from 'knex';

/**
 * Migration: Add tenant_id columns for multi-tenant data isolation
 * 
 * CRITICAL: This migration adds tenant_id to all tables to prevent data leaks
 * between different organizations using the platform.
 * 
 * Security Impact: HIGH - Prevents cross-tenant data access
 */

export async function up(knex: Knex): Promise<void> {
  // Add tenant_id column to all tables (21 tables total)
  
  const tables = [
    // Original tables from 001_baseline_compliance
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
    'ofac_sdn_list', // Global data, but track which tenant imported
    'compliance_audit_log',
    
    // New tables from 002_add_missing_tables
    'gdpr_deletion_requests',
    'pci_access_logs',
    'state_compliance_rules', // Global rules,but track tenant access
    'customer_profiles',
    'customer_preferences',
    'customer_analytics'
  ];

  // Add tenant_id column to each table
  for (const table of tables) {
    // Skip compliance_settings - it's global configuration
    if (table === 'compliance_settings') {
      continue;
    }
    
    await knex.schema.alterTable(table, (t) => {
      // Add tenant_id column (UUID)
      t.uuid('tenant_id').nullable(); // Nullable initially for migration
      
      // Add index for performance
      t.index('tenant_id');
    });
    
    console.log(`✅ Added tenant_id to ${table}`);
  }
  
  // Set default tenant_id for existing records
  // In production, you would need to properly assign tenant_ids
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
  // These improve performance for tenant-filtered queries
  
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
  
  await knex.schema.alterTable('compliance_audit_log', (t) => {
    t.index(['tenant_id', 'entity_type', 'entity_id'], 'idx_audit_log_tenant_entity');
    t.index(['tenant_id', 'created_at'], 'idx_audit_log_tenant_created');
  });
  
  console.log('✅ Created composite indexes for tenant isolation');
  
  // Enable Row Level Security (RLS) on PostgreSQL
  // Note: This requires PostgreSQL 9.5+ and appropriate permissions
  // In production, you should enable RLS with proper policies
  
  // Example RLS policy (commented out - requires superuser):
  /*
  for (const table of tables) {
    await knex.raw(`
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      
      CREATE POLICY tenant_isolation_policy ON ${table}
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
    `);
  }
  */
  
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
    'compliance_audit_log',
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
  
  await knex.schema.alterTable('compliance_audit_log', (t) => {
    t.dropIndex([], 'idx_audit_log_tenant_entity');
    t.dropIndex([], 'idx_audit_log_tenant_created');
  });
  
  // Drop tenant_id column from each table
  for (const table of tables) {
    await knex.schema.alterTable(table, (t) => {
      t.dropColumn('tenant_id');
    });
  }
  
  console.log('✅ Rolled back multi-tenant isolation');
}
