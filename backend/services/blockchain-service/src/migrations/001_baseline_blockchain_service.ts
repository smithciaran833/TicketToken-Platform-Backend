import { Knex } from 'knex';

/**
 * Blockchain Service - Consolidated Baseline Migration
 * 
 * Consolidated from 9 migrations (001-009) on [DATE]
 * 
 * Tables (9 total):
 *   Tenant-scoped (6): wallet_addresses, user_wallet_connections, treasury_wallets,
 *                      blockchain_events, blockchain_transactions, mint_jobs
 *   Global (3): blockchain_tenant_audit, migration_config, queue_jobs
 * 
 * Key fixes applied:
 *   - Removed zero UUID defaults (security hole)
 *   - Standardized RLS pattern with NULLIF + app.is_system_user
 *   - Added FORCE RLS to all tenant tables
 *   - Converted external FKs to comments (cross-service)
 *   - Changed uuid_generate_v4() to gen_random_uuid()
 *   - Added missing deleted_at to user_wallet_connections
 *   - Consolidated 4 policies per table to single FOR ALL
 *   - Removed helper functions (inline pattern instead)
 */

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // ENUM TYPES
  // ==========================================================================
  
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE queue_job_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // ==========================================================================
  // TENANT-SCOPED TABLES (6)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 1. WALLET_ADDRESSES
  // --------------------------------------------------------------------------
  await knex.schema.createTable('wallet_addresses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('wallet_address', 255).notNullable();
    table.string('blockchain_type', 50).notNullable().defaultTo('SOLANA');
    table.boolean('is_primary').defaultTo(false);
    table.decimal('balance', 20, 8).defaultTo(0);
    table.timestamp('last_sync_at', { useTz: true });
    table.timestamp('verified_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
    table.uuid('deleted_by');
    table.string('disconnection_reason', 500);
    table.uuid('tenant_id').notNullable();

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('user_id', 'idx_wallet_addresses_user_id');
    table.index('wallet_address', 'idx_wallet_addresses_wallet_address');
    table.index('blockchain_type', 'idx_wallet_addresses_blockchain_type');
    table.index('deleted_at', 'idx_wallet_addresses_deleted_at');
    table.index('tenant_id', 'idx_wallet_addresses_tenant_id');
  });

  // External FK comment: user_id → auth-service.users(id)
  await knex.raw(`COMMENT ON COLUMN wallet_addresses.user_id IS 'FK: auth-service.users(id) - not enforced, cross-service reference'`);

  // Partial indexes for soft delete
  await knex.raw(`
    CREATE UNIQUE INDEX idx_wallet_addresses_tenant_user_active
    ON wallet_addresses (tenant_id, user_id, wallet_address)
    WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX idx_wallet_addresses_deleted
    ON wallet_addresses (deleted_at)
    WHERE deleted_at IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX idx_wallet_addresses_tenant_active
    ON wallet_addresses (tenant_id)
    WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX idx_wallet_addresses_active
    ON wallet_addresses (user_id, is_primary)
    WHERE deleted_at IS NULL
  `);

  // --------------------------------------------------------------------------
  // 2. USER_WALLET_CONNECTIONS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('user_wallet_connections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('wallet_address', 255).notNullable();
    table.text('signature_proof');
    table.timestamp('connected_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.boolean('is_primary').defaultTo(false);
    table.timestamp('disconnected_at', { useTz: true });
    table.timestamp('deleted_at', { useTz: true });
    table.string('connection_ip', 45);
    table.string('connection_type', 20).defaultTo('CONNECT');
    table.string('disconnection_reason', 500);
    table.uuid('tenant_id').notNullable();

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('user_id', 'idx_user_wallet_connections_user_id');
    table.index('wallet_address', 'idx_user_wallet_connections_wallet_address');
    table.index('connected_at', 'idx_user_wallet_connections_connected_at');
    table.index('tenant_id', 'idx_user_wallet_connections_tenant_id');
  });

  // External FK comment: user_id → auth-service.users(id)
  await knex.raw(`COMMENT ON COLUMN user_wallet_connections.user_id IS 'FK: auth-service.users(id) - not enforced, cross-service reference'`);

  // Partial indexes for soft delete
  await knex.raw(`
    CREATE UNIQUE INDEX idx_user_wallet_connections_tenant_user_active
    ON user_wallet_connections (tenant_id, user_id, wallet_address)
    WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX idx_user_wallet_connections_deleted
    ON user_wallet_connections (deleted_at)
    WHERE deleted_at IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX idx_user_wallet_connections_tenant_active
    ON user_wallet_connections (tenant_id)
    WHERE deleted_at IS NULL
  `);

  // --------------------------------------------------------------------------
  // 3. TREASURY_WALLETS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('treasury_wallets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('wallet_address', 255).notNullable().unique();
    table.string('blockchain_type', 50).notNullable().defaultTo('SOLANA');
    table.string('purpose', 100).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.decimal('balance', 20, 9).defaultTo(0);
    table.timestamp('last_balance_update', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable();

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('blockchain_type', 'idx_treasury_wallets_blockchain_type');
    table.index('purpose', 'idx_treasury_wallets_purpose');
    table.index('is_active', 'idx_treasury_wallets_is_active');
    table.index('tenant_id', 'idx_treasury_wallets_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 4. BLOCKCHAIN_EVENTS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('blockchain_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_type', 100).notNullable();
    table.string('program_id', 255).notNullable();
    table.string('transaction_signature', 255);
    table.bigInteger('slot');
    table.jsonb('event_data').defaultTo('{}');
    table.boolean('processed').defaultTo(false);
    table.timestamp('processed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable();

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('event_type', 'idx_blockchain_events_event_type');
    table.index('program_id', 'idx_blockchain_events_program_id');
    table.index('transaction_signature', 'idx_blockchain_events_transaction_signature');
    table.index('processed', 'idx_blockchain_events_processed');
    table.index('created_at', 'idx_blockchain_events_created_at');
    table.index(['event_type', 'processed'], 'idx_blockchain_events_type_processed');
    table.index('tenant_id', 'idx_blockchain_events_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 5. BLOCKCHAIN_TRANSACTIONS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('blockchain_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('ticket_id');
    table.string('type', 50).notNullable();
    table.string('status', 50).notNullable();
    table.string('transaction_signature', 255);
    table.bigInteger('slot_number');
    table.string('mint_address', 44);
    table.jsonb('metadata').defaultTo('{}');
    table.text('error_message');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable();

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('ticket_id', 'idx_blockchain_transactions_ticket_id');
    table.index('type', 'idx_blockchain_transactions_type');
    table.index('status', 'idx_blockchain_transactions_status');
    table.index('transaction_signature', 'idx_blockchain_transactions_transaction_signature');
    table.index('created_at', 'idx_blockchain_transactions_created_at');
    table.index('tenant_id', 'idx_blockchain_transactions_tenant_id');
  });

  // External FK comment: ticket_id → ticket-service.tickets(id)
  await knex.raw(`COMMENT ON COLUMN blockchain_transactions.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service reference'`);

  // CHECK constraints
  await knex.raw(`
    ALTER TABLE blockchain_transactions
    ADD CONSTRAINT chk_blockchain_transactions_type
    CHECK (type IN ('MINT', 'TRANSFER', 'BURN', 'METADATA_UPDATE', 'VERIFY_COLLECTION'))
  `);
  await knex.raw(`
    ALTER TABLE blockchain_transactions
    ADD CONSTRAINT chk_blockchain_transactions_status
    CHECK (status IN ('PENDING', 'MINTING', 'PROCESSING', 'CONFIRMED', 'FINALIZED', 'FAILED', 'EXPIRED'))
  `);
  await knex.raw(`
    ALTER TABLE blockchain_transactions
    ADD CONSTRAINT chk_blockchain_transactions_slot_non_negative
    CHECK (slot_number IS NULL OR slot_number >= 0)
  `);
  await knex.raw(`
    ALTER TABLE blockchain_transactions
    ADD CONSTRAINT chk_blockchain_transactions_signature_length
    CHECK (transaction_signature IS NULL OR length(transaction_signature) BETWEEN 64 AND 128)
  `);
  await knex.raw(`
    ALTER TABLE blockchain_transactions
    ADD CONSTRAINT chk_blockchain_transactions_mint_address_length
    CHECK (mint_address IS NULL OR length(mint_address) BETWEEN 32 AND 44)
  `);

  // --------------------------------------------------------------------------
  // 6. MINT_JOBS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('mint_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id');
    table.uuid('ticket_id');
    table.string('status', 50).notNullable().defaultTo('pending');
    table.string('nft_address', 255);
    table.text('error');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });
    table.uuid('tenant_id').notNullable();

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('order_id', 'idx_mint_jobs_order_id');
    table.index('ticket_id', 'idx_mint_jobs_ticket_id');
    table.index('status', 'idx_mint_jobs_status');
    table.index('created_at', 'idx_mint_jobs_created_at');
    table.index(['status', 'created_at'], 'idx_mint_jobs_status_created');
    table.index('tenant_id', 'idx_mint_jobs_tenant_id');
  });

  // External FK comments
  await knex.raw(`COMMENT ON COLUMN mint_jobs.order_id IS 'FK: order-service.orders(id) - not enforced, cross-service reference'`);
  await knex.raw(`COMMENT ON COLUMN mint_jobs.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service reference'`);

  // ==========================================================================
  // GLOBAL TABLES (3) - No tenant_id, No RLS
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 7. BLOCKCHAIN_TENANT_AUDIT (Global)
  // --------------------------------------------------------------------------
  await knex.schema.createTable('blockchain_tenant_audit', (table) => {
    table.increments('id').primary();
    table.string('table_name', 100).notNullable();
    table.string('operation', 10).notNullable();
    table.uuid('record_id');
    table.uuid('tenant_id');
    table.uuid('old_tenant_id');
    table.uuid('new_tenant_id');
    table.text('changed_by').defaultTo(knex.raw('current_user'));
    table.text('session_tenant').defaultTo(knex.raw("current_setting('app.current_tenant_id', true)"));
    table.timestamp('changed_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_blockchain_tenant_audit_tenant ON blockchain_tenant_audit(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_blockchain_tenant_audit_changed_at ON blockchain_tenant_audit(changed_at)`);
  await knex.raw(`COMMENT ON TABLE blockchain_tenant_audit IS 'Cross-tenant security audit log - no RLS, global table'`);

  // --------------------------------------------------------------------------
  // 8. MIGRATION_CONFIG (Global)
  // --------------------------------------------------------------------------
  await knex.schema.createTable('migration_config', (table) => {
    table.increments('id').primary();
    table.string('key', 100).notNullable().unique();
    table.text('value').notNullable();
    table.text('description');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(`COMMENT ON TABLE migration_config IS 'Platform-wide migration configuration - no RLS, global table'`);

  // Insert default migration settings
  await knex('migration_config').insert([
    { key: 'lock_timeout', value: '10s', description: 'Maximum time to wait for database locks during migrations' },
    { key: 'statement_timeout', value: '60s', description: 'Maximum execution time for a single migration statement' },
    { key: 'one_change_per_migration', value: 'true', description: 'Best practice: Each migration should do one logical change' },
    { key: 'concurrent_index_threshold', value: '1000000', description: 'Row count above which indexes should be created CONCURRENTLY' }
  ]);

  // --------------------------------------------------------------------------
  // 9. QUEUE_JOBS (Global)
  // --------------------------------------------------------------------------
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
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('failed_at', { useTz: true });
  });

  await knex.raw(`CREATE INDEX idx_queue_jobs_job_id ON queue_jobs(job_id)`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_status ON queue_jobs(queue_name, status)`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_ticket ON queue_jobs(ticket_id) WHERE ticket_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_user ON queue_jobs(user_id) WHERE user_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_created ON queue_jobs(created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_pending ON queue_jobs(queue_name, created_at ASC) WHERE status = 'PENDING'`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_processing ON queue_jobs(queue_name, created_at ASC) WHERE status = 'PROCESSING'`);
  await knex.raw(`CREATE INDEX idx_queue_jobs_failed ON queue_jobs(queue_name, failed_at DESC) WHERE status = 'FAILED'`);
  await knex.raw(`COMMENT ON TABLE queue_jobs IS 'Cross-tenant job queue - no RLS, tenant context set at processing time'`);

  // ==========================================================================
  // ROW LEVEL SECURITY (6 Tenant Tables)
  // ==========================================================================

  const tenantTables = [
    'wallet_addresses',
    'user_wallet_connections',
    'treasury_wallets',
    'blockchain_events',
    'blockchain_transactions',
    'mint_jobs'
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

  console.log('✅ Blockchain Service consolidated baseline migration complete');
  console.log('📊 Tables created: 9 (6 tenant-scoped, 3 global)');
  console.log('🔒 RLS enabled on 6 tenant tables');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies first
  const tenantTables = [
    'mint_jobs',
    'blockchain_transactions',
    'blockchain_events',
    'treasury_wallets',
    'user_wallet_connections',
    'wallet_addresses'
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
  }

  // Drop tables in reverse order (respecting dependencies)
  await knex.schema.dropTableIfExists('queue_jobs');
  await knex.schema.dropTableIfExists('migration_config');
  await knex.schema.dropTableIfExists('blockchain_tenant_audit');
  await knex.schema.dropTableIfExists('mint_jobs');
  await knex.schema.dropTableIfExists('blockchain_transactions');
  await knex.schema.dropTableIfExists('blockchain_events');
  await knex.schema.dropTableIfExists('treasury_wallets');
  await knex.schema.dropTableIfExists('user_wallet_connections');
  await knex.schema.dropTableIfExists('wallet_addresses');

  // Drop enum type
  await knex.raw('DROP TYPE IF EXISTS queue_job_status');

  console.log('✅ Blockchain Service consolidated baseline rolled back');
}
