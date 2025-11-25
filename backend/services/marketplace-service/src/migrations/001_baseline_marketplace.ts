import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  console.log('🏪 Starting Marketplace Service baseline migration...');

  // ==========================================
  // 1. MARKETPLACE_LISTINGS TABLE
  // ==========================================
  await knex.schema.createTableIfNotExists('marketplace_listings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id').notNullable().unique();
    table.uuid('seller_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('venue_id').notNullable();

    // Pricing (INTEGER CENTS ONLY)
    table.integer('price').notNullable(); // Sale price in cents
    table.integer('original_face_value').notNullable(); // Original ticket price in cents
    
    // Price Multiplier (DECIMAL for calculations)
    table.decimal('price_multiplier', 5, 2); // e.g., 1.50 = 150% of face value

    // Status
    table.enum('status', ['active', 'sold', 'cancelled', 'expired', 'pending_approval'])
      .notNullable()
      .defaultTo('active');

    // Timestamps
    table.timestamp('listed_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('sold_at', { useTz: true });
    table.timestamp('expires_at', { useTz: true });
    table.timestamp('cancelled_at', { useTz: true });

    // Blockchain
    table.string('listing_signature', 255);
    table.string('wallet_address', 255).notNullable();
    table.string('program_address', 255);

    // Approval System
    table.boolean('requires_approval').defaultTo(false);
    table.timestamp('approved_at', { useTz: true });
    table.uuid('approved_by');
    table.text('approval_notes');

    // Engagement Metrics
    table.integer('view_count').defaultTo(0);
    table.integer('favorite_count').defaultTo(0);

    // Standard timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes for marketplace_listings
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_listings_ticket_id ON marketplace_listings(ticket_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller_id ON marketplace_listings(seller_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_listings_event_id ON marketplace_listings(event_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_listings_venue_id ON marketplace_listings(venue_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON marketplace_listings(status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_listings_event_status ON marketplace_listings(event_id, status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_listings_expires_at ON marketplace_listings(expires_at)');

  console.log('✅ marketplace_listings table created');

  // ==========================================
  // 2. MARKETPLACE_TRANSFERS TABLE
  // ==========================================
  await knex.schema.createTableIfNotExists('marketplace_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('listing_id').notNullable();
    table.uuid('buyer_id').notNullable();
    table.uuid('seller_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('venue_id').notNullable();

    // Wallet Addresses
    table.string('buyer_wallet', 255).notNullable();
    table.string('seller_wallet', 255).notNullable();

    // Blockchain Transaction
    table.string('transfer_signature', 255).notNullable();
    table.integer('block_height');

    // Payment Details
    table.enum('payment_currency', ['USDC', 'SOL']).notNullable();
    table.decimal('payment_amount', 20, 6); // Amount in smallest unit (lamports/microUSDC)
    table.integer('usd_value').notNullable(); // INTEGER CENTS

    // Status
    table.enum('status', ['initiated', 'pending', 'completed', 'failed', 'disputed'])
      .notNullable()
      .defaultTo('initiated');

    // Timestamps
    table.timestamp('initiated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('failed_at', { useTz: true });

    // Failure tracking
    table.text('failure_reason');

    // Network Fees
    table.decimal('network_fee', 20, 6); // Blockchain fee in smallest unit
    table.integer('network_fee_usd'); // INTEGER CENTS

    // Standard timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes for marketplace_transfers
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_transfers_listing_id ON marketplace_transfers(listing_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_transfers_buyer_id ON marketplace_transfers(buyer_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_transfers_seller_id ON marketplace_transfers(seller_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_transfers_status ON marketplace_transfers(status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_transfers_event_id ON marketplace_transfers(event_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_transfers_buyer_status ON marketplace_transfers(buyer_id, status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_transfers_seller_status ON marketplace_transfers(seller_id, status)');

  console.log('✅ marketplace_transfers table created');

  // ==========================================
  // 3. PLATFORM_FEES TABLE
  // ==========================================
  await knex.schema.createTableIfNotExists('platform_fees', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('transfer_id').notNullable().unique();

    // All amounts in INTEGER CENTS
    table.integer('sale_price').notNullable();
    table.integer('platform_fee_amount').notNullable();
    table.decimal('platform_fee_percentage', 5, 2).notNullable();
    table.integer('venue_fee_amount').notNullable();
    table.decimal('venue_fee_percentage', 5, 2).notNullable();
    table.integer('seller_payout').notNullable();

    // Blockchain Payment Tracking
    table.string('platform_fee_wallet', 255);
    table.string('platform_fee_signature', 255);
    table.string('venue_fee_wallet', 255);
    table.string('venue_fee_signature', 255);

    // Collection Status
    table.boolean('platform_fee_collected').defaultTo(false);
    table.boolean('venue_fee_paid').defaultTo(false);

    // Standard timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes for platform_fees
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_platform_fees_transfer_id ON platform_fees(transfer_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_platform_fees_platform_collected ON platform_fees(platform_fee_collected)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_platform_fees_venue_paid ON platform_fees(venue_fee_paid)');

  console.log('✅ platform_fees table created');

  // ==========================================
  // 4. VENUE_MARKETPLACE_SETTINGS TABLE
  // ==========================================
  await knex.schema.createTableIfNotExists('venue_marketplace_settings', (table) => {
    table.uuid('venue_id').primary();

    // Price Controls (DECIMAL for multipliers)
    table.decimal('max_resale_multiplier', 5, 2).defaultTo(3.0); // 3.0 = 300%
    table.decimal('min_price_multiplier', 5, 2).defaultTo(1.0); // 1.0 = 100%
    table.boolean('allow_below_face').defaultTo(false);

    // Timing Controls
    table.integer('transfer_cutoff_hours').defaultTo(4);
    table.integer('listing_advance_hours').defaultTo(720);
    table.boolean('auto_expire_on_event_start').defaultTo(true);

    // Listing Limits
    table.integer('max_listings_per_user_per_event').defaultTo(8);
    table.integer('max_listings_per_user_total').defaultTo(50);

    // Approval System
    table.boolean('require_listing_approval').defaultTo(false);
    table.boolean('auto_approve_verified_sellers').defaultTo(false);

    // Royalty System
    table.decimal('royalty_percentage', 5, 2).defaultTo(5.0); // 5.0 = 5%
    table.string('royalty_wallet_address', 255).notNullable();
    table.integer('minimum_royalty_payout').defaultTo(1000); // INTEGER CENTS (e.g., $10.00)

    // Geographic Controls
    table.boolean('allow_international_sales').defaultTo(true);
    table.specificType('blocked_countries', 'TEXT[]');

    // KYC Requirements
    table.boolean('require_kyc_for_high_value').defaultTo(false);
    table.integer('high_value_threshold').defaultTo(100000); // INTEGER CENTS (e.g., $1000.00)

    // Standard timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  console.log('✅ venue_marketplace_settings table created');

  // ==========================================
  // 5. MARKETPLACE_PRICE_HISTORY TABLE
  // ==========================================
  await knex.schema.createTableIfNotExists('marketplace_price_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('listing_id').notNullable();
    table.uuid('event_id').notNullable();

    // Price Snapshot (INTEGER CENTS)
    table.integer('old_price').notNullable();
    table.integer('new_price').notNullable();
    table.integer('price_change'); // Calculated: new_price - old_price

    // User who made the change
    table.uuid('changed_by').notNullable();

    // Optional reason
    table.string('change_reason', 255);

    // Timestamp
    table.timestamp('changed_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes for marketplace_price_history
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_price_history_listing_id ON marketplace_price_history(listing_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_price_history_event_id ON marketplace_price_history(event_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_price_history_changed_at ON marketplace_price_history(changed_at)');

  console.log('✅ marketplace_price_history table created');

  // ==========================================
  // 6. MARKETPLACE_DISPUTES TABLE
  // ==========================================
  await knex.schema.createTableIfNotExists('marketplace_disputes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('transfer_id').notNullable();
    table.uuid('listing_id').notNullable();

    // Parties Involved
    table.uuid('filed_by').notNullable();
    table.uuid('filed_against').notNullable();

    // Dispute Details
    table.enum('dispute_type', [
      'payment_not_received',
      'ticket_not_transferred',
      'fraudulent_listing',
      'price_dispute',
      'other'
    ]).notNullable();
    table.text('description').notNullable();
    table.specificType('evidence_urls', 'TEXT[]');

    // Status
    table.enum('status', ['open', 'under_review', 'resolved', 'closed'])
      .notNullable()
      .defaultTo('open');

    // Resolution
    table.text('resolution_notes');
    table.uuid('resolved_by');
    table.timestamp('resolved_at', { useTz: true });

    // Refund Information (INTEGER CENTS)
    table.integer('refund_amount');
    table.string('refund_transaction_id', 255);

    // Timestamps
    table.timestamp('filed_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes for marketplace_disputes
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_disputes_transfer_id ON marketplace_disputes(transfer_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_disputes_listing_id ON marketplace_disputes(listing_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_disputes_filed_by ON marketplace_disputes(filed_by)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_disputes_status ON marketplace_disputes(status)');

  console.log('✅ marketplace_disputes table created');

  // ==========================================
  // 7. TAX_TRANSACTIONS TABLE
  // ==========================================
  await knex.schema.createTableIfNotExists('tax_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('transfer_id').notNullable().unique();
    table.uuid('seller_id').notNullable();

    // Transaction Details (INTEGER CENTS)
    table.integer('sale_amount').notNullable();
    table.integer('cost_basis'); // What seller originally paid
    table.integer('capital_gain'); // sale_amount - cost_basis

    // Tax Year
    table.integer('tax_year').notNullable();
    table.integer('tax_quarter'); // 1, 2, 3, or 4

    // Classification
    table.enum('transaction_type', ['short_term', 'long_term']).notNullable();
    table.string('tax_category', 100);

    // Reporting Status
    table.boolean('reported_to_seller').defaultTo(false);
    table.boolean('reported_to_irs').defaultTo(false);
    table.timestamp('reported_at', { useTz: true });

    // Metadata
    table.jsonb('metadata').defaultTo('{}');

    // Timestamps
    table.timestamp('transaction_date', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes for tax_transactions
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_tax_transactions_transfer_id ON tax_transactions(transfer_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_tax_transactions_seller_id ON tax_transactions(seller_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_tax_transactions_tax_year ON tax_transactions(tax_year)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_tax_transactions_seller_year ON tax_transactions(seller_id, tax_year)');

  console.log('✅ tax_transactions table created');

  // ==========================================
  // 8. ANTI_BOT_ACTIVITIES TABLE
  // ==========================================
  await knex.schema.createTableIfNotExists('anti_bot_activities', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable();

    // Activity Details
    table.string('action_type', 100).notNullable();
    table.string('ip_address', 45); // IPv6 compatible
    table.text('user_agent');

    // Timestamp
    table.timestamp('timestamp', { useTz: true }).defaultTo(knex.fn.now());

    // Additional Metadata
    table.jsonb('metadata').defaultTo('{}');
  });

  // Indexes for anti_bot_activities
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_anti_bot_activities_user_id ON anti_bot_activities(user_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_anti_bot_activities_timestamp ON anti_bot_activities(timestamp)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_anti_bot_activities_user_action ON anti_bot_activities(user_id, action_type)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_anti_bot_activities_user_timestamp ON anti_bot_activities(user_id, timestamp)');

  console.log('✅ anti_bot_activities table created');

  // ==========================================
  // 9. ANTI_BOT_VIOLATIONS TABLE
  // ==========================================
  await knex.schema.createTableIfNotExists('anti_bot_violations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable();

    // Violation Details
    table.text('reason').notNullable();
    table.enum('severity', ['low', 'medium', 'high']).notNullable();

    // Timestamp
    table.timestamp('flagged_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes for anti_bot_violations
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_anti_bot_violations_user_id ON anti_bot_violations(user_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_anti_bot_violations_severity ON anti_bot_violations(severity)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_anti_bot_violations_flagged_at ON anti_bot_violations(flagged_at)');

  console.log('✅ anti_bot_violations table created');

  // ==========================================
  // 10. MARKETPLACE_BLACKLIST TABLE
  // ==========================================
  await knex.schema.createTableIfNotExists('marketplace_blacklist', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    // Identifier (at least one must be provided)
    table.uuid('user_id');
    table.string('wallet_address', 255);

    // Ban Details
    table.text('reason').notNullable();
    table.uuid('banned_by').notNullable();
    table.timestamp('banned_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true }); // NULL = permanent ban

    // Status
    table.boolean('is_active').defaultTo(true);
  });

  // Indexes for marketplace_blacklist
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_blacklist_user_id ON marketplace_blacklist(user_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_blacklist_wallet_address ON marketplace_blacklist(wallet_address)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_blacklist_is_active ON marketplace_blacklist(is_active)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_blacklist_expires_at ON marketplace_blacklist(expires_at)');

  console.log('✅ marketplace_blacklist table created');

  // ==========================================
  // STORED PROCEDURES / FUNCTIONS
  // ==========================================

  // Function: Auto-expire listings
  await knex.raw(`
    CREATE OR REPLACE FUNCTION expire_marketplace_listings()
    RETURNS INTEGER AS $$
    DECLARE
      expired_count INTEGER;
    BEGIN
      -- Update expired listings
      UPDATE marketplace_listings
      SET status = 'expired',
          updated_at = NOW()
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at < NOW();

      GET DIAGNOSTICS expired_count = ROW_COUNT;

      RETURN expired_count;
    END;
    $$ LANGUAGE plpgsql;
  `);

  console.log('✅ expire_marketplace_listings() function created');

  // Function: Calculate platform fees
  await knex.raw(`
    CREATE OR REPLACE FUNCTION calculate_marketplace_fees(
      sale_price_cents INTEGER,
      platform_fee_pct DECIMAL,
      venue_fee_pct DECIMAL
    )
    RETURNS TABLE(
      platform_fee INTEGER,
      venue_fee INTEGER,
      seller_payout INTEGER
    ) AS $$
    BEGIN
      RETURN QUERY SELECT
        CAST(ROUND(sale_price_cents * platform_fee_pct / 100.0) AS INTEGER) as platform_fee,
        CAST(ROUND(sale_price_cents * venue_fee_pct / 100.0) AS INTEGER) as venue_fee,
        CAST(sale_price_cents - ROUND(sale_price_cents * platform_fee_pct / 100.0) - ROUND(sale_price_cents * venue_fee_pct / 100.0) AS INTEGER) as seller_payout;
    END;
    $$ LANGUAGE plpgsql;
  `);

  console.log('✅ calculate_marketplace_fees() function created');

  // Function: Get active listings count for user
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_user_active_listings_count(
      p_user_id UUID,
      p_event_id UUID DEFAULT NULL
    )
    RETURNS INTEGER AS $$
    DECLARE
      listing_count INTEGER;
    BEGIN
      IF p_event_id IS NULL THEN
        SELECT COUNT(*) INTO listing_count
        FROM marketplace_listings
        WHERE seller_id = p_user_id
          AND status = 'active';
      ELSE
        SELECT COUNT(*) INTO listing_count
        FROM marketplace_listings
        WHERE seller_id = p_user_id
          AND event_id = p_event_id
          AND status = 'active';
      END IF;

      RETURN listing_count;
    END;
    $$ LANGUAGE plpgsql;
  `);

  console.log('✅ get_user_active_listings_count() function created');

  console.log('🎉 Marketplace Service baseline migration complete!');
  console.log('📊 Tables created: 10 tables + 3 stored procedures');
  console.log('');
  console.log('Created Tables:');
  console.log('  ✅ marketplace_listings (main listings table)');
  console.log('  ✅ marketplace_transfers (purchase/transfer records)');
  console.log('  ✅ platform_fees (fee breakdown)');
  console.log('  ✅ venue_marketplace_settings (venue configuration)');
  console.log('  ✅ marketplace_price_history (price change tracking)');
  console.log('  ✅ marketplace_disputes (dispute management)');
  console.log('  ✅ tax_transactions (tax reporting)');
  console.log('  ✅ anti_bot_activities (bot detection logs)');
  console.log('  ✅ anti_bot_violations (flagged suspicious activity)');
  console.log('  ✅ marketplace_blacklist (banned users/wallets)');
  console.log('');
  console.log('Created Functions:');
  console.log('  ✅ expire_marketplace_listings() (auto-expire listings)');
  console.log('  ✅ calculate_marketplace_fees() (fee calculation)');
  console.log('  ✅ get_user_active_listings_count() (listing count)');
}

export async function down(knex: Knex): Promise<void> {
  // Drop functions first
  await knex.raw('DROP FUNCTION IF EXISTS get_user_active_listings_count(UUID, UUID)');
  await knex.raw('DROP FUNCTION IF EXISTS calculate_marketplace_fees(INTEGER, DECIMAL, DECIMAL)');
  await knex.raw('DROP FUNCTION IF EXISTS expire_marketplace_listings()');

  // Drop tables in reverse order (respecting foreign key dependencies)
  await knex.schema.dropTableIfExists('marketplace_blacklist');
  await knex.schema.dropTableIfExists('anti_bot_violations');
  await knex.schema.dropTableIfExists('anti_bot_activities');
  await knex.schema.dropTableIfExists('tax_transactions');
  await knex.schema.dropTableIfExists('marketplace_disputes');
  await knex.schema.dropTableIfExists('marketplace_price_history');
  await knex.schema.dropTableIfExists('venue_marketplace_settings');
  await knex.schema.dropTableIfExists('platform_fees');
  await knex.schema.dropTableIfExists('marketplace_transfers');
  await knex.schema.dropTableIfExists('marketplace_listings');

  console.log('✅ Marketplace Service migration rolled back');
}
