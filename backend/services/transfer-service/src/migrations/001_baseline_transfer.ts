import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🔄 Starting Transfer Service baseline migration...');

  // TICKET_TRANSACTIONS TABLE
  await knex.schema.createTable('ticket_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('transaction_type', 100).notNullable(); 
    // TRANSFER_RECEIVED, TRANSFER_SENT, PURCHASE, SALE, etc.
    table.decimal('amount', 10, 2).defaultTo(0);
    table.string('status', 50).notNullable(); // COMPLETED, PENDING, FAILED
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    // Indexes
    table.index('ticket_id');
    table.index('user_id');
    table.index('transaction_type');
    table.index('status');
    table.index('created_at');
    table.index(['ticket_id', 'created_at']); // For transaction history
  });

  console.log('✅ ticket_transactions table created');

  console.log('');
  console.log('🎉 Transfer Service baseline migration complete!');
  console.log('📊 Tables created: 1 table');
  console.log('');
  console.log('Created Tables:');
  console.log('  ✅ ticket_transactions (transaction history)');
  console.log('');
  console.log('Note: Uses ticket_transfers table from ticket-service');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ticket_transactions');
  console.log('✅ Transfer Service migration rolled back');
}
