import { Knex } from 'knex';

/**
 * Marketplace Service - Consolidated Baseline Migration
 *
 * Consolidated from 4 migrations on January 2025
 *
 * Tables (16 total):
 *   Tenant-scoped (12): marketplace_listings, marketplace_transfers, platform_fees,
 *                       venue_marketplace_settings, marketplace_price_history,
 *                       marketplace_disputes, dispute_evidence, tax_transactions,
 *                       anti_bot_activities, anti_bot_violations, marketplace_blacklist, refunds
 *   Global (4): listing_audit_log, anonymization_log, user_activity_log, refund_audit_log
 *
 * Functions (5): expire_marketplace_listings, calculate_marketplace_fees,
 *                get_user_active_listings_count, prevent_audit_log_update, prevent_audit_log_delete
 *
 * Triggers (4): Immutability triggers on audit tables
 *
 * Key fixes applied:
 *   - Changed uuid_generate_v4() to gen_random_uuid()
 *   - Removed uuid-ossp extension
 *   - Standardized RLS pattern with NULLIF + app.is_system_user
 *   - Added FORCE RLS to all tenant tables
 *   - Converted 22 external FKs to comments (cross-service)
 *   - Fixed refunds table (UUID default, correct FK names, RLS)
 */

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // ENUMS
  // ==========================================================================

  await knex.raw(`
    CREATE TYPE marketplace_listing_status AS ENUM ('active', 'sold', 'cancelled', 'expired', 'pending_approval');
    CREATE TYPE marketplace_payment_currency AS ENUM ('USDC', 'SOL');
    CREATE TYPE marketplace_transfer_status AS ENUM ('initiated', 'pending', 'completed', 'failed', 'disputed');
    CREATE TYPE marketplace_dispute_type AS ENUM ('payment_not_received', 'ticket_not_transferred', 'fraudulent_listing', 'price_dispute', 'other');
    CREATE TYPE marketplace_dispute_status AS ENUM ('open', 'under_review', 'resolved', 'closed');
    CREATE TYPE tax_transaction_type AS ENUM ('short_term', 'long_term');
    CREATE TYPE bot_violation_severity AS ENUM ('low', 'medium', 'high');
  `);

  // ==========================================================================
  // TENANT-SCOPED TABLES (12)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 1. MARKETPLACE_LISTINGS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('marketplace_listings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('ticket_id').notNullable().unique();
    table.uuid('seller_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.integer('price').notNullable();
    table.integer('original_face_value').notNullable();
    table.decimal('price_multiplier', 5, 2);
    table.specificType('status', 'marketplace_listing_status').notNullable().defaultTo('active');
    table.timestamp('listed_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('sold_at', { useTz: true });
    table.timestamp('expires_at', { useTz: true });
    table.timestamp('cancelled_at', { useTz: true });
    table.string('listing_signature', 255);
    table.string('wallet_address', 255).notNullable();
    table.string('program_address', 255);
    table.boolean('requires_approval').defaultTo(false);
    table.timestamp('approved_at', { useTz: true });
    table.uuid('approved_by');
    table.text('approval_notes');
    table.integer('view_count').defaultTo(0);
    table.integer('favorite_count').defaultTo(0);
    table.boolean('accepts_fiat_payment').defaultTo(false);
    table.boolean('accepts_crypto_payment').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_marketplace_listings_tenant_id');
    table.index('ticket_id', 'idx_marketplace_listings_ticket_id');
    table.index('seller_id', 'idx_marketplace_listings_seller_id');
    table.index('event_id', 'idx_marketplace_listings_event_id');
    table.index('venue_id', 'idx_marketplace_listings_venue_id');
    table.index('status', 'idx_marketplace_listings_status');
    table.index(['event_id', 'status'], 'idx_marketplace_listings_event_status');
    table.index('expires_at', 'idx_marketplace_listings_expires_at');
  });

  // External FK comments
  await knex.raw(`COMMENT ON COLUMN marketplace_listings.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN marketplace_listings.seller_id IS 'FK: auth-service.users(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN marketplace_listings.event_id IS 'FK: event-service.events(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN marketplace_listings.venue_id IS 'FK: venue-service.venues(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN marketplace_listings.approved_by IS 'FK: auth-service.users(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 2. MARKETPLACE_TRANSFERS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('marketplace_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('listing_id').notNullable();
    table.uuid('buyer_id').notNullable();
    table.uuid('seller_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.string('buyer_wallet', 255).notNullable();
    table.string('seller_wallet', 255).notNullable();
    table.string('transfer_signature', 255).notNullable();
    table.integer('block_height');
    table.specificType('payment_currency', 'marketplace_payment_currency').notNullable();
    table.decimal('payment_amount', 20, 6);
    table.integer('usd_value').notNullable();
    table.specificType('status', 'marketplace_transfer_status').notNullable().defaultTo('initiated');
    table.timestamp('initiated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('failed_at', { useTz: true });
    table.text('failure_reason');
    table.decimal('network_fee', 20, 6);
    table.integer('network_fee_usd');
    table.string('payment_method', 20).defaultTo('crypto');
    table.string('fiat_currency', 3);
    table.string('stripe_payment_intent_id', 255);
    table.string('stripe_transfer_id', 255);
    table.integer('stripe_application_fee_amount');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.foreign('listing_id').references('id').inTable('marketplace_listings').onDelete('CASCADE');

    table.index('tenant_id', 'idx_marketplace_transfers_tenant_id');
    table.index('listing_id', 'idx_marketplace_transfers_listing_id');
    table.index('buyer_id', 'idx_marketplace_transfers_buyer_id');
    table.index('seller_id', 'idx_marketplace_transfers_seller_id');
    table.index('status', 'idx_marketplace_transfers_status');
    table.index('event_id', 'idx_marketplace_transfers_event_id');
    table.index(['buyer_id', 'status'], 'idx_marketplace_transfers_buyer_status');
    table.index(['seller_id', 'status'], 'idx_marketplace_transfers_seller_status');
    table.index('stripe_payment_intent_id', 'idx_marketplace_transfers_stripe_payment_intent');
    table.index('payment_method', 'idx_marketplace_transfers_payment_method');
  });

  await knex.raw(`
    ALTER TABLE marketplace_transfers ADD CONSTRAINT chk_marketplace_transfers_payment_method
    CHECK (payment_method IN ('crypto', 'fiat'))
  `);

  await knex.raw(`COMMENT ON COLUMN marketplace_transfers.buyer_id IS 'FK: auth-service.users(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN marketplace_transfers.seller_id IS 'FK: auth-service.users(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN marketplace_transfers.event_id IS 'FK: event-service.events(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN marketplace_transfers.venue_id IS 'FK: venue-service.venues(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 3. PLATFORM_FEES
  // --------------------------------------------------------------------------
  await knex.schema.createTable('platform_fees', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transfer_id').notNullable().unique();
    table.integer('sale_price').notNullable();
    table.integer('platform_fee_amount').notNullable();
    table.decimal('platform_fee_percentage', 5, 2).notNullable();
    table.integer('venue_fee_amount').notNullable();
    table.decimal('venue_fee_percentage', 5, 2).notNullable();
    table.integer('seller_payout').notNullable();
    table.string('platform_fee_wallet', 255);
    table.string('platform_fee_signature', 255);
    table.string('venue_fee_wallet', 255);
    table.string('venue_fee_signature', 255);
    table.boolean('platform_fee_collected').defaultTo(false);
    table.boolean('venue_fee_paid').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.foreign('transfer_id').references('id').inTable('marketplace_transfers').onDelete('CASCADE');

    table.index('tenant_id', 'idx_platform_fees_tenant_id');
    table.index('transfer_id', 'idx_platform_fees_transfer_id');
    table.index('platform_fee_collected', 'idx_platform_fees_platform_collected');
    table.index('venue_fee_paid', 'idx_platform_fees_venue_paid');
  });

  // --------------------------------------------------------------------------
  // 4. VENUE_MARKETPLACE_SETTINGS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('venue_marketplace_settings', (table) => {
    table.uuid('venue_id').primary();
    table.uuid('tenant_id').notNullable();
    table.decimal('max_resale_multiplier', 5, 2).defaultTo(3.0);
    table.decimal('min_price_multiplier', 5, 2).defaultTo(1.0);
    table.boolean('allow_below_face').defaultTo(false);
    table.integer('transfer_cutoff_hours').defaultTo(4);
    table.integer('listing_advance_hours').defaultTo(720);
    table.boolean('auto_expire_on_event_start').defaultTo(true);
    table.integer('max_listings_per_user_per_event').defaultTo(8);
    table.integer('max_listings_per_user_total').defaultTo(50);
    table.boolean('require_listing_approval').defaultTo(false);
    table.boolean('auto_approve_verified_sellers').defaultTo(false);
    table.decimal('royalty_percentage', 5, 2).defaultTo(5.0);
    table.string('royalty_wallet_address', 255).notNullable();
    table.integer('minimum_royalty_payout').defaultTo(1000);
    table.boolean('allow_international_sales').defaultTo(true);
    table.specificType('blocked_countries', 'TEXT[]');
    table.boolean('require_kyc_for_high_value').defaultTo(false);
    table.integer('high_value_threshold').defaultTo(100000);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_venue_marketplace_settings_tenant_id');
  });

  await knex.raw(`COMMENT ON COLUMN venue_marketplace_settings.venue_id IS 'FK: venue-service.venues(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 5. MARKETPLACE_PRICE_HISTORY
  // --------------------------------------------------------------------------
  await knex.schema.createTable('marketplace_price_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('listing_id').notNullable();
    table.uuid('event_id').notNullable();
    table.integer('old_price').notNullable();
    table.integer('new_price').notNullable();
    table.integer('price_change');
    table.uuid('changed_by').notNullable();
    table.string('change_reason', 255);
    table.timestamp('changed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.foreign('listing_id').references('id').inTable('marketplace_listings').onDelete('CASCADE');

    table.index('tenant_id', 'idx_marketplace_price_history_tenant_id');
    table.index('listing_id', 'idx_marketplace_price_history_listing_id');
    table.index('event_id', 'idx_marketplace_price_history_event_id');
    table.index('changed_at', 'idx_marketplace_price_history_changed_at');
  });

  await knex.raw(`COMMENT ON COLUMN marketplace_price_history.event_id IS 'FK: event-service.events(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN marketplace_price_history.changed_by IS 'FK: auth-service.users(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 6. MARKETPLACE_DISPUTES
  // --------------------------------------------------------------------------
  await knex.schema.createTable('marketplace_disputes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transfer_id').notNullable();
    table.uuid('listing_id').notNullable();
    table.uuid('filed_by').notNullable();
    table.uuid('filed_against').notNullable();
    table.specificType('dispute_type', 'marketplace_dispute_type').notNullable();
    table.text('description').notNullable();
    table.specificType('evidence_urls', 'TEXT[]');
    table.specificType('status', 'marketplace_dispute_status').notNullable().defaultTo('open');
    table.text('resolution_notes');
    table.uuid('resolved_by');
    table.timestamp('resolved_at', { useTz: true });
    table.integer('refund_amount');
    table.string('refund_transaction_id', 255);
    table.timestamp('filed_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.foreign('transfer_id').references('id').inTable('marketplace_transfers').onDelete('CASCADE');
    table.foreign('listing_id').references('id').inTable('marketplace_listings').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_marketplace_disputes_tenant_id');
    table.index('transfer_id', 'idx_marketplace_disputes_transfer_id');
    table.index('listing_id', 'idx_marketplace_disputes_listing_id');
    table.index('filed_by', 'idx_marketplace_disputes_filed_by');
    table.index('status', 'idx_marketplace_disputes_status');
  });

  await knex.raw(`COMMENT ON COLUMN marketplace_disputes.filed_by IS 'FK: auth-service.users(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN marketplace_disputes.filed_against IS 'FK: auth-service.users(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN marketplace_disputes.resolved_by IS 'FK: auth-service.users(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 7. DISPUTE_EVIDENCE
  // --------------------------------------------------------------------------
  await knex.schema.createTable('dispute_evidence', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('dispute_id').notNullable();
    table.uuid('submitted_by').notNullable();
    table.string('evidence_type', 100).notNullable();
    table.text('content').notNullable();
    table.jsonb('metadata');
    table.timestamp('submitted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.foreign('dispute_id').references('id').inTable('marketplace_disputes').onDelete('CASCADE');

    table.index('tenant_id', 'idx_dispute_evidence_tenant_id');
    table.index('dispute_id', 'idx_dispute_evidence_dispute_id');
    table.index('submitted_by', 'idx_dispute_evidence_submitted_by');
  });

  await knex.raw(`COMMENT ON COLUMN dispute_evidence.submitted_by IS 'FK: auth-service.users(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 8. TAX_TRANSACTIONS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('tax_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transfer_id').notNullable().unique();
    table.uuid('seller_id').notNullable();
    table.integer('sale_amount').notNullable();
    table.integer('cost_basis');
    table.integer('capital_gain');
    table.integer('tax_year').notNullable();
    table.integer('tax_quarter');
    table.specificType('transaction_type', 'tax_transaction_type').notNullable();
    table.string('tax_category', 100);
    table.boolean('reported_to_seller').defaultTo(false);
    table.boolean('reported_to_irs').defaultTo(false);
    table.timestamp('reported_at', { useTz: true });
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('transaction_date', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.foreign('transfer_id').references('id').inTable('marketplace_transfers').onDelete('CASCADE');

    table.index('tenant_id', 'idx_tax_transactions_tenant_id');
    table.index('transfer_id', 'idx_tax_transactions_transfer_id');
    table.index('seller_id', 'idx_tax_transactions_seller_id');
    table.index('tax_year', 'idx_tax_transactions_tax_year');
    table.index(['seller_id', 'tax_year'], 'idx_tax_transactions_seller_year');
  });

  await knex.raw(`COMMENT ON COLUMN tax_transactions.seller_id IS 'FK: auth-service.users(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 9. ANTI_BOT_ACTIVITIES
  // --------------------------------------------------------------------------
  await knex.schema.createTable('anti_bot_activities', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('action_type', 100).notNullable();
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('timestamp', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.jsonb('metadata').defaultTo('{}');

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_anti_bot_activities_tenant_id');
    table.index('user_id', 'idx_anti_bot_activities_user_id');
    table.index('timestamp', 'idx_anti_bot_activities_timestamp');
    table.index(['user_id', 'action_type'], 'idx_anti_bot_activities_user_action');
    table.index(['user_id', 'timestamp'], 'idx_anti_bot_activities_user_timestamp');
  });

  await knex.raw(`COMMENT ON COLUMN anti_bot_activities.user_id IS 'FK: auth-service.users(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 10. ANTI_BOT_VIOLATIONS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('anti_bot_violations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.text('reason').notNullable();
    table.specificType('severity', 'bot_violation_severity').notNullable();
    table.timestamp('flagged_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_anti_bot_violations_tenant_id');
    table.index('user_id', 'idx_anti_bot_violations_user_id');
    table.index('severity', 'idx_anti_bot_violations_severity');
    table.index('flagged_at', 'idx_anti_bot_violations_flagged_at');
  });

  await knex.raw(`COMMENT ON COLUMN anti_bot_violations.user_id IS 'FK: auth-service.users(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 11. MARKETPLACE_BLACKLIST
  // --------------------------------------------------------------------------
  await knex.schema.createTable('marketplace_blacklist', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id');
    table.string('wallet_address', 255);
    table.text('reason').notNullable();
    table.uuid('banned_by').notNullable();
    table.timestamp('banned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true });
    table.boolean('is_active').defaultTo(true);

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_marketplace_blacklist_tenant_id');
    table.index('user_id', 'idx_marketplace_blacklist_user_id');
    table.index('wallet_address', 'idx_marketplace_blacklist_wallet_address');
    table.index('is_active', 'idx_marketplace_blacklist_is_active');
    table.index('expires_at', 'idx_marketplace_blacklist_expires_at');
  });

  await knex.raw(`COMMENT ON COLUMN marketplace_blacklist.user_id IS 'FK: auth-service.users(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN marketplace_blacklist.banned_by IS 'FK: auth-service.users(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 12. REFUNDS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('refunds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transfer_id').notNullable();
    table.uuid('listing_id').notNullable();
    table.uuid('buyer_id').notNullable();
    table.uuid('seller_id').notNullable();
    table.bigInteger('original_amount').notNullable();
    table.bigInteger('refund_amount').notNullable();
    table.string('reason', 50).notNullable();
    table.text('reason_details');
    table.uuid('initiated_by').notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.string('stripe_refund_id', 100);
    table.text('error_message');
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.foreign('transfer_id').references('id').inTable('marketplace_transfers').onDelete('CASCADE');
    table.foreign('listing_id').references('id').inTable('marketplace_listings').onDelete('CASCADE');

    table.index('tenant_id', 'idx_refunds_tenant_id');
    table.index('transfer_id', 'idx_refunds_transfer_id');
    table.index('buyer_id', 'idx_refunds_buyer_id');
    table.index('seller_id', 'idx_refunds_seller_id');
    table.index('status', 'idx_refunds_status');
  });

  await knex.raw(`COMMENT ON COLUMN refunds.buyer_id IS 'FK: auth-service.users(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN refunds.seller_id IS 'FK: auth-service.users(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN refunds.initiated_by IS 'FK: auth-service.users(id) - not enforced, cross-service'`);

  // ==========================================================================
  // GLOBAL TABLES (4) - No tenant_id, No RLS
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 13. LISTING_AUDIT_LOG (Global - Immutable)
  // --------------------------------------------------------------------------
  await knex.schema.createTable('listing_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('listing_id').notNullable();
    table.string('action', 50).notNullable();
    table.string('old_status', 30);
    table.string('new_status', 30);
    table.text('reason');
    table.timestamp('event_start_time', { useTz: true });
    table.jsonb('metadata');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_listing_audit_log_listing ON listing_audit_log(listing_id)`);
  await knex.raw(`CREATE INDEX idx_listing_audit_log_action ON listing_audit_log(action, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_listing_audit_log_created ON listing_audit_log(created_at DESC)`);
  await knex.raw(`COMMENT ON TABLE listing_audit_log IS 'Audit log for listing changes - immutable, global'`);

  // --------------------------------------------------------------------------
  // 14. ANONYMIZATION_LOG (Global)
  // --------------------------------------------------------------------------
  await knex.schema.createTable('anonymization_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('anonymized_id', 50).notNullable();
    table.text('tables_affected').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_anonymization_log_user ON anonymization_log(user_id)`);
  await knex.raw(`CREATE INDEX idx_anonymization_log_anonymized ON anonymization_log(anonymized_id)`);
  await knex.raw(`CREATE INDEX idx_anonymization_log_created ON anonymization_log(created_at DESC)`);
  await knex.raw(`COMMENT ON TABLE anonymization_log IS 'GDPR anonymization tracking - global'`);

  // --------------------------------------------------------------------------
  // 15. USER_ACTIVITY_LOG (Global)
  // --------------------------------------------------------------------------
  await knex.schema.createTable('user_activity_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id');
    table.string('activity_type', 50).notNullable();
    table.jsonb('metadata');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_user_activity_log_user ON user_activity_log(user_id)`);
  await knex.raw(`CREATE INDEX idx_user_activity_log_type ON user_activity_log(activity_type, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_user_activity_log_created ON user_activity_log(created_at DESC)`);
  await knex.raw(`COMMENT ON TABLE user_activity_log IS 'User activity for retention policies - global'`);

  // --------------------------------------------------------------------------
  // 16. REFUND_AUDIT_LOG (Global - Immutable)
  // --------------------------------------------------------------------------
  await knex.schema.createTable('refund_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('refund_id');
    table.uuid('transfer_id');
    table.uuid('event_id');
    table.string('action', 50).notNullable();
    table.string('old_status', 20);
    table.string('new_status', 20);
    table.bigInteger('amount');
    table.string('stripe_refund_id', 100);
    table.string('reason', 50);
    table.text('error');
    table.uuid('initiated_by');
    table.jsonb('metadata');
    table.string('request_id', 100);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_refund_audit_refund_id ON refund_audit_log(refund_id)`);
  await knex.raw(`CREATE INDEX idx_refund_audit_transfer_id ON refund_audit_log(transfer_id)`);
  await knex.raw(`CREATE INDEX idx_refund_audit_created_at ON refund_audit_log(created_at DESC)`);
  await knex.raw(`COMMENT ON TABLE refund_audit_log IS 'Audit log for refund operations - immutable, global'`);

  // ==========================================================================
  // FUNCTIONS
  // ==========================================================================

  // Function: Auto-expire listings
  await knex.raw(`
    CREATE OR REPLACE FUNCTION expire_marketplace_listings()
    RETURNS INTEGER AS $$
    DECLARE
      expired_count INTEGER;
    BEGIN
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

  // Function: Prevent audit log updates (immutability)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION prevent_audit_log_update()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Audit logs are immutable and cannot be updated';
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Function: Prevent audit log deletes (immutability)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION prevent_audit_log_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Audit logs are immutable and cannot be deleted';
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================================================
  // TRIGGERS (Audit Log Immutability)
  // ==========================================================================

  await knex.raw(`
    CREATE TRIGGER prevent_listing_audit_update
      BEFORE UPDATE ON listing_audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_update();

    CREATE TRIGGER prevent_listing_audit_delete
      BEFORE DELETE ON listing_audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_delete();

    CREATE TRIGGER prevent_refund_audit_update
      BEFORE UPDATE ON refund_audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_update();

    CREATE TRIGGER prevent_refund_audit_delete
      BEFORE DELETE ON refund_audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_delete();
  `);

  // ==========================================================================
  // ROW LEVEL SECURITY (12 Tenant Tables)
  // ==========================================================================

  const tenantTables = [
    'marketplace_listings',
    'marketplace_transfers',
    'platform_fees',
    'venue_marketplace_settings',
    'marketplace_price_history',
    'marketplace_disputes',
    'dispute_evidence',
    'tax_transactions',
    'anti_bot_activities',
    'anti_bot_violations',
    'marketplace_blacklist',
    'refunds'
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

  // ==========================================================================
  // COMPLETION
  // ==========================================================================

  console.log('✅ Marketplace Service consolidated baseline migration complete');
  console.log('📊 Tables created: 16 (12 tenant-scoped, 4 global)');
  console.log('🔒 RLS enabled on 12 tenant tables');
  console.log('⚡ Functions: 5, Triggers: 4, Enums: 7');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  const tenantTables = [
    'refunds',
    'marketplace_blacklist',
    'anti_bot_violations',
    'anti_bot_activities',
    'tax_transactions',
    'dispute_evidence',
    'marketplace_disputes',
    'marketplace_price_history',
    'venue_marketplace_settings',
    'platform_fees',
    'marketplace_transfers',
    'marketplace_listings'
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
  }

  // Drop triggers
  await knex.raw(`DROP TRIGGER IF EXISTS prevent_refund_audit_delete ON refund_audit_log`);
  await knex.raw(`DROP TRIGGER IF EXISTS prevent_refund_audit_update ON refund_audit_log`);
  await knex.raw(`DROP TRIGGER IF EXISTS prevent_listing_audit_delete ON listing_audit_log`);
  await knex.raw(`DROP TRIGGER IF EXISTS prevent_listing_audit_update ON listing_audit_log`);

  // Drop functions
  await knex.raw(`DROP FUNCTION IF EXISTS prevent_audit_log_delete()`);
  await knex.raw(`DROP FUNCTION IF EXISTS prevent_audit_log_update()`);
  await knex.raw(`DROP FUNCTION IF EXISTS get_user_active_listings_count(UUID, UUID)`);
  await knex.raw(`DROP FUNCTION IF EXISTS calculate_marketplace_fees(INTEGER, DECIMAL, DECIMAL)`);
  await knex.raw(`DROP FUNCTION IF EXISTS expire_marketplace_listings()`);

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('refund_audit_log');
  await knex.schema.dropTableIfExists('user_activity_log');
  await knex.schema.dropTableIfExists('anonymization_log');
  await knex.schema.dropTableIfExists('listing_audit_log');
  await knex.schema.dropTableIfExists('refunds');
  await knex.schema.dropTableIfExists('marketplace_blacklist');
  await knex.schema.dropTableIfExists('anti_bot_violations');
  await knex.schema.dropTableIfExists('anti_bot_activities');
  await knex.schema.dropTableIfExists('tax_transactions');
  await knex.schema.dropTableIfExists('dispute_evidence');
  await knex.schema.dropTableIfExists('marketplace_disputes');
  await knex.schema.dropTableIfExists('marketplace_price_history');
  await knex.schema.dropTableIfExists('venue_marketplace_settings');
  await knex.schema.dropTableIfExists('platform_fees');
  await knex.schema.dropTableIfExists('marketplace_transfers');
  await knex.schema.dropTableIfExists('marketplace_listings');

  // Drop enums
  await knex.raw(`DROP TYPE IF EXISTS bot_violation_severity`);
  await knex.raw(`DROP TYPE IF EXISTS tax_transaction_type`);
  await knex.raw(`DROP TYPE IF EXISTS marketplace_dispute_status`);
  await knex.raw(`DROP TYPE IF EXISTS marketplace_dispute_type`);
  await knex.raw(`DROP TYPE IF EXISTS marketplace_transfer_status`);
  await knex.raw(`DROP TYPE IF EXISTS marketplace_payment_currency`);
  await knex.raw(`DROP TYPE IF EXISTS marketplace_listing_status`);

  console.log('✅ Marketplace Service consolidated baseline rolled back');
}
