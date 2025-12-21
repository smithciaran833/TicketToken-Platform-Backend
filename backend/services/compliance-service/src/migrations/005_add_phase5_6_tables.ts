import { Knex } from 'knex';
/**
 * PHASE 5 & 6 DATABASE MIGRATION
 *
 * Creates tables for:
 * - Workflow engine
 * - Multi-jurisdiction tax tracking
 * 
 * NOTE: compliance_audit_log is now created in migration 001 with full schema
 */
export async function up(knex: Knex): Promise<void> {
  // Compliance Workflows Table
  await knex.schema.createTable('compliance_workflows', (table) => {
    table.string('id').primary();
    table.string('venue_id').notNullable();
    table.string('tenant_id').notNullable();
    table.enum('type', ['venue_verification', 'tax_year_end', 'compliance_review', 'document_renewal']).notNullable();
    table.enum('status', ['pending', 'in_progress', 'completed', 'failed', 'cancelled']).notNullable();
    table.jsonb('steps').notNullable();
    table.string('current_step');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    // Indexes
    table.index(['tenant_id', 'venue_id']);
    table.index(['tenant_id', 'status']);
    table.index('type');
    table.index('created_at');
  });

  // Add jurisdiction column to tax_records if not exists
  await knex.schema.alterTable('tax_records', (table) => {
    table.string('jurisdiction').defaultTo('US');
    table.jsonb('metadata').defaultTo('{}');
  });

  // Add jurisdiction index
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_tax_records_jurisdiction
    ON tax_records(tenant_id, jurisdiction, year)
  `);

  // Add jurisdiction column to form_1099_records if not exists
  await knex.schema.alterTable('form_1099_records', (table) => {
    table.string('jurisdiction').defaultTo('US');
  });

  // Add jurisdiction index to 1099 records
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_form_1099_jurisdiction
    ON form_1099_records(tenant_id, jurisdiction, year)
  `);

  console.log('✅ Phase 5 & 6 tables created successfully');
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('compliance_workflows');

  // Remove added columns
  await knex.schema.alterTable('tax_records', (table) => {
    table.dropColumn('jurisdiction');
    table.dropColumn('metadata');
  });

  await knex.schema.alterTable('form_1099_records', (table) => {
    table.dropColumn('jurisdiction');
  });

  console.log('✅ Phase 5 & 6 tables dropped successfully');
}
