import { Knex } from 'knex';

/**
 * PHASE 1: BASELINE ORDERS SCHEMA
 * 
 * Consolidates migrations 001-004:
 * - Core order tables with multi-tenancy built-in
 * - Row Level Security (RLS) for tenant isolation
 * - Comprehensive indexing strategy for performance
 * - Business logic functions and triggers
 * 
 * Tables created: 6
 * - orders, order_items, order_events
 * - order_addresses, order_discounts, order_refunds
 */

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // ============================================================================
  // ORDERS TABLE - Core order tracking with multi-tenancy
  // ============================================================================
  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    table.string('order_number', 20).unique().notNullable();
    
    // Status: PENDING, RESERVED, CONFIRMED, COMPLETED, CANCELLED, EXPIRED, REFUNDED
    table.string('status', 50).notNullable().defaultTo('PENDING');
    
    // Pricing (in cents)
    table.bigInteger('subtotal_cents').notNullable();
    table.bigInteger('platform_fee_cents').notNullable().defaultTo(0);
    table.bigInteger('processing_fee_cents').notNullable().defaultTo(0);
    table.bigInteger('tax_cents').notNullable().defaultTo(0);
    table.bigInteger('discount_cents').notNullable().defaultTo(0);
    table.bigInteger('total_cents').notNullable();
    
    table.string('currency', 3).notNullable().defaultTo('USD');
    
    // Payment integration
    table.string('payment_intent_id', 255).nullable();
    table.string('idempotency_key', 255).unique().nullable();
    
    // Reservation management
    table.timestamp('reservation_expires_at').nullable();
    table.timestamp('confirmed_at').nullable();
    table.timestamp('cancelled_at').nullable();
    table.timestamp('refunded_at').nullable();
    
    // Metadata
    table.jsonb('metadata').nullable();
    
    // Audit
    table.timestamps(true, true);
    
    // Constraints
    table.check('subtotal_cents >= 0', [], 'ck_orders_subtotal_positive');
    table.check('total_cents >= 0', [], 'ck_orders_total_positive');
  });

  // ============================================================================
  // ORDER_ITEMS TABLE - Line items with pricing snapshot
  // ============================================================================
  await knex.schema.createTable('order_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('ticket_type_id').notNullable().references('id').inTable('ticket_types').onDelete('RESTRICT');
    
    table.integer('quantity').notNullable();
    table.bigInteger('unit_price_cents').notNullable();
    table.bigInteger('total_price_cents').notNullable();
    
    table.timestamps(true, true);
    
    // Constraints
    table.check('quantity > 0', [], 'ck_order_items_quantity_positive');
    table.check('unit_price_cents >= 0', [], 'ck_order_items_unit_price_positive');
    table.check('total_price_cents >= 0', [], 'ck_order_items_total_price_positive');
  });

  // ============================================================================
  // ORDER_EVENTS TABLE - Complete audit trail
  // ============================================================================
  await knex.schema.createTable('order_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    
    // Event types: CREATED, RESERVED, CONFIRMED, CANCELLED, EXPIRED, REFUNDED, MODIFIED, STATUS_CHANGED
    table.string('event_type', 50).notNullable();
    
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.jsonb('metadata').defaultTo('{}');
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // ============================================================================
  // ORDER_ADDRESSES TABLE - Billing/shipping addresses
  // ============================================================================
  await knex.schema.createTable('order_addresses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    
    table.string('address_type', 20).notNullable(); // BILLING, SHIPPING
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('email', 255).notNullable();
    table.string('phone', 50).nullable();
    table.string('line1', 255).notNullable();
    table.string('line2', 255).nullable();
    table.string('city', 100).notNullable();
    table.string('state', 100).nullable();
    table.string('postal_code', 20).notNullable();
    table.string('country', 2).notNullable(); // ISO 3166-1 alpha-2
    
    table.timestamps(true, true);
  });

  // ============================================================================
  // ORDER_DISCOUNTS TABLE - Promo codes, coupons applied
  // ============================================================================
  await knex.schema.createTable('order_discounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    
    table.string('code', 50).notNullable();
    table.string('discount_type', 20).notNullable(); // PERCENTAGE, FIXED_AMOUNT
    table.decimal('discount_value', 10, 2).notNullable();
    table.bigInteger('discount_amount_cents').notNullable();
    
    table.timestamps(true, true);
  });

  // ============================================================================
  // ORDER_REFUNDS TABLE - Refund tracking with reasons
  // ============================================================================
  await knex.schema.createTable('order_refunds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    
    table.bigInteger('refund_amount_cents').notNullable();
    table.string('refund_reason', 255).notNullable();
    table.string('refund_status', 50).notNullable().defaultTo('PENDING'); // PENDING, PROCESSING, COMPLETED, FAILED
    table.string('stripe_refund_id', 255).nullable();
    table.uuid('initiated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    
    // Constraints
    table.check('refund_amount_cents > 0', [], 'ck_order_refunds_amount_positive');
  });

  // ============================================================================
  // BASIC INDEXES - Single column performance
  // ============================================================================
  
  // Orders indexes
  await knex.schema.table('orders', (table) => {
    table.index('tenant_id', 'idx_orders_tenant_id');
    table.index('user_id', 'idx_orders_user_id');
    table.index('event_id', 'idx_orders_event_id');
    table.index('status', 'idx_orders_status');
    table.index('created_at', 'idx_orders_created_at');
    table.index('payment_intent_id', 'idx_orders_payment_intent_id');
  });

  // Order items indexes
  await knex.schema.table('order_items', (table) => {
    table.index('tenant_id', 'idx_order_items_tenant_id');
    table.index('order_id', 'idx_order_items_order_id');
    table.index('ticket_type_id', 'idx_order_items_ticket_type_id');
  });

  // Order events indexes
  await knex.schema.table('order_events', (table) => {
    table.index('tenant_id', 'idx_order_events_tenant_id');
    table.index('order_id', 'idx_order_events_order_id');
    table.index(['order_id', 'created_at'], 'idx_order_events_order_created');
  });

  // Order addresses indexes
  await knex.schema.table('order_addresses', (table) => {
    table.index('tenant_id', 'idx_order_addresses_tenant_id');
    table.index('order_id', 'idx_order_addresses_order_id');
  });

  // Order discounts indexes
  await knex.schema.table('order_discounts', (table) => {
    table.index('tenant_id', 'idx_order_discounts_tenant_id');
    table.index('order_id', 'idx_order_discounts_order_id');
    table.index('code', 'idx_order_discounts_code');
  });

  // Order refunds indexes
  await knex.schema.table('order_refunds', (table) => {
    table.index('tenant_id', 'idx_order_refunds_tenant_id');
    table.index('order_id', 'idx_order_refunds_order_id');
    table.index('refund_status', 'idx_order_refunds_status');
  });

  // ============================================================================
  // TENANT COMPOSITE INDEXES - Multi-column tenant queries
  // ============================================================================
  
  // Tenant + user: User's orders within tenant
  await knex.raw(`
    CREATE INDEX idx_orders_tenant_user ON orders (tenant_id, user_id)
  `);

  // Tenant + event: Orders for specific event in tenant
  await knex.raw(`
    CREATE INDEX idx_orders_tenant_event ON orders (tenant_id, event_id)
  `);

  // Tenant + status: Filter by status within tenant
  await knex.raw(`
    CREATE INDEX idx_orders_tenant_status ON orders (tenant_id, status)
  `);

  // Tenant + created: Recent orders in tenant
  await knex.raw(`
    CREATE INDEX idx_orders_tenant_created ON orders (tenant_id, created_at DESC)
  `);

  // Tenant + order for items
  await knex.raw(`
    CREATE INDEX idx_order_items_tenant_order ON order_items (tenant_id, order_id)
  `);

  // ============================================================================
  // PERFORMANCE PARTIAL INDEXES - Status-specific optimizations
  // ============================================================================
  
  // Expiring reservations - Critical for background jobs
  await knex.raw(`
    CREATE INDEX idx_orders_expiring_reservations 
    ON orders (reservation_expires_at) 
    WHERE status = 'RESERVED' AND reservation_expires_at IS NOT NULL
  `);

  // PENDING orders - Active checkout/cart flows
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status_pending 
    ON orders (tenant_id, created_at DESC) 
    WHERE status = 'PENDING'
  `);

  // CONFIRMED orders - Payment confirmed, awaiting fulfillment
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status_confirmed 
    ON orders (tenant_id, created_at DESC) 
    WHERE status = 'CONFIRMED'
  `);

  // COMPLETED orders - Fulfilled orders
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status_completed 
    ON orders (tenant_id, created_at DESC) 
    WHERE status = 'COMPLETED'
  `);

  // CANCELLED orders - For analytics and reporting
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status_cancelled 
    ON orders (tenant_id, cancelled_at DESC NULLS LAST) 
    WHERE status = 'CANCELLED'
  `);

  // EXPIRED orders - For cleanup jobs and analytics
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status_expired 
    ON orders (tenant_id, created_at DESC) 
    WHERE status = 'EXPIRED'
  `);

  // REFUNDED orders - For reconciliation and reporting
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status_refunded 
    ON orders (tenant_id, refunded_at DESC NULLS LAST) 
    WHERE status = 'REFUNDED'
  `);

  // ============================================================================
  // PERFORMANCE COMPOSITE INDEXES - Multi-column analytics queries
  // ============================================================================
  
  // User + status query pattern
  await knex.raw(`
    CREATE INDEX idx_orders_user_status_created 
    ON orders (user_id, status, created_at DESC)
  `);

  // Event dashboard: Filter orders by event + status
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_event_status_created 
    ON orders (tenant_id, event_id, status, created_at DESC)
  `);

  // Status dashboard: Filter by status across all events
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_status_created 
    ON orders (tenant_id, status, created_at DESC)
  `);

  // ============================================================================
  // PERFORMANCE INDEXES - Related tables
  // ============================================================================
  
  // Order items by ticket type - for inventory/analytics
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_ticket_type_created 
    ON order_items (ticket_type_id, created_at DESC)
  `);

  // Order events by type - for audit trail queries
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_events_type_created 
    ON order_events (event_type, created_at DESC)
  `);

  // Order refunds by status - for reconciliation
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_refunds_status_created 
    ON order_refunds (refund_status, created_at DESC)
  `);

  // ============================================================================
  // ROW LEVEL SECURITY (RLS) - Tenant isolation
  // ============================================================================
  
  await knex.raw('ALTER TABLE orders ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_items ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_events ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_addresses ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_discounts ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_refunds ENABLE ROW LEVEL SECURITY');

  // ============================================================================
  // RLS POLICIES - Enforce tenant isolation
  // ============================================================================
  
  await knex.raw(`
    CREATE POLICY orders_tenant_isolation ON orders
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::uuid)
  `);

  await knex.raw(`
    CREATE POLICY order_items_tenant_isolation ON order_items
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::uuid)
  `);

  await knex.raw(`
    CREATE POLICY order_events_tenant_isolation ON order_events
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::uuid)
  `);

  await knex.raw(`
    CREATE POLICY order_addresses_tenant_isolation ON order_addresses
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::uuid)
  `);

  await knex.raw(`
    CREATE POLICY order_discounts_tenant_isolation ON order_discounts
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::uuid)
  `);

  await knex.raw(`
    CREATE POLICY order_refunds_tenant_isolation ON order_refunds
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::uuid)
  `);

  // ============================================================================
  // TRIGGERS - Auto-update and audit
  // ============================================================================
  
  // Update updated_at timestamp trigger function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Apply update triggers to tables
  await knex.raw(`
    CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON order_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER update_order_addresses_updated_at BEFORE UPDATE ON order_addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER update_order_discounts_updated_at BEFORE UPDATE ON order_discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER update_order_refunds_updated_at BEFORE UPDATE ON order_refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // Audit trigger - log status changes
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
    CREATE TRIGGER log_order_status_changes AFTER UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION log_order_status_change();
  `);

  // ============================================================================
  // FUNCTIONS - Business logic helpers
  // ============================================================================
  
  // Calculate order total
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

  // Generate order number
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

  // Validate order state transition
  await knex.raw(`
    CREATE OR REPLACE FUNCTION validate_order_status_transition(
      p_old_status TEXT,
      p_new_status TEXT
    ) RETURNS BOOLEAN AS $$
    BEGIN
      -- PENDING can go to: RESERVED, CANCELLED, EXPIRED
      IF p_old_status = 'PENDING' THEN
        RETURN p_new_status IN ('RESERVED', 'CANCELLED', 'EXPIRED');
      END IF;
      
      -- RESERVED can go to: CONFIRMED, CANCELLED, EXPIRED
      IF p_old_status = 'RESERVED' THEN
        RETURN p_new_status IN ('CONFIRMED', 'CANCELLED', 'EXPIRED');
      END IF;
      
      -- CONFIRMED can go to: COMPLETED, CANCELLED, REFUNDED
      IF p_old_status = 'CONFIRMED' THEN
        RETURN p_new_status IN ('COMPLETED', 'CANCELLED', 'REFUNDED');
      END IF;
      
      -- COMPLETED can go to: REFUNDED
      IF p_old_status = 'COMPLETED' THEN
        RETURN p_new_status = 'REFUNDED';
      END IF;
      
      -- Terminal states cannot transition
      IF p_old_status IN ('CANCELLED', 'EXPIRED', 'REFUNDED') THEN
        RETURN FALSE;
      END IF;
      
      RETURN FALSE;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS validate_order_status_transition');
  await knex.raw('DROP FUNCTION IF EXISTS generate_order_number');
  await knex.raw('DROP FUNCTION IF EXISTS calculate_order_total');
  await knex.raw('DROP FUNCTION IF EXISTS log_order_status_change');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column');

  // Drop RLS policies
  await knex.raw('DROP POLICY IF EXISTS orders_tenant_isolation ON orders');
  await knex.raw('DROP POLICY IF EXISTS order_items_tenant_isolation ON order_items');
  await knex.raw('DROP POLICY IF EXISTS order_events_tenant_isolation ON order_events');
  await knex.raw('DROP POLICY IF EXISTS order_addresses_tenant_isolation ON order_addresses');
  await knex.raw('DROP POLICY IF EXISTS order_discounts_tenant_isolation ON order_discounts');
  await knex.raw('DROP POLICY IF EXISTS order_refunds_tenant_isolation ON order_refunds');

  // Disable RLS
  await knex.raw('ALTER TABLE orders DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_items DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_events DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_addresses DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_discounts DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_refunds DISABLE ROW LEVEL SECURITY');

  // Drop tables (in reverse order due to foreign keys)
  await knex.schema.dropTableIfExists('order_refunds');
  await knex.schema.dropTableIfExists('order_discounts');
  await knex.schema.dropTableIfExists('order_addresses');
  await knex.schema.dropTableIfExists('order_events');
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
}
