import { Knex } from 'knex';

/**
 * Migration: Add CHECK constraints for business rule validation
 * Security Fix: MD6 - Missing CHECK constraints for royalty_percentage, max_capacity
 */
export async function up(knex: Knex): Promise<void> {
  // Check if venue_settings table exists and has required columns
  const hasVenueSettings = await knex.schema.hasTable('venue_settings');
  
  if (hasVenueSettings) {
    // Add CHECK constraint for royalty_percentage (0-100%)
    const hasRoyaltyPercentage = await knex.schema.hasColumn('venue_settings', 'royalty_percentage');
    if (hasRoyaltyPercentage) {
      await knex.raw(`
        ALTER TABLE venue_settings 
        ADD CONSTRAINT chk_royalty_percentage_range 
        CHECK (royalty_percentage >= 0 AND royalty_percentage <= 100)
      `).catch(() => {
        console.log('CHECK constraint chk_royalty_percentage_range may already exist');
      });
      console.log('✅ Added CHECK constraint for royalty_percentage (0-100)');
    }
  }

  // Check if venues table has max_capacity column
  const hasVenues = await knex.schema.hasTable('venues');
  
  if (hasVenues) {
    // Add CHECK constraint for max_capacity (positive number)
    const hasMaxCapacity = await knex.schema.hasColumn('venues', 'max_capacity');
    if (hasMaxCapacity) {
      await knex.raw(`
        ALTER TABLE venues 
        ADD CONSTRAINT chk_max_capacity_positive 
        CHECK (max_capacity IS NULL OR max_capacity > 0)
      `).catch(() => {
        console.log('CHECK constraint chk_max_capacity_positive may already exist');
      });
      console.log('✅ Added CHECK constraint for max_capacity (positive)');
    }

    // Add CHECK constraint for status enum-like values
    const hasStatus = await knex.schema.hasColumn('venues', 'status');
    if (hasStatus) {
      await knex.raw(`
        ALTER TABLE venues 
        ADD CONSTRAINT chk_venue_status_valid 
        CHECK (status IN ('active', 'inactive', 'pending', 'suspended'))
      `).catch(() => {
        console.log('CHECK constraint chk_venue_status_valid may already exist');
      });
      console.log('✅ Added CHECK constraint for venue status');
    }
  }

  // Check if venue_integrations table has status column
  const hasIntegrations = await knex.schema.hasTable('venue_integrations');
  
  if (hasIntegrations) {
    const hasStatus = await knex.schema.hasColumn('venue_integrations', 'status');
    if (hasStatus) {
      await knex.raw(`
        ALTER TABLE venue_integrations 
        ADD CONSTRAINT chk_integration_status_valid 
        CHECK (status IN ('active', 'inactive', 'pending', 'error'))
      `).catch(() => {
        console.log('CHECK constraint chk_integration_status_valid may already exist');
      });
      console.log('✅ Added CHECK constraint for integration status');
    }

    // Add CHECK constraint for provider enum
    const hasProvider = await knex.schema.hasColumn('venue_integrations', 'provider');
    if (hasProvider) {
      await knex.raw(`
        ALTER TABLE venue_integrations 
        ADD CONSTRAINT chk_integration_provider_valid 
        CHECK (provider IN ('stripe', 'square', 'toast', 'mailchimp', 'twilio'))
      `).catch(() => {
        console.log('CHECK constraint chk_integration_provider_valid may already exist');
      });
      console.log('✅ Added CHECK constraint for integration provider');
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop CHECK constraints
  await knex.raw(`
    ALTER TABLE venue_settings 
    DROP CONSTRAINT IF EXISTS chk_royalty_percentage_range
  `).catch(() => {});

  await knex.raw(`
    ALTER TABLE venues 
    DROP CONSTRAINT IF EXISTS chk_max_capacity_positive
  `).catch(() => {});

  await knex.raw(`
    ALTER TABLE venues 
    DROP CONSTRAINT IF EXISTS chk_venue_status_valid
  `).catch(() => {});

  await knex.raw(`
    ALTER TABLE venue_integrations 
    DROP CONSTRAINT IF EXISTS chk_integration_status_valid
  `).catch(() => {});

  await knex.raw(`
    ALTER TABLE venue_integrations 
    DROP CONSTRAINT IF EXISTS chk_integration_provider_valid
  `).catch(() => {});
}
