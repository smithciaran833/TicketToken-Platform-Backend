import { Knex } from 'knex';

/**
 * Queue Service - Consolidated Baseline Migration
 *
 * Consolidated from 1 migration on January 2025
 *
 * Tables (10 total):
 *   Tenant-scoped (10): queues, jobs, schedules, rate_limits, critical_jobs,
 *                       queue_metrics, idempotency_keys, rate_limiters,
 *                       alert_history, dead_letter_jobs
 *
 * Key fixes applied:
 *   - Removed zero UUID default on tenant_id
 *   - Standardized RLS pattern with NULLIF + app.is_system_user
 *   - Added FORCE RLS to all tenant tables
 *   - Removed seed data (tenant-specific concern)
 *   - Converted acknowledged_by external FK to comment
 */

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // TENANT-SCOPED TABLES (10)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 1. QUEUES - Queue definitions
  // --------------------------------------------------------------------------
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

    table.index('name', 'idx_queues_name');
    table.index('type', 'idx_queues_type');
    table.index('active', 'idx_queues_active');
    table.index('tenant_id', 'idx_queues_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 2. JOBS - Job records
  // --------------------------------------------------------------------------
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

    table.index('queue', 'idx_jobs_queue');
    table.index(['queue', 'status'], 'idx_jobs_queue_status');
    table.index('type', 'idx_jobs_type');
    table.index('status', 'idx_jobs_status');
    table.index('scheduled_for', 'idx_jobs_scheduled_for');
    table.index('created_at', 'idx_jobs_created_at');
    table.index('tenant_id', 'idx_jobs_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 3. SCHEDULES - Scheduled job definitions
  // --------------------------------------------------------------------------
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

    table.index('name', 'idx_schedules_name');
    table.index('active', 'idx_schedules_active');
    table.index('next_run', 'idx_schedules_next_run');
    table.index('tenant_id', 'idx_schedules_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 4. RATE_LIMITS - Rate limiting state
  // --------------------------------------------------------------------------
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

    table.index('key', 'idx_rate_limits_key');
    table.index('reset_at', 'idx_rate_limits_reset_at');
    table.index('tenant_id', 'idx_rate_limits_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 5. CRITICAL_JOBS - High-priority persistent jobs
  // --------------------------------------------------------------------------
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

    table.index('queue_name', 'idx_critical_jobs_queue_name');
    table.index(['queue_name', 'status'], 'idx_critical_jobs_queue_status');
    table.index('status', 'idx_critical_jobs_status');
    table.index('priority', 'idx_critical_jobs_priority');
    table.index('idempotency_key', 'idx_critical_jobs_idempotency_key');
    table.index('created_at', 'idx_critical_jobs_created_at');
    table.index('tenant_id', 'idx_critical_jobs_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 6. QUEUE_METRICS - Queue monitoring metrics
  // --------------------------------------------------------------------------
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

    table.index('queue_name', 'idx_queue_metrics_queue_name');
    table.index('captured_at', 'idx_queue_metrics_captured_at');
    table.index(['queue_name', 'captured_at'], 'idx_queue_metrics_queue_captured');
    table.index('tenant_id', 'idx_queue_metrics_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 7. IDEMPOTENCY_KEYS - Duplicate job prevention
  // --------------------------------------------------------------------------
  await knex.schema.createTable('idempotency_keys', (table) => {
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

    table.index('key', 'idx_idempotency_keys_key');
    table.index('queue_name', 'idx_idempotency_keys_queue_name');
    table.index('expires_at', 'idx_idempotency_keys_expires_at');
    table.index(['key', 'expires_at'], 'idx_idempotency_keys_key_expires');
    table.index('tenant_id', 'idx_idempotency_keys_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 8. RATE_LIMITERS - Token bucket rate limiting
  // --------------------------------------------------------------------------
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

    table.index('service_name', 'idx_rate_limiters_service_name');
    table.index('tenant_id', 'idx_rate_limiters_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 9. ALERT_HISTORY - Monitoring alerts
  // --------------------------------------------------------------------------
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

    table.index('queue_name', 'idx_alert_history_queue_name');
    table.index('severity', 'idx_alert_history_severity');
    table.index('created_at', 'idx_alert_history_created_at');
    table.index('acknowledged', 'idx_alert_history_acknowledged');
    table.index(['queue_name', 'created_at'], 'idx_alert_history_queue_created');
    table.index('tenant_id', 'idx_alert_history_tenant_id');
  });

  // External FK comment
  await knex.raw(`COMMENT ON COLUMN alert_history.acknowledged_by IS 'FK: auth-service.users(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 10. DEAD_LETTER_JOBS - Failed jobs archive
  // --------------------------------------------------------------------------
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

    table.index('queue_name', 'idx_dead_letter_jobs_queue_name');
    table.index('job_type', 'idx_dead_letter_jobs_job_type');
    table.index('created_at', 'idx_dead_letter_jobs_created_at');
    table.index(['queue_name', 'job_type', 'created_at'], 'idx_dead_letter_jobs_queue_type_created');
    table.index('tenant_id', 'idx_dead_letter_jobs_tenant_id');
  });

  // ==========================================================================
  // ROW LEVEL SECURITY (10 Tenant Tables)
  // ==========================================================================

  const tenantTables = [
    'queues',
    'jobs',
    'schedules',
    'rate_limits',
    'critical_jobs',
    'queue_metrics',
    'idempotency_keys',
    'rate_limiters',
    'alert_history',
    'dead_letter_jobs'
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);

    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation ON ${tableName}
        FOR ALL
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);
  }

  // ==========================================================================
  // COMPLETION
  // ==========================================================================

  console.log('✅ Queue Service consolidated baseline migration complete');
  console.log('📊 Tables created: 10 (all tenant-scoped)');
  console.log('🔒 RLS enabled on all tables');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  const tenantTables = [
    'dead_letter_jobs',
    'alert_history',
    'rate_limiters',
    'idempotency_keys',
    'queue_metrics',
    'critical_jobs',
    'rate_limits',
    'schedules',
    'jobs',
    'queues'
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
  }

  // Drop tables in reverse order
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

  console.log('✅ Queue Service consolidated baseline rolled back');
}
