import { Knex } from 'knex';

/**
 * Migration: Add status_reason column to events table
 * 
 * AUDIT FIX (LOW-STATE-REASON): Tracks why state changes occurred for audit trail
 * 
 * The status_reason field stores:
 * - Human-readable explanation for state change
 * - Used for audit logging and customer communication
 * - Examples: "Venue unavailable", "Artist illness", "Weather conditions"
 */

export async function up(knex: Knex): Promise<void> {
  // Set lock timeout for migration (audit requirement)
  await knex.raw('SET lock_timeout = \'5s\'');

  await knex.schema.alterTable('events', (table) => {
    // Status reason: human-readable explanation for current status
    table
      .string('status_reason', 500)
      .nullable()
      .comment('Reason for the current status (e.g., cancellation reason, postponement explanation)');

    // Status changed by: who made the change (user ID or system)
    table
      .string('status_changed_by', 100)
      .nullable()
      .comment('User ID or "system" for automatic transitions');

    // Status changed at: when the status was last changed
    table
      .timestamp('status_changed_at', { useTz: true })
      .nullable()
      .comment('Timestamp of last status change');
  });

  // Add index for querying events by status change time
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_status_changed_at 
    ON events (status_changed_at DESC) 
    WHERE status_changed_at IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop index first
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_events_status_changed_at');

  await knex.schema.alterTable('events', (table) => {
    table.dropColumn('status_reason');
    table.dropColumn('status_changed_by');
    table.dropColumn('status_changed_at');
  });
}
