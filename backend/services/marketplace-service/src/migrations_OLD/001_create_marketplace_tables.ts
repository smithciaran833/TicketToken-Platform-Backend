import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create marketplace_listings table
  await knex.schema.createTable('marketplace_listings', (table) => {
    table.uuid('id').primary();
    table.uuid('ticket_id').notNullable().unique();
    table.uuid('seller_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.decimal('price', 10, 2).notNullable();
    table.decimal('original_face_value', 10, 2).notNullable();
    table.decimal('price_multiplier', 5, 2);
    table.enum('status', ['active', 'sold', 'cancelled', 'expired', 'pending_approval']).defaultTo('active');
    table.timestamp('listed_at').defaultTo(knex.fn.now());
    table.timestamp('sold_at');
    table.timestamp('expires_at');
    table.timestamp('cancelled_at');
    table.string('listing_signature');
    table.string('wallet_address').notNullable();
    table.string('program_address');
    table.boolean('requires_approval').defaultTo(false);
    table.timestamp('approved_at');
    table.uuid('approved_by');
    table.text('approval_notes');
    table.integer('view_count').defaultTo(0);
    table.integer('favorite_count').defaultTo(0);
    table.timestamps(true, true);

    // Indexes
    table.index(['event_id', 'status']);
    table.index(['seller_id', 'status']);
    table.index(['status']);
    table.index(['expires_at']);
  });

  // Create marketplace_transfers table
  await knex.schema.createTable('marketplace_transfers', (table) => {
    table.uuid('id').primary();
    table.uuid('listing_id').notNullable();
    table.uuid('buyer_id').notNullable();
    table.uuid('seller_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.string('buyer_wallet').notNullable();
    table.string('seller_wallet').notNullable();
    table.string('transfer_signature').notNullable();
    table.integer('block_height');
    table.enum('payment_currency', ['USDC', 'SOL']).notNullable();
    table.decimal('payment_amount', 10, 4);
    table.decimal('usd_value', 10, 2).notNullable();
    table.enum('status', ['initiated', 'pending', 'completed', 'failed', 'disputed']).defaultTo('initiated');
    table.timestamp('initiated_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.timestamp('failed_at');
    table.text('failure_reason');
    table.decimal('network_fee', 10, 6);
    table.decimal('network_fee_usd', 10, 2);
    table.timestamps(true, true);

    // Indexes
    table.index(['buyer_id', 'status']);
    table.index(['seller_id', 'status']);
    table.index(['listing_id']);
    table.index(['status']);
  });

  // Create platform_fees table
  await knex.schema.createTable('platform_fees', (table) => {
    table.uuid('id').primary();
    table.uuid('transfer_id').notNullable().unique();
    table.decimal('sale_price', 10, 2).notNullable();
    table.decimal('platform_fee_amount', 10, 2).notNullable();
    table.decimal('platform_fee_percentage', 5, 2).notNullable();
    table.decimal('venue_fee_amount', 10, 2).notNullable();
    table.decimal('venue_fee_percentage', 5, 2).notNullable();
    table.decimal('seller_payout', 10, 2).notNullable();
    table.string('platform_fee_wallet');
    table.string('platform_fee_signature');
    table.string('venue_fee_wallet');
    table.string('venue_fee_signature');
    table.boolean('platform_fee_collected').defaultTo(false);
    table.boolean('venue_fee_paid').defaultTo(false);
    table.timestamps(true, true);

    // Indexes
    table.index(['platform_fee_collected']);
    table.index(['venue_fee_paid']);
  });

  // Create venue_marketplace_settings table
  await knex.schema.createTable('venue_marketplace_settings', (table) => {
    table.uuid('venue_id').primary();
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
    table.string('royalty_wallet_address').notNullable();
    table.decimal('minimum_royalty_payout', 10, 2).defaultTo(10.0);
    table.boolean('allow_international_sales').defaultTo(true);
    table.specificType('blocked_countries', 'text[]');
    table.boolean('require_kyc_for_high_value').defaultTo(false);
    table.decimal('high_value_threshold', 10, 2).defaultTo(1000.0);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('platform_fees');
  await knex.schema.dropTableIfExists('marketplace_transfers');
  await knex.schema.dropTableIfExists('marketplace_listings');
  await knex.schema.dropTableIfExists('venue_marketplace_settings');
}
