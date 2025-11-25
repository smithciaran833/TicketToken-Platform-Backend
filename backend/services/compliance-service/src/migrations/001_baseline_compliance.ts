import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. VENUE_VERIFICATIONS
  await knex.schema.createTable('venue_verifications', (table) => {
    table.increments('id').primary();
    table.string('venue_id', 255).notNullable().unique();
    table.string('ein', 20);
    table.string('business_name', 255);
    table.text('business_address');
    table.string('status', 50).defaultTo('pending');
    table.string('verification_id', 255).unique();
    table.boolean('w9_uploaded').defaultTo(false);
    table.boolean('bank_verified').defaultTo(false);
    table.boolean('ofac_cleared').defaultTo(false);
    table.integer('risk_score').defaultTo(0);
    table.boolean('manual_review_required').defaultTo(false);
    table.text('manual_review_notes');
    table.timestamps(true, true);

    table.index('venue_id');
    table.index('status');
  });

  // 2. TAX_RECORDS
  await knex.schema.createTable('tax_records', (table) => {
    table.increments('id').primary();
    table.string('venue_id', 255).notNullable();
    table.integer('year').notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.string('ticket_id', 255);
    table.string('event_id', 255);
    table.boolean('threshold_reached').defaultTo(false);
    table.boolean('form_1099_required').defaultTo(false);
    table.boolean('form_1099_sent').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('venue_id');
    table.index('year');
    table.index(['venue_id', 'year']);
  });

  // 3. OFAC_CHECKS
  await knex.schema.createTable('ofac_checks', (table) => {
    table.increments('id').primary();
    table.string('venue_id', 255);
    table.string('name_checked', 255);
    table.boolean('is_match');
    table.integer('confidence');
    table.string('matched_name', 255);
    table.boolean('reviewed').defaultTo(false);
    table.text('review_notes');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('venue_id');
  });

  // 4. RISK_ASSESSMENTS
  await knex.schema.createTable('risk_assessments', (table) => {
    table.increments('id').primary();
    table.string('venue_id', 255);
    table.integer('risk_score');
    table.jsonb('factors');
    table.string('recommendation', 50);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('venue_id');
  });

  // 5. RISK_FLAGS
  await knex.schema.createTable('risk_flags', (table) => {
    table.increments('id').primary();
    table.string('venue_id', 255);
    table.text('reason');
    table.string('severity', 20).defaultTo('medium');
    table.boolean('resolved').defaultTo(false);
    table.text('resolution');
    table.timestamp('resolved_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('venue_id');
  });

  // 6. COMPLIANCE_DOCUMENTS
  await knex.schema.createTable('compliance_documents', (table) => {
    table.increments('id').primary();
    table.string('document_id', 255).unique();
    table.string('venue_id', 255);
    table.string('document_type', 50);
    table.string('filename', 255);
    table.string('original_name', 255);
    table.text('storage_path');
    table.text('s3_url');
    table.string('uploaded_by', 255);
    table.boolean('verified').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('venue_id');
  });

  // 7. BANK_VERIFICATIONS
  await knex.schema.createTable('bank_verifications', (table) => {
    table.increments('id').primary();
    table.string('venue_id', 255);
    table.string('account_last_four', 4);
    table.string('routing_number', 20);
    table.boolean('verified');
    table.string('account_name', 255);
    table.string('account_type', 20);
    table.string('plaid_request_id', 255);
    table.string('plaid_item_id', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('venue_id');
  });

  // 8. PAYOUT_METHODS
  await knex.schema.createTable('payout_methods', (table) => {
    table.increments('id').primary();
    table.string('venue_id', 255);
    table.string('payout_id', 255);
    table.string('provider', 50);
    table.string('status', 20);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('venue_id');
  });

  // 9. NOTIFICATION_LOG
  await knex.schema.createTable('notification_log', (table) => {
    table.increments('id').primary();
    table.string('type', 20);
    table.string('recipient', 255);
    table.string('subject', 255);
    table.text('message');
    table.string('template', 100);
    table.string('status', 20);
    table.text('error_message');
    table.timestamp('updated_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 10. COMPLIANCE_SETTINGS
  await knex.schema.createTable('compliance_settings', (table) => {
    table.increments('id').primary();
    table.string('key', 100).unique().notNullable();
    table.text('value');
    table.text('description');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 11. COMPLIANCE_BATCH_JOBS
  await knex.schema.createTable('compliance_batch_jobs', (table) => {
    table.increments('id').primary();
    table.string('job_type', 50);
    table.string('status', 20);
    table.integer('progress').defaultTo(0);
    table.integer('total_items');
    table.integer('completed_items').defaultTo(0);
    table.integer('error_count').defaultTo(0);
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 12. FORM_1099_RECORDS
  await knex.schema.createTable('form_1099_records', (table) => {
    table.increments('id').primary();
    table.string('venue_id', 255);
    table.integer('year');
    table.string('form_type', 20);
    table.decimal('gross_amount', 10, 2);
    table.integer('transaction_count');
    table.jsonb('form_data');
    table.boolean('sent_to_irs').defaultTo(false);
    table.boolean('sent_to_venue').defaultTo(false);
    table.timestamp('generated_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['venue_id', 'year']);
  });

  // 13. WEBHOOK_LOGS
  await knex.schema.createTable('webhook_logs', (table) => {
    table.increments('id').primary();
    table.string('source', 50);
    table.string('type', 100);
    table.jsonb('payload');
    table.boolean('processed').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('source');
  });

  // 14. OFAC_SDN_LIST
  await knex.schema.createTable('ofac_sdn_list', (table) => {
    table.increments('id').primary();
    table.string('uid', 50);
    table.string('full_name', 255);
    table.string('first_name', 100);
    table.string('last_name', 100);
    table.string('sdn_type', 50);
    table.jsonb('programs');
    table.jsonb('raw_data');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('full_name');
  });

  // 15. COMPLIANCE_AUDIT_LOG
  await knex.schema.createTable('compliance_audit_log', (table) => {
    table.increments('id').primary();
    table.string('action', 100).notNullable();
    table.string('entity_type', 50);
    table.string('entity_id', 255);
    table.string('user_id', 255);
    table.string('ip_address', 45);
    table.text('user_agent');
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['entity_type', 'entity_id']);
  });

  // Insert default settings
  await knex('compliance_settings').insert([
    { key: 'tax_threshold', value: '600', description: 'IRS 1099-K threshold' },
    { key: 'high_risk_score', value: '70', description: 'Score above which venues are blocked' },
    { key: 'review_required_score', value: '50', description: 'Score requiring manual review' },
    { key: 'ofac_update_enabled', value: 'true', description: 'Auto-update OFAC list daily' },
    { key: 'auto_approve_low_risk', value: 'false', description: 'Auto-approve venues with score < 20' }
  ]).onConflict('key').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('compliance_audit_log');
  await knex.schema.dropTableIfExists('ofac_sdn_list');
  await knex.schema.dropTableIfExists('webhook_logs');
  await knex.schema.dropTableIfExists('form_1099_records');
  await knex.schema.dropTableIfExists('compliance_batch_jobs');
  await knex.schema.dropTableIfExists('compliance_settings');
  await knex.schema.dropTableIfExists('notification_log');
  await knex.schema.dropTableIfExists('payout_methods');
  await knex.schema.dropTableIfExists('bank_verifications');
  await knex.schema.dropTableIfExists('compliance_documents');
  await knex.schema.dropTableIfExists('risk_flags');
  await knex.schema.dropTableIfExists('risk_assessments');
  await knex.schema.dropTableIfExists('ofac_checks');
  await knex.schema.dropTableIfExists('tax_records');
  await knex.schema.dropTableIfExists('venue_verifications');
}
