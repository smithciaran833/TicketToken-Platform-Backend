import { Knex } from 'knex';

/**
 * Migration: Add version column for optimistic locking (SL6)
 * 
 * CRITICAL FIX for audit finding:
 * - Enables optimistic locking to prevent concurrent update conflicts
 * - Version is auto-incremented on each update
 * - Prevents lost updates in concurrent modification scenarios
 */
export async function up(knex: Knex): Promise<void> {
  // Add version column to events table
  await knex.schema.alterTable('events', (table) => {
    table.integer('version').notNullable().defaultTo(1);
    table.index(['id', 'version'], 'idx_events_id_version');
  });

  // Add version column to event_schedules table
  await knex.schema.alterTable('event_schedules', (table) => {
    table.integer('version').notNullable().defaultTo(1);
  });

  // Add version column to event_capacity table
  await knex.schema.alterTable('event_capacity', (table) => {
    table.integer('version').notNullable().defaultTo(1);
  });

  // Add version column to event_pricing table
  await knex.schema.alterTable('event_pricing', (table) => {
    table.integer('version').notNullable().defaultTo(1);
  });

  // Create a function to auto-increment version on update
  await knex.raw(`
    CREATE OR REPLACE FUNCTION increment_version()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.version = OLD.version + 1;
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Add triggers to auto-increment version
  await knex.raw(`
    CREATE TRIGGER events_version_trigger
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();
  `);

  await knex.raw(`
    CREATE TRIGGER event_schedules_version_trigger
    BEFORE UPDATE ON event_schedules
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();
  `);

  await knex.raw(`
    CREATE TRIGGER event_capacity_version_trigger
    BEFORE UPDATE ON event_capacity
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();
  `);

  await knex.raw(`
    CREATE TRIGGER event_pricing_version_trigger
    BEFORE UPDATE ON event_pricing
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();
  `);

  console.log('✓ Added version columns and triggers for optimistic locking');
}

export async function down(knex: Knex): Promise<void> {
  // Remove triggers
  await knex.raw('DROP TRIGGER IF EXISTS events_version_trigger ON events');
  await knex.raw('DROP TRIGGER IF EXISTS event_schedules_version_trigger ON event_schedules');
  await knex.raw('DROP TRIGGER IF EXISTS event_capacity_version_trigger ON event_capacity');
  await knex.raw('DROP TRIGGER IF EXISTS event_pricing_version_trigger ON event_pricing');

  // Remove function
  await knex.raw('DROP FUNCTION IF EXISTS increment_version()');

  // Remove version columns
  await knex.schema.alterTable('events', (table) => {
    table.dropIndex(['id', 'version'], 'idx_events_id_version');
    table.dropColumn('version');
  });

  await knex.schema.alterTable('event_schedules', (table) => {
    table.dropColumn('version');
  });

  await knex.schema.alterTable('event_capacity', (table) => {
    table.dropColumn('version');
  });

  await knex.schema.alterTable('event_pricing', (table) => {
    table.dropColumn('version');
  });

  console.log('✓ Removed version columns and triggers');
}
