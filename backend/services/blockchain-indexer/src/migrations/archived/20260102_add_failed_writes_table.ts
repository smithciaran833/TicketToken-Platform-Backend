/**
 * Migration: Add failed_mongodb_writes table for dead letter queue
 * 
 * AUDIT FIX: ERR-10 - Track failed MongoDB writes for recovery
 * 
 * This table stores failed MongoDB writes so they can be retried
 * or investigated later. Prevents silent data loss.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create the failed_mongodb_writes table
  await knex.schema.createTable('failed_mongodb_writes', (table) => {
    table.string('signature', 128).primary();
    table.bigInteger('slot').notNullable();
    table.text('error_message');
    table.string('error_code', 50);
    table.string('last_error').nullable();
    table.integer('retry_count').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').nullable();
    table.timestamp('resolved_at').nullable();
    table.string('resolution_status', 50).nullable(); // 'retried', 'manual', 'skipped'
    
    // Indexes for querying
    table.index('created_at');
    table.index('retry_count');
    table.index('resolved_at');
  });

  // Add comment to table
  await knex.raw(`
    COMMENT ON TABLE failed_mongodb_writes IS 
    'Dead letter queue for failed MongoDB writes - AUDIT FIX ERR-10'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('failed_mongodb_writes');
}
