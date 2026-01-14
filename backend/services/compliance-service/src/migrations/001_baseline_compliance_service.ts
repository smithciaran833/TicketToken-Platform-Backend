import { Knex } from 'knex';

/**
 * Compliance Service - Consolidated Baseline Migration
 * 
 * Generated: January 13, 2026
 * Consolidates: 001-006 + 20260103 migrations
 * 
 * Tables: 23 (19 tenant-scoped, 4 global)
 * 
 * Standards Applied:
 * - UUID PKs (converted from integer)
 * - gen_random_uuid() for all UUIDs
 * - tenant_id on tenant-scoped tables
 * - RLS with app.current_tenant_id + app.is_system_user
 * - External FKs converted to comments
 * - Internal FKs preserved
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // ENUMS
  // ============================================================================

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE compliance_severity AS ENUM ('low', 'medium', 'high', 'critical');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE workflow_type AS ENUM ('venue_verification', 'tax_year_end', 'compliance_review', 'document_renewal');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE workflow_status AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // ============================================================================
  // GLOBAL TABLES (4) - No tenant_id, No RLS
  // ============================================================================

  // ---------------------------------------------------------------------------
  // compliance_settings - Platform-wide configuration
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('compliance_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('key', 100).unique().notNullable();
    table.text('value');
    table.text('description');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ---------------------------------------------------------------------------
  // ofac_sdn_list - Federal sanctions list (reference data)
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('ofac_sdn_list', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('uid', 50);
    table.string('full_name', 255);
    table.string('first_name', 100);
    table.string('last_name', 100);
    table.string('sdn_type', 50);
    table.jsonb('programs');
    table.jsonb('raw_data');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_ofac_sdn_list_full_name ON ofac_sdn_list(full_name)');
  await knex.raw('CREATE INDEX idx_ofac_sdn_list_uid ON ofac_sdn_list(uid)');

  // ---------------------------------------------------------------------------
  // state_compliance_rules - State regulations (reference data)
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('state_compliance_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('state_code', 2).notNullable().unique();
    table.string('state_name', 100).notNullable();
    table.boolean('resale_allowed').defaultTo(true);
    table.decimal('max_markup_percentage', 5, 2);
    table.decimal('max_markup_amount', 10, 2);
    table.boolean('license_required').defaultTo(false);
    table.text('license_type');
    table.text('restrictions');
    table.jsonb('metadata');
    table.boolean('active').defaultTo(true);
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_state_compliance_rules_code ON state_compliance_rules(state_code)');
  await knex.raw('CREATE INDEX idx_state_compliance_rules_active ON state_compliance_rules(active)');

  // ---------------------------------------------------------------------------
  // webhook_logs - Provider webhook deduplication
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('webhook_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('source', 50);
    table.string('type', 100);
    table.jsonb('payload');
    table.boolean('processed').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_webhook_logs_source ON webhook_logs(source)');
  await knex.raw('CREATE INDEX idx_webhook_logs_created ON webhook_logs(created_at)');

  // ============================================================================
  // TENANT-SCOPED TABLES (19) - With tenant_id and RLS
  // ============================================================================

  // ---------------------------------------------------------------------------
  // venue_verifications
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('venue_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().unique().comment('FK: venues.id');
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
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_verifications_tenant ON venue_verifications(tenant_id)');
  await knex.raw('CREATE INDEX idx_venue_verifications_venue ON venue_verifications(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_verifications_status ON venue_verifications(status)');
  await knex.raw('CREATE INDEX idx_venue_verifications_tenant_venue ON venue_verifications(tenant_id, venue_id)');
  await knex.raw('CREATE INDEX idx_venue_verifications_tenant_status ON venue_verifications(tenant_id, status)');

  // CHECK constraints
  await knex.raw(`
    ALTER TABLE venue_verifications
    ADD CONSTRAINT chk_ein_format CHECK (ein IS NULL OR ein ~ '^[0-9]{2}-[0-9]{7}$')
  `);
  await knex.raw(`
    ALTER TABLE venue_verifications
    ADD CONSTRAINT chk_status_valid CHECK (status IN ('pending', 'verified', 'rejected', 'expired'))
  `);

  // ---------------------------------------------------------------------------
  // tax_records
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('tax_records', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.integer('year').notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.uuid('ticket_id').comment('FK: tickets.id');
    table.uuid('event_id').comment('FK: events.id');
    table.boolean('threshold_reached').defaultTo(false);
    table.boolean('form_1099_required').defaultTo(false);
    table.boolean('form_1099_sent').defaultTo(false);
    table.string('jurisdiction').defaultTo('US');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('venue_id').references('venue_verifications.venue_id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_tax_records_tenant ON tax_records(tenant_id)');
  await knex.raw('CREATE INDEX idx_tax_records_venue ON tax_records(venue_id)');
  await knex.raw('CREATE INDEX idx_tax_records_year ON tax_records(year)');
  await knex.raw('CREATE INDEX idx_tax_records_tenant_venue ON tax_records(tenant_id, venue_id)');
  await knex.raw('CREATE INDEX idx_tax_records_tenant_year ON tax_records(tenant_id, year)');
  await knex.raw('CREATE INDEX idx_tax_records_jurisdiction ON tax_records(tenant_id, jurisdiction, year)');

  await knex.raw(`
    ALTER TABLE tax_records
    ADD CONSTRAINT chk_amount_positive CHECK (amount >= 0)
  `);

  // ---------------------------------------------------------------------------
  // ofac_checks
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('ofac_checks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id');
    table.string('name_checked', 255);
    table.boolean('is_match');
    table.integer('confidence');
    table.string('matched_name', 255);
    table.boolean('reviewed').defaultTo(false);
    table.text('review_notes');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('venue_id').references('venue_verifications.venue_id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_ofac_checks_tenant ON ofac_checks(tenant_id)');
  await knex.raw('CREATE INDEX idx_ofac_checks_venue ON ofac_checks(venue_id)');
  await knex.raw('CREATE INDEX idx_ofac_checks_tenant_venue ON ofac_checks(tenant_id, venue_id)');
  await knex.raw('CREATE INDEX idx_ofac_checks_tenant_created ON ofac_checks(tenant_id, created_at)');

  // ---------------------------------------------------------------------------
  // risk_assessments
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('risk_assessments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id');
    table.integer('risk_score');
    table.jsonb('factors');
    table.string('recommendation', 50);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('venue_id').references('venue_verifications.venue_id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_risk_assessments_tenant ON risk_assessments(tenant_id)');
  await knex.raw('CREATE INDEX idx_risk_assessments_venue ON risk_assessments(venue_id)');

  await knex.raw(`
    ALTER TABLE risk_assessments
    ADD CONSTRAINT chk_risk_score_range CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100))
  `);

  // ---------------------------------------------------------------------------
  // risk_flags
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('risk_flags', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id');
    table.uuid('risk_assessment_id');
    table.text('reason');
    table.string('severity', 20).defaultTo('medium');
    table.boolean('resolved').defaultTo(false);
    table.text('resolution');
    table.timestamp('resolved_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('venue_id').references('venue_verifications.venue_id').onDelete('CASCADE');
    table.foreign('risk_assessment_id').references('risk_assessments.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_risk_flags_tenant ON risk_flags(tenant_id)');
  await knex.raw('CREATE INDEX idx_risk_flags_venue ON risk_flags(venue_id)');

  // ---------------------------------------------------------------------------
  // compliance_documents
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('compliance_documents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('document_id', 255).unique();
    table.uuid('venue_id');
    table.string('document_type', 50);
    table.string('filename', 255);
    table.string('original_name', 255);
    table.text('storage_path');
    table.text('s3_url');
    table.uuid('uploaded_by').comment('FK: users.id');
    table.boolean('verified').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('venue_id').references('venue_verifications.venue_id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_compliance_documents_tenant ON compliance_documents(tenant_id)');
  await knex.raw('CREATE INDEX idx_compliance_documents_venue ON compliance_documents(venue_id)');
  await knex.raw('CREATE INDEX idx_compliance_documents_tenant_venue ON compliance_documents(tenant_id, venue_id)');
  await knex.raw('CREATE INDEX idx_compliance_documents_tenant_type ON compliance_documents(tenant_id, document_type)');

  // ---------------------------------------------------------------------------
  // bank_verifications
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('bank_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id');
    table.string('account_last_four', 4);
    table.string('routing_number', 20);
    table.boolean('verified');
    table.string('account_name', 255);
    table.string('account_type', 20);
    table.string('plaid_request_id', 255);
    table.string('plaid_item_id', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('venue_id').references('venue_verifications.venue_id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_bank_verifications_tenant ON bank_verifications(tenant_id)');
  await knex.raw('CREATE INDEX idx_bank_verifications_venue ON bank_verifications(venue_id)');

  // ---------------------------------------------------------------------------
  // payout_methods
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('payout_methods', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id');
    table.string('payout_id', 255);
    table.string('provider', 50);
    table.string('status', 20);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('venue_id').references('venue_verifications.venue_id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_payout_methods_tenant ON payout_methods(tenant_id)');
  await knex.raw('CREATE INDEX idx_payout_methods_venue ON payout_methods(venue_id)');

  // ---------------------------------------------------------------------------
  // notification_log
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
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

  await knex.raw('CREATE INDEX idx_notification_log_tenant ON notification_log(tenant_id)');

  // ---------------------------------------------------------------------------
  // compliance_batch_jobs
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('compliance_batch_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
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

  await knex.raw('CREATE INDEX idx_compliance_batch_jobs_tenant ON compliance_batch_jobs(tenant_id)');

  // ---------------------------------------------------------------------------
  // form_1099_records
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('form_1099_records', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id');
    table.integer('year');
    table.string('form_type', 20);
    table.decimal('gross_amount', 10, 2);
    table.integer('transaction_count');
    table.jsonb('form_data');
    table.boolean('sent_to_irs').defaultTo(false);
    table.boolean('sent_to_venue').defaultTo(false);
    table.string('jurisdiction').defaultTo('US');
    table.timestamp('generated_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('venue_id').references('venue_verifications.venue_id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_form_1099_records_tenant ON form_1099_records(tenant_id)');
  await knex.raw('CREATE INDEX idx_form_1099_records_venue_year ON form_1099_records(venue_id, year)');
  await knex.raw('CREATE INDEX idx_form_1099_jurisdiction ON form_1099_records(tenant_id, jurisdiction, year)');

  // ---------------------------------------------------------------------------
  // compliance_audit_log
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('compliance_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').comment('FK: venues.id');
    table.uuid('user_id').comment('FK: users.id');
    table.string('action').notNullable();
    table.string('resource').notNullable();
    table.string('resource_id');
    table.jsonb('changes').defaultTo('{}');
    table.jsonb('metadata').defaultTo('{}');
    table.string('ip_address');
    table.text('user_agent');
    table.specificType('severity', 'compliance_severity').defaultTo('low');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_compliance_audit_log_tenant_created ON compliance_audit_log(tenant_id, created_at)');
  await knex.raw('CREATE INDEX idx_compliance_audit_log_resource ON compliance_audit_log(resource, resource_id)');
  await knex.raw('CREATE INDEX idx_compliance_audit_log_user ON compliance_audit_log(user_id, created_at)');
  await knex.raw('CREATE INDEX idx_compliance_audit_log_venue ON compliance_audit_log(venue_id, created_at)');
  await knex.raw('CREATE INDEX idx_compliance_audit_log_severity ON compliance_audit_log(severity, created_at)');
  await knex.raw('CREATE INDEX idx_compliance_audit_log_action ON compliance_audit_log(action)');

  // ---------------------------------------------------------------------------
  // gdpr_deletion_requests
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('gdpr_deletion_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('customer_id').notNullable().comment('FK: users.id');
    table.string('email', 255);
    table.string('status', 50).defaultTo('processing');
    table.text('reason');
    table.uuid('requested_by').comment('FK: users.id');
    table.jsonb('deletion_log');
    table.timestamp('requested_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_gdpr_deletion_requests_tenant ON gdpr_deletion_requests(tenant_id)');
  await knex.raw('CREATE INDEX idx_gdpr_deletion_requests_customer ON gdpr_deletion_requests(customer_id)');
  await knex.raw('CREATE INDEX idx_gdpr_deletion_requests_status ON gdpr_deletion_requests(status)');
  await knex.raw('CREATE INDEX idx_gdpr_deletion_requests_requested ON gdpr_deletion_requests(requested_at)');

  // ---------------------------------------------------------------------------
  // privacy_export_requests
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('privacy_export_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable().comment('FK: users.id');
    table.text('reason');
    table.string('status', 50).notNullable().defaultTo('pending');
    table.timestamp('requested_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.string('download_url', 500);
    table.timestamp('expires_at');
    table.text('error_message');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_privacy_export_requests_tenant ON privacy_export_requests(tenant_id)');
  await knex.raw('CREATE INDEX idx_privacy_export_requests_user ON privacy_export_requests(user_id)');
  await knex.raw('CREATE INDEX idx_privacy_export_requests_status ON privacy_export_requests(status)');
  await knex.raw('CREATE INDEX idx_privacy_export_requests_requested ON privacy_export_requests(requested_at)');
  await knex.raw('CREATE INDEX idx_privacy_export_requests_queue ON privacy_export_requests(status, requested_at)');

  // ---------------------------------------------------------------------------
  // pci_access_logs
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('pci_access_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable().comment('FK: users.id');
    table.string('action', 100).notNullable();
    table.string('resource_type', 50);
    table.string('resource_id', 255);
    table.string('ip_address', 45);
    table.text('user_agent');
    table.boolean('authorized').defaultTo(true);
    table.text('denial_reason');
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_pci_access_logs_tenant ON pci_access_logs(tenant_id)');
  await knex.raw('CREATE INDEX idx_pci_access_logs_user ON pci_access_logs(user_id)');
  await knex.raw('CREATE INDEX idx_pci_access_logs_action ON pci_access_logs(action)');
  await knex.raw('CREATE INDEX idx_pci_access_logs_created ON pci_access_logs(created_at)');
  await knex.raw('CREATE INDEX idx_pci_access_logs_resource ON pci_access_logs(resource_type, resource_id)');

  // ---------------------------------------------------------------------------
  // customer_profiles
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('customer_profiles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('customer_id').notNullable().unique().comment('FK: users.id');
    table.string('email', 255);
    table.string('name', 255);
    table.string('phone', 50);
    table.text('address');
    table.string('city', 100);
    table.string('state', 2);
    table.string('zip', 20);
    table.string('country', 2).defaultTo('US');
    table.boolean('email_verified').defaultTo(false);
    table.boolean('phone_verified').defaultTo(false);
    table.boolean('gdpr_deleted').defaultTo(false);
    table.timestamp('last_activity_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_customer_profiles_tenant ON customer_profiles(tenant_id)');
  await knex.raw('CREATE INDEX idx_customer_profiles_customer ON customer_profiles(customer_id)');
  await knex.raw('CREATE INDEX idx_customer_profiles_email ON customer_profiles(email)');
  await knex.raw('CREATE INDEX idx_customer_profiles_gdpr ON customer_profiles(gdpr_deleted)');
  await knex.raw('CREATE INDEX idx_customer_profiles_activity ON customer_profiles(last_activity_at)');
  await knex.raw('CREATE INDEX idx_customer_profiles_tenant_customer ON customer_profiles(tenant_id, customer_id)');
  await knex.raw('CREATE INDEX idx_customer_profiles_tenant_email ON customer_profiles(tenant_id, email)');

  // ---------------------------------------------------------------------------
  // customer_preferences
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('customer_preferences', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('customer_id').notNullable().unique();
    table.boolean('marketing_emails').defaultTo(false);
    table.boolean('transactional_emails').defaultTo(true);
    table.boolean('sms_notifications').defaultTo(false);
    table.boolean('push_notifications').defaultTo(false);
    table.boolean('data_sharing_consent').defaultTo(false);
    table.boolean('analytics_tracking').defaultTo(true);
    table.string('language', 10).defaultTo('en');
    table.string('timezone', 50).defaultTo('America/New_York');
    table.jsonb('custom_preferences');
    table.timestamp('consent_date');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('customer_id').references('customer_profiles.customer_id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_customer_preferences_tenant ON customer_preferences(tenant_id)');
  await knex.raw('CREATE INDEX idx_customer_preferences_customer ON customer_preferences(customer_id)');

  // ---------------------------------------------------------------------------
  // customer_analytics
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('customer_analytics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('customer_id').notNullable();
    table.string('event_type', 100).notNullable();
    table.string('event_name', 255);
    table.jsonb('event_data');
    table.string('session_id', 255);
    table.string('ip_address', 45);
    table.text('user_agent');
    table.string('referrer', 500);
    table.string('page_url', 500);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('customer_id').references('customer_profiles.customer_id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_customer_analytics_tenant ON customer_analytics(tenant_id)');
  await knex.raw('CREATE INDEX idx_customer_analytics_customer ON customer_analytics(customer_id)');
  await knex.raw('CREATE INDEX idx_customer_analytics_event ON customer_analytics(event_type)');
  await knex.raw('CREATE INDEX idx_customer_analytics_created ON customer_analytics(created_at)');
  await knex.raw('CREATE INDEX idx_customer_analytics_session ON customer_analytics(session_id)');

  // ---------------------------------------------------------------------------
  // compliance_workflows
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('compliance_workflows', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.specificType('type', 'workflow_type').notNullable();
    table.specificType('status', 'workflow_status').notNullable();
    table.jsonb('steps').notNullable();
    table.string('current_step');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_compliance_workflows_tenant ON compliance_workflows(tenant_id)');
  await knex.raw('CREATE INDEX idx_compliance_workflows_tenant_venue ON compliance_workflows(tenant_id, venue_id)');
  await knex.raw('CREATE INDEX idx_compliance_workflows_tenant_status ON compliance_workflows(tenant_id, status)');
  await knex.raw('CREATE INDEX idx_compliance_workflows_type ON compliance_workflows(type)');
  await knex.raw('CREATE INDEX idx_compliance_workflows_created ON compliance_workflows(created_at)');

  // ============================================================================
  // ROW LEVEL SECURITY - 19 Tenant Tables
  // ============================================================================

  const tenantTables = [
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
    'compliance_audit_log',
    'gdpr_deletion_requests',
    'privacy_export_requests',
    'pci_access_logs',
    'customer_profiles',
    'customer_preferences',
    'customer_analytics',
    'compliance_workflows',
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);

    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation ON ${tableName}
        FOR ALL
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);
  }

  // ============================================================================
  // SEED DATA
  // ============================================================================

  // Default compliance settings
  await knex('compliance_settings').insert([
    { key: 'tax_threshold', value: '600', description: 'IRS 1099-K threshold' },
    { key: 'high_risk_score', value: '70', description: 'Score above which venues are blocked' },
    { key: 'review_required_score', value: '50', description: 'Score requiring manual review' },
    { key: 'ofac_update_enabled', value: 'true', description: 'Auto-update OFAC list daily' },
    { key: 'auto_approve_low_risk', value: 'false', description: 'Auto-approve venues with score < 20' }
  ]).onConflict('key').ignore();

  // Default state compliance rules
  await knex('state_compliance_rules').insert([
    {
      state_code: 'TN',
      state_name: 'Tennessee',
      resale_allowed: true,
      max_markup_percentage: 20.00,
      license_required: false,
      restrictions: 'Maximum 20% markup on ticket resale as per state law',
      active: true,
      metadata: JSON.stringify({ last_verified: new Date().toISOString() })
    },
    {
      state_code: 'TX',
      state_name: 'Texas',
      resale_allowed: true,
      license_required: true,
      license_type: 'Texas Occupations Code Chapter 2104',
      restrictions: 'Requires secondary ticket seller license',
      active: true,
      metadata: JSON.stringify({ last_verified: new Date().toISOString() })
    },
    {
      state_code: 'NY',
      state_name: 'New York',
      resale_allowed: true,
      license_required: false,
      restrictions: 'Must disclose total price including fees upfront',
      active: true,
      metadata: JSON.stringify({ last_verified: new Date().toISOString() })
    },
    {
      state_code: 'CA',
      state_name: 'California',
      resale_allowed: true,
      license_required: false,
      restrictions: 'Must register with Secretary of State if reselling >$2000/year',
      active: true,
      metadata: JSON.stringify({ last_verified: new Date().toISOString() })
    }
  ]).onConflict('state_code').ignore();

  console.log('✅ Compliance Service consolidated migration complete');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  const tenantTables = [
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
    'compliance_audit_log',
    'gdpr_deletion_requests',
    'privacy_export_requests',
    'pci_access_logs',
    'customer_profiles',
    'customer_preferences',
    'customer_analytics',
    'compliance_workflows',
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
    await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
  }

  // Drop tenant tables in reverse dependency order
  await knex.schema.dropTableIfExists('compliance_workflows');
  await knex.schema.dropTableIfExists('customer_analytics');
  await knex.schema.dropTableIfExists('customer_preferences');
  await knex.schema.dropTableIfExists('customer_profiles');
  await knex.schema.dropTableIfExists('pci_access_logs');
  await knex.schema.dropTableIfExists('privacy_export_requests');
  await knex.schema.dropTableIfExists('gdpr_deletion_requests');
  await knex.schema.dropTableIfExists('compliance_audit_log');
  await knex.schema.dropTableIfExists('form_1099_records');
  await knex.schema.dropTableIfExists('compliance_batch_jobs');
  await knex.schema.dropTableIfExists('notification_log');
  await knex.schema.dropTableIfExists('payout_methods');
  await knex.schema.dropTableIfExists('bank_verifications');
  await knex.schema.dropTableIfExists('compliance_documents');
  await knex.schema.dropTableIfExists('risk_flags');
  await knex.schema.dropTableIfExists('risk_assessments');
  await knex.schema.dropTableIfExists('ofac_checks');
  await knex.schema.dropTableIfExists('tax_records');
  await knex.schema.dropTableIfExists('venue_verifications');

  // Drop global tables
  await knex.schema.dropTableIfExists('webhook_logs');
  await knex.schema.dropTableIfExists('state_compliance_rules');
  await knex.schema.dropTableIfExists('ofac_sdn_list');
  await knex.schema.dropTableIfExists('compliance_settings');

  // Drop enums
  await knex.raw('DROP TYPE IF EXISTS workflow_status');
  await knex.raw('DROP TYPE IF EXISTS workflow_type');
  await knex.raw('DROP TYPE IF EXISTS compliance_severity');

  console.log('✅ Compliance Service rollback complete');
}
