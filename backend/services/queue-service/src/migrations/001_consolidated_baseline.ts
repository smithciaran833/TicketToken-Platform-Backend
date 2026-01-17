// @ts-nocheck
import { Knex } from 'knex';

/**
 * Queue Service - Consolidated Baseline Migration
 */

export async function up(knex: Knex): Promise<void> {
  // 1. QUEUES
  await knex.schema.createTable('queues', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable().unique();
    table.string('type', 100).notNullable();
    table.jsonb('config').defaultTo('{}');
    table.boolean('active').defaultTo(true);
    table.integer('pending_count').defaultTo(0);
    table.integer('processing_count').defaultTo(0);
    table.integer('completed_count').defaultTo(0);
    table.integer('failed_count').defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // 2. JOBS
  await knex.schema.createTable('jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('queue', 255).notNullable();
    table.string('type', 255).notNullable();
    table.jsonb('data').defaultTo('{}');
    table.string('status', 50).notNullable().defaultTo('pending');
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(3);
    table.text('error');
    table.timestamp('scheduled_for', { useTz: true });
    table.timestamp('started_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
    table.index(['queue', 'status']);
  });

  // 3. SCHEDULES
  await knex.schema.createTable('schedules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable().unique();
    table.string('cron_expression', 100).notNullable();
    table.string('job_type', 255).notNullable();
    table.jsonb('job_data').defaultTo('{}');
    table.boolean('active').defaultTo(true);
    table.timestamp('last_run', { useTz: true });
    table.timestamp('next_run', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // 4. RATE_LIMITS
  await knex.schema.createTable('rate_limits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('key', 255).notNullable().unique();
    table.integer('limit').notNullable();
    table.integer('window_seconds').notNullable();
    table.integer('current_count').defaultTo(0);
    table.timestamp('reset_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // 5. CRITICAL_JOBS
  await knex.schema.createTable('critical_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('queue_name', 255).notNullable();
    table.string('job_type', 255).notNullable();
    table.jsonb('data').defaultTo('{}');
    table.integer('priority').defaultTo(0);
    table.string('idempotency_key', 255).unique();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(5);
    table.text('error');
    table.timestamp('started_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // 6. QUEUE_METRICS
  await knex.schema.createTable('queue_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('queue_name', 255).notNullable();
    table.integer('waiting_count').defaultTo(0);
    table.integer('active_count').defaultTo(0);
    table.integer('completed_count').defaultTo(0);
    table.integer('failed_count').defaultTo(0);
    table.timestamp('captured_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // 7. QUEUE_IDEMPOTENCY_KEYS
  await knex.schema.createTable('queue_idempotency_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('key', 255).notNullable().unique();
    table.string('queue_name', 255).notNullable();
    table.string('job_type', 255).notNullable();
    table.jsonb('result').defaultTo('{}');
    table.timestamp('processed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // 8. RATE_LIMITERS
  await knex.schema.createTable('rate_limiters', (table) => {
    table.string('service_name', 255).primary();
    table.uuid('tenant_id').notNullable();
    table.decimal('tokens_available', 10, 2).notNullable();
    table.integer('concurrent_requests').notNullable().defaultTo(0);
    table.integer('max_concurrent').notNullable();
    table.decimal('refill_rate', 10, 2).notNullable();
    table.integer('bucket_size').notNullable();
    table.timestamp('last_refill', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // 9. ALERT_HISTORY
  await knex.schema.createTable('alert_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('severity', 50).notNullable();
    table.string('alert_type', 100).notNullable();
    table.text('message').notNullable();
    table.string('queue_name', 255);
    table.decimal('metric_value', 10, 2);
    table.decimal('threshold_value', 10, 2);
    table.boolean('acknowledged').defaultTo(false);
    table.uuid('acknowledged_by');
    table.timestamp('acknowledged_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // 10. DEAD_LETTER_JOBS
  await knex.schema.createTable('dead_letter_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('queue_name', 255).notNullable();
    table.string('job_type', 255).notNullable();
    table.jsonb('job_data').defaultTo('{}');
    table.text('error');
    table.integer('attempts').defaultTo(0);
    table.uuid('original_job_id');
    table.timestamp('failed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // RLS
  const tables = ['queues', 'jobs', 'schedules', 'rate_limits', 'critical_jobs', 'queue_metrics', 'queue_idempotency_keys', 'rate_limiters', 'alert_history', 'dead_letter_jobs'];
  for (const t of tables) {
    await knex.raw(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
    await knex.raw(`CREATE POLICY ${t}_tenant_isolation ON ${t} FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_system_user', true) = 'true') WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_system_user', true) = 'true')`);
  }

  console.log('✅ Queue Service migration complete - 10 tables');
}

export async function down(knex: Knex): Promise<void> {
  const tables = ['dead_letter_jobs', 'alert_history', 'rate_limiters', 'queue_idempotency_keys', 'queue_metrics', 'critical_jobs', 'rate_limits', 'schedules', 'jobs', 'queues'];
  for (const t of tables) {
    await knex.raw(`DROP POLICY IF EXISTS ${t}_tenant_isolation ON ${t}`);
    await knex.schema.dropTableIfExists(t);
  }
}
