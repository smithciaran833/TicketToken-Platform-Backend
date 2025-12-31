import { Knex } from 'knex';

/**
 * Migration: Add webhook_events table for webhook deduplication
 * Security Fix: WH2-WH3 - Prevent duplicate webhook processing
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('webhook_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_id', 255).unique().notNullable();
    table.string('event_type', 100).notNullable();
    table.timestamp('processed_at').defaultTo(knex.fn.now());
    table.uuid('tenant_id').nullable().references('id').inTable('tenants').onDelete('SET NULL');
    table.string('source', 50).defaultTo('stripe'); // For future webhook sources
    table.jsonb('metadata').nullable(); // Store additional event metadata if needed
    
    // Index for fast lookups
    table.index('event_id');
    table.index(['event_type', 'processed_at']);
    table.index('tenant_id');
  });

  // Add comment explaining purpose
  await knex.raw(`
    COMMENT ON TABLE webhook_events IS 'Stores processed webhook event IDs to prevent duplicate processing (WH2-WH3 security fix)';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('webhook_events');
}
