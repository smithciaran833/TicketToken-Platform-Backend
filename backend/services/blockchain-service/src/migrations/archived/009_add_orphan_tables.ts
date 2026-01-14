import { Knex } from 'knex';

/**
 * Phase 6: Add Orphan Tables for Blockchain Service
 * 
 * Tables added:
 * - queue_jobs: Track NFT minting and blockchain job processing
 * 
 * Note: This is a cross-tenant job tracking table without tenant_id.
 * Jobs are processed by job_id and tracked for observability.
 */

export async function up(knex: Knex): Promise<void> {
  // Set timeouts to prevent blocking
  await knex.raw("SET lock_timeout = '10s'");
  await knex.raw("SET statement_timeout = '60s'");

  // ============================================================================
  // ENUM TYPES
  // ============================================================================

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE queue_job_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ============================================================================
  // TABLE: queue_jobs
  // ============================================================================

  await knex.schema.createTable('queue_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('job_id', 255).notNullable().unique();
    table.string('queue_name', 100).notNullable();
    table.string('job_type', 50).notNullable();
    table.uuid('ticket_id');
    table.uuid('user_id');
    table.specificType('status', 'queue_job_status').notNullable().defaultTo('PENDING');
    table.jsonb('metadata');
    table.text('error_message');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.timestamp('failed_at');
  });

  await knex.raw(`CREATE INDEX idx_queue_jobs_job_id ON queue_jobs(job_id)`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_status ON queue_jobs(queue_name, status)`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_ticket ON queue_jobs(ticket_id) WHERE ticket_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_user ON queue_jobs(user_id) WHERE user_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_created ON queue_jobs(created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_pending ON queue_jobs(queue_name, created_at ASC) WHERE status = 'PENDING'`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_processing ON queue_jobs(queue_name, created_at ASC) WHERE status = 'PROCESSING'`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_failed ON queue_jobs(queue_name, failed_at DESC) WHERE status = 'FAILED'`);

  // Note: This is a cross-tenant job tracking table for blockchain operations.
  // RLS is NOT enabled as it's used by background workers that process jobs
  // across all tenants. Tenant isolation is enforced at the application layer
  // via ticket_id and user_id foreign key relationships.
}

export async function down(knex: Knex): Promise<void> {
  // Drop table
  await knex.schema.dropTableIfExists('queue_jobs');

  // Drop type
  await knex.raw('DROP TYPE IF EXISTS queue_job_status');
}
