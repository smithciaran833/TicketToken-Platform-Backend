import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. QUEUES TABLE
  await knex.schema.createTable('queues', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable().unique();
    table.string('type', 100).notNullable();
    table.jsonb('config').defaultTo('{}');
    table.boolean('active').defaultTo(true);
    table.integer('pending_count').defaultTo(0);
    table.integer('processing_count').defaultTo(0);
    table.integer('completed_count').defaultTo(0);
    table.integer('failed_count').defaultTo(0);
    table.timestamps(true, true);

    // Indexes
    table.index('name');
    table.index('type');
    table.index('active');
  });

  // 2. JOBS TABLE
  await knex.schema.createTable('jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('queue', 255).notNullable();
    table.string('type', 255).notNullable();
    table.jsonb('data').defaultTo('{}');
    table.string('status', 50).notNullable().defaultTo('pending'); // pending, processing, completed, failed
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(3);
    table.text('error');
    table.timestamp('scheduled_for');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamps(true, true);

    // Indexes
    table.index('queue');
    table.index(['queue', 'status']);
    table.index('type');
    table.index('status');
    table.index('scheduled_for');
    table.index('created_at');
  });

  // 3. SCHEDULES TABLE
  await knex.schema.createTable('schedules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable().unique();
    table.string('cron_expression', 100).notNullable();
    table.string('job_type', 255).notNullable();
    table.jsonb('job_data').defaultTo('{}');
    table.boolean('active').defaultTo(true);
    table.timestamp('last_run');
    table.timestamp('next_run');
    table.timestamps(true, true);

    // Indexes
    table.index('name');
    table.index('active');
    table.index('next_run');
  });

  // 4. RATE_LIMITS TABLE
  await knex.schema.createTable('rate_limits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('key', 255).notNullable().unique();
    table.integer('limit').notNullable();
    table.integer('window_seconds').notNullable();
    table.integer('current_count').defaultTo(0);
    table.timestamp('reset_at').notNullable();
    table.timestamps(true, true);

    // Indexes
    table.index('key');
    table.index('reset_at');
  });

  // 5. CRITICAL_JOBS TABLE (for high-priority persistence)
  await knex.schema.createTable('critical_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('queue_name', 255).notNullable();
    table.string('job_type', 255).notNullable();
    table.jsonb('data').defaultTo('{}');
    table.integer('priority').defaultTo(0);
    table.string('idempotency_key', 255).unique();
    table.string('status', 50).notNullable().defaultTo('pending'); // pending, processing, completed, failed
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(5);
    table.text('error');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamps(true, true);

    // Indexes
    table.index('queue_name');
    table.index(['queue_name', 'status']);
    table.index('status');
    table.index('priority');
    table.index('idempotency_key');
    table.index('created_at');
  });

  // 6. QUEUE_METRICS TABLE (for monitoring)
  await knex.schema.createTable('queue_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('queue_name', 255).notNullable();
    table.integer('waiting_count').defaultTo(0);
    table.integer('active_count').defaultTo(0);
    table.integer('completed_count').defaultTo(0);
    table.integer('failed_count').defaultTo(0);
    table.timestamp('captured_at').notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);

    // Indexes
    table.index('queue_name');
    table.index('captured_at');
    table.index(['queue_name', 'captured_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('queue_metrics');
  await knex.schema.dropTableIfExists('critical_jobs');
  await knex.schema.dropTableIfExists('rate_limits');
  await knex.schema.dropTableIfExists('schedules');
  await knex.schema.dropTableIfExists('jobs');
  await knex.schema.dropTableIfExists('queues');
}
