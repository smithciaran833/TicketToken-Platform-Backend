import { Knex } from 'knex';

/**
 * Order Service - Consolidated Baseline Migration
 *
 * CONSOLIDATION INFO:
 * - Source files: 2 migrations (001-002) archived in ./archived/
 * - Total tables: 23 (all tenant-scoped)
 * - Generated: 2025-01-13
 *
 * FIXES APPLIED:
 * - Standardized RLS pattern with app.current_tenant_id + app.is_system_user
 * - Added FORCE ROW LEVEL SECURITY to all tables
 * - Added tenant_id + RLS to refund_policy_rules
 * - Changed uuid_generate_v4() to gen_random_uuid()
 * - Removed uuid-ossp extension (not needed)
 * - External FKs converted to comments
 */

export async function up(knex: Knex): Promise<void> {
  // Set timeouts to prevent blocking
  await knex.raw("SET lock_timeout = '10s'");
  await knex.raw("SET statement_timeout = '60s'");

  // Extension for trigram search
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');

  // ============================================================================
  // ENUM TYPES
  // ============================================================================

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE refund_type AS ENUM ('FULL', 'PARTIAL', 'ITEM');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE modification_type AS ENUM (
        'ADD_ITEM', 'REMOVE_ITEM', 'UPGRADE_ITEM', 'DOWNGRADE_ITEM', 'CHANGE_QUANTITY'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE modification_status AS ENUM (
        'PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE bulk_operation_status AS ENUM (
        'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL_SUCCESS'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE bulk_operation_type AS ENUM (
        'BULK_CANCEL', 'BULK_REFUND', 'BULK_UPDATE', 'BULK_EXPORT'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE discount_type AS ENUM (
        'PERCENTAGE', 'FIXED_AMOUNT', 'BOGO', 'TIERED', 'EARLY_BIRD'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE order_note_type AS ENUM (
        'CUSTOMER_INQUIRY', 'ISSUE_REPORTED', 'RESOLUTION', 'VIP_MARKER',
        'FRAUD_SUSPICION', 'PAYMENT_ISSUE', 'DELIVERY_ISSUE', 'GENERAL', 'INTERNAL_NOTE'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE report_period AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE override_approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION log_order_status_change()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_events (id, order_id, tenant_id, event_type, metadata)
        VALUES (
          gen_random_uuid(),
          NEW.id,
          NEW.tenant_id,
          'STATUS_CHANGED',
          jsonb_build_object(
            'old_status', OLD.status,
            'new_status', NEW.status,
            'changed_at', NOW()
          )
        );
      END IF;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_event_revenue()
    RETURNS TRIGGER AS $$
    DECLARE
      event_id_var UUID;
    BEGIN
      IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
        SELECT DISTINCT oi.ticket_type_id INTO event_id_var
        FROM order_items oi
        WHERE oi.order_id = NEW.id
        LIMIT 1;
        -- Note: Actual event update would require cross-service call
        -- This is a placeholder for the trigger structure
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION calculate_order_total(
      p_subtotal_cents BIGINT,
      p_platform_fee_cents BIGINT,
      p_processing_fee_cents BIGINT,
      p_tax_cents BIGINT,
      p_discount_cents BIGINT
    ) RETURNS BIGINT AS $$
    BEGIN
      RETURN p_subtotal_cents + p_platform_fee_cents + p_processing_fee_cents + p_tax_cents - p_discount_cents;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION generate_order_number()
    RETURNS TEXT AS $$
    DECLARE
      order_num TEXT;
      exists_count INT;
    BEGIN
      LOOP
        order_num := 'ORD-' || LPAD(FLOOR(RANDOM() * 100000000)::TEXT, 8, '0');
        SELECT COUNT(*) INTO exists_count FROM orders WHERE order_number = order_num;
        EXIT WHEN exists_count = 0;
      END LOOP;
      RETURN order_num;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION validate_order_status_transition(
      p_old_status TEXT,
      p_new_status TEXT
    ) RETURNS BOOLEAN AS $$
    BEGIN
      IF p_old_status = 'PENDING' THEN
        RETURN p_new_status IN ('RESERVED', 'CANCELLED', 'EXPIRED');
      END IF;
      IF p_old_status = 'RESERVED' THEN
        RETURN p_new_status IN ('CONFIRMED', 'CANCELLED', 'EXPIRED');
      END IF;
      IF p_old_status = 'CONFIRMED' THEN
        RETURN p_new_status IN ('COMPLETED', 'CANCELLED', 'REFUNDED');
      END IF;
      IF p_old_status = 'COMPLETED' THEN
        RETURN p_new_status = 'REFUNDED';
      END IF;
      IF p_old_status IN ('CANCELLED', 'EXPIRED', 'REFUNDED') THEN
        RETURN FALSE;
      END IF;
      RETURN FALSE;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION orders_search_vector_trigger() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.id::text, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.order_number, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.status, '')), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);

  // ============================================================================
  // TABLE 1: orders
  // ============================================================================

  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable(); // FK comment: users (auth-service)
    table.uuid('event_id').notNullable(); // FK comment: events (event-service)
    table.string('order_number', 20).unique().notNullable();
    table.string('status', 50).notNullable().defaultTo('PENDING');
    table.bigInteger('subtotal_cents').notNullable();
    table.bigInteger('platform_fee_cents').notNullable().defaultTo(0);
    table.bigInteger('processing_fee_cents').notNullable().defaultTo(0);
    table.bigInteger('tax_cents').notNullable().defaultTo(0);
    table.bigInteger('discount_cents').notNullable().defaultTo(0);
    table.bigInteger('total_cents').notNullable();
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.string('payment_intent_id', 255).nullable();
    table.string('payment_status', 50).nullable();
    table.bigInteger('total_amount').nullable();
    table.string('idempotency_key', 255).unique().nullable();
    table.integer('ticket_quantity').notNullable().defaultTo(0);
    table.timestamp('expires_at').nullable();
    table.timestamp('confirmed_at').nullable();
    table.timestamp('cancelled_at').nullable();
    table.timestamp('refunded_at').nullable();
    table.jsonb('metadata').nullable();
    table.uuid('parent_order_id').nullable();
    table.boolean('is_modification').defaultTo(false);
    table.uuid('split_from_order_id').nullable();
    table.boolean('is_split_order').defaultTo(false);
    table.uuid('split_group_id').nullable();
    table.jsonb('applied_promo_codes').nullable();
    table.specificType('search_vector', 'tsvector').nullable();
    table.boolean('has_dispute').defaultTo(false);
    table.string('dispute_id', 255).nullable();
    table.string('dispute_status', 50).nullable();
    table.string('dispute_reason', 255).nullable();
    table.bigInteger('dispute_amount_cents').nullable();
    table.boolean('refund_locked').defaultTo(false);
    table.timestamp('dispute_created_at').nullable();
    table.timestamp('dispute_closed_at').nullable();
    table.string('dispute_outcome', 50).nullable();
    table.boolean('payout_completed').defaultTo(false);
    table.bigInteger('payout_amount_cents').nullable();
    table.timestamp('payout_completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
    table.index('event_id');
    table.index('status');
    table.index('created_at');
    table.index('payment_intent_id');
  });

  // Self-referential FKs for orders
  await knex.schema.alterTable('orders', (table) => {
    table.foreign('parent_order_id').references('id').inTable('orders').onDelete('SET NULL');
    table.foreign('split_from_order_id').references('id').inTable('orders').onDelete('SET NULL');
  });

  await knex.raw(`
    ALTER TABLE orders ADD CONSTRAINT ck_orders_subtotal_positive CHECK (subtotal_cents >= 0);
  `);

  await knex.raw(`
    ALTER TABLE orders ADD CONSTRAINT ck_orders_total_positive CHECK (total_cents >= 0);
  `);

  await knex.raw(`CREATE INDEX idx_orders_tenant_user ON orders (tenant_id, user_id)`);
  await knex.raw(`CREATE INDEX idx_orders_tenant_event ON orders (tenant_id, event_id)`);
  await knex.raw(`CREATE INDEX idx_orders_tenant_status ON orders (tenant_id, status)`);
  await knex.raw(`CREATE INDEX idx_orders_tenant_created ON orders (tenant_id, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_orders_status_pending ON orders (tenant_id, created_at DESC) WHERE status = 'PENDING'`);
  await knex.raw(`CREATE INDEX idx_orders_status_confirmed ON orders (tenant_id, created_at DESC) WHERE status = 'CONFIRMED'`);
  await knex.raw(`CREATE INDEX idx_orders_status_completed ON orders (tenant_id, created_at DESC) WHERE status = 'COMPLETED'`);
  await knex.raw(`CREATE INDEX idx_orders_status_cancelled ON orders (tenant_id, cancelled_at DESC NULLS LAST) WHERE status = 'CANCELLED'`);
  await knex.raw(`CREATE INDEX idx_orders_status_expired ON orders (tenant_id, created_at DESC) WHERE status = 'EXPIRED'`);
  await knex.raw(`CREATE INDEX idx_orders_status_refunded ON orders (tenant_id, refunded_at DESC NULLS LAST) WHERE status = 'REFUNDED'`);
  await knex.raw(`CREATE INDEX idx_orders_user_status_created ON orders (user_id, status, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_orders_expires_at ON orders (expires_at) WHERE status = 'RESERVED' AND expires_at IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_orders_payment_intent_not_null ON orders (payment_intent_id) WHERE payment_intent_id IS NOT NULL`);
  await knex.raw(`CREATE UNIQUE INDEX idx_orders_unique_idempotency_per_tenant ON orders (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_orders_user_recent_includes ON orders (user_id, created_at DESC) INCLUDE (status, total_cents, order_number) WHERE status IN ('CONFIRMED', 'COMPLETED')`);
  await knex.raw(`CREATE INDEX idx_orders_parent ON orders(parent_order_id) WHERE parent_order_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_orders_split_from ON orders(split_from_order_id) WHERE split_from_order_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_orders_split_group ON orders(split_group_id) WHERE split_group_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_orders_search_vector ON orders USING GIN (search_vector)`);
  await knex.raw(`CREATE INDEX idx_orders_tenant_created_status ON orders (tenant_id, created_at DESC, status)`);
  await knex.raw(`CREATE INDEX idx_orders_tenant_event_created ON orders (tenant_id, event_id, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_orders_tenant_event_status_created ON orders (tenant_id, event_id, status, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_orders_tenant_status_created ON orders (tenant_id, status, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_orders_dispute_id ON orders (dispute_id) WHERE dispute_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_orders_has_dispute ON orders (tenant_id, has_dispute) WHERE has_dispute = TRUE`);

  // ============================================================================
  // TABLE 2: order_items
  // ============================================================================

  await knex.schema.createTable('order_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.uuid('ticket_type_id').notNullable(); // FK comment: ticket_types (ticket-service)
    table.integer('quantity').notNullable();
    table.bigInteger('unit_price_cents').notNullable();
    table.bigInteger('total_price_cents').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('order_id');
    table.index('ticket_type_id');
  });

  await knex.raw(`
    ALTER TABLE order_items ADD CONSTRAINT ck_order_items_quantity_positive CHECK (quantity > 0);
  `);

  await knex.raw(`
    ALTER TABLE order_items ADD CONSTRAINT ck_order_items_unit_price_positive CHECK (unit_price_cents >= 0);
  `);

  await knex.raw(`
    ALTER TABLE order_items ADD CONSTRAINT ck_order_items_total_price_positive CHECK (total_price_cents >= 0);
  `);

  await knex.raw(`CREATE INDEX idx_order_items_ticket_type_created ON order_items (ticket_type_id, created_at DESC)`);

  // ============================================================================
  // TABLE 3: order_events
  // ============================================================================

  await knex.schema.createTable('order_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.string('event_type', 50).notNullable();
    table.uuid('user_id').nullable(); // FK comment: users (auth-service)
    table.jsonb('metadata').defaultTo('{}');
    table.jsonb('event_data').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('order_id');
    table.index(['order_id', 'created_at']);
  });

  await knex.raw(`CREATE INDEX idx_order_events_type_created ON order_events (event_type, created_at DESC)`);

  // ============================================================================
  // TABLE 4: order_addresses
  // ============================================================================

  await knex.schema.createTable('order_addresses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.string('address_type', 20).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('email', 255).notNullable();
    table.string('phone', 50).nullable();
    table.string('line1', 255).notNullable();
    table.string('line2', 255).nullable();
    table.string('city', 100).notNullable();
    table.string('state', 100).nullable();
    table.string('postal_code', 20).notNullable();
    table.string('country', 2).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('order_id');
  });

  // ============================================================================
  // TABLE 5: refund_policies
  // ============================================================================

  await knex.schema.createTable('refund_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('policy_name', 255).notNullable();
    table.text('description').nullable();
    table.integer('refund_window_hours').notNullable();
    table.boolean('pro_rated').defaultTo(false);
    table.jsonb('conditions').nullable();
    table.string('event_type', 100).nullable();
    table.string('ticket_type', 100).nullable();
    table.boolean('active').defaultTo(true);
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index(['tenant_id', 'active']);
    table.index('event_type');
  });

  // ============================================================================
  // TABLE 6: refund_reasons
  // ============================================================================

  await knex.schema.createTable('refund_reasons', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('reason_code', 50).notNullable();
    table.string('reason_text', 500).notNullable();
    table.text('description').nullable();
    table.boolean('requires_documentation').defaultTo(false);
    table.boolean('internal_only').defaultTo(false);
    table.boolean('auto_approve').defaultTo(false);
    table.integer('priority').defaultTo(0);
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'reason_code']);
    table.index('tenant_id');
    table.index(['tenant_id', 'active']);
  });

  // ============================================================================
  // TABLE 7: order_refunds
  // ============================================================================

  await knex.schema.createTable('order_refunds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.bigInteger('refund_amount_cents').notNullable();
    table.string('refund_reason', 255).notNullable();
    table.string('refund_status', 50).notNullable().defaultTo('PENDING');
    table.string('stripe_refund_id', 255).nullable();
    table.uuid('initiated_by').nullable(); // FK comment: users (auth-service)
    table.jsonb('metadata').defaultTo('{}');
    table.specificType('refund_type', 'refund_type').notNullable().defaultTo('FULL');
    table.jsonb('refunded_items').nullable();
    table.integer('remaining_balance_cents').nullable();
    table.uuid('policy_id').nullable();
    table.uuid('reason_id').nullable();
    table.text('reason_notes').nullable();
    table.jsonb('policy_calculation').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('order_id');
    table.index('refund_status');
  });

  await knex.raw(`
    ALTER TABLE order_refunds ADD CONSTRAINT ck_order_refunds_amount_positive CHECK (refund_amount_cents > 0);
  `);

  await knex.raw(`CREATE INDEX idx_order_refunds_status_created ON order_refunds (refund_status, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_order_refunds_policy ON order_refunds(policy_id) WHERE policy_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_order_refunds_reason ON order_refunds(reason_id) WHERE reason_id IS NOT NULL`);

  // ============================================================================
  // TABLE 8: refund_policy_rules (FIX: Added tenant_id)
  // ============================================================================

  await knex.schema.createTable('refund_policy_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable(); // FIX: Added
    table.uuid('policy_id').notNullable();
    table.enum('rule_type', ['TIME_BASED', 'PERCENTAGE', 'TIERED', 'FLAT_FEE', 'NO_REFUND']).notNullable();
    table.string('condition_type', 50).nullable();
    table.integer('condition_value').nullable();
    table.integer('refund_percentage').nullable();
    table.jsonb('rule_config').notNullable();
    table.integer('priority').defaultTo(0);
    table.boolean('active').defaultTo(true);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id'); // FIX: Added
    table.index('policy_id');
    table.index(['policy_id', 'priority']);
  });

  // ============================================================================
  // TABLE 9: refund_compliance_log
  // ============================================================================

  await knex.schema.createTable('refund_compliance_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('refund_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.enum('regulation_type', [
      'FTC_16_CFR_424', 'STATE_LAW_NY', 'STATE_LAW_CA',
      'EU_CONSUMER_RIGHTS', 'CCPA', 'INTERNAL_POLICY'
    ]).notNullable();
    table.string('compliance_check', 255).notNullable();
    table.boolean('passed').notNullable();
    table.text('details').nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('checked_at').defaultTo(knex.fn.now());

    table.index('refund_id');
    table.index('tenant_id');
    table.index(['refund_id', 'regulation_type']);
    table.index('checked_at');
  });

  // ============================================================================
  // TABLE 10: order_modifications
  // ============================================================================

  await knex.schema.createTable('order_modifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.specificType('modification_type', 'modification_type').notNullable();
    table.specificType('status', 'modification_status').notNullable().defaultTo('PENDING');
    table.uuid('original_item_id').nullable();
    table.uuid('new_item_id').nullable();
    table.uuid('new_ticket_type_id').nullable();
    table.integer('quantity_change').defaultTo(0);
    table.integer('price_difference_cents').defaultTo(0);
    table.integer('additional_fees_cents').defaultTo(0);
    table.integer('total_adjustment_cents').defaultTo(0);
    table.string('payment_intent_id', 255).nullable();
    table.uuid('refund_id').nullable();
    table.uuid('requested_by').notNullable();
    table.uuid('approved_by').nullable();
    table.uuid('rejected_by').nullable();
    table.text('rejection_reason').nullable();
    table.text('reason').nullable();
    table.text('notes').nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('requested_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('approved_at').nullable();
    table.timestamp('rejected_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('order_id');
    table.index('tenant_id');
    table.index('status');
    table.index('modification_type');
    table.index('requested_by');
  });

  // ============================================================================
  // TABLE 11: order_splits
  // ============================================================================

  await knex.schema.createTable('order_splits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('parent_order_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.integer('split_count').notNullable();
    table.text('split_reason').nullable();
    table.uuid('split_by').notNullable();
    table.specificType('child_order_ids', 'UUID[]').notNullable().defaultTo('{}');
    table.jsonb('payment_allocations').notNullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();

    table.index('parent_order_id');
    table.index('tenant_id');
  });

  await knex.raw(`CREATE INDEX idx_order_splits_child_orders ON order_splits USING GIN(child_order_ids)`);
  await knex.raw(`ALTER TABLE order_splits ADD CONSTRAINT valid_split_count CHECK (split_count >= 2 AND split_count <= 10)`);

  // ============================================================================
  // TABLE 12: bulk_operations
  // ============================================================================

  await knex.schema.createTable('bulk_operations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.specificType('operation_type', 'bulk_operation_type').notNullable();
    table.specificType('status', 'bulk_operation_status').notNullable().defaultTo('PENDING');
    table.specificType('order_ids', 'UUID[]').notNullable();
    table.integer('total_count').notNullable();
    table.integer('processed_count').defaultTo(0);
    table.integer('success_count').defaultTo(0);
    table.integer('failed_count').defaultTo(0);
    table.jsonb('results').nullable();
    table.jsonb('errors').nullable();
    table.uuid('initiated_by').notNullable();
    table.jsonb('parameters').nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('status');
    table.index('operation_type');
    table.index('initiated_by');
    table.index('created_at');
  });

  // ============================================================================
  // TABLE 13: promo_codes
  // ============================================================================

  await knex.schema.createTable('promo_codes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('code', 50).notNullable();
    table.specificType('discount_type', 'discount_type').notNullable();
    table.integer('discount_value').notNullable();
    table.timestamp('valid_from').notNullable();
    table.timestamp('valid_until').notNullable();
    table.integer('usage_limit').nullable();
    table.integer('usage_count').defaultTo(0);
    table.integer('per_user_limit').defaultTo(1);
    table.integer('min_purchase_cents').defaultTo(0);
    table.jsonb('applicable_event_ids').nullable();
    table.jsonb('applicable_categories').nullable();
    table.boolean('is_active').defaultTo(true);
    table.uuid('created_by').nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'code']);
  });

  await knex.raw(`CREATE INDEX idx_promo_codes_tenant_code ON promo_codes(tenant_id, UPPER(code))`);
  await knex.raw(`CREATE INDEX idx_promo_codes_active ON promo_codes(tenant_id, is_active) WHERE is_active = TRUE`);
  await knex.raw(`CREATE INDEX idx_promo_codes_valid ON promo_codes(valid_from, valid_until) WHERE is_active = TRUE`);

  // ============================================================================
  // TABLE 14: promo_code_redemptions
  // ============================================================================

  await knex.schema.createTable('promo_code_redemptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('promo_code_id').notNullable();
    table.uuid('order_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.integer('discount_applied_cents').notNullable();
    table.timestamp('redeemed_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('promo_code_id');
    table.index(['user_id', 'promo_code_id']);
    table.index('order_id');
  });

  // ============================================================================
  // TABLE 15: order_notes
  // ============================================================================

  await knex.schema.createTable('order_notes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.uuid('user_id').nullable();
    table.uuid('admin_user_id').notNullable();
    table.specificType('note_type', 'order_note_type').notNullable();
    table.text('content').notNullable();
    table.boolean('is_internal').defaultTo(true);
    table.boolean('is_flagged').defaultTo(false);
    table.specificType('tags', 'text[]').nullable();
    table.jsonb('attachments').nullable();
    table.specificType('mentioned_users', 'uuid[]').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_order_notes_tenant_order ON order_notes(tenant_id, order_id, created_at)`);
  await knex.raw(`CREATE INDEX idx_order_notes_admin_user ON order_notes(admin_user_id, created_at)`);
  await knex.raw(`CREATE INDEX idx_order_notes_flagged ON order_notes(tenant_id, is_flagged, created_at DESC) WHERE is_flagged = true`);
  await knex.raw(`CREATE INDEX idx_order_notes_tags ON order_notes USING GIN (tags)`);

  // ============================================================================
  // TABLE 16: order_disputes
  // ============================================================================

  await knex.schema.createTable('order_disputes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.string('dispute_id', 255).notNullable().unique();
    table.string('payment_intent_id', 255).notNullable();
    table.bigInteger('amount_cents').notNullable();
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.string('reason', 255).notNullable();
    table.string('status', 50).notNullable();
    table.string('outcome', 50).nullable();
    table.timestamp('evidence_due_by').nullable();
    table.timestamp('closed_at').nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('order_id');
    table.index('dispute_id');
    table.index('status');
  });

  // ============================================================================
  // TABLE 17: order_report_summaries
  // ============================================================================

  await knex.schema.createTable('order_report_summaries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.specificType('period', 'report_period').notNullable();
    table.timestamp('start_date').notNullable();
    table.timestamp('end_date').notNullable();
    table.integer('total_orders').notNullable().defaultTo(0);
    table.bigInteger('total_revenue_cents').notNullable().defaultTo(0);
    table.bigInteger('average_order_value_cents').notNullable().defaultTo(0);
    table.bigInteger('total_refunds_cents').notNullable().defaultTo(0);
    table.jsonb('orders_by_status').notNullable().defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'period', 'start_date']);
  });

  await knex.raw(`CREATE INDEX idx_order_report_summaries_tenant ON order_report_summaries(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_order_report_summaries_period ON order_report_summaries(tenant_id, period, start_date DESC)`);

  // ============================================================================
  // TABLE 18: order_revenue_reports
  // ============================================================================

  await knex.schema.createTable('order_revenue_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('entity_type', 20).notNullable();
    table.uuid('entity_id').notNullable();
    table.specificType('period', 'report_period').notNullable();
    table.timestamp('start_date').notNullable();
    table.timestamp('end_date').notNullable();
    table.bigInteger('total_revenue_cents').notNullable().defaultTo(0);
    table.integer('total_orders').notNullable().defaultTo(0);
    table.integer('total_tickets_sold').notNullable().defaultTo(0);
    table.bigInteger('average_order_value_cents').notNullable().defaultTo(0);
    table.jsonb('top_ticket_types').defaultTo('[]');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'entity_type', 'entity_id', 'start_date']);
  });

  await knex.raw(`CREATE INDEX idx_order_revenue_reports_tenant ON order_revenue_reports(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_order_revenue_reports_entity ON order_revenue_reports(tenant_id, entity_type, entity_id)`);

  // ============================================================================
  // TABLE 19: saved_searches
  // ============================================================================

  await knex.schema.createTable('saved_searches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('admin_user_id').notNullable();
    table.string('name', 255).notNullable();
    table.jsonb('filters').notNullable();
    table.boolean('is_default').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_saved_searches_tenant ON saved_searches(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_saved_searches_user ON saved_searches(tenant_id, admin_user_id)`);
  await knex.raw(`CREATE INDEX idx_saved_searches_default ON saved_searches(tenant_id, admin_user_id, is_default) WHERE is_default = true`);

  // ============================================================================
  // TABLE 20: search_history
  // ============================================================================

  await knex.schema.createTable('search_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('admin_user_id').notNullable();
    table.text('query').nullable();
    table.jsonb('filters').notNullable();
    table.integer('results_count').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_search_history_tenant ON search_history(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_search_history_user ON search_history(tenant_id, admin_user_id, created_at DESC)`);

  // ============================================================================
  // TABLE 21: admin_overrides
  // ============================================================================

  await knex.schema.createTable('admin_overrides', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.uuid('admin_user_id').notNullable();
    table.string('override_type', 50).notNullable();
    table.jsonb('original_value').nullable();
    table.jsonb('new_value').nullable();
    table.text('reason').notNullable();
    table.specificType('approval_status', 'override_approval_status').notNullable().defaultTo('PENDING');
    table.uuid('approved_by').nullable();
    table.timestamp('approved_at').nullable();
    table.text('rejection_reason').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_admin_overrides_tenant ON admin_overrides(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_admin_overrides_order ON admin_overrides(order_id)`);
  await knex.raw(`CREATE INDEX idx_admin_overrides_status ON admin_overrides(tenant_id, approval_status)`);
  await knex.raw(`CREATE INDEX idx_admin_overrides_pending ON admin_overrides(tenant_id, created_at ASC) WHERE approval_status = 'PENDING'`);

  // ============================================================================
  // TABLE 22: admin_override_audit
  // ============================================================================

  await knex.schema.createTable('admin_override_audit', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('override_id').notNullable();
    table.string('action', 30).notNullable();
    table.uuid('actor_user_id').notNullable();
    table.string('actor_role', 50).notNullable();
    table.jsonb('changes').notNullable();
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_admin_override_audit_tenant ON admin_override_audit(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_admin_override_audit_override ON admin_override_audit(override_id, created_at ASC)`);

  // ============================================================================
  // TABLE 23: note_templates
  // ============================================================================

  await knex.schema.createTable('note_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.specificType('note_type', 'order_note_type').notNullable();
    table.text('content_template').notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('usage_count').notNullable().defaultTo(0);
    table.uuid('created_by').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_note_templates_tenant ON note_templates(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_note_templates_active ON note_templates(tenant_id, is_active, note_type) WHERE is_active = true`);
  await knex.raw(`CREATE INDEX idx_note_templates_usage ON note_templates(tenant_id, usage_count DESC, name ASC)`);

  // ============================================================================
  // INTERNAL FOREIGN KEY CONSTRAINTS
  // ============================================================================

  console.log('🔗 Adding internal foreign key constraints...');

  // order_items → orders
  await knex.schema.alterTable('order_items', (table) => {
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
  });

  // order_events → orders
  await knex.schema.alterTable('order_events', (table) => {
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
  });

  // order_addresses → orders
  await knex.schema.alterTable('order_addresses', (table) => {
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
  });

  // order_refunds → orders, refund_policies, refund_reasons
  await knex.schema.alterTable('order_refunds', (table) => {
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
    table.foreign('policy_id').references('id').inTable('refund_policies').onDelete('SET NULL');
    table.foreign('reason_id').references('id').inTable('refund_reasons').onDelete('SET NULL');
  });

  // refund_policy_rules → refund_policies
  await knex.schema.alterTable('refund_policy_rules', (table) => {
    table.foreign('policy_id').references('id').inTable('refund_policies').onDelete('CASCADE');
  });

  // order_modifications → orders, order_items, order_refunds
  await knex.schema.alterTable('order_modifications', (table) => {
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
    table.foreign('original_item_id').references('id').inTable('order_items').onDelete('SET NULL');
    table.foreign('refund_id').references('id').inTable('order_refunds').onDelete('SET NULL');
  });

  // order_splits → orders
  await knex.schema.alterTable('order_splits', (table) => {
    table.foreign('parent_order_id').references('id').inTable('orders').onDelete('CASCADE');
  });

  // promo_code_redemptions → promo_codes, orders
  await knex.schema.alterTable('promo_code_redemptions', (table) => {
    table.foreign('promo_code_id').references('id').inTable('promo_codes').onDelete('CASCADE');
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
  });

  // order_notes → orders
  await knex.schema.alterTable('order_notes', (table) => {
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
  });

  // order_disputes → orders
  await knex.schema.alterTable('order_disputes', (table) => {
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
  });

  // admin_overrides → orders
  await knex.schema.alterTable('admin_overrides', (table) => {
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
  });

  // admin_override_audit → admin_overrides
  await knex.schema.alterTable('admin_override_audit', (table) => {
    table.foreign('override_id').references('id').inTable('admin_overrides').onDelete('CASCADE');
  });

  console.log('✅ Internal FK constraints added');

  // ============================================================================
  // EXTERNAL FK REFERENCES (Comments Only - Cross-Service)
  // ============================================================================

  /*
  EXTERNAL FK REFERENCES - These reference tables in other services:

  -- orders
  -- table.foreign('user_id').references('id').inTable('users') -- auth-service
  -- table.foreign('event_id').references('id').inTable('events') -- event-service

  -- order_items
  -- table.foreign('ticket_type_id').references('id').inTable('ticket_types') -- ticket-service

  -- order_events
  -- table.foreign('user_id').references('id').inTable('users') -- auth-service

  -- order_refunds
  -- table.foreign('initiated_by').references('id').inTable('users') -- auth-service
  */

  // ============================================================================
  // ROW LEVEL SECURITY
  // ============================================================================

  console.log('🔒 Enabling Row Level Security...');

  const tenantTables = [
    'orders',
    'order_items',
    'order_events',
    'order_addresses',
    'refund_policies',
    'refund_reasons',
    'order_refunds',
    'refund_policy_rules',
    'refund_compliance_log',
    'order_modifications',
    'order_splits',
    'bulk_operations',
    'promo_codes',
    'promo_code_redemptions',
    'order_notes',
    'order_disputes',
    'order_report_summaries',
    'order_revenue_reports',
    'saved_searches',
    'search_history',
    'admin_overrides',
    'admin_override_audit',
    'note_templates',
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
        );
    `);
  }

  console.log('✅ RLS policies created for all tenant tables');

  // ============================================================================
  // TRIGGERS
  // ============================================================================

  console.log('🔧 Creating triggers...');

  await knex.raw(`
    CREATE TRIGGER log_order_status_changes
    AFTER UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION log_order_status_change();
  `);

  await knex.raw(`
    CREATE TRIGGER trg_update_event_revenue
    AFTER UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_event_revenue();
  `);

  await knex.raw(`
    CREATE TRIGGER orders_search_vector_update
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION orders_search_vector_trigger();
  `);

  await knex.raw(`
    CREATE TRIGGER update_order_notes_updated_at
    BEFORE UPDATE ON order_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER update_order_report_summaries_updated_at
    BEFORE UPDATE ON order_report_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER update_order_revenue_reports_updated_at
    BEFORE UPDATE ON order_revenue_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER update_saved_searches_updated_at
    BEFORE UPDATE ON saved_searches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER update_admin_overrides_updated_at
    BEFORE UPDATE ON admin_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER update_note_templates_updated_at
    BEFORE UPDATE ON note_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('✅ Triggers created');

  // Initialize search vectors for existing data
  await knex.raw(`
    UPDATE orders
    SET search_vector =
      setweight(to_tsvector('english', COALESCE(id::text, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(order_number, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(status, '')), 'C')
    WHERE search_vector IS NULL
  `);

  console.log('✅ Order service consolidated migration complete!');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Rolling back order service migration...');

  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS update_note_templates_updated_at ON note_templates');
  await knex.raw('DROP TRIGGER IF EXISTS update_admin_overrides_updated_at ON admin_overrides');
  await knex.raw('DROP TRIGGER IF EXISTS update_saved_searches_updated_at ON saved_searches');
  await knex.raw('DROP TRIGGER IF EXISTS update_order_revenue_reports_updated_at ON order_revenue_reports');
  await knex.raw('DROP TRIGGER IF EXISTS update_order_report_summaries_updated_at ON order_report_summaries');
  await knex.raw('DROP TRIGGER IF EXISTS update_order_notes_updated_at ON order_notes');
  await knex.raw('DROP TRIGGER IF EXISTS orders_search_vector_update ON orders');
  await knex.raw('DROP TRIGGER IF EXISTS trg_update_event_revenue ON orders');
  await knex.raw('DROP TRIGGER IF EXISTS log_order_status_changes ON orders');

  // Drop RLS policies
  const tenantTables = [
    'note_templates',
    'admin_override_audit',
    'admin_overrides',
    'search_history',
    'saved_searches',
    'order_revenue_reports',
    'order_report_summaries',
    'order_disputes',
    'order_notes',
    'promo_code_redemptions',
    'promo_codes',
    'bulk_operations',
    'order_splits',
    'order_modifications',
    'refund_compliance_log',
    'refund_policy_rules',
    'order_refunds',
    'refund_reasons',
    'refund_policies',
    'order_addresses',
    'order_events',
    'order_items',
    'orders',
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
  }

  // Drop tables in reverse order (respecting FK dependencies)
  await knex.schema.dropTableIfExists('note_templates');
  await knex.schema.dropTableIfExists('admin_override_audit');
  await knex.schema.dropTableIfExists('admin_overrides');
  await knex.schema.dropTableIfExists('search_history');
  await knex.schema.dropTableIfExists('saved_searches');
  await knex.schema.dropTableIfExists('order_revenue_reports');
  await knex.schema.dropTableIfExists('order_report_summaries');
  await knex.schema.dropTableIfExists('order_disputes');
  await knex.schema.dropTableIfExists('order_notes');
  await knex.schema.dropTableIfExists('promo_code_redemptions');
  await knex.schema.dropTableIfExists('promo_codes');
  await knex.schema.dropTableIfExists('bulk_operations');
  await knex.schema.dropTableIfExists('order_splits');
  await knex.schema.dropTableIfExists('order_modifications');
  await knex.schema.dropTableIfExists('refund_compliance_log');
  await knex.schema.dropTableIfExists('refund_policy_rules');
  await knex.schema.dropTableIfExists('order_refunds');
  await knex.schema.dropTableIfExists('refund_reasons');
  await knex.schema.dropTableIfExists('refund_policies');
  await knex.schema.dropTableIfExists('order_addresses');
  await knex.schema.dropTableIfExists('order_events');
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS orders_search_vector_trigger()');
  await knex.raw('DROP FUNCTION IF EXISTS validate_order_status_transition(TEXT, TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS generate_order_number()');
  await knex.raw('DROP FUNCTION IF EXISTS calculate_order_total(BIGINT, BIGINT, BIGINT, BIGINT, BIGINT)');
  await knex.raw('DROP FUNCTION IF EXISTS update_event_revenue()');
  await knex.raw('DROP FUNCTION IF EXISTS log_order_status_change()');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');

  // Drop enum types
  await knex.raw('DROP TYPE IF EXISTS override_approval_status');
  await knex.raw('DROP TYPE IF EXISTS report_period');
  await knex.raw('DROP TYPE IF EXISTS order_note_type');
  await knex.raw('DROP TYPE IF EXISTS discount_type');
  await knex.raw('DROP TYPE IF EXISTS bulk_operation_type');
  await knex.raw('DROP TYPE IF EXISTS bulk_operation_status');
  await knex.raw('DROP TYPE IF EXISTS modification_status');
  await knex.raw('DROP TYPE IF EXISTS modification_type');
  await knex.raw('DROP TYPE IF EXISTS refund_type');

  console.log('✅ Order service migration rolled back');
}
