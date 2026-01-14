import { Knex } from 'knex';

/**
 * Migration: Add foreign key constraints to nft_mints table
 * 
 * This migration adds referential integrity constraints to ensure
 * data consistency between the nft_mints and tickets tables.
 * 
 * NOTE: Before running this migration:
 * 1. Ensure the tickets table exists
 * 2. Clean up any orphaned records in nft_mints that don't have matching tickets
 * 3. Consider running this during a maintenance window
 */
export async function up(knex: Knex): Promise<void> {
  // Check if tickets table exists before adding FK
  const hasTicketsTable = await knex.schema.hasTable('tickets');
  
  if (!hasTicketsTable) {
    console.warn('⚠️ tickets table does not exist - skipping foreign key migration');
    console.warn('   Run this migration after the tickets table is created');
    return;
  }

  // Check if nft_mints table exists
  const hasNftMintsTable = await knex.schema.hasTable('nft_mints');
  
  if (!hasNftMintsTable) {
    console.warn('⚠️ nft_mints table does not exist - creating it first');
    
    await knex.schema.createTable('nft_mints', (table) => {
      table.uuid('id').defaultTo(knex.raw('gen_random_uuid()')).primary();
      table.uuid('ticket_id').notNullable();
      table.uuid('tenant_id').notNullable();
      table.string('transaction_signature', 255);
      table.string('mint_address', 255);
      table.string('asset_id', 255);
      table.text('metadata_uri');
      table.string('merkle_tree', 255);
      table.string('owner_address', 255);
      table.string('blockchain', 50).defaultTo('solana');
      table.integer('retry_count').defaultTo(0);
      table.string('status', 50).defaultTo('pending');
      table.text('error_message');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('completed_at');
      
      // Unique constraint to prevent duplicate mints
      table.unique(['ticket_id', 'tenant_id']);
      
      // Index for common queries
      table.index(['status']);
      table.index(['tenant_id']);
      table.index(['created_at']);
    });
  }

  // Add foreign key constraint
  await knex.schema.alterTable('nft_mints', (table) => {
    // Foreign key to tickets table
    // Using ON DELETE CASCADE - if ticket is deleted, mint record is deleted
    // Using ON UPDATE CASCADE - if ticket ID changes, mint record is updated
    table
      .foreign('ticket_id', 'fk_nft_mints_ticket_id')
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });

  // Check if tenants table exists and add FK
  const hasTenantsTable = await knex.schema.hasTable('tenants');
  
  if (hasTenantsTable) {
    await knex.schema.alterTable('nft_mints', (table) => {
      table
        .foreign('tenant_id', 'fk_nft_mints_tenant_id')
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
    });
    console.log('✅ Added foreign key constraint for tenant_id');
  }

  console.log('✅ Foreign key constraints added successfully');
}

export async function down(knex: Knex): Promise<void> {
  const hasNftMintsTable = await knex.schema.hasTable('nft_mints');
  
  if (!hasNftMintsTable) {
    return;
  }

  await knex.schema.alterTable('nft_mints', (table) => {
    // Drop foreign keys if they exist
    table.dropForeign(['ticket_id'], 'fk_nft_mints_ticket_id');
  });

  // Try to drop tenant FK (may not exist)
  try {
    await knex.schema.alterTable('nft_mints', (table) => {
      table.dropForeign(['tenant_id'], 'fk_nft_mints_tenant_id');
    });
  } catch (error) {
    // FK may not exist, ignore
  }

  console.log('✅ Foreign key constraints removed');
}
