import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('⛓️  Starting Blockchain Service baseline migration...');

  // 1. WALLET_ADDRESSES TABLE
  await knex.schema.createTable('wallet_addresses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable();
    table.string('wallet_address', 255).notNullable();
    table.string('blockchain_type', 50).notNullable().defaultTo('SOLANA'); // SOLANA, ETHEREUM, etc.
    table.boolean('is_primary').defaultTo(false);
    table.decimal('balance', 20, 8).defaultTo(0); // Wallet balance cache
    table.timestamp('last_sync_at', { useTz: true }); // Last blockchain sync
    table.timestamp('verified_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true }); // Soft delete

    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');

    // Constraints
    table.unique(['user_id', 'wallet_address']);

    // Indexes
    table.index('user_id');
    table.index('wallet_address');
    table.index('blockchain_type');
    table.index('deleted_at');
    table.index('tenant_id');
  });

  console.log('✅ wallet_addresses table created');

  // 2. USER_WALLET_CONNECTIONS TABLE
  await knex.schema.createTable('user_wallet_connections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable();
    table.string('wallet_address', 255).notNullable();
    table.text('signature_proof'); // Base64 signature for verification
    table.timestamp('connected_at', { useTz: true }).defaultTo(knex.fn.now());
    table.boolean('is_primary').defaultTo(false);
    table.timestamp('disconnected_at', { useTz: true });

    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('user_id');
    table.index('wallet_address');
    table.index('connected_at');
    table.index('tenant_id');
  });

  console.log('✅ user_wallet_connections table created');

  // 3. TREASURY_WALLETS TABLE
  await knex.schema.createTable('treasury_wallets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('wallet_address', 255).notNullable().unique();
    table.string('blockchain_type', 50).notNullable().defaultTo('SOLANA');
    table.string('purpose', 100).notNullable(); // TREASURY, FEE_COLLECTION, ROYALTY, etc.
    table.boolean('is_active').defaultTo(true);
    table.decimal('balance', 20, 9).defaultTo(0); // Track balance
    table.timestamp('last_balance_update', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('blockchain_type');
    table.index('purpose');
    table.index('is_active');
    table.index('tenant_id');
  });

  console.log('✅ treasury_wallets table created');

  // 4. BLOCKCHAIN_EVENTS TABLE
  await knex.schema.createTable('blockchain_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('event_type', 100).notNullable(); // MINT, TRANSFER, BURN, ERROR, RAW_LOGS, etc.
    table.string('program_id', 255).notNullable();
    table.string('transaction_signature', 255);
    table.bigInteger('slot');
    table.jsonb('event_data').defaultTo('{}');
    table.boolean('processed').defaultTo(false);
    table.timestamp('processed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('event_type');
    table.index('program_id');
    table.index('transaction_signature');
    table.index('processed');
    table.index('created_at');
    table.index(['event_type', 'processed']);
    table.index('tenant_id');
  });

  console.log('✅ blockchain_events table created');

  // 5. BLOCKCHAIN_TRANSACTIONS TABLE
  await knex.schema.createTable('blockchain_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id');
    table.string('type', 50).notNullable(); // MINT, TRANSFER, BURN, etc.
    table.string('status', 50).notNullable(); // PENDING, CONFIRMED, FAILED
    table.string('transaction_signature', 255);
    table.bigInteger('slot_number');
    table.jsonb('metadata').defaultTo('{}');
    table.text('error_message');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('ticket_id');
    table.index('type');
    table.index('status');
    table.index('transaction_signature');
    table.index('created_at');
    table.index('tenant_id');
  });

  console.log('✅ blockchain_transactions table created');

  // 6. MINT_JOBS TABLE (for mint worker queue)
  await knex.schema.createTable('mint_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('order_id');
    table.uuid('ticket_id');
    table.string('status', 50).notNullable().defaultTo('pending'); // pending, processing, completed, failed
    table.string('nft_address', 255); // Minted NFT address
    table.text('error');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });

    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');

    // Indexes
    table.index('order_id');
    table.index('ticket_id');
    table.index('status');
    table.index('created_at');
    table.index(['status', 'created_at']); // For polling pending jobs
    table.index('tenant_id');
  });

  console.log('✅ mint_jobs table created');

  // ==========================================
  // FOREIGN KEY CONSTRAINTS
  // ==========================================
  console.log('');
  console.log('🔗 Adding foreign key constraints...');

  // wallet_addresses FKs
  await knex.schema.alterTable('wallet_addresses', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  console.log('✅ wallet_addresses → users');

  // user_wallet_connections FKs
  await knex.schema.alterTable('user_wallet_connections', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  console.log('✅ user_wallet_connections → users');

  // blockchain_transactions FKs
  await knex.schema.alterTable('blockchain_transactions', (table) => {
    table.foreign('ticket_id').references('id').inTable('tickets').onDelete('SET NULL');
  });
  console.log('✅ blockchain_transactions → tickets');

  // mint_jobs FKs
  await knex.schema.alterTable('mint_jobs', (table) => {
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
    table.foreign('ticket_id').references('id').inTable('tickets').onDelete('CASCADE');
  });
  console.log('✅ mint_jobs → orders, tickets');

  console.log('✅ All FK constraints added (5 total)');

  // ==========================================
  // ROW LEVEL SECURITY
  // ==========================================
  await knex.raw('ALTER TABLE wallet_addresses ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE user_wallet_connections ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE treasury_wallets ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE blockchain_events ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE blockchain_transactions ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE mint_jobs ENABLE ROW LEVEL SECURITY');

  await knex.raw(`CREATE POLICY tenant_isolation_policy ON wallet_addresses USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON user_wallet_connections USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON treasury_wallets USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON blockchain_events USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON blockchain_transactions USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON mint_jobs USING (tenant_id::text = current_setting('app.current_tenant', true))`);

  console.log('✅ RLS enabled');

  console.log('');
  console.log('🎉 Blockchain Service baseline migration complete!');
  console.log('📊 Tables created: 7 tables');
  console.log('');
  console.log('Created Tables:');
  console.log('  ✅ tenants');
  console.log('  ✅ wallet_addresses (user wallet registry)');
  console.log('  ✅ user_wallet_connections (wallet connection history)');
  console.log('  ✅ treasury_wallets (platform treasury wallets)');
  console.log('  ✅ blockchain_events (blockchain event log)');
  console.log('  ✅ blockchain_transactions (transaction records)');
  console.log('  ✅ mint_jobs (NFT minting queue)');
  console.log('🔒 Tenant isolation enabled');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON mint_jobs');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON blockchain_transactions');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON blockchain_events');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON treasury_wallets');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON user_wallet_connections');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON wallet_addresses');

  await knex.raw('ALTER TABLE mint_jobs DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE blockchain_transactions DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE blockchain_events DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE treasury_wallets DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE user_wallet_connections DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE wallet_addresses DISABLE ROW LEVEL SECURITY');

  await knex.schema.dropTableIfExists('mint_jobs');
  await knex.schema.dropTableIfExists('blockchain_transactions');
  await knex.schema.dropTableIfExists('blockchain_events');
  await knex.schema.dropTableIfExists('treasury_wallets');
  await knex.schema.dropTableIfExists('user_wallet_connections');
  await knex.schema.dropTableIfExists('wallet_addresses');

  console.log('✅ Blockchain Service migration rolled back');
}
