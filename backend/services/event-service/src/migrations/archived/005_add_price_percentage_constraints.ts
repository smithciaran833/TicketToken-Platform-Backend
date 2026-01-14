import { Knex } from 'knex';

/**
 * Migration: Add CHECK constraints for price and percentage fields
 * 
 * Audit Finding: DI3 - CHECK constraints for price/percentage ranges
 * 
 * This migration adds database-level validation to ensure:
 * - Prices cannot be negative
 * - Tax rates are valid decimals (0-1)
 * - Percentages are valid (0-100)
 * - Age restrictions are non-negative
 * 
 * Best Practice: SET lock_timeout to prevent blocking during deployment
 */

export async function up(knex: Knex): Promise<void> {
  // Set lock timeout to prevent long waits during deployment
  // If lock cannot be acquired within 5 seconds, the migration will fail fast
  await knex.raw('SET lock_timeout = \'5s\'');

  console.log('Adding CHECK constraints for price and percentage fields...');

  // ========================================
  // EVENT_PRICING TABLE CONSTRAINTS
  // ========================================
  
  // base_price >= 0
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_pricing 
        ADD CONSTRAINT event_pricing_base_price_check 
        CHECK (base_price >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added event_pricing_base_price_check (base_price >= 0)');

  // service_fee >= 0
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_pricing 
        ADD CONSTRAINT event_pricing_service_fee_check 
        CHECK (service_fee >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added event_pricing_service_fee_check (service_fee >= 0)');

  // facility_fee >= 0
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_pricing 
        ADD CONSTRAINT event_pricing_facility_fee_check 
        CHECK (facility_fee >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added event_pricing_facility_fee_check (facility_fee >= 0)');

  // tax_rate between 0 and 1 (represents 0% to 100%)
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_pricing 
        ADD CONSTRAINT event_pricing_tax_rate_check 
        CHECK (tax_rate >= 0 AND tax_rate <= 1);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added event_pricing_tax_rate_check (tax_rate 0-1)');

  // min_price >= 0 (nullable, but if set must be non-negative)
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_pricing 
        ADD CONSTRAINT event_pricing_min_price_check 
        CHECK (min_price IS NULL OR min_price >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added event_pricing_min_price_check (min_price >= 0 if set)');

  // max_price >= 0 (nullable, but if set must be non-negative)
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_pricing 
        ADD CONSTRAINT event_pricing_max_price_check 
        CHECK (max_price IS NULL OR max_price >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added event_pricing_max_price_check (max_price >= 0 if set)');

  // current_price >= 0 (nullable)
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_pricing 
        ADD CONSTRAINT event_pricing_current_price_check 
        CHECK (current_price IS NULL OR current_price >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added event_pricing_current_price_check (current_price >= 0 if set)');

  // early_bird_price >= 0 (nullable)
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_pricing 
        ADD CONSTRAINT event_pricing_early_bird_price_check 
        CHECK (early_bird_price IS NULL OR early_bird_price >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added event_pricing_early_bird_price_check');

  // last_minute_price >= 0 (nullable)
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_pricing 
        ADD CONSTRAINT event_pricing_last_minute_price_check 
        CHECK (last_minute_price IS NULL OR last_minute_price >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added event_pricing_last_minute_price_check');

  // group_discount_percentage between 0 and 100 (nullable)
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_pricing 
        ADD CONSTRAINT event_pricing_group_discount_check 
        CHECK (group_discount_percentage IS NULL OR (group_discount_percentage >= 0 AND group_discount_percentage <= 100));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added event_pricing_group_discount_check (0-100%)');

  // ========================================
  // EVENTS TABLE CONSTRAINTS
  // ========================================

  // royalty_percentage between 0 and 100 (nullable)
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE events 
        ADD CONSTRAINT events_royalty_percentage_check 
        CHECK (royalty_percentage IS NULL OR (royalty_percentage >= 0 AND royalty_percentage <= 100));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added events_royalty_percentage_check (0-100%)');

  // age_restriction >= 0
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE events 
        ADD CONSTRAINT events_age_restriction_check 
        CHECK (age_restriction >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added events_age_restriction_check (>= 0)');

  // priority_score >= 0
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE events 
        ADD CONSTRAINT events_priority_score_check 
        CHECK (priority_score >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added events_priority_score_check (>= 0)');

  // Analytics counts >= 0
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE events 
        ADD CONSTRAINT events_view_count_check 
        CHECK (view_count >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE events 
        ADD CONSTRAINT events_interest_count_check 
        CHECK (interest_count >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE events 
        ADD CONSTRAINT events_share_count_check 
        CHECK (share_count >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added events analytics count checks (>= 0)');

  // ========================================
  // EVENT_CAPACITY TABLE CONSTRAINTS
  // ========================================

  // total_capacity > 0
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_capacity 
        ADD CONSTRAINT event_capacity_total_check 
        CHECK (total_capacity > 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // available_capacity >= 0
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_capacity 
        ADD CONSTRAINT event_capacity_available_check 
        CHECK (available_capacity >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // reserved_capacity >= 0
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_capacity 
        ADD CONSTRAINT event_capacity_reserved_check 
        CHECK (reserved_capacity >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // sold_count >= 0
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_capacity 
        ADD CONSTRAINT event_capacity_sold_check 
        CHECK (sold_count >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // minimum_purchase >= 1
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_capacity 
        ADD CONSTRAINT event_capacity_min_purchase_check 
        CHECK (minimum_purchase >= 1);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✅ Added event_capacity constraints');

  console.log('✅ All CHECK constraints added successfully');
}

export async function down(knex: Knex): Promise<void> {
  // Set lock timeout for rollback as well
  await knex.raw('SET lock_timeout = \'5s\'');

  console.log('Removing CHECK constraints...');

  // event_pricing constraints
  await knex.raw('ALTER TABLE event_pricing DROP CONSTRAINT IF EXISTS event_pricing_base_price_check');
  await knex.raw('ALTER TABLE event_pricing DROP CONSTRAINT IF EXISTS event_pricing_service_fee_check');
  await knex.raw('ALTER TABLE event_pricing DROP CONSTRAINT IF EXISTS event_pricing_facility_fee_check');
  await knex.raw('ALTER TABLE event_pricing DROP CONSTRAINT IF EXISTS event_pricing_tax_rate_check');
  await knex.raw('ALTER TABLE event_pricing DROP CONSTRAINT IF EXISTS event_pricing_min_price_check');
  await knex.raw('ALTER TABLE event_pricing DROP CONSTRAINT IF EXISTS event_pricing_max_price_check');
  await knex.raw('ALTER TABLE event_pricing DROP CONSTRAINT IF EXISTS event_pricing_current_price_check');
  await knex.raw('ALTER TABLE event_pricing DROP CONSTRAINT IF EXISTS event_pricing_early_bird_price_check');
  await knex.raw('ALTER TABLE event_pricing DROP CONSTRAINT IF EXISTS event_pricing_last_minute_price_check');
  await knex.raw('ALTER TABLE event_pricing DROP CONSTRAINT IF EXISTS event_pricing_group_discount_check');

  // events constraints
  await knex.raw('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_royalty_percentage_check');
  await knex.raw('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_age_restriction_check');
  await knex.raw('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_priority_score_check');
  await knex.raw('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_view_count_check');
  await knex.raw('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_interest_count_check');
  await knex.raw('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_share_count_check');

  // event_capacity constraints
  await knex.raw('ALTER TABLE event_capacity DROP CONSTRAINT IF EXISTS event_capacity_total_check');
  await knex.raw('ALTER TABLE event_capacity DROP CONSTRAINT IF EXISTS event_capacity_available_check');
  await knex.raw('ALTER TABLE event_capacity DROP CONSTRAINT IF EXISTS event_capacity_reserved_check');
  await knex.raw('ALTER TABLE event_capacity DROP CONSTRAINT IF EXISTS event_capacity_sold_check');
  await knex.raw('ALTER TABLE event_capacity DROP CONSTRAINT IF EXISTS event_capacity_min_purchase_check');

  console.log('✅ All CHECK constraints removed');
}
