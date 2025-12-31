import { Knex } from 'knex';

/**
 * Migration: Enhance webhook_events table for full processing lifecycle
 * Security Fix: WH4-WH8 - Processing status, async handling, payload storage, cleanup
 */
export async function up(knex: Knex): Promise<void> {
  // Add new columns to webhook_events table
  await knex.schema.alterTable('webhook_events', (table) => {
    // WH4: Processing status tracking
    table.string('status', 20).defaultTo('pending').notNullable();
    
    // WH5: Support for async processing
    table.timestamp('processing_started_at', { useTz: true }).nullable();
    table.timestamp('processing_completed_at', { useTz: true }).nullable();
    
    // WH6: Payload storage
    table.jsonb('payload').nullable();
    
    // WH7: Error tracking for retry logic
    table.text('error_message').nullable();
    table.integer('retry_count').defaultTo(0);
    table.timestamp('last_retry_at', { useTz: true }).nullable();
    
    // WH8: Additional metadata for debugging
    table.string('source_ip', 45).nullable();
    table.text('headers_hash').nullable();
    
    // Lock tracking for WH10
    table.string('lock_key', 255).nullable();
    table.timestamp('lock_expires_at', { useTz: true }).nullable();
  });

  // Add indexes for efficient queries
  await knex.raw('CREATE INDEX idx_webhook_events_status ON webhook_events(status)');
  await knex.raw('CREATE INDEX idx_webhook_events_status_created ON webhook_events(status, processed_at)');
  await knex.raw('CREATE INDEX idx_webhook_events_retry ON webhook_events(status, retry_count, last_retry_at)');
  await knex.raw('CREATE INDEX idx_webhook_events_lock ON webhook_events(lock_key, lock_expires_at)');
  
  // Add constraint for valid status values
  await knex.raw(`
    ALTER TABLE webhook_events 
    ADD CONSTRAINT webhook_events_status_check 
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying'))
  `);

  // Add comment explaining the table purpose
  await knex.raw(`
    COMMENT ON TABLE webhook_events IS 'Stores webhook events with full processing lifecycle (WH4-WH8 security fix). Supports async processing, retries, and deduplication.';
  `);

  console.log('✅ Enhanced webhook_events table with processing status, payload storage, and retry tracking');
}

export async function down(knex: Knex): Promise<void> {
  // Drop constraint first
  await knex.raw('ALTER TABLE webhook_events DROP CONSTRAINT IF EXISTS webhook_events_status_check');
  
  // Drop indexes
  await knex.raw('DROP INDEX IF EXISTS idx_webhook_events_lock');
  await knex.raw('DROP INDEX IF EXISTS idx_webhook_events_retry');
  await knex.raw('DROP INDEX IF EXISTS idx_webhook_events_status_created');
  await knex.raw('DROP INDEX IF EXISTS idx_webhook_events_status');
  
  // Remove added columns
  await knex.schema.alterTable('webhook_events', (table) => {
    table.dropColumn('lock_expires_at');
    table.dropColumn('lock_key');
    table.dropColumn('headers_hash');
    table.dropColumn('source_ip');
    table.dropColumn('last_retry_at');
    table.dropColumn('retry_count');
    table.dropColumn('error_message');
    table.dropColumn('payload');
    table.dropColumn('processing_completed_at');
    table.dropColumn('processing_started_at');
    table.dropColumn('status');
  });
}
