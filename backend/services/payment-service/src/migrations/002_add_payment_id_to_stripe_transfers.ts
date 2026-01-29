import { Knex } from 'knex';

/**
 * Migration: Add payment_id to stripe_transfers
 * 
 * CRITICAL FIX: The stripe_transfers table was missing payment_id column,
 * causing all queries in stripe-connect-transfer.service.ts to fail.
 */
export async function up(knex: Knex): Promise<void> {
  console.log('🔧 Adding payment_id to stripe_transfers...');

  // Add payment_id column
  await knex.schema.alterTable('stripe_transfers', (table) => {
    table.uuid('payment_id').nullable(); // Nullable first for existing rows
  });

  console.log('✅ Added payment_id column');

  // Add foreign key constraint
  await knex.raw(`
    ALTER TABLE stripe_transfers 
    ADD CONSTRAINT stripe_transfers_payment_id_fkey 
    FOREIGN KEY (payment_id) 
    REFERENCES payment_transactions(id) 
    ON DELETE CASCADE;
  `);

  console.log('✅ Added foreign key constraint');

  // Add index for performance
  await knex.schema.alterTable('stripe_transfers', (table) => {
    table.index('payment_id');
  });

  console.log('✅ Added index on payment_id');

  // Note: If you have existing data, you'll need to backfill payment_id values
  // before making it NOT NULL. For now, leaving it nullable.
  
  console.log('✅ Migration complete: payment_id added to stripe_transfers');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Rolling back payment_id addition...');

  await knex.schema.alterTable('stripe_transfers', (table) => {
    table.dropIndex('payment_id');
    table.dropForeign('payment_id');
    table.dropColumn('payment_id');
  });

  console.log('✅ Rollback complete');
}
