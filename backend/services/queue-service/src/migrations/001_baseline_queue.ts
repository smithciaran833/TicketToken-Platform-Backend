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
    
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
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
    
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
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
    
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
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
    
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
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
    
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
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
    
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // 7. IDEMPOTENCY_KEYS TABLE (for preventing duplicate job processing)
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('key', 255).notNullable().unique();
    table.string('queue_name', 255).notNullable();
    table.string('job_type', 255).notNullable();
    table.jsonb('result').defaultTo('{}');
    table.timestamp('processed_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.timestamps(true, true);

    // Indexes
    table.index('key');
    table.index('queue_name');
    table.index('expires_at');
    table.index(['key', 'expires_at']);
    
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // 8. RATE_LIMITERS TABLE (for token bucket rate limiting)
  await knex.schema.createTable('rate_limiters', (table) => {
    table.string('service_name', 255).primary();
    table.decimal('tokens_available', 10, 2).notNullable();
    table.integer('concurrent_requests').notNullable().defaultTo(0);
    table.integer('max_concurrent').notNullable();
    table.decimal('refill_rate', 10, 2).notNullable();
    table.integer('bucket_size').notNullable();
    table.timestamp('last_refill').notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);

    // Indexes
    table.index('service_name');
    
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // Insert initial rate limiter configurations
  await knex('rate_limiters').insert([
    {
      service_name: 'stripe',
      tokens_available: 100,
      concurrent_requests: 0,
      max_concurrent: 10,
      refill_rate: 100,
      bucket_size: 100,
      tenant_id: '00000000-0000-0000-0000-000000000001'
    },
    {
      service_name: 'twilio',
      tokens_available: 10,
      concurrent_requests: 0,
      max_concurrent: 5,
      refill_rate: 10,
      bucket_size: 10,
      tenant_id: '00000000-0000-0000-0000-000000000001'
    },
    {
      service_name: 'sendgrid',
      tokens_available: 50,
      concurrent_requests: 0,
      max_concurrent: 10,
      refill_rate: 50,
      bucket_size: 50,
      tenant_id: '00000000-0000-0000-0000-000000000001'
    },
    {
      service_name: 'solana_rpc',
      tokens_available: 25,
      concurrent_requests: 0,
      max_concurrent: 5,
      refill_rate: 25,
      bucket_size: 25,
      tenant_id: '00000000-0000-0000-0000-000000000001'
    }
  ]);

  // 9. ALERT_HISTORY TABLE (for monitoring alerts)
  await knex.schema.createTable('alert_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('severity', 50).notNullable(); // 'critical', 'warning', 'info'
    table.string('alert_type', 100).notNullable(); // 'queue_depth', 'job_age', 'high_failures', etc.
    table.text('message').notNullable();
    table.string('queue_name', 255);
    table.decimal('metric_value', 10, 2);
    table.decimal('threshold_value', 10, 2);
    table.boolean('acknowledged').defaultTo(false);
    table.uuid('acknowledged_by');
    table.timestamp('acknowledged_at');
    table.timestamps(true, true);

    // Indexes
    table.index('queue_name');
    table.index('severity');
    table.index('created_at');
    table.index('acknowledged');
    table.index(['queue_name', 'created_at']);
    
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // 10. DEAD_LETTER_JOBS TABLE (for failed jobs)
  await knex.schema.createTable('dead_letter_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('queue_name', 255).notNullable();
    table.string('job_type', 255).notNullable();
    table.jsonb('job_data').defaultTo('{}');
    table.text('error');
    table.integer('attempts').defaultTo(0);
    table.uuid('original_job_id');
    table.timestamp('failed_at').notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);

    // Indexes
    table.index('queue_name');
    table.index('job_type');
    table.index('created_at');
    table.index(['queue_name', 'job_type', 'created_at']);
    
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    table.index('tenant_id');
  });

  // RLS
  await knex.raw('ALTER TABLE queues ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE jobs ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE schedules ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE critical_jobs ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE queue_metrics ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE rate_limiters ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE dead_letter_jobs ENABLE ROW LEVEL SECURITY');

  await knex.raw(`CREATE POLICY tenant_isolation_policy ON queues USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON jobs USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON schedules USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON rate_limits USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON critical_jobs USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON queue_metrics USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON idempotency_keys USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON rate_limiters USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON alert_history USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON dead_letter_jobs USING (tenant_id::text = current_setting('app.current_tenant', true))`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON dead_letter_jobs');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON alert_history');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON rate_limiters');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON idempotency_keys');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON queue_metrics');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON critical_jobs');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON rate_limits');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON schedules');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON jobs');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON queues');

  await knex.raw('ALTER TABLE dead_letter_jobs DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE alert_history DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE rate_limiters DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE idempotency_keys DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE queue_metrics DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE critical_jobs DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE schedules DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE jobs DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE queues DISABLE ROW LEVEL SECURITY');

  await knex.schema.dropTableIfExists('dead_letter_jobs');
  await knex.schema.dropTableIfExists('alert_history');
  await knex.schema.dropTableIfExists('rate_limiters');
  await knex.schema.dropTableIfExists('idempotency_keys');
  await knex.schema.dropTableIfExists('queue_metrics');
  await knex.schema.dropTableIfExists('critical_jobs');
  await knex.schema.dropTableIfExists('rate_limits');
  await knex.schema.dropTableIfExists('schedules');
  await knex.schema.dropTableIfExists('jobs');
  await knex.schema.dropTableIfExists('queues');
}
