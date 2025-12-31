import { Knex } from 'knex';

/**
 * Migration: Add version column for optimistic locking
 * Security Fix: RC5 - No version column for optimistic locking
 */
export async function up(knex: Knex): Promise<void> {
  // Add version column to venues table
  const venuesHasVersion = await knex.schema.hasColumn('venues', 'version');
  if (!venuesHasVersion) {
    await knex.schema.alterTable('venues', (table) => {
      table.integer('version').defaultTo(1).notNullable();
    });
    console.log('✅ Added version column to venues table');
  }

  // Add version column to venue_settings table
  const settingsHasVersion = await knex.schema.hasColumn('venue_settings', 'version');
  if (!settingsHasVersion) {
    await knex.schema.alterTable('venue_settings', (table) => {
      table.integer('version').defaultTo(1).notNullable();
    });
    console.log('✅ Added version column to venue_settings table');
  }

  // Add version column to venue_integrations table
  const integrationsHasVersion = await knex.schema.hasColumn('venue_integrations', 'version');
  if (!integrationsHasVersion) {
    await knex.schema.alterTable('venue_integrations', (table) => {
      table.integer('version').defaultTo(1).notNullable();
    });
    console.log('✅ Added version column to venue_integrations table');
  }

  // Add comments explaining the purpose
  await knex.raw(`
    COMMENT ON COLUMN venues.version IS 'Optimistic locking version counter (RC5 security fix)';
  `);
}

export async function down(knex: Knex): Promise<void> {
  const venuesHasVersion = await knex.schema.hasColumn('venues', 'version');
  if (venuesHasVersion) {
    await knex.schema.alterTable('venues', (table) => {
      table.dropColumn('version');
    });
  }

  const settingsHasVersion = await knex.schema.hasColumn('venue_settings', 'version');
  if (settingsHasVersion) {
    await knex.schema.alterTable('venue_settings', (table) => {
      table.dropColumn('version');
    });
  }

  const integrationsHasVersion = await knex.schema.hasColumn('venue_integrations', 'version');
  if (integrationsHasVersion) {
    await knex.schema.alterTable('venue_integrations', (table) => {
      table.dropColumn('version');
    });
  }
}
