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
    table.timestamp('verified_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Constraints
    table.unique(['user_id', 'wallet_address']);

    // Indexes
    table.index('user_id');
    table.index('wallet_address');
    table.index('blockchain_type');
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

    // Indexes
    table.index('user_id');
    table.index('wallet_address');
    table.index('connected_at');
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

    // Indexes
    table.index('blockchain_type');
    table.index('purpose');
    table.index('is_active');
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

    // Indexes
    table.index('event_type');
    table.index('program_id');
    table.index('transaction_signature');
    table.index('processed');
    table.index('created_at');
    table.index(['event_type', 'processed']);
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

    // Indexes
    table.index('ticket_id');
    table.index('type');
    table.index('status');
    table.index('transaction_signature');
    table.index('created_at');
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

    // Indexes
    table.index('order_id');
    table.index('ticket_id');
    table.index('status');
    table.index('created_at');
    table.index(['status', 'created_at']); // For polling pending jobs
  });

  console.log('✅ mint_jobs table created');

  console.log('');
  console.log('🎉 Blockchain Service baseline migration complete!');
  console.log('📊 Tables created: 6 tables');
  console.log('');
  console.log('Created Tables:');
  console.log('  ✅ wallet_addresses (user wallet registry)');
  console.log('  ✅ user_wallet_connections (wallet connection history)');
  console.log('  ✅ treasury_wallets (platform treasury wallets)');
  console.log('  ✅ blockchain_events (blockchain event log)');
  console.log('  ✅ blockchain_transactions (transaction records)');
  console.log('  ✅ mint_jobs (NFT minting queue)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('mint_jobs');
  await knex.schema.dropTableIfExists('blockchain_transactions');
  await knex.schema.dropTableIfExists('blockchain_events');
  await knex.schema.dropTableIfExists('treasury_wallets');
  await knex.schema.dropTableIfExists('user_wallet_connections');
  await knex.schema.dropTableIfExists('wallet_addresses');

  console.log('✅ Blockchain Service migration rolled back');
}
