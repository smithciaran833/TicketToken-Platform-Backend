import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');

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

  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
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
    table.uuid('parent_order_id').references('id').inTable('orders');
    table.boolean('is_modification').defaultTo(false);
    table.uuid('split_from_order_id').references('id').inTable('orders');
    table.boolean('is_split_order').defaultTo(false);
    table.uuid('split_group_id');
    table.jsonb('applied_promo_codes');
    table.specificType('search_vector', 'tsvector');
    table.timestamps(true, true);
    table.check('subtotal_cents >= 0', [], 'ck_orders_subtotal_positive');
    table.check('total_cents >= 0', [], 'ck_orders_total_positive');
  });

  await knex.schema.createTable('order_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('ticket_type_id').notNullable().references('id').inTable('ticket_types').onDelete('RESTRICT');
    table.integer('quantity').notNullable();
    table.bigInteger('unit_price_cents').notNullable();
    table.bigInteger('total_price_cents').notNullable();
    table.timestamps(true, true);
    table.check('quantity > 0', [], 'ck_order_items_quantity_positive');
    table.check('unit_price_cents >= 0', [], 'ck_order_items_unit_price_positive');
    table.check('total_price_cents >= 0', [], 'ck_order_items_total_price_positive');
  });

  await knex.schema.createTable('order_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.string('event_type', 50).notNullable();
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('order_addresses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
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
    table.timestamps(true, true);
  });

  // NOTE: discounts and order_discounts tables are owned by ticket-service

  await knex.schema.createTable('refund_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('policy_name', 255).notNullable();
    table.text('description');
    table.integer('refund_window_hours').notNullable();
    table.boolean('pro_rated').defaultTo(false);
    table.jsonb('conditions');
    table.string('event_type', 100);
    table.string('ticket_type', 100);
    table.boolean('active').defaultTo(true);
    table.timestamps(true, true);
    table.index('tenant_id');
    table.index(['tenant_id', 'active']);
    table.index('event_type');
  });

  await knex.schema.createTable('refund_reasons', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('reason_code', 50).notNullable();
    table.string('reason_text', 500).notNullable();
    table.text('description');
    table.boolean('requires_documentation').defaultTo(false);
    table.boolean('internal_only').defaultTo(false);
    table.boolean('auto_approve').defaultTo(false);
    table.integer('priority').defaultTo(0);
    table.boolean('active').defaultTo(true);
    table.timestamps(true, true);
    table.unique(['tenant_id', 'reason_code']);
    table.index('tenant_id');
    table.index(['tenant_id', 'active']);
  });

  await knex.schema.createTable('order_refunds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.bigInteger('refund_amount_cents').notNullable();
    table.string('refund_reason', 255).notNullable();
    table.string('refund_status', 50).notNullable().defaultTo('PENDING');
    table.string('stripe_refund_id', 255).nullable();
    table.uuid('initiated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.jsonb('metadata').defaultTo('{}');
    table.specificType('refund_type', 'refund_type').notNullable().defaultTo('FULL');
    table.jsonb('refunded_items');
    table.integer('remaining_balance_cents');
    table.uuid('policy_id').references('id').inTable('refund_policies');
    table.uuid('reason_id').references('id').inTable('refund_reasons');
    table.text('reason_notes');
    table.jsonb('policy_calculation');
    table.timestamps(true, true);
    table.check('refund_amount_cents > 0', [], 'ck_order_refunds_amount_positive');
  });

  await knex.schema.createTable('refund_policy_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('policy_id').notNullable().references('id').inTable('refund_policies').onDelete('CASCADE');
    table.enum('rule_type', ['TIME_BASED', 'PERCENTAGE', 'TIERED', 'FLAT_FEE', 'NO_REFUND']).notNullable();
    table.jsonb('rule_config').notNullable();
    table.integer('priority').defaultTo(0);
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index('policy_id');
    table.index(['policy_id', 'priority']);
  });

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
    table.text('details');
    table.jsonb('metadata');
    table.timestamp('checked_at').defaultTo(knex.fn.now());
    table.index('refund_id');
    table.index('tenant_id');
    table.index(['refund_id', 'regulation_type']);
    table.index('checked_at');
  });

  await knex.schema.createTable('order_modifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();
    table.specificType('modification_type', 'modification_type').notNullable();
    table.specificType('status', 'modification_status').notNullable().defaultTo('PENDING');
    table.uuid('original_item_id').references('id').inTable('order_items');
    table.uuid('new_item_id');
    table.uuid('new_ticket_type_id');
    table.integer('quantity_change').defaultTo(0);
    table.integer('price_difference_cents').defaultTo(0);
    table.integer('additional_fees_cents').defaultTo(0);
    table.integer('total_adjustment_cents').defaultTo(0);
    table.string('payment_intent_id', 255);
    table.uuid('refund_id').references('id').inTable('order_refunds');
    table.uuid('requested_by').notNullable();
    table.uuid('approved_by');
    table.uuid('rejected_by');
    table.text('rejection_reason');
    table.text('reason');
    table.text('notes');
    table.jsonb('metadata');
    table.timestamp('requested_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('approved_at');
    table.timestamp('rejected_at');
    table.timestamp('completed_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index('order_id', 'idx_order_modifications_order');
    table.index('tenant_id', 'idx_order_modifications_tenant');
    table.index('status', 'idx_order_modifications_status');
    table.index('modification_type', 'idx_order_modifications_type');
    table.index('requested_by', 'idx_order_modifications_requested_by');
  });

  await knex.schema.createTable('order_splits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('parent_order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();
    table.integer('split_count').notNullable();
    table.text('split_reason');
    table.uuid('split_by').notNullable();
    table.specificType('child_order_ids', 'UUID[]').notNullable().defaultTo('{}');
    table.jsonb('payment_allocations').notNullable();
    table.jsonb('metadata');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.index('parent_order_id', 'idx_order_splits_parent');
    table.index('tenant_id', 'idx_order_splits_tenant');
  });

  await knex.raw(`CREATE INDEX idx_order_splits_child_orders ON order_splits USING GIN(child_order_ids)`);
  await knex.raw(`ALTER TABLE order_splits ADD CONSTRAINT valid_split_count CHECK (split_count >= 2 AND split_count <= 10)`);

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
    table.jsonb('results');
    table.jsonb('errors');
    table.uuid('initiated_by').notNullable();
    table.jsonb('parameters');
    table.jsonb('metadata');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index('tenant_id', 'idx_bulk_operations_tenant');
    table.index('status', 'idx_bulk_operations_status');
    table.index('operation_type', 'idx_bulk_operations_type');
    table.index('initiated_by', 'idx_bulk_operations_initiated_by');
    table.index('created_at', 'idx_bulk_operations_created');
  });

  await knex.schema.createTable('promo_codes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('code', 50).notNullable();
    table.specificType('discount_type', 'discount_type').notNullable();
    table.integer('discount_value').notNullable();
    table.timestamp('valid_from').notNullable();
    table.timestamp('valid_until').notNullable();
    table.integer('usage_limit');
    table.integer('usage_count').defaultTo(0);
    table.integer('per_user_limit').defaultTo(1);
    table.integer('min_purchase_cents').defaultTo(0);
    table.jsonb('applicable_event_ids');
    table.jsonb('applicable_categories');
    table.boolean('is_active').defaultTo(true);
    table.uuid('created_by');
    table.jsonb('metadata');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['tenant_id', 'code']);
  });

  await knex.raw(`CREATE INDEX idx_promo_codes_tenant_code ON promo_codes(tenant_id, UPPER(code))`);
  await knex.raw(`CREATE INDEX idx_promo_codes_active ON promo_codes(tenant_id, is_active) WHERE is_active = TRUE`);
  await knex.raw(`CREATE INDEX idx_promo_codes_valid ON promo_codes(valid_from, valid_until) WHERE is_active = TRUE`);

  await knex.schema.createTable('promo_code_redemptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('promo_code_id').notNullable().references('id').inTable('promo_codes').onDelete('CASCADE');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('user_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.integer('discount_applied_cents').notNullable();
    table.timestamp('redeemed_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index('promo_code_id', 'idx_redemptions_promo');
    table.index(['user_id', 'promo_code_id'], 'idx_redemptions_user');
    table.index('order_id', 'idx_redemptions_order');
  });

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

  await knex.schema.table('orders', (table) => {
    table.index('tenant_id', 'idx_orders_tenant_id');
    table.index('user_id', 'idx_orders_user_id');
    table.index('event_id', 'idx_orders_event_id');
    table.index('status', 'idx_orders_status');
    table.index('created_at', 'idx_orders_created_at');
    table.index('payment_intent_id', 'idx_orders_payment_intent_id');
  });

  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_user ON orders (tenant_id, user_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_event ON orders (tenant_id, event_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders (tenant_id, status)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_created ON orders (tenant_id, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_status_pending ON orders (tenant_id, created_at DESC) WHERE status = 'PENDING'`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_status_confirmed ON orders (tenant_id, created_at DESC) WHERE status = 'CONFIRMED'`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_status_completed ON orders (tenant_id, created_at DESC) WHERE status = 'COMPLETED'`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_status_cancelled ON orders (tenant_id, cancelled_at DESC NULLS LAST) WHERE status = 'CANCELLED'`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_status_expired ON orders (tenant_id, created_at DESC) WHERE status = 'EXPIRED'`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_status_refunded ON orders (tenant_id, refunded_at DESC NULLS LAST) WHERE status = 'REFUNDED'`);
  await knex.raw(`CREATE INDEX idx_orders_user_status_created ON orders (user_id, status, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_orders_expires_at ON orders (expires_at) WHERE status = 'RESERVED' AND expires_at IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_orders_payment_intent_id_not_null ON orders (payment_intent_id) WHERE payment_intent_id IS NOT NULL`);
  await knex.raw(`CREATE UNIQUE INDEX idx_orders_unique_idempotency_per_tenant ON orders (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_orders_user_recent_includes ON orders (user_id, created_at DESC) INCLUDE (status, total_cents, order_number) WHERE status IN ('CONFIRMED', 'COMPLETED')`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_parent ON orders(parent_order_id) WHERE parent_order_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_split_from ON orders(split_from_order_id) WHERE split_from_order_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_split_group ON orders(split_group_id) WHERE split_group_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_search_vector ON orders USING GIN (search_vector)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_created_status ON orders (tenant_id, created_at DESC, status)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_event_created ON orders (tenant_id, event_id, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_event_status_created ON orders (tenant_id, event_id, status, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_created ON orders (tenant_id, status, created_at DESC)`);

  await knex.schema.table('order_items', (table) => {
    table.index('tenant_id', 'idx_order_items_tenant_id');
    table.index('order_id', 'idx_order_items_order_id');
    table.index('ticket_type_id', 'idx_order_items_ticket_type_id');
  });
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_order_items_ticket_type_created ON order_items (ticket_type_id, created_at DESC)`);

  await knex.schema.table('order_events', (table) => {
    table.index('tenant_id', 'idx_order_events_tenant_id');
    table.index('order_id', 'idx_order_events_order_id');
    table.index(['order_id', 'created_at'], 'idx_order_events_order_created');
  });
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_order_events_type_created ON order_events (event_type, created_at DESC)`);

  await knex.schema.table('order_addresses', (table) => {
    table.index('tenant_id', 'idx_order_addresses_tenant_id');
    table.index('order_id', 'idx_order_addresses_order_id');
  });

  await knex.schema.table('order_refunds', (table) => {
    table.index('tenant_id', 'idx_order_refunds_tenant_id');
    table.index('order_id', 'idx_order_refunds_order_id');
    table.index('refund_status', 'idx_order_refunds_status');
  });
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_order_refunds_status_created ON order_refunds (refund_status, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_order_refunds_policy ON order_refunds(policy_id) WHERE policy_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_order_refunds_reason ON order_refunds(reason_id) WHERE reason_id IS NOT NULL`);

  await knex.raw(`CREATE INDEX idx_order_notes_tenant_order ON order_notes(tenant_id, order_id, created_at)`);
  await knex.raw(`CREATE INDEX idx_order_notes_admin_user ON order_notes(admin_user_id, created_at)`);
  await knex.raw(`CREATE INDEX idx_order_notes_flagged ON order_notes(tenant_id, is_flagged, created_at DESC) WHERE is_flagged = true`);
  await knex.raw(`CREATE INDEX idx_order_notes_tags ON order_notes USING GIN (tags)`);

  await knex.raw('ALTER TABLE orders ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_items ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_events ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_addresses ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_refunds ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_modifications ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_splits ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE bulk_operations ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE promo_code_redemptions ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_notes ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE refund_policies ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE refund_reasons ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE refund_policy_rules ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE refund_compliance_log ENABLE ROW LEVEL SECURITY');

  await knex.raw(`CREATE POLICY orders_tenant_isolation ON orders FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY order_items_tenant_isolation ON order_items FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY order_events_tenant_isolation ON order_events FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY order_addresses_tenant_isolation ON order_addresses FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY order_refunds_tenant_isolation ON order_refunds FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY order_modifications_tenant_isolation ON order_modifications FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY order_splits_tenant_isolation ON order_splits FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY bulk_operations_tenant_isolation ON bulk_operations FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY promo_codes_tenant_isolation ON promo_codes FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY promo_code_redemptions_tenant_isolation ON promo_code_redemptions FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY order_notes_tenant_isolation ON order_notes FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY refund_policies_tenant_isolation ON refund_policies FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY refund_reasons_tenant_isolation ON refund_reasons FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY refund_compliance_log_tenant_isolation ON refund_compliance_log FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION log_order_status_change()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_events (order_id, tenant_id, event_type, metadata)
        VALUES (
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
        SELECT DISTINCT tt.event_id INTO event_id_var
        FROM order_items oi
        JOIN ticket_types tt ON oi.ticket_type_id = tt.id
        WHERE oi.order_id = NEW.id
        LIMIT 1;
        IF event_id_var IS NOT NULL THEN
          UPDATE events
          SET revenue = revenue + COALESCE(NEW.total_amount, NEW.total_cents)
          WHERE id = event_id_var;
        END IF;
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

  await knex.raw(`CREATE TRIGGER log_order_status_changes AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION log_order_status_change()`);
  await knex.raw(`CREATE TRIGGER trg_update_event_revenue AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_event_revenue()`);
  await knex.raw(`DROP TRIGGER IF EXISTS orders_search_vector_update ON orders`);
  await knex.raw(`CREATE TRIGGER orders_search_vector_update BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION orders_search_vector_trigger()`);
  await knex.raw(`CREATE TRIGGER update_order_notes_updated_at BEFORE UPDATE ON order_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`
    UPDATE orders
    SET search_vector =
      setweight(to_tsvector('english', COALESCE(id::text, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(order_number, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(status, '')), 'C')
    WHERE search_vector IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS update_order_notes_updated_at ON order_notes');
  await knex.raw('DROP TRIGGER IF EXISTS orders_search_vector_update ON orders');
  await knex.raw('DROP TRIGGER IF EXISTS trg_update_event_revenue ON orders');
  await knex.raw('DROP TRIGGER IF EXISTS log_order_status_changes ON orders');

  await knex.raw('DROP FUNCTION IF EXISTS orders_search_vector_trigger()');
  await knex.raw('DROP FUNCTION IF EXISTS update_event_revenue()');
  await knex.raw('DROP FUNCTION IF EXISTS validate_order_status_transition(TEXT, TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS generate_order_number()');
  await knex.raw('DROP FUNCTION IF EXISTS calculate_order_total(BIGINT, BIGINT, BIGINT, BIGINT, BIGINT)');
  await knex.raw('DROP FUNCTION IF EXISTS log_order_status_change()');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');

  await knex.raw('DROP POLICY IF EXISTS refund_compliance_log_tenant_isolation ON refund_compliance_log');
  await knex.raw('DROP POLICY IF EXISTS refund_reasons_tenant_isolation ON refund_reasons');
  await knex.raw('DROP POLICY IF EXISTS refund_policies_tenant_isolation ON refund_policies');
  await knex.raw('DROP POLICY IF EXISTS order_notes_tenant_isolation ON order_notes');
  await knex.raw('DROP POLICY IF EXISTS promo_code_redemptions_tenant_isolation ON promo_code_redemptions');
  await knex.raw('DROP POLICY IF EXISTS promo_codes_tenant_isolation ON promo_codes');
  await knex.raw('DROP POLICY IF EXISTS bulk_operations_tenant_isolation ON bulk_operations');
  await knex.raw('DROP POLICY IF EXISTS order_splits_tenant_isolation ON order_splits');
  await knex.raw('DROP POLICY IF EXISTS order_modifications_tenant_isolation ON order_modifications');
  await knex.raw('DROP POLICY IF EXISTS order_refunds_tenant_isolation ON order_refunds');
  await knex.raw('DROP POLICY IF EXISTS order_addresses_tenant_isolation ON order_addresses');
  await knex.raw('DROP POLICY IF EXISTS order_events_tenant_isolation ON order_events');
  await knex.raw('DROP POLICY IF EXISTS order_items_tenant_isolation ON order_items');
  await knex.raw('DROP POLICY IF EXISTS orders_tenant_isolation ON orders');

  await knex.raw('ALTER TABLE refund_compliance_log DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE refund_policy_rules DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE refund_reasons DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE refund_policies DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_notes DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE promo_code_redemptions DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE promo_codes DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE bulk_operations DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_splits DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_modifications DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_refunds DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_addresses DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_events DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_items DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE orders DISABLE ROW LEVEL SECURITY');

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

  await knex.raw('DROP TYPE IF EXISTS order_note_type');
  await knex.raw('DROP TYPE IF EXISTS discount_type');
  await knex.raw('DROP TYPE IF EXISTS bulk_operation_type');
  await knex.raw('DROP TYPE IF EXISTS bulk_operation_status');
  await knex.raw('DROP TYPE IF EXISTS modification_status');
  await knex.raw('DROP TYPE IF EXISTS modification_type');
  await knex.raw('DROP TYPE IF EXISTS refund_type');
}
