import { Knex } from 'knex';

/**
 * Blockchain Indexer - Consolidated Baseline Migration
 *
 * Consolidated from 3 migrations on January 2025
 *
 * Tables (7 total):
 *   Tenant-scoped (6): indexer_state, indexed_transactions, indexer_marketplace_activity,
 *                      reconciliation_runs, ownership_discrepancies, reconciliation_log
 *   Global (1): failed_mongodb_writes
 *
 * Key fixes applied:
 *   - Removed zero UUID defaults (security hole)
 *   - Standardized RLS pattern with NULLIF + app.is_system_user
 *   - Added FORCE RLS to all tenant tables
 *   - Converted external FKs to comments (cross-service)
 *   - Changed uuid_generate_v4() to gen_random_uuid()
 *   - Renamed marketplace_activity to indexer_marketplace_activity (collision with analytics view)
 */

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // TENANT-SCOPED TABLES (6)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 1. INDEXER_STATE (singleton pattern)
  // --------------------------------------------------------------------------
  await knex.schema.createTable('indexer_state', (table) => {
    table.integer('id').primary(); // Always 1 (singleton pattern)
    table.bigInteger('last_processed_slot').notNullable().defaultTo(0);
    table.string('last_processed_signature', 255);
    table.string('indexer_version', 20).notNullable().defaultTo('1.0.0');
    table.boolean('is_running').defaultTo(false);
    table.timestamp('started_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable();

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_indexer_state_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 2. INDEXED_TRANSACTIONS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('indexed_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('signature', 255).notNullable().unique();
    table.bigInteger('slot').notNullable();
    table.timestamp('block_time', { useTz: true });
    table.string('instruction_type', 50).notNullable();
    table.timestamp('processed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable();

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('signature', 'idx_indexed_transactions_signature');
    table.index('slot', 'idx_indexed_transactions_slot');
    table.index('instruction_type', 'idx_indexed_transactions_instruction_type');
    table.index('processed_at', 'idx_indexed_transactions_processed_at');
    table.index('tenant_id', 'idx_indexed_transactions_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 3. INDEXER_MARKETPLACE_ACTIVITY (renamed from marketplace_activity)
  // --------------------------------------------------------------------------
  await knex.schema.createTable('indexer_marketplace_activity', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('token_id', 255).notNullable();
    table.uuid('ticket_id');
    table.string('marketplace', 100).notNullable();
    table.string('activity_type', 50).notNullable();
    table.decimal('price', 20, 9);
    table.string('seller', 255);
    table.string('buyer', 255);
    table.string('transaction_signature', 255).notNullable().unique();
    table.timestamp('block_time', { useTz: true });
    table.timestamp('indexed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable();

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('token_id', 'idx_indexer_marketplace_activity_token_id');
    table.index('ticket_id', 'idx_indexer_marketplace_activity_ticket_id');
    table.index('marketplace', 'idx_indexer_marketplace_activity_marketplace');
    table.index('activity_type', 'idx_indexer_marketplace_activity_activity_type');
    table.index('transaction_signature', 'idx_indexer_marketplace_activity_tx_sig');
    table.index('block_time', 'idx_indexer_marketplace_activity_block_time');
    table.index('tenant_id', 'idx_indexer_marketplace_activity_tenant_id');
  });

  // External FK comment
  await knex.raw(`COMMENT ON COLUMN indexer_marketplace_activity.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service reference'`);

  // --------------------------------------------------------------------------
  // 4. RECONCILIATION_RUNS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('reconciliation_runs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });
    table.string('status', 50).notNullable().defaultTo('RUNNING');
    table.integer('tickets_checked').defaultTo(0);
    table.integer('discrepancies_found').defaultTo(0);
    table.integer('discrepancies_resolved').defaultTo(0);
    table.integer('duration_ms');
    table.text('error_message');
    table.uuid('tenant_id').notNullable();

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('started_at', 'idx_reconciliation_runs_started_at');
    table.index('status', 'idx_reconciliation_runs_status');
    table.index('tenant_id', 'idx_reconciliation_runs_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 5. OWNERSHIP_DISCREPANCIES
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ownership_discrepancies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('ticket_id').notNullable();
    table.string('discrepancy_type', 100).notNullable();
    table.text('database_value');
    table.text('blockchain_value');
    table.boolean('resolved').defaultTo(false);
    table.timestamp('detected_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('resolved_at', { useTz: true });
    table.uuid('tenant_id').notNullable();

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('ticket_id', 'idx_ownership_discrepancies_ticket_id');
    table.index('discrepancy_type', 'idx_ownership_discrepancies_type');
    table.index('resolved', 'idx_ownership_discrepancies_resolved');
    table.index('detected_at', 'idx_ownership_discrepancies_detected_at');
    table.index('tenant_id', 'idx_ownership_discrepancies_tenant_id');
  });

  // External FK comment
  await knex.raw(`COMMENT ON COLUMN ownership_discrepancies.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service reference'`);

  // --------------------------------------------------------------------------
  // 6. RECONCILIATION_LOG
  // --------------------------------------------------------------------------
  await knex.schema.createTable('reconciliation_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('reconciliation_run_id').notNullable();
    table.uuid('ticket_id').notNullable();
    table.string('field_name', 100).notNullable();
    table.text('old_value');
    table.text('new_value');
    table.string('source', 50).notNullable().defaultTo('blockchain');
    table.timestamp('changed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable();

    // Internal FKs
    table.foreign('reconciliation_run_id').references('id').inTable('reconciliation_runs').onDelete('CASCADE');
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('reconciliation_run_id', 'idx_reconciliation_log_run_id');
    table.index('ticket_id', 'idx_reconciliation_log_ticket_id');
    table.index('field_name', 'idx_reconciliation_log_field_name');
    table.index('changed_at', 'idx_reconciliation_log_changed_at');
    table.index('tenant_id', 'idx_reconciliation_log_tenant_id');
  });

  // External FK comment
  await knex.raw(`COMMENT ON COLUMN reconciliation_log.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service reference'`);

  // ==========================================================================
  // GLOBAL TABLES (1) - No tenant_id, No RLS
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 7. FAILED_MONGODB_WRITES (Global - Dead Letter Queue)
  // --------------------------------------------------------------------------
  await knex.schema.createTable('failed_mongodb_writes', (table) => {
    table.string('signature', 128).primary();
    table.bigInteger('slot').notNullable();
    table.text('error_message');
    table.string('error_code', 50);
    table.string('last_error');
    table.integer('retry_count').defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true });
    table.timestamp('resolved_at', { useTz: true });
    table.string('resolution_status', 50);

    // Indexes
    table.index('created_at', 'idx_failed_mongodb_writes_created_at');
    table.index('retry_count', 'idx_failed_mongodb_writes_retry_count');
    table.index('resolved_at', 'idx_failed_mongodb_writes_resolved_at');
  });

  await knex.raw(`COMMENT ON TABLE failed_mongodb_writes IS 'Dead letter queue for failed MongoDB writes - no RLS, global table'`);

  // ==========================================================================
  // ROW LEVEL SECURITY (6 Tenant Tables)
  // ==========================================================================

  const tenantTables = [
    'indexer_state',
    'indexed_transactions',
    'indexer_marketplace_activity',
    'reconciliation_runs',
    'ownership_discrepancies',
    'reconciliation_log'
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

  console.log('✅ Blockchain Indexer consolidated baseline migration complete');
  console.log('📊 Tables created: 7 (6 tenant-scoped, 1 global)');
  console.log('🔒 RLS enabled on 6 tenant tables');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies first
  const tenantTables = [
    'reconciliation_log',
    'ownership_discrepancies',
    'reconciliation_runs',
    'indexer_marketplace_activity',
    'indexed_transactions',
    'indexer_state'
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
  }

  // Drop tables in reverse order (respecting dependencies)
  await knex.schema.dropTableIfExists('failed_mongodb_writes');
  await knex.schema.dropTableIfExists('reconciliation_log');
  await knex.schema.dropTableIfExists('ownership_discrepancies');
  await knex.schema.dropTableIfExists('reconciliation_runs');
  await knex.schema.dropTableIfExists('indexer_marketplace_activity');
  await knex.schema.dropTableIfExists('indexed_transactions');
  await knex.schema.dropTableIfExists('indexer_state');

  console.log('✅ Blockchain Indexer consolidated baseline rolled back');
}
