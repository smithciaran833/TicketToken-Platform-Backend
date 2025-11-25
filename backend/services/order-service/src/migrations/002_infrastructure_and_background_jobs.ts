import { Knex } from 'knex';

/**
 * PHASE 2: INFRASTRUCTURE & BACKGROUND JOBS
 * 
 * Consolidates migrations 005-008, 031-032, 037:
 * - Order archiving system (archive schema + 7 tables)
 * - Event sourcing store (event_store table)
 * - Dead letter queue for failed events
 * - Job execution tracking and alerting
 * - Multi-Factor Authentication (MFA) infrastructure
 * - Payment access audit logging (PCI DSS compliance)
 * - Comprehensive audit logging system (SOC 2, GDPR, PCI DSS)
 * 
 * Tables created: 18
 * - 7 in archive schema (orders, order_items, order_events, order_addresses, order_discounts, order_refunds, archive_audit_log)
 * - 11 in main schema (event_store, dead_letter_queue, job_execution_history, job_alerts, mfa_methods, mfa_verification_attempts, payment_access_audit_log, audit_logs, financial_transaction_logs, data_access_logs, compliance_reports)
 * 
 * Schemas created: 1 (archive)
 * ENUM types: 2 (audit_log_type, audit_log_severity)
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // SECTION 1: ARCHIVE SCHEMA (from migration 005)
  // ============================================================================
  // Create a separate schema for archived orders to keep them isolated
  // from the main operational tables while maintaining queryability
  
  await knex.raw('CREATE SCHEMA IF NOT EXISTS archive');

  // ============================================================================
  // ARCHIVED ORDERS TABLE
  // ============================================================================
  // Mirror structure of main orders table with additional archival metadata
  
  await knex.schema.withSchema('archive').createTable('orders', (table) => {
    // Original order columns
    table.uuid('id').primary();
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('event_id').notNullable();
    table.string('order_number', 50).notNullable();
    table.enum('status', [
      'PENDING',
      'RESERVED',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
      'REFUNDED'
    ]).notNullable();
    table.decimal('subtotal', 12, 2).notNullable();
    table.decimal('tax', 12, 2).notNullable().defaultTo(0);
    table.decimal('fees', 12, 2).notNullable().defaultTo(0);
    table.decimal('discount', 12, 2).notNullable().defaultTo(0);
    table.decimal('total', 12, 2).notNullable();
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.string('payment_intent_id', 255);
    table.string('payment_method', 50);
    table.timestamp('reserved_at');
    table.timestamp('confirmed_at');
    table.timestamp('completed_at');
    table.timestamp('cancelled_at');
    table.timestamp('refunded_at');
    table.timestamp('expires_at');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Archive-specific columns
    table.timestamp('archived_at').notNullable().defaultTo(knex.fn.now());
    table.string('archive_reason', 100).notNullable().defaultTo('age_threshold');
    table.text('archive_notes');

    // Indexes for archive queries
    table.index(['tenant_id', 'archived_at'], 'idx_archive_orders_tenant_archived');
    table.index(['user_id', 'archived_at'], 'idx_archive_orders_user_archived');
    table.index(['event_id', 'archived_at'], 'idx_archive_orders_event_archived');
    table.index(['status', 'archived_at'], 'idx_archive_orders_status_archived');
    table.index('archived_at', 'idx_archive_orders_archived_at');
  });

  // ============================================================================
  // ARCHIVED ORDER ITEMS TABLE
  // ============================================================================
  
  await knex.schema.withSchema('archive').createTable('order_items', (table) => {
    table.uuid('id').primary();
    table.uuid('order_id').notNullable();
    table.uuid('ticket_type_id').notNullable();
    table.integer('quantity').notNullable();
    table.decimal('price_per_ticket', 10, 2).notNullable();
    table.decimal('subtotal', 12, 2).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').notNullable();
    table.timestamp('updated_at').notNullable();
    table.timestamp('archived_at').notNullable().defaultTo(knex.fn.now());

    table.index('order_id', 'idx_archive_order_items_order');
    table.index('ticket_type_id', 'idx_archive_order_items_ticket_type');
    table.index('archived_at', 'idx_archive_order_items_archived_at');
  });

  // ============================================================================
  // ARCHIVED ORDER EVENTS TABLE
  // ============================================================================
  
  await knex.schema.withSchema('archive').createTable('order_events', (table) => {
    table.uuid('id').primary();
    table.uuid('order_id').notNullable();
    table.string('event_type', 50).notNullable();
    table.jsonb('event_data').notNullable();
    table.uuid('created_by');
    table.timestamp('created_at').notNullable();
    table.timestamp('archived_at').notNullable().defaultTo(knex.fn.now());

    table.index('order_id', 'idx_archive_order_events_order');
    table.index('event_type', 'idx_archive_order_events_type');
    table.index('archived_at', 'idx_archive_order_events_archived_at');
  });

  // ============================================================================
  // ARCHIVED ORDER ADDRESSES TABLE
  // ============================================================================
  
  await knex.schema.withSchema('archive').createTable('order_addresses', (table) => {
    table.uuid('id').primary();
    table.uuid('order_id').notNullable();
    table.enum('address_type', ['BILLING', 'SHIPPING']).notNullable();
    table.string('first_name', 100);
    table.string('last_name', 100);
    table.string('company', 100);
    table.string('address_line1', 255);
    table.string('address_line2', 255);
    table.string('city', 100);
    table.string('state', 100);
    table.string('postal_code', 20);
    table.string('country', 2);
    table.string('phone', 50);
    table.timestamp('created_at').notNullable();
    table.timestamp('updated_at').notNullable();
    table.timestamp('archived_at').notNullable().defaultTo(knex.fn.now());

    table.index('order_id', 'idx_archive_order_addresses_order');
    table.index('archived_at', 'idx_archive_order_addresses_archived_at');
  });

  // ============================================================================
  // ARCHIVED ORDER DISCOUNTS TABLE
  // ============================================================================
  
  await knex.schema.withSchema('archive').createTable('order_discounts', (table) => {
    table.uuid('id').primary();
    table.uuid('order_id').notNullable();
    table.string('discount_code', 50);
    table.enum('discount_type', ['PERCENTAGE', 'FIXED_AMOUNT', 'PROMOTIONAL']).notNullable();
    table.decimal('discount_value', 10, 2).notNullable();
    table.decimal('discount_amount', 10, 2).notNullable();
    table.text('description');
    table.timestamp('created_at').notNullable();
    table.timestamp('archived_at').notNullable().defaultTo(knex.fn.now());

    table.index('order_id', 'idx_archive_order_discounts_order');
    table.index('discount_code', 'idx_archive_order_discounts_code');
    table.index('archived_at', 'idx_archive_order_discounts_archived_at');
  });

  // ============================================================================
  // ARCHIVED ORDER REFUNDS TABLE
  // ============================================================================
  
  await knex.schema.withSchema('archive').createTable('order_refunds', (table) => {
    table.uuid('id').primary();
    table.uuid('order_id').notNullable();
    table.string('refund_id', 255);
    table.decimal('amount', 12, 2).notNullable();
    table.enum('refund_status', ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).notNullable();
    table.text('reason');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('processed_at');
    table.timestamp('created_at').notNullable();
    table.timestamp('updated_at').notNullable();
    table.timestamp('archived_at').notNullable().defaultTo(knex.fn.now());

    table.index('order_id', 'idx_archive_order_refunds_order');
    table.index('refund_status', 'idx_archive_order_refunds_status');
    table.index('archived_at', 'idx_archive_order_refunds_archived_at');
  });

  // ============================================================================
  // ARCHIVE AUDIT LOG
  // ============================================================================
  // Track all archiving operations for compliance and debugging
  
  await knex.schema.withSchema('archive').createTable('archive_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('operation', 50).notNullable(); // 'ARCHIVE', 'RESTORE', 'DELETE'
    table.integer('orders_affected').notNullable();
    table.integer('items_affected').notNullable();
    table.integer('events_affected').notNullable();
    table.timestamp('threshold_date').notNullable();
    table.integer('days_old').notNullable();
    table.string('executed_by', 100).notNullable();
    table.text('notes');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('started_at').notNullable();
    table.timestamp('completed_at');
    table.integer('duration_ms');
    table.boolean('success').notNullable();
    table.text('error_message');

    table.index('tenant_id', 'idx_archive_audit_tenant');
    table.index('operation', 'idx_archive_audit_operation');
    table.index('started_at', 'idx_archive_audit_started_at');
  });

  // Add comment for documentation
  await knex.raw(`
    COMMENT ON SCHEMA archive IS 'Archive schema for orders older than retention threshold (default 90 days)'
  `);

  // ============================================================================
  // SECTION 2: EVENT STORE (from migration 006)
  // ============================================================================
  
  await knex.schema.createTable('event_store', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_type', 100).notNullable();
    table.string('version', 20).notNullable();
    table.uuid('aggregate_id').notNullable(); // orderId
    table.string('aggregate_type', 50).notNullable().defaultTo('order');
    table.uuid('tenant_id').notNullable();
    table.jsonb('payload').notNullable();
    table.jsonb('metadata');
    table.timestamp('published_at').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes for efficient querying
    table.index('aggregate_id', 'idx_event_store_aggregate_id');
    table.index('event_type', 'idx_event_store_event_type');
    table.index('tenant_id', 'idx_event_store_tenant_id');
    table.index('published_at', 'idx_event_store_published_at');
    table.index(['aggregate_id', 'published_at'], 'idx_event_store_aggregate_published');
    table.index(['tenant_id', 'event_type', 'published_at'], 'idx_event_store_tenant_type_published');
  });

  await knex.raw(`
    COMMENT ON TABLE event_store IS 'Event sourcing store for order events - enables replay and audit trail'
  `);
  
  await knex.raw(`
    COMMENT ON COLUMN event_store.aggregate_id IS 'The ID of the aggregate (order) this event belongs to'
  `);
  
  await knex.raw(`
    COMMENT ON COLUMN event_store.published_at IS 'When the event was published to the event bus'
  `);

  // ============================================================================
  // SECTION 3: DEAD LETTER QUEUE (from migration 007)
  // ============================================================================
  
  await knex.schema.createTable('dead_letter_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.text('error').notNullable();
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.timestamp('first_attempt_at').notNullable();
    table.timestamp('last_attempt_at').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('event_type', 'idx_dlq_event_type');
    table.index('created_at', 'idx_dlq_created_at');
    table.index(['event_type', 'created_at'], 'idx_dlq_type_created');
  });

  await knex.raw(`
    COMMENT ON TABLE dead_letter_queue IS 'Dead letter queue for failed event publications'
  `);

  // ============================================================================
  // SECTION 4: JOB EXECUTION HISTORY (from migration 008)
  // ============================================================================
  
  // Create job_execution_history table
  await knex.schema.createTable('job_execution_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('job_name', 100).notNullable();
    table.timestamp('started_at').notNullable();
    table.timestamp('completed_at').nullable();
    table.integer('duration_ms').nullable();
    table.enum('status', ['RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT']).notNullable();
    table.text('error_message').nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('job_name', 'idx_job_history_name');
    table.index('status', 'idx_job_history_status');
    table.index('started_at', 'idx_job_history_started');
    table.index(['job_name', 'started_at'], 'idx_job_history_name_started');
    table.index(['job_name', 'status'], 'idx_job_history_name_status');
  });

  await knex.raw(`
    COMMENT ON TABLE job_execution_history IS 'Audit trail for all background job executions'
  `);

  // Create job_alerts table
  await knex.schema.createTable('job_alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('job_name', 100).notNullable();
    table.enum('alert_type', [
      'JOB_FAILURE',
      'CONSECUTIVE_FAILURES',
      'SLOW_EXECUTION',
      'CIRCUIT_OPEN',
      'JOB_STALE'
    ]).notNullable();
    table.enum('severity', ['WARNING', 'ERROR', 'CRITICAL']).notNullable();
    table.text('message').notNullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.boolean('acknowledged').notNullable().defaultTo(false);
    table.timestamp('acknowledged_at').nullable();
    table.string('acknowledged_by', 100).nullable();

    // Indexes
    table.index('job_name', 'idx_job_alerts_name');
    table.index('alert_type', 'idx_job_alerts_type');
    table.index('severity', 'idx_job_alerts_severity');
    table.index('acknowledged', 'idx_job_alerts_ack');
    table.index('created_at', 'idx_job_alerts_created');
    table.index(['job_name', 'acknowledged'], 'idx_job_alerts_name_ack');
    table.index(['severity', 'acknowledged'], 'idx_job_alerts_sev_ack');
  });

  await knex.raw(`
    COMMENT ON TABLE job_alerts IS 'Alerts for job failures and performance issues'
  `);

  // ============================================================================
  // SECTION 5: MULTI-FACTOR AUTHENTICATION (from migration 031)
  // ============================================================================
  // Converted from Pool to Knex
  
  // Create MFA methods table
  await knex.schema.createTable('mfa_methods', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.enum('method_type', ['TOTP', 'SMS', 'EMAIL', 'BACKUP_CODES']).notNullable();
    table.text('secret_encrypted');
    table.text('phone_number_encrypted');
    table.text('email_encrypted');
    table.text('backup_codes_encrypted');
    table.boolean('is_verified').defaultTo(false);
    table.boolean('is_primary').defaultTo(false);
    table.timestamp('last_used_at');
    table.timestamps(true, true);
    
    table.unique(['tenant_id', 'user_id', 'method_type']);
    
    // Indexes
    table.index(['tenant_id', 'user_id']);
    table.index('user_id');
  });

  // Create partial index for primary MFA method
  await knex.raw(`
    CREATE INDEX idx_mfa_methods_user_primary ON mfa_methods(user_id) WHERE is_primary = TRUE
  `);

  // Create MFA verification attempts table
  await knex.schema.createTable('mfa_verification_attempts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('mfa_method_id').references('id').inTable('mfa_methods').onDelete('CASCADE');
    table.string('code_hash', 255).notNullable();
    table.boolean('is_successful').notNullable();
    table.specificType('ip_address', 'inet');
    table.text('user_agent');
    table.timestamp('attempted_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index('mfa_method_id');
    table.index(['user_id', 'attempted_at']);
  });

  await knex.raw(`
    COMMENT ON TABLE mfa_methods IS 'Multi-factor authentication methods for enhanced security'
  `);
  
  await knex.raw(`
    COMMENT ON TABLE mfa_verification_attempts IS 'Audit log of all MFA verification attempts'
  `);

  // ============================================================================
  // SECTION 6: PAYMENT ACCESS AUDIT (from migration 032 - PCI DSS)
  // ============================================================================
  // Converted from Pool to Knex
  
  // Create payment access audit log table
  await knex.schema.createTable('payment_access_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('action', 100).notNullable();
    table.string('resource_type', 50).notNullable();
    table.uuid('resource_id');
    table.specificType('ip_address', 'inet').notNullable();
    table.text('user_agent');
    table.text('request_path').notNullable();
    table.string('request_method', 10).notNullable();
    table.integer('response_status');
    table.boolean('mfa_verified').defaultTo(false);
    table.boolean('success').notNullable();
    table.text('error_message');
    table.jsonb('metadata');
    table.timestamp('accessed_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes for common queries
    table.index(['tenant_id', 'user_id']);
    table.index(['user_id', 'accessed_at']);
    table.index(['action', 'accessed_at']);
    table.index(['ip_address', 'accessed_at']);
  });

  // Create indexes with WHERE clauses
  await knex.raw(`
    CREATE INDEX idx_payment_access_audit_resource ON payment_access_audit_log(resource_type, resource_id) WHERE resource_id IS NOT NULL
  `);
  
  await knex.raw(`
    CREATE INDEX idx_payment_access_audit_failed ON payment_access_audit_log(success, accessed_at) WHERE success = FALSE
  `);

  // Add CHECK constraint for action enum
  await knex.raw(`
    ALTER TABLE payment_access_audit_log ADD CONSTRAINT payment_access_audit_log_action_check 
    CHECK (action IN (
      'VIEW_PAYMENT_DATA',
      'VIEW_PAYMENT_METHOD',
      'CREATE_PAYMENT_METHOD',
      'UPDATE_PAYMENT_METHOD',
      'DELETE_PAYMENT_METHOD',
      'PROCESS_REFUND',
      'VIEW_REFUND',
      'MANUAL_DISCOUNT',
      'ADMIN_OVERRIDE',
      'VIEW_FINANCIAL_REPORT',
      'EXPORT_PAYMENT_DATA'
    ))
  `);

  await knex.raw(`
    COMMENT ON TABLE payment_access_audit_log IS 'PCI DSS compliant audit log for all payment data access'
  `);

  // ============================================================================
  // SECTION 7: COMPREHENSIVE AUDIT LOGGING (from migration 037)
  // ============================================================================
  // SOC 2, GDPR, PCI DSS compliance - Full audit trail system
  
  // Create ENUM types for audit logging
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE audit_log_type AS ENUM (
        'ADMIN_ACTION',
        'DATA_ACCESS',
        'DATA_MODIFICATION',
        'DATA_DELETION',
        'EXPORT',
        'LOGIN',
        'LOGOUT',
        'PERMISSION_CHANGE',
        'CONFIG_CHANGE',
        'SECURITY_EVENT',
        'PAYMENT_ACCESS',
        'PII_ACCESS',
        'REFUND_ACTION',
        'OVERRIDE_ACTION',
        'BULK_OPERATION',
        'API_CALL',
        'COMPLIANCE_EVENT'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE audit_log_severity AS ENUM (
        'INFO',
        'WARNING',
        'ERROR',
        'CRITICAL'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create immutable audit logs table
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.specificType('log_type', 'audit_log_type').notNullable();
    table.specificType('severity', 'audit_log_severity').notNullable().defaultTo('INFO');
    
    // Actor information
    table.uuid('user_id');
    table.string('username', 255);
    table.string('user_role', 100);
    table.string('user_email', 255);
    
    // Action details
    table.string('action', 255).notNullable();
    table.text('description');
    table.jsonb('before_state');
    table.jsonb('after_state');
    table.jsonb('metadata');
    
    // Resource information
    table.string('resource_type', 100);
    table.uuid('resource_id');
    table.string('resource_name', 255);
    
    // Request context
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.string('request_id', 100);
    table.string('session_id', 100);
    table.string('api_key_id', 100);
    
    // Location
    table.string('country_code', 2);
    table.string('region', 100);
    table.string('city', 100);
    
    // Compliance flags
    table.boolean('is_pii_access').notNullable().defaultTo(false);
    table.boolean('is_payment_access').notNullable().defaultTo(false);
    table.boolean('requires_review').notNullable().defaultTo(false);
    table.boolean('is_suspicious').notNullable().defaultTo(false);
    
    // Timestamps (immutable - no updated_at)
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at'); // For GDPR/retention policies
    
    // Indexes for querying
    table.index(['tenant_id', 'created_at']);
    table.index(['user_id', 'created_at']);
    table.index(['log_type', 'created_at']);
    table.index(['resource_type', 'resource_id']);
    table.index(['is_pii_access', 'created_at']);
    table.index(['is_payment_access', 'created_at']);
    table.index('requires_review');
    table.index(['ip_address', 'created_at']);
    table.index('session_id');
    table.index('request_id');
    table.index('expires_at');
  });

  // Create financial transaction logs table
  await knex.schema.createTable('financial_transaction_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    
    // Transaction identification
    table.uuid('order_id');
    table.string('transaction_id', 255).notNullable();
    table.string('external_transaction_id', 255);
    table.string('payment_processor', 50).notNullable();
    
    // Transaction details
    table.string('transaction_type', 50).notNullable();
    table.string('payment_method', 50).notNullable();
    table.decimal('amount_cents', 15, 0).notNullable();
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.string('status', 50).notNullable();
    
    // Fee breakdown
    table.decimal('platform_fee_cents', 15, 0);
    table.decimal('processing_fee_cents', 15, 0);
    table.decimal('tax_cents', 15, 0);
    table.decimal('net_amount_cents', 15, 0);
    
    // Currency conversion (if applicable)
    table.string('original_currency', 3);
    table.decimal('original_amount_cents', 15, 0);
    table.decimal('exchange_rate', 10, 6);
    table.timestamp('exchange_rate_date');
    
    // Approval chain for refunds
    table.uuid('initiated_by');
    table.uuid('approved_by');
    table.timestamp('approved_at');
    table.text('approval_reason');
    
    // Risk & fraud
    table.integer('fraud_score');
    table.string('risk_level', 20);
    table.boolean('requires_manual_review').defaultTo(false);
    table.boolean('is_flagged').defaultTo(false);
    
    // Metadata
    table.jsonb('payment_details');
    table.jsonb('processor_response');
    table.text('notes');
    
    // Timestamps
    table.timestamp('transaction_date').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['tenant_id', 'transaction_date']);
    table.index('order_id');
    table.index('transaction_id');
    table.index('external_transaction_id');
    table.index(['payment_processor', 'transaction_date']);
    table.index('status');
    table.index('requires_manual_review');
    table.index('is_flagged');
    table.index('initiated_by');
    table.index('approved_by');
  });

  // Create data access logs table
  await knex.schema.createTable('data_access_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    
    // Access details
    table.uuid('user_id').notNullable();
    table.string('user_role', 100).notNullable();
    table.string('access_type', 50).notNullable();
    table.string('resource_type', 100).notNullable();
    table.uuid('resource_id');
    
    // Query/filter details
    table.jsonb('query_params');
    table.jsonb('filters_applied');
    table.integer('records_accessed');
    table.integer('records_modified');
    
    // PII/sensitive data flags
    table.boolean('accessed_pii').notNullable().defaultTo(false);
    table.boolean('accessed_payment_data').notNullable().defaultTo(false);
    table.boolean('accessed_health_data').notNullable().defaultTo(false);
    table.specificType('pii_fields', 'text[]');
    
    // Context
    table.string('ip_address', 45).notNullable();
    table.string('user_agent', 500);
    table.string('request_id', 100);
    table.string('session_id', 100);
    table.string('endpoint', 500);
    table.string('method', 10);
    
    // Business justification
    table.text('purpose');
    table.string('ticket_reference', 100);
    table.boolean('is_automated').notNullable().defaultTo(false);
    
    // Compliance
    table.boolean('requires_review').notNullable().defaultTo(false);
    table.boolean('is_suspicious').notNullable().defaultTo(false);
    table.text('suspicious_reason');
    
    // Timestamps
    table.timestamp('accessed_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['tenant_id', 'accessed_at']);
    table.index(['user_id', 'accessed_at']);
    table.index(['resource_type', 'resource_id']);
    table.index(['accessed_pii', 'accessed_at']);
    table.index(['accessed_payment_data', 'accessed_at']);
    table.index('requires_review');
    table.index('is_suspicious');
    table.index('session_id');
    table.index(['ip_address', 'accessed_at']);
  });

  // Create compliance reports table
  await knex.schema.createTable('compliance_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    
    // Report details
    table.string('report_type', 100).notNullable();
    table.string('report_period', 50).notNullable();
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    
    // Report status
    table.string('status', 50).notNullable().defaultTo('GENERATING');
    table.integer('progress_percentage').defaultTo(0);
    
    // Report content
    table.jsonb('summary');
    table.jsonb('metrics');
    table.jsonb('findings');
    table.jsonb('recommendations');
    table.text('report_url');
    table.string('file_format', 20);
    table.bigInteger('file_size_bytes');
    
    // Evidence collection
    table.integer('audit_logs_included');
    table.integer('access_logs_included');
    table.integer('transaction_logs_included');
    table.jsonb('evidence_summary');
    
    // Certification/attestation
    table.uuid('generated_by');
    table.uuid('reviewed_by');
    table.uuid('approved_by');
    table.timestamp('reviewed_at');
    table.timestamp('approved_at');
    table.text('reviewer_notes');
    
    // Distribution
    table.specificType('recipients', 'text[]');
    table.boolean('is_distributed').defaultTo(false);
    table.timestamp('distributed_at');
    
    // Timestamps
    table.timestamp('generated_at');
    table.timestamps(true, true);
    
    // Indexes
    table.index(['tenant_id', 'created_at']);
    table.index(['report_type', 'period_start', 'period_end']);
    table.index('status');
    table.index(['period_start', 'period_end']);
  });

  // Enable Row Level Security on all audit tables
  await knex.raw(`
    ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE financial_transaction_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE data_access_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;
  `);

  // Create RLS policies
  await knex.raw(`
    CREATE POLICY tenant_isolation_audit_logs ON audit_logs
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_financial_transaction_logs ON financial_transaction_logs
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_data_access_logs ON data_access_logs
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_compliance_reports ON compliance_reports
      USING (tenant_id::text = current_setting('app.current_tenant', true));
  `);

  // Create trigger to prevent updates/deletes on audit_logs (immutable)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER prevent_audit_log_updates
      BEFORE UPDATE ON audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION prevent_audit_log_modification();

    CREATE TRIGGER prevent_audit_log_deletes
      BEFORE DELETE ON audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION prevent_audit_log_modification();
  `);

  // Create function to auto-set expiration dates
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_audit_log_expiration()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Financial and compliance logs: 7 years retention
      IF NEW.is_payment_access OR NEW.log_type IN ('PAYMENT_ACCESS', 'REFUND_ACTION', 'COMPLIANCE_EVENT') THEN
        NEW.expires_at := NEW.created_at + INTERVAL '7 years';
      -- Security events: 3 years retention
      ELSIF NEW.log_type = 'SECURITY_EVENT' OR NEW.is_suspicious THEN
        NEW.expires_at := NEW.created_at + INTERVAL '3 years';
      -- Regular logs: 1 year retention
      ELSE
        NEW.expires_at := NEW.created_at + INTERVAL '1 year';
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER set_expiration_on_insert
      BEFORE INSERT ON audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION set_audit_log_expiration();
  `);

  await knex.raw(`
    COMMENT ON TABLE audit_logs IS 'Immutable audit log for SOC 2, GDPR, and PCI DSS compliance - 1-7 year retention'
  `);
  
  await knex.raw(`
    COMMENT ON TABLE financial_transaction_logs IS '7-year retention financial transaction audit log for compliance'
  `);
  
  await knex.raw(`
    COMMENT ON TABLE data_access_logs IS 'GDPR-compliant data access audit trail'
  `);
  
  await knex.raw(`
    COMMENT ON TABLE compliance_reports IS 'Automated compliance report generation and distribution'
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse order: 037, 032, 031, 008, 007, 006, 005
  
  // Section 7: Audit logging system (from 037)
  await knex.raw('DROP TRIGGER IF EXISTS prevent_audit_log_updates ON audit_logs');
  await knex.raw('DROP TRIGGER IF EXISTS prevent_audit_log_deletes ON audit_logs');
  await knex.raw('DROP TRIGGER IF EXISTS set_expiration_on_insert ON audit_logs');
  await knex.raw('DROP FUNCTION IF EXISTS prevent_audit_log_modification()');
  await knex.raw('DROP FUNCTION IF EXISTS set_audit_log_expiration()');
  
  await knex.schema.dropTableIfExists('compliance_reports');
  await knex.schema.dropTableIfExists('data_access_logs');
  await knex.schema.dropTableIfExists('financial_transaction_logs');
  await knex.schema.dropTableIfExists('audit_logs');
  
  await knex.raw('DROP TYPE IF EXISTS audit_log_severity');
  await knex.raw('DROP TYPE IF EXISTS audit_log_type');

  // Section 6: Payment access audit (from 032)
  await knex.schema.dropTableIfExists('payment_access_audit_log');

  // Section 5: MFA tables (from 031)
  await knex.schema.dropTableIfExists('mfa_verification_attempts');
  await knex.schema.dropTableIfExists('mfa_methods');

  // Section 4: Job execution tables (from 008)
  await knex.schema.dropTableIfExists('job_alerts');
  await knex.schema.dropTableIfExists('job_execution_history');

  // Section 3: Dead letter queue (from 007)
  await knex.schema.dropTableIfExists('dead_letter_queue');

  // Section 2: Event store (from 006)
  await knex.schema.dropTableIfExists('event_store');

  // Section 1: Archive schema and tables (from 005)
  await knex.schema.withSchema('archive').dropTableIfExists('archive_audit_log');
  await knex.schema.withSchema('archive').dropTableIfExists('order_refunds');
  await knex.schema.withSchema('archive').dropTableIfExists('order_discounts');
  await knex.schema.withSchema('archive').dropTableIfExists('order_addresses');
  await knex.schema.withSchema('archive').dropTableIfExists('order_events');
  await knex.schema.withSchema('archive').dropTableIfExists('order_items');
  await knex.schema.withSchema('archive').dropTableIfExists('orders');
  
  // Drop archive schema
  await knex.raw('DROP SCHEMA IF EXISTS archive CASCADE');
}
