import { Knex } from 'knex';

/**
 * Migration to create external analytics tables required by revenue calculator
 * These tables aggregate event and venue data for analytics queries
 */
export async function up(knex: Knex): Promise<void> {
  // Create venue_analytics table
  await knex.schema.createTable('venue_analytics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.date('date').notNullable();
    table.decimal('revenue', 12, 2).defaultTo(0);
    table.integer('ticket_sales').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['venue_id', 'date']);
    table.index('date');
    
    // Unique constraint to prevent duplicate entries
    table.unique(['venue_id', 'date']);
  });

  // Create event_analytics table
  await knex.schema.createTable('event_analytics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable();
    table.date('date').notNullable();
    table.decimal('revenue', 12, 2).defaultTo(0);
    table.integer('tickets_sold').defaultTo(0);
    table.integer('capacity').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['event_id', 'date']);
    table.index('date');
    
    // Unique constraint to prevent duplicate entries
    table.unique(['event_id', 'date']);
  });

  // Add RLS policies for multi-tenancy
  await knex.raw('ALTER TABLE venue_analytics ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE event_analytics ENABLE ROW LEVEL SECURITY');

  // Create RLS policy for venue_analytics (uses venue_id directly)
  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON venue_analytics
    USING (venue_id::text = current_setting('app.current_tenant', true))
  `);

  // Create RLS policy for event_analytics (needs to join with events table)
  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON event_analytics
    USING (
      event_id IN (
        SELECT id FROM events 
        WHERE venue_id::text = current_setting('app.current_tenant', true)
      )
    )
  `);

  console.log('✅ External analytics tables created (venue_analytics, event_analytics)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('event_analytics');
  await knex.schema.dropTableIfExists('venue_analytics');
  
  console.log('✅ External analytics tables dropped');
}
