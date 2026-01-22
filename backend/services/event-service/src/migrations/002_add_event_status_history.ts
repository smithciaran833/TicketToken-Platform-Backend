import type { Knex } from 'knex';

/**
 * Migration: Add Event Status History Table
 * 
 * Creates an audit trail table to track all event status changes.
 * This provides compliance, debugging, and analytics capabilities.
 * 
 * Issue #8 Fix: No Status Audit Trail
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('event_status_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();
    table.string('previous_status', 50);
    table.string('new_status', 50).notNullable();
    table.string('transition_type', 50);
    table.timestamp('changed_at').defaultTo(knex.fn.now()).notNullable();
    table.string('changed_by', 100).defaultTo('system-job');
    
    // Indexes for efficient queries
    table.index(['event_id'], 'idx_event_status_history_event_id');
    table.index(['tenant_id'], 'idx_event_status_history_tenant_id');
    table.index(['changed_at'], 'idx_event_status_history_changed_at');
    
    // Composite index for common query pattern
    table.index(['event_id', 'changed_at'], 'idx_event_status_history_event_time');
  });

  // Add comment to table
  await knex.raw(`
    COMMENT ON TABLE event_status_history IS 
    'Audit trail for event status transitions - tracks all status changes for compliance and debugging'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('event_status_history');
}
