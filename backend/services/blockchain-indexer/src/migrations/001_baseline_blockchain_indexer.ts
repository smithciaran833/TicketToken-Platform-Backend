import { Knex } from 'knex';
import logger from '../utils/logger';

export async function up(knex: Knex): Promise<void> {
  logger.info('🔗 Starting Blockchain Indexer baseline migration...');

  // 1. INDEXER_STATE TABLE
  await knex.schema.createTable('indexer_state', (table) => {
    table.integer('id').primary(); // Always 1 (singleton pattern)
    table.bigInteger('last_processed_slot').notNullable().defaultTo(0);
    table.string('last_processed_signature', 255);
    table.string('indexer_version', 20).notNullable().defaultTo('1.0.0');
    table.boolean('is_running').defaultTo(false);
    table.timestamp('started_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  logger.info('✅ indexer_state table created');

  // 2. INDEXED_TRANSACTIONS TABLE
  await knex.schema.createTable('indexed_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('signature', 255).notNullable().unique();
    table.bigInteger('slot').notNullable();
    table.timestamp('block_time', { useTz: true });
    table.string('instruction_type', 50).notNullable(); // MINT_NFT, TRANSFER, BURN, UNKNOWN
    table.timestamp('processed_at', { useTz: true }).defaultTo(knex.fn.now());

    // Indexes
    table.index('signature');
    table.index('slot');
    table.index('instruction_type');
    table.index('processed_at');
  });

  logger.info('✅ indexed_transactions table created');

  // 3. MARKETPLACE_ACTIVITY TABLE
  await knex.schema.createTable('marketplace_activity', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('token_id', 255).notNullable();
    table.uuid('ticket_id'); // Links to tickets table
    table.string('marketplace', 100).notNullable(); // Magic Eden, Tensor, etc.
    table.string('activity_type', 50).notNullable(); // LIST, SALE, DELIST, BID, etc.
    table.decimal('price', 20, 9); // Lamports or SOL
    table.string('seller', 255);
    table.string('buyer', 255);
    table.string('transaction_signature', 255).notNullable().unique();
    table.timestamp('block_time', { useTz: true });
    table.timestamp('indexed_at', { useTz: true }).defaultTo(knex.fn.now());

    // Indexes
    table.index('token_id');
    table.index('ticket_id');
    table.index('marketplace');
    table.index('activity_type');
    table.index('transaction_signature');
    table.index('block_time');
  });

  logger.info('✅ marketplace_activity table created');

  // 4. RECONCILIATION_RUNS TABLE
  await knex.schema.createTable('reconciliation_runs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });
    table.string('status', 50).notNullable().defaultTo('RUNNING'); // RUNNING, COMPLETED, FAILED
    table.integer('tickets_checked').defaultTo(0);
    table.integer('discrepancies_found').defaultTo(0);
    table.integer('discrepancies_resolved').defaultTo(0);
    table.integer('duration_ms');
    table.text('error_message');

    // Indexes
    table.index('started_at');
    table.index('status');
  });

  logger.info('✅ reconciliation_runs table created');

  // 5. OWNERSHIP_DISCREPANCIES TABLE
  await knex.schema.createTable('ownership_discrepancies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id').notNullable();
    table.string('discrepancy_type', 100).notNullable(); 
    // Types: OWNERSHIP_MISMATCH, TOKEN_NOT_FOUND, BURN_NOT_RECORDED, etc.
    table.text('database_value');
    table.text('blockchain_value');
    table.boolean('resolved').defaultTo(false);
    table.timestamp('detected_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('resolved_at', { useTz: true });

    // Indexes
    table.index('ticket_id');
    table.index('discrepancy_type');
    table.index('resolved');
    table.index('detected_at');
  });

  logger.info('✅ ownership_discrepancies table created');

  // 6. RECONCILIATION_LOG TABLE
  await knex.schema.createTable('reconciliation_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('reconciliation_run_id').notNullable();
    table.uuid('ticket_id').notNullable();
    table.string('field_name', 100).notNullable(); // wallet_address, status, etc.
    table.text('old_value');
    table.text('new_value');
    table.string('source', 50).notNullable().defaultTo('blockchain'); // blockchain, manual
    table.timestamp('changed_at', { useTz: true }).defaultTo(knex.fn.now());

    // Foreign key
    table.foreign('reconciliation_run_id').references('id').inTable('reconciliation_runs').onDelete('CASCADE');

    // Indexes
    table.index('reconciliation_run_id');
    table.index('ticket_id');
    table.index('field_name');
    table.index('changed_at');
  });

  logger.info('✅ reconciliation_log table created');

  logger.info('');
  logger.info('🎉 Blockchain Indexer baseline migration complete!');
  logger.info('📊 Tables created: 6 tables');
  logger.info('');
  logger.info('Created Tables:');
  logger.info('  ✅ indexer_state (singleton state tracking)');
  logger.info('  ✅ indexed_transactions (all processed transactions)');
  logger.info('  ✅ marketplace_activity (NFT marketplace events)');
  logger.info('  ✅ reconciliation_runs (reconciliation job tracking)');
  logger.info('  ✅ ownership_discrepancies (DB vs blockchain mismatches)');
  logger.info('  ✅ reconciliation_log (reconciliation change history)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reconciliation_log');
  await knex.schema.dropTableIfExists('ownership_discrepancies');
  await knex.schema.dropTableIfExists('reconciliation_runs');
  await knex.schema.dropTableIfExists('marketplace_activity');
  await knex.schema.dropTableIfExists('indexed_transactions');
  await knex.schema.dropTableIfExists('indexer_state');

  logger.info('✅ Blockchain Indexer migration rolled back');
}
