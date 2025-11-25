import { Knex } from 'knex';

/**
 * PHASE 6: ANALYTICS & ADMIN OPERATIONS
 * 
 * Consolidates migrations 021-027:
 * - Order reports & scheduling (021)
 * - Customer analytics & segmentation (022)
 * - Financial reconciliation & chargebacks (023)
 * - Order search optimization (024) - MODIFIES orders table
 * - Admin overrides & approval workflows (025)
 * - Customer notes & interaction history (026)
 * - Fraud detection & prevention (027)
 * 
 * Tables created: 23
 * Tables modified: 1 (orders - adds search_vector column)
 * 
 * ENUM types: 8
 * PostgreSQL Extensions: pg_trgm (fuzzy text matching)
 * Special Features: Full-text search, trigram indexes, trigger functions, data backfill
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // SECTION 1: EXTENSIONS & PREREQUISITES
  // ============================================================================
  
  // Enable pg_trgm extension for fuzzy text matching (from migration 024)
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');

  // ============================================================================
  // SECTION 2: ENUM TYPES (8 total)
  // ============================================================================
  
  // From migration 021: Order Reports
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE report_type AS ENUM (
        'DAILY_SUMMARY',
        'WEEKLY_SUMMARY',
        'MONTHLY_SUMMARY',
        'REVENUE_BY_EVENT',
        'REVENUE_BY_VENUE',
        'REFUND_RATE',
        'CONVERSION_FUNNEL',
        'CUSTOM'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE report_format AS ENUM (
        'JSON',
        'CSV',
        'PDF',
        'EXCEL'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE report_status AS ENUM (
        'PENDING',
        'GENERATING',
        'COMPLETED',
        'FAILED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // From migration 022: Customer Analytics
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE customer_segment AS ENUM (
        'VIP',
        'REGULAR',
        'AT_RISK',
        'NEW',
        'INACTIVE',
        'CHURNED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // From migration 023: Financial Reconciliation
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE transaction_type AS ENUM (
        'PAYMENT',
        'REFUND',
        'CHARGEBACK',
        'FEE',
        'ADJUSTMENT'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE reconciliation_status AS ENUM (
        'PENDING',
        'MATCHED',
        'DISCREPANCY',
        'RESOLVED',
        'INVESTIGATING'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // From migration 025: Admin Overrides
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE admin_override_type AS ENUM (
        'STATUS_CHANGE',
        'EXTEND_EXPIRATION',
        'MANUAL_DISCOUNT',
        'WAIVE_CANCELLATION_FEE',
        'WAIVE_REFUND_FEE',
        'ADJUST_PRICE',
        'FORCE_CONFIRM',
        'FORCE_CANCEL'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE override_approval_status AS ENUM (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'AUTO_APPROVED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // From migration 026: Customer Notes
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE order_note_type AS ENUM (
        'CUSTOMER_INQUIRY',
        'ISSUE_REPORTED',
        'RESOLUTION',
        'VIP_MARKER',
        'FRAUD_SUSPICION',
        'PAYMENT_ISSUE',
        'DELIVERY_ISSUE',
        'GENERAL',
        'INTERNAL_NOTE'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // From migration 027: Fraud Detection
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE fraud_risk_level AS ENUM (
        'LOW',
        'MEDIUM',
        'HIGH',
        'CRITICAL'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE fraud_detection_method AS ENUM (
        'VELOCITY_CHECK',
        'DUPLICATE_ORDER',
        'GEO_ANOMALY',
        'PAYMENT_PATTERN',
        'DEVICE_FINGERPRINT',
        'BEHAVIORAL',
        'EXTERNAL_SERVICE',
        'MANUAL_REVIEW'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // ============================================================================
  // SECTION 3: REPORTING & ANALYTICS TABLES (Migrations 021-023)
  // ============================================================================
  
  // --- Migration 021: Order Reports ---
  
  // Create order_reports table
  await knex.schema.createTable('order_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.specificType('report_type', 'report_type').notNullable();
    table.specificType('report_format', 'report_format').notNullable();
    table.specificType('status', 'report_status').notNullable().defaultTo('PENDING');
    
    // Date range
    table.timestamp('start_date', { useTz: true }).notNullable();
    table.timestamp('end_date', { useTz: true }).notNullable();
    
    // Filters (JSON for flexibility)
    table.jsonb('filters').defaultTo('{}');
    
    // Report data and metadata
    table.jsonb('data');
    table.text('file_path');
    table.integer('file_size_bytes');
    
    // Generation info
    table.uuid('generated_by');
    table.timestamp('generated_at', { useTz: true });
    table.text('error_message');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Constraints
    table.check('end_date >= start_date', [], 'valid_date_range');
  });

  // Create report_schedules table
  await knex.schema.createTable('report_schedules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    
    // Schedule configuration
    table.string('name', 255).notNullable();
    table.text('description');
    table.specificType('report_type', 'report_type').notNullable();
    table.specificType('report_format', 'report_format').notNullable();
    
    // Schedule timing (cron-like)
    table.string('frequency', 50).notNullable();
    table.string('cron_expression', 100);
    table.string('timezone', 50).defaultTo('UTC');
    
    // Date range configuration
    table.string('date_range_type', 50).notNullable();
    table.integer('custom_days_back');
    
    // Filters and options
    table.jsonb('filters').defaultTo('{}');
    
    // Delivery
    table.specificType('recipients', 'text[]');
    table.boolean('enabled').defaultTo(true);
    
    // Execution tracking
    table.timestamp('last_run_at', { useTz: true });
    table.uuid('last_report_id').references('id').inTable('order_reports');
    table.timestamp('next_run_at', { useTz: true });
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // --- Migration 022: Customer Analytics ---
  
  // Create customer_analytics table
  await knex.schema.createTable('customer_analytics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    
    // Lifetime metrics
    table.bigInteger('lifetime_value_cents').defaultTo(0);
    table.integer('total_orders').defaultTo(0);
    table.integer('completed_orders').defaultTo(0);
    table.integer('cancelled_orders').defaultTo(0);
    table.integer('refunded_orders').defaultTo(0);
    
    // Average metrics
    table.bigInteger('avg_order_value_cents').defaultTo(0);
    table.decimal('avg_items_per_order', 10, 2).defaultTo(0);
    
    // Timing metrics
    table.timestamp('first_order_date', { useTz: true });
    table.timestamp('last_order_date', { useTz: true });
    table.integer('days_since_last_order');
    table.decimal('avg_days_between_orders', 10, 2);
    
    // Frequency metrics
    table.integer('orders_last_30_days').defaultTo(0);
    table.integer('orders_last_90_days').defaultTo(0);
    table.integer('orders_last_365_days').defaultTo(0);
    
    // Engagement metrics
    table.decimal('email_open_rate', 5, 2);
    table.decimal('email_click_rate', 5, 2);
    table.specificType('preferred_event_categories', 'text[]');
    
    // Segmentation
    table.specificType('segment', 'customer_segment').defaultTo('NEW');
    table.timestamp('segment_updated_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Risk indicators
    table.integer('chargeback_count').defaultTo(0);
    table.decimal('refund_rate', 5, 2).defaultTo(0);
    
    // Timestamps
    table.timestamp('calculated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Unique constraint
    table.unique(['tenant_id', 'user_id']);
  });

  // Create customer_segments table
  await knex.schema.createTable('customer_segments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    
    // Segment configuration
    table.specificType('segment_name', 'customer_segment').notNullable();
    table.string('display_name', 255).notNullable();
    table.text('description');
    
    // Segment criteria (stored as JSONB for flexibility)
    table.jsonb('criteria').notNullable();
    
    // Segment benefits/actions
    table.specificType('benefits', 'text[]');
    table.jsonb('automated_actions');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Unique constraint
    table.unique(['tenant_id', 'segment_name']);
  });

  // Create customer_segment_history table
  await knex.schema.createTable('customer_segment_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    
    table.specificType('previous_segment', 'customer_segment');
    table.specificType('new_segment', 'customer_segment').notNullable();
    
    table.text('reason');
    table.timestamp('changed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // --- Migration 023: Financial Reconciliation ---
  
  // Create financial_transactions table
  await knex.schema.createTable('financial_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').references('id').inTable('orders');
    
    // Transaction details
    table.specificType('transaction_type', 'transaction_type').notNullable();
    table.timestamp('transaction_date', { useTz: true }).notNullable();
    
    // Payment processor info
    table.string('processor', 50).notNullable();
    table.string('processor_transaction_id', 255);
    table.string('processor_reference', 255);
    
    // Amounts (in cents)
    table.bigInteger('gross_amount_cents').notNullable();
    table.bigInteger('fee_amount_cents').defaultTo(0);
    table.bigInteger('net_amount_cents').notNullable();
    
    // Currency
    table.string('currency', 3).defaultTo('USD');
    
    // Additional context
    table.text('description');
    table.jsonb('metadata').defaultTo('{}');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Constraint
    table.check('net_amount_cents = gross_amount_cents - fee_amount_cents', [], 'valid_net_amount');
  });

  // Create reconciliation_reports table
  await knex.schema.createTable('reconciliation_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    
    // Report period
    table.date('report_date').notNullable();
    table.string('processor', 50).notNullable();
    
    // Reconciliation summary
    table.specificType('status', 'reconciliation_status').notNullable().defaultTo('PENDING');
    
    // Counts
    table.integer('total_transactions').defaultTo(0);
    table.integer('matched_transactions').defaultTo(0);
    table.integer('discrepancy_transactions').defaultTo(0);
    
    // Amounts (in cents)
    table.bigInteger('expected_amount_cents').defaultTo(0);
    table.bigInteger('actual_amount_cents').defaultTo(0);
    table.bigInteger('difference_cents').defaultTo(0);
    
    // Details
    table.jsonb('discrepancies').defaultTo('[]');
    table.text('notes');
    
    // Reconciliation info
    table.uuid('reconciled_by');
    table.timestamp('reconciled_at', { useTz: true });
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Unique constraint
    table.unique(['tenant_id', 'report_date', 'processor']);
  });

  // Create fee_breakdown table
  await knex.schema.createTable('fee_breakdown', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable().references('id').inTable('orders');
    table.uuid('transaction_id').references('id').inTable('financial_transactions');
    
    // Fee types
    table.bigInteger('platform_fee_cents').defaultTo(0);
    table.bigInteger('processing_fee_cents').defaultTo(0);
    table.bigInteger('tax_cents').defaultTo(0);
    table.bigInteger('other_fees_cents').defaultTo(0);
    
    // Total
    table.bigInteger('total_fees_cents').notNullable();
    
    // Fee calculation details
    table.decimal('platform_fee_rate', 5, 4);
    table.decimal('processing_fee_rate', 5, 4);
    table.integer('processing_fee_fixed_cents');
    table.decimal('tax_rate', 5, 4);
    
    // Calculation metadata
    table.jsonb('calculation_details').defaultTo('{}');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Constraint
    table.check(
      'total_fees_cents = platform_fee_cents + processing_fee_cents + tax_cents + other_fees_cents',
      [],
      'valid_total_fees'
    );
  });

  // Create chargeback_tracking table
  await knex.schema.createTable('chargeback_tracking', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable().references('id').inTable('orders');
    table.uuid('transaction_id').references('id').inTable('financial_transactions');
    
    // Chargeback details
    table.timestamp('chargeback_date', { useTz: true }).notNullable();
    table.bigInteger('chargeback_amount_cents').notNullable();
    table.string('currency', 3).defaultTo('USD');
    
    // Reason
    table.string('reason_code', 50);
    table.text('reason_description');
    
    // Processor info
    table.string('processor', 50).notNullable();
    table.string('processor_chargeback_id', 255);
    
    // Status
    table.string('status', 50).defaultTo('RECEIVED');
    
    // Response
    table.boolean('disputed').defaultTo(false);
    table.text('dispute_response');
    table.jsonb('dispute_evidence');
    
    // Resolution
    table.timestamp('resolved_at', { useTz: true });
    table.text('resolution_notes');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ============================================================================
  // SECTION 4: ORDERS TABLE MODIFICATION (Migration 024)
  // ============================================================================
  
  // Add full-text search column to orders table
  await knex.schema.alterTable('orders', (table) => {
    table.specificType('search_vector', 'tsvector');
  });

  // Create function to update search vector
  await knex.raw(`
    CREATE OR REPLACE FUNCTION orders_search_vector_trigger() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.id::text, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.customer_email, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.customer_name, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.customer_phone, '')), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger to auto-update search vector
  await knex.raw(`
    DROP TRIGGER IF EXISTS orders_search_vector_update ON orders;
    CREATE TRIGGER orders_search_vector_update
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION orders_search_vector_trigger();
  `);

  // ============================================================================
  // SECTION 5: ADMIN TOOLS TABLES (Migrations 024-027)
  // ============================================================================
  
  // --- Migration 024: Search Tables ---
  
  // Create saved_searches table
  await knex.schema.createTable('saved_searches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('admin_user_id').notNullable();
    table.string('name', 255).notNullable();
    table.jsonb('filters').notNullable();
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Create search_history table
  await knex.schema.createTable('search_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('admin_user_id').notNullable();
    table.text('query').notNullable();
    table.jsonb('filters');
    table.integer('results_count');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // --- Migration 025: Admin Overrides ---
  
  // Create admin_overrides table
  await knex.schema.createTable('admin_overrides', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('admin_user_id').notNullable();
    table.specificType('override_type', 'admin_override_type').notNullable();
    table.jsonb('original_value');
    table.jsonb('new_value');
    table.text('reason').notNullable();
    table.specificType('approval_status', 'override_approval_status').defaultTo('AUTO_APPROVED');
    table.uuid('approved_by');
    table.timestamp('approved_at', { useTz: true });
    table.text('rejection_reason');
    table.jsonb('metadata');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Create admin_approval_workflow table
  await knex.schema.createTable('admin_approval_workflow', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.specificType('override_type', 'admin_override_type').notNullable();
    table.boolean('requires_approval').defaultTo(true);
    table.string('min_approval_level', 50).notNullable();
    table.integer('approval_timeout_hours').defaultTo(24);
    table.specificType('notify_roles', 'text[]');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Create admin_override_audit table
  await knex.schema.createTable('admin_override_audit', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('override_id').notNullable().references('id').inTable('admin_overrides').onDelete('CASCADE');
    table.string('action', 50).notNullable();
    table.uuid('actor_user_id').notNullable();
    table.string('actor_role', 50);
    table.jsonb('changes');
    table.specificType('ip_address', 'inet');
    table.text('user_agent');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // --- Migration 026: Customer Notes ---
  
  // Create order_notes table
  await knex.schema.createTable('order_notes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('user_id');
    table.uuid('admin_user_id').notNullable();
    table.specificType('note_type', 'order_note_type').notNullable();
    table.text('content').notNullable();
    table.boolean('is_internal').defaultTo(true);
    table.boolean('is_flagged').defaultTo(false);
    table.specificType('tags', 'text[]');
    table.jsonb('attachments');
    table.specificType('mentioned_users', 'uuid[]');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Create customer_interaction_history table
  await knex.schema.createTable('customer_interaction_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('order_id').references('id').inTable('orders').onDelete('SET NULL');
    table.uuid('admin_user_id').notNullable();
    table.string('interaction_type', 50).notNullable();
    table.string('channel', 50).notNullable();
    table.string('subject', 500);
    table.text('summary').notNullable();
    table.integer('duration_seconds');
    table.string('resolution_status', 50);
    table.integer('satisfaction_score');
    table.string('ticket_id', 255);
    table.string('ticket_system', 50);
    table.jsonb('metadata');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // CHECK constraint
    table.check('satisfaction_score >= 1 AND satisfaction_score <= 5', [], 'valid_satisfaction_score');
  });

  // Create note_templates table
  await knex.schema.createTable('note_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.specificType('note_type', 'order_note_type').notNullable();
    table.text('content_template').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.integer('usage_count').defaultTo(0);
    table.uuid('created_by').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // --- Migration 027: Fraud Detection ---
  
  // Create fraud_scores table
  await knex.schema.createTable('fraud_scores', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('user_id').notNullable();
    table.integer('score').notNullable();
    table.specificType('risk_level', 'fraud_risk_level').notNullable();
    table.jsonb('factors').notNullable();
    table.specificType('detection_methods', 'fraud_detection_method[]');
    table.boolean('is_reviewed').defaultTo(false);
    table.uuid('reviewed_by');
    table.timestamp('reviewed_at', { useTz: true });
    table.string('resolution', 50);
    table.text('resolution_notes');
    table.jsonb('external_scores');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Check constraint
    table.check('score >= 0 AND score <= 100', [], 'valid_score_range');
  });

  // Create fraud_rules table
  await knex.schema.createTable('fraud_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.string('rule_type', 50).notNullable();
    table.jsonb('conditions').notNullable();
    table.integer('score_impact').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.integer('priority').defaultTo(0);
    table.uuid('created_by').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Check constraint
    table.check('score_impact >= 0 AND score_impact <= 100', [], 'valid_score_impact');
  });

  // Create blocked_entities table
  await knex.schema.createTable('blocked_entities', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('entity_type', 50).notNullable();
    table.string('entity_value', 500).notNullable();
    table.text('block_reason').notNullable();
    table.boolean('is_permanent').defaultTo(false);
    table.timestamp('blocked_until', { useTz: true });
    table.uuid('blocked_by').notNullable();
    table.text('unblock_reason');
    table.uuid('unblocked_by');
    table.timestamp('unblocked_at', { useTz: true });
    table.jsonb('metadata');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Create fraud_alerts table
  await knex.schema.createTable('fraud_alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('fraud_score_id').notNullable().references('id').inTable('fraud_scores').onDelete('CASCADE');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.string('alert_type', 50).notNullable();
    table.string('severity', 20).notNullable();
    table.text('message').notNullable();
    table.boolean('is_acknowledged').defaultTo(false);
    table.uuid('acknowledged_by');
    table.timestamp('acknowledged_at', { useTz: true });
    table.jsonb('actions_taken');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Create order_velocity_tracking table
  await knex.schema.createTable('order_velocity_tracking', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('tracking_key', 255).notNullable();
    table.integer('window_minutes').notNullable();
    table.integer('order_count').notNullable();
    table.bigInteger('total_amount_cents').notNullable();
    table.timestamp('first_order_at', { useTz: true }).notNullable();
    table.timestamp('last_order_at', { useTz: true }).notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Create fraud_pattern_analysis table
  await knex.schema.createTable('fraud_pattern_analysis', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('pattern_type', 100).notNullable();
    table.text('pattern_signature').notNullable();
    table.integer('occurrence_count').defaultTo(1);
    table.specificType('affected_orders', 'uuid[]');
    table.specificType('affected_users', 'uuid[]');
    table.decimal('confidence_score', 5, 2);
    table.timestamp('first_detected_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_detected_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ============================================================================
  // SECTION 6: ALL INDEXES (~55 indexes)
  // ============================================================================
  
  // --- Migration 021 Indexes: Order Reports ---
  await knex.schema.alterTable('order_reports', (table) => {
    table.index(['tenant_id', 'report_type'], 'idx_order_reports_tenant_type');
    table.index('created_at', 'idx_order_reports_created');
    table.index(['tenant_id', 'start_date', 'end_date'], 'idx_order_reports_date_range');
  });
  
  await knex.raw(`
    CREATE INDEX idx_order_reports_status 
    ON order_reports(status) WHERE status IN ('PENDING', 'GENERATING')
  `);

  await knex.schema.alterTable('report_schedules', (table) => {
    table.index('tenant_id', 'idx_report_schedules_tenant');
  });

  await knex.raw(`
    CREATE INDEX idx_report_schedules_enabled 
    ON report_schedules(enabled, next_run_at) WHERE enabled = true
  `);

  // --- Migration 022 Indexes: Customer Analytics ---
  await knex.schema.alterTable('customer_analytics', (table) => {
    table.index(['tenant_id', 'user_id'], 'idx_customer_analytics_tenant_user');
    table.index(['tenant_id', 'segment'], 'idx_customer_analytics_segment');
    table.index('last_order_date', 'idx_customer_analytics_last_order');
  });

  await knex.raw(`
    CREATE INDEX idx_customer_analytics_ltv 
    ON customer_analytics(tenant_id, lifetime_value_cents DESC)
  `);

  await knex.raw(`
    CREATE INDEX idx_customer_analytics_at_risk 
    ON customer_analytics(tenant_id, days_since_last_order) 
    WHERE segment IN ('AT_RISK', 'INACTIVE')
  `);

  await knex.schema.alterTable('customer_segments', (table) => {
    table.index('tenant_id', 'idx_customer_segments_tenant');
  });

  await knex.schema.alterTable('customer_segment_history', (table) => {
    table.index(['tenant_id', 'user_id', 'changed_at'], 'idx_customer_segment_history_user');
  });

  // --- Migration 023 Indexes: Financial Reconciliation ---
  await knex.schema.alterTable('financial_transactions', (table) => {
    table.index(['tenant_id', 'transaction_date'], 'idx_financial_transactions_tenant_date');
    table.index('order_id', 'idx_financial_transactions_order');
    table.index(['processor', 'transaction_date'], 'idx_financial_transactions_processor');
    table.index('processor_transaction_id', 'idx_financial_transactions_processor_id');
  });

  await knex.schema.alterTable('reconciliation_reports', (table) => {
    table.index(['tenant_id', 'report_date'], 'idx_reconciliation_reports_tenant_date');
  });

  await knex.raw(`
    CREATE INDEX idx_reconciliation_reports_status 
    ON reconciliation_reports(status) WHERE status IN ('PENDING', 'DISCREPANCY')
  `);

  await knex.schema.alterTable('fee_breakdown', (table) => {
    table.index('order_id', 'idx_fee_breakdown_order');
    table.index('transaction_id', 'idx_fee_breakdown_transaction');
  });

  await knex.schema.alterTable('chargeback_tracking', (table) => {
    table.index(['tenant_id', 'chargeback_date'], 'idx_chargeback_tracking_tenant');
    table.index('order_id', 'idx_chargeback_tracking_order');
  });

  await knex.raw(`
    CREATE INDEX idx_chargeback_tracking_status 
    ON chargeback_tracking(status) WHERE status IN ('RECEIVED', 'DISPUTED')
  `);

  // --- Migration 024 Indexes: Search Optimization ---
  
  // GIN index for full-text search on orders
  await knex.raw(`
    CREATE INDEX idx_orders_search_vector 
    ON orders USING GIN (search_vector)
  `);

  // Trigram indexes for fuzzy matching
  await knex.raw(`
    CREATE INDEX idx_orders_email_trgm 
    ON orders USING GIN (customer_email gin_trgm_ops)
  `);

  await knex.raw(`
    CREATE INDEX idx_orders_name_trgm 
    ON orders USING GIN (customer_name gin_trgm_ops)
  `);

  await knex.raw(`
    CREATE INDEX idx_orders_phone_trgm 
    ON orders USING GIN (customer_phone gin_trgm_ops)
  `);

  // Composite indexes for advanced filtering
  await knex.raw(`
    CREATE INDEX idx_orders_tenant_created_status 
    ON orders (tenant_id, created_at DESC, status)
  `);

  await knex.raw(`
    CREATE INDEX idx_orders_tenant_event_created 
    ON orders (tenant_id, event_id, created_at DESC)
  `);

  await knex.schema.alterTable('saved_searches', (table) => {
    table.index(['tenant_id', 'admin_user_id'], 'idx_saved_searches_tenant_admin');
  });

  await knex.schema.alterTable('search_history', (table) => {
    table.index(['tenant_id', 'admin_user_id', 'created_at'], 'idx_search_history_tenant_admin_created');
  });

  // --- Migration 025 Indexes: Admin Overrides ---
  await knex.schema.alterTable('admin_overrides', (table) => {
    table.index(['tenant_id', 'order_id'], 'idx_admin_overrides_tenant_order');
    table.index(['tenant_id', 'created_at'], 'idx_admin_overrides_tenant_created');
    table.index(['admin_user_id', 'created_at'], 'idx_admin_overrides_admin_user');
  });

  await knex.raw(`
    CREATE INDEX idx_admin_overrides_approval_status 
    ON admin_overrides(approval_status, created_at DESC) 
    WHERE approval_status = 'PENDING'
  `);

  await knex.schema.alterTable('admin_approval_workflow', (table) => {
    table.index(['tenant_id', 'override_type'], 'idx_approval_workflow_tenant_type');
  });

  await knex.schema.alterTable('admin_override_audit', (table) => {
    table.index(['tenant_id', 'override_id', 'created_at'], 'idx_override_audit_tenant_override');
    table.index(['actor_user_id', 'created_at'], 'idx_override_audit_actor');
  });

  // --- Migration 026 Indexes: Customer Notes ---
  await knex.schema.alterTable('order_notes', (table) => {
    table.index(['tenant_id', 'order_id', 'created_at'], 'idx_order_notes_tenant_order');
    table.index(['admin_user_id', 'created_at'], 'idx_order_notes_admin_user');
  });

  await knex.raw(`
    CREATE INDEX idx_order_notes_flagged 
    ON order_notes(tenant_id, is_flagged, created_at DESC) 
    WHERE is_flagged = true
  `);

  await knex.raw(`
    CREATE INDEX idx_order_notes_tags 
    ON order_notes USING GIN (tags)
  `);

  await knex.schema.alterTable('customer_interaction_history', (table) => {
    table.index(['tenant_id', 'user_id', 'created_at'], 'idx_interaction_history_tenant_user');
    table.index(['tenant_id', 'order_id', 'created_at'], 'idx_interaction_history_tenant_order');
    table.index(['admin_user_id', 'created_at'], 'idx_interaction_history_admin');
    table.index(['tenant_id', 'resolution_status', 'created_at'], 'idx_interaction_history_resolution');
  });

  await knex.raw(`
    CREATE INDEX idx_interaction_history_ticket 
    ON customer_interaction_history(ticket_id) 
    WHERE ticket_id IS NOT NULL
  `);

  await knex.schema.alterTable('note_templates', (table) => {
    table.index(['tenant_id', 'note_type', 'is_active'], 'idx_note_templates_tenant_type');
  });

  // --- Migration 027 Indexes: Fraud Detection ---
  await knex.schema.alterTable('fraud_scores', (table) => {
    table.index(['tenant_id', 'order_id'], 'idx_fraud_scores_tenant_order');
    table.index(['tenant_id', 'risk_level', 'created_at'], 'idx_fraud_scores_tenant_risk');
    table.index(['user_id', 'created_at'], 'idx_fraud_scores_user');
  });

  await knex.raw(`
    CREATE INDEX idx_fraud_scores_unreviewed 
    ON fraud_scores(tenant_id, is_reviewed, created_at DESC) 
    WHERE is_reviewed = false AND risk_level IN ('HIGH', 'CRITICAL')
  `);

  await knex.schema.alterTable('fraud_rules', (table) => {
    table.index(['tenant_id', 'is_active', 'priority'], 'idx_fraud_rules_tenant_active');
  });

  await knex.schema.alterTable('blocked_entities', (table) => {
    table.index(['tenant_id', 'entity_type', 'entity_value'], 'idx_blocked_entities_tenant_type_value');
  });

  await knex.raw(`
    CREATE INDEX idx_blocked_entities_active 
    ON blocked_entities(tenant_id, entity_type) 
    WHERE unblocked_at IS NULL
  `);

  await knex.schema.alterTable('fraud_alerts', (table) => {
    table.index(['fraud_score_id', 'created_at'], 'idx_fraud_alerts_fraud_score');
  });

  await knex.raw(`
    CREATE INDEX idx_fraud_alerts_tenant_unacked 
    ON fraud_alerts(tenant_id, is_acknowledged, created_at DESC) 
    WHERE is_acknowledged = false
  `);

  await knex.schema.alterTable('order_velocity_tracking', (table) => {
    table.index(['tenant_id', 'user_id', 'tracking_key'], 'idx_velocity_tracking_tenant_user_key');
  });

  await knex.raw(`
    CREATE INDEX idx_velocity_tracking_expires 
    ON order_velocity_tracking(expires_at) 
    WHERE expires_at > NOW()
  `);

  await knex.schema.alterTable('fraud_pattern_analysis', (table) => {
    table.index(['tenant_id', 'is_active', 'last_detected_at'], 'idx_fraud_patterns_tenant_active');
    table.index('pattern_signature', 'idx_fraud_patterns_signature');
  });

  // ============================================================================
  // SECTION 7: RLS POLICIES (Enable + Policies for ~18 tables)
  // ============================================================================
  
  // Enable RLS
  await knex.raw('ALTER TABLE order_reports ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE customer_analytics ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE customer_segment_history ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE reconciliation_reports ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE fee_breakdown ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE chargeback_tracking ENABLE ROW LEVEL SECURITY');
  
  // Create RLS policies
  await knex.raw(`
    CREATE POLICY order_reports_tenant_isolation ON order_reports
    USING (tenant_id::TEXT = current_setting('app.current_tenant', TRUE))
  `);

  await knex.raw(`
    CREATE POLICY report_schedules_tenant_isolation ON report_schedules
    USING (tenant_id::TEXT = current_setting('app.current_tenant', TRUE))
  `);

  await knex.raw(`
    CREATE POLICY customer_analytics_tenant_isolation ON customer_analytics
    USING (tenant_id::TEXT = current_setting('app.current_tenant', TRUE))
  `);

  await knex.raw(`
    CREATE POLICY customer_segments_tenant_isolation ON customer_segments
    USING (tenant_id::TEXT = current_setting('app.current_tenant', TRUE))
  `);

  await knex.raw(`
    CREATE POLICY customer_segment_history_tenant_isolation ON customer_segment_history
    USING (tenant_id::TEXT = current_setting('app.current_tenant', TRUE))
  `);

  await knex.raw(`
    CREATE POLICY financial_transactions_tenant_isolation ON financial_transactions
    USING (tenant_id::TEXT = current_setting('app.current_tenant', TRUE))
  `);

  await knex.raw(`
    CREATE POLICY reconciliation_reports_tenant_isolation ON reconciliation_reports
    USING (tenant_id::TEXT = current_setting('app.current_tenant', TRUE))
  `);

  await knex.raw(`
    CREATE POLICY fee_breakdown_tenant_isolation ON fee_breakdown
    USING (tenant_id::TEXT = current_setting('app.current_tenant', TRUE))
  `);

  await knex.raw(`
    CREATE POLICY chargeback_tracking_tenant_isolation ON chargeback_tracking
    USING (tenant_id::TEXT = current_setting('app.current_tenant', TRUE))
  `);

  // ============================================================================
  // SECTION 8: UPDATED_AT TRIGGERS
  // ============================================================================
  
  await knex.raw(`
    CREATE TRIGGER update_order_reports_updated_at
    BEFORE UPDATE ON order_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_report_schedules_updated_at
    BEFORE UPDATE ON report_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_customer_analytics_updated_at
    BEFORE UPDATE ON customer_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_customer_segments_updated_at
    BEFORE UPDATE ON customer_segments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_financial_transactions_updated_at
    BEFORE UPDATE ON financial_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_reconciliation_reports_updated_at
    BEFORE UPDATE ON reconciliation_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_chargeback_tracking_updated_at
    BEFORE UPDATE ON chargeback_tracking
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_saved_searches_updated_at
    BEFORE UPDATE ON saved_searches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_admin_overrides_updated_at
    BEFORE UPDATE ON admin_overrides
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_admin_approval_workflow_updated_at
    BEFORE UPDATE ON admin_approval_workflow
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_order_notes_updated_at
    BEFORE UPDATE ON order_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_customer_interaction_history_updated_at
    BEFORE UPDATE ON customer_interaction_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_note_templates_updated_at
    BEFORE UPDATE ON note_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_fraud_scores_updated_at
    BEFORE UPDATE ON fraud_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_fraud_rules_updated_at
    BEFORE UPDATE ON fraud_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_blocked_entities_updated_at
    BEFORE UPDATE ON blocked_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_fraud_pattern_analysis_updated_at
    BEFORE UPDATE ON fraud_pattern_analysis
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  // ============================================================================
  // SECTION 9: DATA BACKFILL & INSERTS
  // ============================================================================
  
  // Backfill search vectors for existing orders
  await knex.raw(`
    UPDATE orders 
    SET search_vector = 
      setweight(to_tsvector('english', COALESCE(id::text, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(customer_email, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(customer_name, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(customer_phone, '')), 'C')
    WHERE search_vector IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse order: 027, 026, 025, 024, 023, 022, 021
  
  // Section 9: No need to rollback data backfill
  
  // Section 8: Triggers dropped automatically with tables
  
  // Section 7: RLS policies dropped automatically with tables
  
  // Section 6: Indexes dropped automatically with tables
  
  // Section 5: Drop Admin Tools Tables (027-024)
  await knex.schema.dropTableIfExists('fraud_pattern_analysis');
  await knex.schema.dropTableIfExists('order_velocity_tracking');
  await knex.schema.dropTableIfExists('fraud_alerts');
  await knex.schema.dropTableIfExists('blocked_entities');
  await knex.schema.dropTableIfExists('fraud_rules');
  await knex.schema.dropTableIfExists('fraud_scores');
  
  await knex.schema.dropTableIfExists('note_templates');
  await knex.schema.dropTableIfExists('customer_interaction_history');
  await knex.schema.dropTableIfExists('order_notes');
  
  await knex.schema.dropTableIfExists('admin_override_audit');
  await knex.schema.dropTableIfExists('admin_approval_workflow');
  await knex.schema.dropTableIfExists('admin_overrides');
  
  await knex.schema.dropTableIfExists('search_history');
  await knex.schema.dropTableIfExists('saved_searches');
  
  // Section 4: Revert Orders Table Modification
  await knex.raw('DROP TRIGGER IF EXISTS orders_search_vector_update ON orders');
  await knex.raw('DROP FUNCTION IF EXISTS orders_search_vector_trigger()');
  
  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('search_vector');
  });
  
  // Section 3: Drop Reporting & Analytics Tables (023-021)
  await knex.schema.dropTableIfExists('chargeback_tracking');
  await knex.schema.dropTableIfExists('fee_breakdown');
  await knex.schema.dropTableIfExists('reconciliation_reports');
  await knex.schema.dropTableIfExists('financial_transactions');
  
  await knex.schema.dropTableIfExists('customer_segment_history');
  await knex.schema.dropTableIfExists('customer_segments');
  await knex.schema.dropTableIfExists('customer_analytics');
  
  await knex.schema.dropTableIfExists('report_schedules');
  await knex.schema.dropTableIfExists('order_reports');
  
  // Section 2: Drop ENUMs
  await knex.raw('DROP TYPE IF EXISTS fraud_detection_method');
  await knex.raw('DROP TYPE IF EXISTS fraud_risk_level');
  await knex.raw('DROP TYPE IF EXISTS order_note_type');
  await knex.raw('DROP TYPE IF EXISTS override_approval_status');
  await knex.raw('DROP TYPE IF EXISTS admin_override_type');
  await knex.raw('DROP TYPE IF EXISTS reconciliation_status');
  await knex.raw('DROP TYPE IF EXISTS transaction_type');
  await knex.raw('DROP TYPE IF EXISTS customer_segment');
  await knex.raw('DROP TYPE IF EXISTS report_status');
  await knex.raw('DROP TYPE IF EXISTS report_format');
  await knex.raw('DROP TYPE IF EXISTS report_type');
  
  // Section 1: Extension remains (safe to leave)
  // pg_trgm extension not dropped as it may be used by other migrations
}
