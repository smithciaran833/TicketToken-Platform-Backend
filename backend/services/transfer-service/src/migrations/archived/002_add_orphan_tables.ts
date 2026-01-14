import { Knex } from 'knex';

/**
 * Phase 6: Add Orphan Tables for Transfer Service
 * 
 * Tables added:
 * - webhook_deliveries: Track webhook delivery attempts
 * - failed_blockchain_transfers: Track failed blockchain transfers for retry
 * 
 * Note: These tables inherit tenant context via their foreign keys
 * (subscription_id → webhook_subscriptions, transfer_id → ticket_transfers)
 */

export async function up(knex: Knex): Promise<void> {
  // Set timeouts to prevent blocking
  await knex.raw("SET lock_timeout = '10s'");
  await knex.raw("SET statement_timeout = '60s'");

  // ============================================================================
  // TABLE: webhook_deliveries
  // ============================================================================

  await knex.schema.createTable('webhook_deliveries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('subscription_id').notNullable();
    table.string('event', 100).notNullable();
    table.string('status', 20).notNullable();
    table.integer('http_status').notNullable();
    table.text('error_message');
    table.timestamp('attempted_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_webhook_deliveries_subscription ON webhook_deliveries(subscription_id)`);
  await knex.raw(`CREATE INDEX idx_webhook_deliveries_attempted ON webhook_deliveries(attempted_at DESC)`);
  await knex.raw(`CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status, attempted_at DESC)`);
  await knex.raw(`CREATE INDEX idx_webhook_deliveries_failed ON webhook_deliveries(subscription_id, attempted_at DESC) WHERE status = 'FAILED'`);

  // ============================================================================
  // TABLE: failed_blockchain_transfers
  // ============================================================================

  await knex.schema.createTable('failed_blockchain_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transfer_id').notNullable().unique();
    table.text('error_message').notNullable();
    table.timestamp('failed_at').notNullable().defaultTo(knex.fn.now());
    table.integer('retry_count').notNullable().defaultTo(0);

    table.check('retry_count >= 0', [], 'ck_failed_transfers_retry_count_positive');
  });

  await knex.raw(`CREATE INDEX idx_failed_blockchain_transfers_transfer ON failed_blockchain_transfers(transfer_id)`);
  await knex.raw(`CREATE INDEX idx_failed_blockchain_transfers_retry ON failed_blockchain_transfers(retry_count ASC, failed_at ASC)`);
  await knex.raw(`CREATE INDEX idx_failed_blockchain_transfers_ready ON failed_blockchain_transfers(failed_at ASC) WHERE retry_count < 5`);

  // Note: These tables don't have explicit tenant_id columns because they reference
  // other tables (webhook_subscriptions, ticket_transfers) that do have tenant isolation.
  // RLS is NOT enabled here to allow cross-tenant cleanup jobs and retry processing.
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables
  await knex.schema.dropTableIfExists('failed_blockchain_transfers');
  await knex.schema.dropTableIfExists('webhook_deliveries');
}
