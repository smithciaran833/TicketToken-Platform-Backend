import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🔒 Adding escrow support to marketplace_transfers...');

  // Add escrow-related columns to marketplace_transfers
  await knex.schema.table('marketplace_transfers', (table) => {
    // Escrow tracking
    table.string('escrow_address', 255);
    table.string('escrow_signature', 255);
    table.timestamp('escrow_created_at', { useTz: true });
    
    // Refund tracking
    table.string('refund_signature', 255);
    table.timestamp('refunded_at', { useTz: true });
    
    // Escrow release tracking
    table.string('escrow_release_signature', 255);
    table.timestamp('escrow_released_at', { useTz: true });
  });

  // Add index for escrow address lookups
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_marketplace_transfers_escrow ON marketplace_transfers(escrow_address) WHERE escrow_address IS NOT NULL');

  // Add index for pending escrows (for monitoring)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_transfers_pending_escrow 
    ON marketplace_transfers(status, created_at) 
    WHERE escrow_address IS NOT NULL 
    AND status IN ('initiated', 'pending')
  `);

  console.log('✅ Escrow support added to marketplace_transfers');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Rolling back escrow support...');

  // Drop indexes
  await knex.raw('DROP INDEX IF EXISTS idx_marketplace_transfers_escrow');
  await knex.raw('DROP INDEX IF EXISTS idx_marketplace_transfers_pending_escrow');

  // Drop columns
  await knex.schema.table('marketplace_transfers', (table) => {
    table.dropColumn('escrow_address');
    table.dropColumn('escrow_signature');
    table.dropColumn('escrow_created_at');
    table.dropColumn('refund_signature');
    table.dropColumn('refunded_at');
    table.dropColumn('escrow_release_signature');
    table.dropColumn('escrow_released_at');
  });

  console.log('✅ Escrow support rolled back');
}
