import { Knex } from 'knex';

/**
 * PHASE 4: PAYMENTS AND PRICING
 * 
 * Consolidates migrations 013-017, 035:
 * - Payment methods (store customer payment info)
 * - Split payments (multiple payment methods per order)
 * - Promo codes (discount codes and redemption tracking)
 * - Discount combination rules (how discounts stack)
 * - Promotional campaigns (marketing campaigns with codes)
 * - Tax management (jurisdictions, rates, exemptions, calculations)
 * 
 * Tables created: 13
 * - payment_methods
 * - payment_attempts
 * - payment_splits
 * - promo_codes
 * - promo_code_redemptions
 * - discount_combination_rules
 * - promotional_campaigns
 * - campaign_promo_codes
 * - tax_jurisdictions
 * - tax_rates
 * - tax_exemptions
 * - tax_calculations
 * 
 * Tables modified: 1
 * - orders (+3 columns)
 * 
 * ENUM types: 7
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // SECTION 1: PAYMENT METHODS (from migration 013)
  // ============================================================================
  
  // Create payment_method_type ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE payment_method_type AS ENUM (
        'CREDIT_CARD',
        'DEBIT_CARD',
        'PAYPAL',
        'APPLE_PAY',
        'GOOGLE_PAY',
        'BANK_TRANSFER'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create payment_attempt_status ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE payment_attempt_status AS ENUM (
        'PENDING',
        'PROCESSING',
        'SUCCESS',
        'FAILED',
        'CANCELLED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create payment_methods table
  await knex.schema.createTable('payment_methods', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    
    // Method details
    table.specificType('type', 'payment_method_type').notNullable();
    table.string('provider', 50).notNullable();
    table.string('token', 255).notNullable();
    
    // Card details (for display only)
    table.string('last_four', 4);
    table.string('card_brand', 50);
    table.integer('expiry_month');
    table.integer('expiry_year');
    
    // Flags
    table.boolean('is_default').defaultTo(false);
    table.boolean('is_verified').defaultTo(false);
    table.boolean('is_expired').defaultTo(false);
    
    // Metadata
    table.jsonb('billing_address');
    table.jsonb('metadata');
    
    // Timestamps
    table.timestamp('last_used_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    // Constraints
    table.unique(['tenant_id', 'user_id', 'token']);
  });

  // Create indexes for payment_methods
  await knex.schema.table('payment_methods', (table) => {
    table.index(['tenant_id', 'user_id'], 'idx_payment_methods_tenant_user');
    table.index(['token'], 'idx_payment_methods_token');
  });

  // Create partial index for default payment methods (requires raw SQL)
  await knex.raw(`
    CREATE INDEX idx_payment_methods_user_default 
    ON payment_methods(user_id, is_default) 
    WHERE is_default = TRUE
  `);

  // Create payment_attempts table
  await knex.schema.createTable('payment_attempts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('payment_method_id').references('id').inTable('payment_methods');
    table.uuid('tenant_id').notNullable();
    table.integer('attempt_number').notNullable().defaultTo(1);
    table.specificType('status', 'payment_attempt_status').notNullable().defaultTo('PENDING');
    table.integer('amount_cents').notNullable();
    table.string('provider', 50).notNullable();
    table.string('provider_transaction_id', 255);
    table.jsonb('provider_response');
    table.string('error_code', 100);
    table.text('error_message');
    table.timestamp('attempted_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('order_id', 'idx_payment_attempts_order');
    table.index('payment_method_id', 'idx_payment_attempts_payment_method');
    table.index('status', 'idx_payment_attempts_status');
    table.index('attempted_at', 'idx_payment_attempts_attempted');
  });

  // Add CHECK constraint for payment_attempts
  await knex.raw(`
    ALTER TABLE payment_attempts
    ADD CONSTRAINT valid_amount CHECK (amount_cents > 0)
  `);

  // ============================================================================
  // SECTION 2: SPLIT PAYMENTS (from migration 014)
  // ============================================================================
  
  // Create split_payment_status ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE split_payment_status AS ENUM (
        'PENDING',
        'PROCESSING',
        'COMPLETED',
        'FAILED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create payment_splits table
  await knex.schema.createTable('payment_splits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('payment_method_id').notNullable().references('id').inTable('payment_methods');
    table.uuid('tenant_id').notNullable();
    table.integer('amount_cents').notNullable();
    table.decimal('percentage', 5, 2);
    table.specificType('status', 'split_payment_status').notNullable().defaultTo('PENDING');
    table.timestamp('processed_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('order_id', 'idx_payment_splits_order');
    table.index('payment_method_id', 'idx_payment_splits_payment_method');
    table.index('status', 'idx_payment_splits_status');
  });

  // Add CHECK constraint for payment_splits
  await knex.raw(`
    ALTER TABLE payment_splits
    ADD CONSTRAINT valid_split_amount CHECK (amount_cents > 0)
  `);

  // ============================================================================
  // SECTION 3: PROMO CODES (from migration 015)
  // ============================================================================
  
  // Create discount_type ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE discount_type AS ENUM (
        'PERCENTAGE',
        'FIXED_AMOUNT',
        'BOGO',
        'TIERED',
        'EARLY_BIRD'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create promo_codes table
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

    // UNIQUE constraint
    table.unique(['tenant_id', 'code']);
  });

  // Create special functional index with UPPER() for case-insensitive search
  await knex.raw(`
    CREATE INDEX idx_promo_codes_tenant_code 
    ON promo_codes(tenant_id, UPPER(code))
  `);

  // Create partial indexes for promo_codes
  await knex.raw(`
    CREATE INDEX idx_promo_codes_active 
    ON promo_codes(tenant_id, is_active) 
    WHERE is_active = TRUE
  `);

  await knex.raw(`
    CREATE INDEX idx_promo_codes_valid 
    ON promo_codes(valid_from, valid_until) 
    WHERE is_active = TRUE
  `);

  // Create promo_code_redemptions table
  await knex.schema.createTable('promo_code_redemptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('promo_code_id').notNullable().references('id').inTable('promo_codes').onDelete('CASCADE');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('user_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.integer('discount_applied_cents').notNullable();
    table.timestamp('redeemed_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('promo_code_id', 'idx_redemptions_promo');
    table.index(['user_id', 'promo_code_id'], 'idx_redemptions_user');
    table.index('order_id', 'idx_redemptions_order');
  });

  // ============================================================================
  // SECTION 4: DISCOUNT COMBINATION RULES (from migration 016)
  // ============================================================================
  
  // Create combination_rule_type ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE combination_rule_type AS ENUM (
        'MUTUALLY_EXCLUSIVE',
        'STACKABLE',
        'CONDITIONAL'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create discount_combination_rules table
  await knex.schema.createTable('discount_combination_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.specificType('rule_type', 'combination_rule_type').notNullable();
    table.jsonb('promo_code_ids').notNullable();
    table.integer('max_combined_discount_percent');
    table.integer('priority').defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Create partial index for combination rules
  await knex.raw(`
    CREATE INDEX idx_combination_rules_tenant 
    ON discount_combination_rules(tenant_id, is_active) 
    WHERE is_active = TRUE
  `);

  // ============================================================================
  // SECTION 5: PROMOTIONAL CAMPAIGNS (from migration 017)
  // ============================================================================
  
  // Create campaign_status ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE campaign_status AS ENUM (
        'DRAFT',
        'ACTIVE',
        'PAUSED',
        'COMPLETED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create promotional_campaigns table
  await knex.schema.createTable('promotional_campaigns', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.text('description');
    table.timestamp('start_date').notNullable();
    table.timestamp('end_date').notNullable();
    table.specificType('status', 'campaign_status').notNullable().defaultTo('DRAFT');
    table.jsonb('target_audience');
    table.integer('budget_limit_cents');
    table.integer('total_spent_cents').defaultTo(0);
    table.integer('generated_codes_count').defaultTo(0);
    table.boolean('ab_test_enabled').defaultTo(false);
    table.jsonb('ab_test_config');
    table.jsonb('performance_metrics');
    table.uuid('created_by');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('tenant_id', 'idx_campaigns_tenant');
    table.index('status', 'idx_campaigns_status');
    table.index(['start_date', 'end_date'], 'idx_campaigns_dates');
  });

  // Create campaign_promo_codes junction table
  await knex.schema.createTable('campaign_promo_codes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('campaign_id').notNullable().references('id').inTable('promotional_campaigns').onDelete('CASCADE');
    table.uuid('promo_code_id').notNullable().references('id').inTable('promo_codes').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // UNIQUE constraint
    table.unique(['campaign_id', 'promo_code_id']);

    // Indexes
    table.index('campaign_id', 'idx_campaign_codes_campaign');
    table.index('promo_code_id', 'idx_campaign_codes_promo');
  });

  // ============================================================================
  // SECTION 6: MODIFY ORDERS TABLE
  // ============================================================================
  // Add payment and promo code tracking columns
  // (from migrations 013 and 015)
  
  await knex.schema.table('orders', (table) => {
    // From migration 013
    table.uuid('payment_method_id').references('id').inTable('payment_methods');
    table.boolean('allows_split_payment').defaultTo(false);
    
    // From migration 015
    table.jsonb('applied_promo_codes');
  });

  // Add partial index for orders with payment methods
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_orders_payment_method 
    ON orders(payment_method_id) 
    WHERE payment_method_id IS NOT NULL
  `);

  // ============================================================================
  // SECTION 7: TAX MANAGEMENT (from migration 035)
  // ============================================================================
  // Comprehensive tax calculation system for multi-jurisdiction compliance
  
  // Create tax_jurisdiction_type ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE tax_jurisdiction_type AS ENUM (
        'FEDERAL',
        'STATE',
        'COUNTY',
        'CITY',
        'DISTRICT'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create tax_jurisdictions table
  await knex.schema.createTable('tax_jurisdictions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.string('code', 50).notNullable(); // e.g., 'US-CA-SF'
    table.specificType('type', 'tax_jurisdiction_type').notNullable();
    table.string('country', 2).notNullable(); // ISO country code
    table.string('region', 100); // State/Province
    table.string('city', 100);
    table.string('postal_code', 20);
    table.uuid('parent_jurisdiction_id').references('id').inTable('tax_jurisdictions');
    table.boolean('active').defaultTo(true);
    table.jsonb('metadata');
    table.timestamps(true, true);

    // Unique constraint
    table.unique(['tenant_id', 'code']);

    // Indexes
    table.index('tenant_id');
    table.index(['tenant_id', 'active']);
    table.index(['country', 'region', 'city']);
    table.index('parent_jurisdiction_id');
  });

  // Create tax_rates table
  await knex.schema.createTable('tax_rates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('jurisdiction_id').notNullable()
      .references('id').inTable('tax_jurisdictions')
      .onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable(); // e.g., 'California Sales Tax'
    table.decimal('rate', 10, 6).notNullable(); // e.g., 0.0825 for 8.25%
    table.string('tax_type', 50).notNullable(); // 'SALES', 'VAT', 'GST', 'SERVICE'
    table.timestamp('effective_from').notNullable();
    table.timestamp('effective_to');
    table.boolean('compound').defaultTo(false); // Tax on tax
    table.boolean('include_in_price').defaultTo(false); // Tax-inclusive pricing
    table.jsonb('applicable_categories'); // Which event/ticket categories
    table.decimal('threshold_amount_cents', 12, 2); // Min amount for tax to apply
    table.boolean('active').defaultTo(true);
    table.jsonb('metadata');
    table.timestamps(true, true);

    // Indexes
    table.index('jurisdiction_id');
    table.index('tenant_id');
    table.index(['effective_from', 'effective_to']);
    table.index(['tenant_id', 'active']);
  });

  // Create tax_exemptions table
  await knex.schema.createTable('tax_exemptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('jurisdiction_id').references('id').inTable('tax_jurisdictions');
    table.string('exemption_type', 50).notNullable(); // 'RESALE', 'NONPROFIT', 'GOVERNMENT', etc.
    table.string('certificate_number', 100);
    table.string('issuing_authority', 255);
    table.timestamp('valid_from').notNullable();
    table.timestamp('valid_until');
    table.string('document_url', 500); // Uploaded certificate
    table.enum('status', ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']).notNullable().defaultTo('PENDING');
    table.uuid('approved_by');
    table.timestamp('approved_at');
    table.text('rejection_reason');
    table.boolean('active').defaultTo(true);
    table.jsonb('metadata');
    table.timestamps(true, true);

    // Indexes
    table.index('tenant_id');
    table.index('user_id');
    table.index('jurisdiction_id');
    table.index('status');
    table.index(['user_id', 'jurisdiction_id', 'active']);
  });

  // Create tax_calculations table (audit trail)
  await knex.schema.createTable('tax_calculations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();
    
    // Calculation details
    table.decimal('subtotal_cents', 12, 2).notNullable();
    table.decimal('total_tax_cents', 12, 2).notNullable();
    table.jsonb('tax_breakdown').notNullable(); // Array of taxes applied
    
    // Location used for calculation
    table.string('billing_country', 2);
    table.string('billing_region', 100);
    table.string('billing_city', 100);
    table.string('billing_postal_code', 20);
    table.string('shipping_country', 2);
    table.string('shipping_region', 100);
    
    // Tax exemption applied?
    table.uuid('exemption_id').references('id').inTable('tax_exemptions');
    table.boolean('tax_exempt').defaultTo(false);
    table.text('exemption_reason');
    
    // Metadata for compliance
    table.string('calculation_engine', 50); // 'INTERNAL', 'AVALARA', 'TAXJAR'
    table.string('engine_version', 20);
    table.jsonb('engine_response'); // Raw response from tax engine
    table.timestamp('calculated_at').notNullable().defaultTo(knex.fn.now());
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('order_id');
    table.index('tenant_id');
    table.index('exemption_id');
    table.index('calculated_at');
    table.index(['billing_country', 'billing_region']);
  });

  await knex.raw(`
    COMMENT ON TABLE tax_jurisdictions IS 'Tax jurisdictions (federal, state, county, city) for multi-region compliance'
  `);
  
  await knex.raw(`
    COMMENT ON TABLE tax_rates IS 'Tax rates by jurisdiction with effective dates and applicability rules'
  `);
  
  await knex.raw(`
    COMMENT ON TABLE tax_exemptions IS 'Tax exemption certificates for eligible customers (resale, nonprofit, etc.)'
  `);
  
  await knex.raw(`
    COMMENT ON TABLE tax_calculations IS 'Audit trail of tax calculations for each order (compliance & reporting)'
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse order: 035, 017, 016, 015, 014, 013
  
  // ============================================================================
  // Section 7: Drop tax management tables (from 035)
  // ============================================================================
  
  await knex.schema.dropTableIfExists('tax_calculations');
  await knex.schema.dropTableIfExists('tax_exemptions');
  await knex.schema.dropTableIfExists('tax_rates');
  await knex.schema.dropTableIfExists('tax_jurisdictions');
  await knex.raw('DROP TYPE IF EXISTS tax_jurisdiction_type');

  // ============================================================================
  // Remove modifications to orders table (from 013 and 015)
  // ============================================================================
  
  await knex.raw('DROP INDEX IF EXISTS idx_orders_payment_method');

  await knex.schema.table('orders', (table) => {
    table.dropColumn('applied_promo_codes');
    table.dropColumn('allows_split_payment');
    table.dropColumn('payment_method_id');
  });

  // ============================================================================
  // Section 5: Drop promotional campaigns (from 017)
  // ============================================================================
  
  await knex.schema.dropTableIfExists('campaign_promo_codes');
  await knex.schema.dropTableIfExists('promotional_campaigns');
  await knex.raw('DROP TYPE IF EXISTS campaign_status');

  // ============================================================================
  // Section 4: Drop discount combination rules (from 016)
  // ============================================================================
  
  await knex.raw('DROP INDEX IF EXISTS idx_combination_rules_tenant');
  await knex.schema.dropTableIfExists('discount_combination_rules');
  await knex.raw('DROP TYPE IF EXISTS combination_rule_type');

  // ============================================================================
  // Section 3: Drop promo codes (from 015)
  // ============================================================================
  
  await knex.schema.dropTableIfExists('promo_code_redemptions');
  await knex.raw('DROP INDEX IF EXISTS idx_promo_codes_valid');
  await knex.raw('DROP INDEX IF EXISTS idx_promo_codes_active');
  await knex.raw('DROP INDEX IF EXISTS idx_promo_codes_tenant_code');
  await knex.schema.dropTableIfExists('promo_codes');
  await knex.raw('DROP TYPE IF EXISTS discount_type');

  // ============================================================================
  // Section 2: Drop payment splits (from 014)
  // ============================================================================
  
  await knex.schema.dropTableIfExists('payment_splits');
  await knex.raw('DROP TYPE IF EXISTS split_payment_status');

  // ============================================================================
  // Section 1: Drop payment methods (from 013)
  // ============================================================================
  
  await knex.schema.dropTableIfExists('payment_attempts');
  await knex.raw('DROP INDEX IF EXISTS idx_payment_methods_user_default');
  await knex.schema.dropTableIfExists('payment_methods');
  await knex.raw('DROP TYPE IF EXISTS payment_attempt_status');
  await knex.raw('DROP TYPE IF EXISTS payment_method_type');
}
