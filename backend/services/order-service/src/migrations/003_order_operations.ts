import { Knex } from 'knex';

/**
 * PHASE 3: ORDER OPERATIONS
 * 
 * Consolidates migrations 009-012, 034:
 * - Partial refunds (refund individual items)
 * - Order modifications (change orders after creation)
 * - Order splitting (break one order into multiple)
 * - Bulk operations (process multiple orders at once)
 * - Refund policy management (business rules and compliance)
 * 
 * Tables created: 7
 * - order_modifications
 * - order_splits
 * - bulk_operations
 * - refund_policies
 * - refund_policy_rules
 * - refund_reasons
 * - refund_compliance_log
 * 
 * Tables modified: 2
 * - order_refunds (+3 columns from 009, +4 columns from 034)
 * - orders (+5 columns)
 * 
 * ENUM types: 7
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // SECTION 1: PARTIAL REFUNDS (from migration 009)
  // ============================================================================
  
  // Create refund_type ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE refund_type AS ENUM (
        'FULL',
        'PARTIAL',
        'ITEM'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Add partial refund support to order_refunds table
  await knex.schema.table('order_refunds', (table) => {
    table.specificType('refund_type', 'refund_type').notNullable().defaultTo('FULL');
    table.jsonb('refunded_items');
    table.integer('remaining_balance_cents');
  });

  // ============================================================================
  // SECTION 2: ORDER MODIFICATIONS (from migration 010)
  // ============================================================================
  
  // Create modification_type ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE modification_type AS ENUM (
        'ADD_ITEM',
        'REMOVE_ITEM', 
        'UPGRADE_ITEM',
        'DOWNGRADE_ITEM',
        'CHANGE_QUANTITY'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create modification_status ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE modification_status AS ENUM (
        'PENDING',
        'APPROVED',
        'PROCESSING',
        'COMPLETED',
        'REJECTED',
        'FAILED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create order_modifications table
  await knex.schema.createTable('order_modifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();
    table.specificType('modification_type', 'modification_type').notNullable();
    table.specificType('status', 'modification_status').notNullable().defaultTo('PENDING');
    
    // Item modification details
    table.uuid('original_item_id').references('id').inTable('order_items');
    table.uuid('new_item_id');
    table.uuid('new_ticket_type_id');
    table.integer('quantity_change').defaultTo(0);
    
    // Financial impact
    table.integer('price_difference_cents').defaultTo(0);
    table.integer('additional_fees_cents').defaultTo(0);
    table.integer('total_adjustment_cents').defaultTo(0);
    
    // Payment tracking
    table.string('payment_intent_id', 255);
    table.uuid('refund_id').references('id').inTable('order_refunds');
    
    // Approval workflow
    table.uuid('requested_by').notNullable();
    table.uuid('approved_by');
    table.uuid('rejected_by');
    table.text('rejection_reason');
    
    // Metadata
    table.text('reason');
    table.text('notes');
    table.jsonb('metadata');
    
    // Timestamps
    table.timestamp('requested_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('approved_at');
    table.timestamp('rejected_at');
    table.timestamp('completed_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('order_id', 'idx_order_modifications_order');
    table.index('tenant_id', 'idx_order_modifications_tenant');
    table.index('status', 'idx_order_modifications_status');
    table.index('modification_type', 'idx_order_modifications_type');
    table.index('requested_by', 'idx_order_modifications_requested_by');
  });

  // ============================================================================
  // SECTION 3: ORDER SPLITTING (from migration 011)
  // ============================================================================
  
  // Create order_splits table
  await knex.schema.createTable('order_splits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('parent_order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();
    
    // Split details
    table.integer('split_count').notNullable();
    table.text('split_reason');
    table.uuid('split_by').notNullable();
    
    // Child orders - array of UUIDs
    table.specificType('child_order_ids', 'UUID[]').notNullable().defaultTo('{}');
    
    // Payment allocation
    table.jsonb('payment_allocations').notNullable();
    
    // Metadata
    table.jsonb('metadata');
    
    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at');

    // Indexes
    table.index('parent_order_id', 'idx_order_splits_parent');
    table.index('tenant_id', 'idx_order_splits_tenant');
  });

  // Add GIN index for array column (need raw SQL for this)
  await knex.raw(`
    CREATE INDEX idx_order_splits_child_orders 
    ON order_splits USING GIN(child_order_ids)
  `);

  // Add CHECK constraint for split_count
  await knex.raw(`
    ALTER TABLE order_splits
    ADD CONSTRAINT valid_split_count CHECK (split_count >= 2 AND split_count <= 10)
  `);

  // ============================================================================
  // SECTION 4: BULK OPERATIONS (from migration 012)
  // ============================================================================
  
  // Create bulk_operation_status ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE bulk_operation_status AS ENUM (
        'PENDING',
        'PROCESSING',
        'COMPLETED',
        'FAILED',
        'PARTIAL_SUCCESS'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create bulk_operation_type ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE bulk_operation_type AS ENUM (
        'BULK_CANCEL',
        'BULK_REFUND',
        'BULK_UPDATE',
        'BULK_EXPORT'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create bulk_operations table
  await knex.schema.createTable('bulk_operations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.specificType('operation_type', 'bulk_operation_type').notNullable();
    table.specificType('status', 'bulk_operation_status').notNullable().defaultTo('PENDING');
    
    // Operation details
    table.specificType('order_ids', 'UUID[]').notNullable();
    table.integer('total_count').notNullable();
    table.integer('processed_count').defaultTo(0);
    table.integer('success_count').defaultTo(0);
    table.integer('failed_count').defaultTo(0);
    
    // Results
    table.jsonb('results');
    table.jsonb('errors');
    
    // Metadata
    table.uuid('initiated_by').notNullable();
    table.jsonb('parameters');
    table.jsonb('metadata');
    
    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('tenant_id', 'idx_bulk_operations_tenant');
    table.index('status', 'idx_bulk_operations_status');
    table.index('operation_type', 'idx_bulk_operations_type');
    table.index('initiated_by', 'idx_bulk_operations_initiated_by');
    table.index('created_at', 'idx_bulk_operations_created');
  });

  // ============================================================================
  // SECTION 5: MODIFY ORDERS TABLE
  // ============================================================================
  // Add tracking columns for modifications and splits
  // (from migrations 010 and 011)
  
  await knex.schema.table('orders', (table) => {
    // From migration 010 (modifications)
    table.uuid('parent_order_id').references('id').inTable('orders');
    table.boolean('is_modification').defaultTo(false);
    
    // From migration 011 (splitting)
    table.uuid('split_from_order_id').references('id').inTable('orders');
    table.boolean('is_split_order').defaultTo(false);
    table.uuid('split_group_id');
  });

  // Add indexes on orders table
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_orders_parent 
    ON orders(parent_order_id) 
    WHERE parent_order_id IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_orders_split_from 
    ON orders(split_from_order_id) 
    WHERE split_from_order_id IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_orders_split_group 
    ON orders(split_group_id) 
    WHERE split_group_id IS NOT NULL
  `);

  // ============================================================================
  // SECTION 6: REFUND POLICY MANAGEMENT (from migration 034)
  // ============================================================================
  // Adds business logic layer for refund policy compliance
  
  // Create refund_policies table
  await knex.schema.createTable('refund_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('policy_name', 255).notNullable();
    table.text('description');
    table.integer('refund_window_hours').notNullable(); // Hours before event
    table.boolean('pro_rated').defaultTo(false);
    table.jsonb('conditions'); // Complex conditions
    table.string('event_type', 100); // Optional: specific event types
    table.string('ticket_type', 100); // Optional: specific ticket types
    table.boolean('active').defaultTo(true);
    table.timestamps(true, true);

    // Indexes
    table.index('tenant_id');
    table.index(['tenant_id', 'active']);
    table.index('event_type');
  });

  // Create refund_policy_rules table
  await knex.schema.createTable('refund_policy_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('policy_id').notNullable()
      .references('id').inTable('refund_policies')
      .onDelete('CASCADE');
    table.enum('rule_type', [
      'TIME_BASED',
      'PERCENTAGE',
      'TIERED',
      'FLAT_FEE',
      'NO_REFUND'
    ]).notNullable();
    table.jsonb('rule_config').notNullable(); // Configuration for rule
    table.integer('priority').defaultTo(0); // Higher priority = evaluated first
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('policy_id');
    table.index(['policy_id', 'priority']);
  });

  // Create refund_reasons table
  await knex.schema.createTable('refund_reasons', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('reason_code', 50).notNullable();
    table.string('reason_text', 500).notNullable();
    table.text('description');
    table.boolean('requires_documentation').defaultTo(false);
    table.boolean('internal_only').defaultTo(false); // Only admins can use
    table.boolean('auto_approve').defaultTo(false); // Automatically approve refunds
    table.integer('priority').defaultTo(0);
    table.boolean('active').defaultTo(true);
    table.timestamps(true, true);

    // Unique constraint
    table.unique(['tenant_id', 'reason_code']);

    // Indexes
    table.index('tenant_id');
    table.index(['tenant_id', 'active']);
  });

  // Create refund_compliance_log table
  await knex.schema.createTable('refund_compliance_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('refund_id').notNullable(); // References order_refunds
    table.uuid('tenant_id').notNullable();
    table.enum('regulation_type', [
      'FTC_16_CFR_424',      // FTC Mail/Telephone Order Rule
      'STATE_LAW_NY',         // New York State Law
      'STATE_LAW_CA',         // California Consumer Protection
      'EU_CONSUMER_RIGHTS',   // EU Consumer Rights Directive
      'CCPA',                 // California Consumer Privacy Act
      'INTERNAL_POLICY'       // Internal company policy
    ]).notNullable();
    table.string('compliance_check', 255).notNullable();
    table.boolean('passed').notNullable();
    table.text('details'); // Explanation of check
    table.jsonb('metadata'); // Additional data
    table.timestamp('checked_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('refund_id');
    table.index('tenant_id');
    table.index(['refund_id', 'regulation_type']);
    table.index('checked_at');
  });

  // Add policy_id and related columns to existing order_refunds table
  await knex.schema.table('order_refunds', (table) => {
    table.uuid('policy_id').references('id').inTable('refund_policies');
    table.uuid('reason_id').references('id').inTable('refund_reasons');
    table.text('reason_notes'); // Additional notes from customer
    table.jsonb('policy_calculation'); // Store how refund amount was calculated
  });

  // Create indexes on order_refunds new columns
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_order_refunds_policy 
    ON order_refunds(policy_id) 
    WHERE policy_id IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_order_refunds_reason 
    ON order_refunds(reason_id) 
    WHERE reason_id IS NOT NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE refund_policies IS 'Refund policy templates with business rules and time windows'
  `);
  
  await knex.raw(`
    COMMENT ON TABLE refund_policy_rules IS 'Granular rules for refund calculation (time-based, percentage, etc.)'
  `);
  
  await knex.raw(`
    COMMENT ON TABLE refund_reasons IS 'Categorized refund reasons for tracking and compliance'
  `);
  
  await knex.raw(`
    COMMENT ON TABLE refund_compliance_log IS 'Compliance audit log for refunds (FTC, state laws, EU directives)'
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse order: 034, 012, 011, 010, 009
  
  // ============================================================================
  // Section 6: Remove refund policy columns and tables (from 034)
  // ============================================================================
  
  await knex.raw('DROP INDEX IF EXISTS idx_order_refunds_reason');
  await knex.raw('DROP INDEX IF EXISTS idx_order_refunds_policy');

  await knex.schema.table('order_refunds', (table) => {
    table.dropColumn('policy_calculation');
    table.dropColumn('reason_notes');
    table.dropColumn('reason_id');
    table.dropColumn('policy_id');
  });

  await knex.schema.dropTableIfExists('refund_compliance_log');
  await knex.schema.dropTableIfExists('refund_reasons');
  await knex.schema.dropTableIfExists('refund_policy_rules');
  await knex.schema.dropTableIfExists('refund_policies');

  // ============================================================================
  // Remove modifications to orders table (from 010 and 011)
  // ============================================================================
  
  await knex.raw('DROP INDEX IF EXISTS idx_orders_split_group');
  await knex.raw('DROP INDEX IF EXISTS idx_orders_split_from');
  await knex.raw('DROP INDEX IF EXISTS idx_orders_parent');

  await knex.schema.table('orders', (table) => {
    table.dropColumn('split_group_id');
    table.dropColumn('is_split_order');
    table.dropColumn('split_from_order_id');
    table.dropColumn('is_modification');
    table.dropColumn('parent_order_id');
  });

  // ============================================================================
  // Section 4: Drop bulk_operations (from 012)
  // ============================================================================
  
  await knex.schema.dropTableIfExists('bulk_operations');
  await knex.raw('DROP TYPE IF EXISTS bulk_operation_type');
  await knex.raw('DROP TYPE IF EXISTS bulk_operation_status');

  // ============================================================================
  // Section 3: Drop order_splits (from 011)
  // ============================================================================
  
  await knex.raw('DROP INDEX IF EXISTS idx_order_splits_child_orders');
  await knex.schema.dropTableIfExists('order_splits');

  // ============================================================================
  // Section 2: Drop order_modifications (from 010)
  // ============================================================================
  
  await knex.schema.dropTableIfExists('order_modifications');
  await knex.raw('DROP TYPE IF EXISTS modification_status');
  await knex.raw('DROP TYPE IF EXISTS modification_type');

  // ============================================================================
  // Section 1: Remove partial refund columns (from 009)
  // ============================================================================
  
  await knex.schema.table('order_refunds', (table) => {
    table.dropColumn('remaining_balance_cents');
    table.dropColumn('refunded_items');
    table.dropColumn('refund_type');
  });

  await knex.raw('DROP TYPE IF EXISTS refund_type');
}
