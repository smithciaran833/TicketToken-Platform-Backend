import { Knex } from 'knex';

/**
 * Migration to add Row Level Security (RLS) policies to pricing tables
 * These tables were missing from the original baseline migration RLS setup
 */
export async function up(knex: Knex): Promise<void> {
  // First, add tenant_id column to both tables to enable proper RLS
  await knex.schema.alterTable('price_history', (table) => {
    table.uuid('tenant_id');
    table.index('tenant_id');
  });

  await knex.schema.alterTable('pending_price_changes', (table) => {
    table.uuid('tenant_id');
    table.index('tenant_id');
  });

  // Backfill tenant_id from events table for existing records
  await knex.raw(`
    UPDATE price_history
    SET tenant_id = e.tenant_id
    FROM events e
    WHERE price_history.event_id = e.id
    AND price_history.tenant_id IS NULL
  `);

  await knex.raw(`
    UPDATE pending_price_changes
    SET tenant_id = e.tenant_id
    FROM events e
    WHERE pending_price_changes.event_id = e.id
    AND pending_price_changes.tenant_id IS NULL
  `);

  // Make tenant_id NOT NULL after backfill
  await knex.schema.alterTable('price_history', (table) => {
    table.uuid('tenant_id').notNullable().alter();
  });

  await knex.schema.alterTable('pending_price_changes', (table) => {
    table.uuid('tenant_id').notNullable().alter();
  });

  // Enable Row Level Security on both tables
  await knex.raw('ALTER TABLE price_history ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE pending_price_changes ENABLE ROW LEVEL SECURITY');

  // Create RLS policy for price_history
  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON price_history
    USING (tenant_id = current_setting('app.current_tenant')::uuid)
  `);

  // Create RLS policy for pending_price_changes
  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON pending_price_changes
    USING (tenant_id = current_setting('app.current_tenant')::uuid)
  `);

  console.log('✅ RLS policies added to price_history and pending_price_changes tables');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON price_history');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON pending_price_changes');

  // Disable RLS
  await knex.raw('ALTER TABLE price_history DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE pending_price_changes DISABLE ROW LEVEL SECURITY');

  // Remove tenant_id columns
  await knex.schema.alterTable('price_history', (table) => {
    table.dropColumn('tenant_id');
  });

  await knex.schema.alterTable('pending_price_changes', (table) => {
    table.dropColumn('tenant_id');
  });

  console.log('✅ RLS policies removed from pricing tables');
}
