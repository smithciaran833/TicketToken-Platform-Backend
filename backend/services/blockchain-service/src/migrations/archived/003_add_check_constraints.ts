/**
 * Migration: Add CHECK Constraints
 * 
 * AUDIT FIX #105: Add CHECK constraints to database
 * 
 * This migration adds data integrity constraints:
 * - Status columns: Valid enum values only
 * - Amount columns: Non-negative values
 * - Address columns: Length validation for Solana addresses
 * - Transaction columns: Valid format validation
 * 
 * IMPORTANT: Run with SET lock_timeout = '10s' to prevent long locks
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Set lock timeout to prevent long-running locks
  await knex.raw('SET lock_timeout = ?', ['10s']);

  // =====================================================================
  // blockchain_transactions table constraints
  // =====================================================================
  
  // Check constraint on transaction type
  await knex.raw(`
    ALTER TABLE blockchain_transactions
    ADD CONSTRAINT chk_blockchain_transactions_type
    CHECK (type IN ('MINT', 'TRANSFER', 'BURN', 'METADATA_UPDATE', 'VERIFY_COLLECTION'))
  `).catch(err => {
    if (!err.message.includes('already exists')) throw err;
  });

  // Check constraint on transaction status
  await knex.raw(`
    ALTER TABLE blockchain_transactions
    ADD CONSTRAINT chk_blockchain_transactions_status
    CHECK (status IN ('PENDING', 'MINTING', 'PROCESSING', 'CONFIRMED', 'FINALIZED', 'FAILED', 'EXPIRED'))
  `).catch(err => {
    if (!err.message.includes('already exists')) throw err;
  });

  // Check constraint on slot_number (must be non-negative)
  await knex.raw(`
    ALTER TABLE blockchain_transactions
    ADD CONSTRAINT chk_blockchain_transactions_slot_non_negative
    CHECK (slot_number IS NULL OR slot_number >= 0)
  `).catch(err => {
    if (!err.message.includes('already exists')) throw err;
  });

  // Check constraint on transaction signature length (base58 encoded, typically 64-128 chars)
  await knex.raw(`
    ALTER TABLE blockchain_transactions
    ADD CONSTRAINT chk_blockchain_transactions_signature_length
    CHECK (transaction_signature IS NULL OR length(transaction_signature) BETWEEN 64 AND 128)
  `).catch(err => {
    if (!err.message.includes('already exists')) throw err;
  });

  // Check constraint on mint address length (Solana addresses are 32-44 chars base58)
  await knex.raw(`
    ALTER TABLE blockchain_transactions
    ADD CONSTRAINT chk_blockchain_transactions_mint_address_length
    CHECK (mint_address IS NULL OR length(mint_address) BETWEEN 32 AND 44)
  `).catch(err => {
    if (!err.message.includes('already exists')) throw err;
  });

  // =====================================================================
  // tickets table constraints (if exists)
  // =====================================================================
  
  // Check if tickets table exists before adding constraints
  const ticketsExists = await knex.schema.hasTable('tickets');
  
  if (ticketsExists) {
    // Check constraint on ticket status
    await knex.raw(`
      ALTER TABLE tickets
      ADD CONSTRAINT chk_tickets_status
      CHECK (status IN ('AVAILABLE', 'RESERVED', 'MINTING', 'MINT_FAILED', 'MINTED', 'SOLD', 'TRANSFERRED', 'USED', 'CANCELLED', 'EXPIRED'))
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Check constraint on token_id length
    await knex.raw(`
      ALTER TABLE tickets
      ADD CONSTRAINT chk_tickets_token_id_length
      CHECK (token_id IS NULL OR length(token_id) BETWEEN 32 AND 44)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Check constraint on mint_address length
    await knex.raw(`
      ALTER TABLE tickets
      ADD CONSTRAINT chk_tickets_mint_address_length
      CHECK (mint_address IS NULL OR length(mint_address) BETWEEN 32 AND 44)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Check constraint on mint_transaction_id length
    await knex.raw(`
      ALTER TABLE tickets
      ADD CONSTRAINT chk_tickets_mint_tx_id_length
      CHECK (mint_transaction_id IS NULL OR length(mint_transaction_id) BETWEEN 64 AND 128)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Check constraint on price (must be non-negative)
    await knex.raw(`
      ALTER TABLE tickets
      ADD CONSTRAINT chk_tickets_price_non_negative
      CHECK (price IS NULL OR price >= 0)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });
  }

  // =====================================================================
  // wallets table constraints (if exists)
  // =====================================================================
  
  const walletsExists = await knex.schema.hasTable('wallets');
  
  if (walletsExists) {
    // Check constraint on wallet address length
    await knex.raw(`
      ALTER TABLE wallets
      ADD CONSTRAINT chk_wallets_address_length
      CHECK (address IS NULL OR length(address) BETWEEN 32 AND 44)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Check constraint on wallet type
    await knex.raw(`
      ALTER TABLE wallets
      ADD CONSTRAINT chk_wallets_type
      CHECK (type IN ('USER', 'TREASURY', 'FEE', 'ESCROW', 'PROGRAM'))
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Check constraint on balance (must be non-negative)
    await knex.raw(`
      ALTER TABLE wallets
      ADD CONSTRAINT chk_wallets_balance_non_negative
      CHECK (balance IS NULL OR balance >= 0)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });
  }

  // =====================================================================
  // nft_mints table constraints (if exists)
  // =====================================================================
  
  const nftMintsExists = await knex.schema.hasTable('nft_mints');
  
  if (nftMintsExists) {
    // Check constraint on mint status
    await knex.raw(`
      ALTER TABLE nft_mints
      ADD CONSTRAINT chk_nft_mints_status
      CHECK (status IN ('pending', 'minting', 'completed', 'failed'))
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Check constraint on retry_count (must be non-negative)
    await knex.raw(`
      ALTER TABLE nft_mints
      ADD CONSTRAINT chk_nft_mints_retry_count_non_negative
      CHECK (retry_count IS NULL OR retry_count >= 0)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Check constraint on transaction_signature length
    await knex.raw(`
      ALTER TABLE nft_mints
      ADD CONSTRAINT chk_nft_mints_signature_length
      CHECK (transaction_signature IS NULL OR length(transaction_signature) BETWEEN 64 AND 128)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Check constraint on mint_address length
    await knex.raw(`
      ALTER TABLE nft_mints
      ADD CONSTRAINT chk_nft_mints_address_length
      CHECK (mint_address IS NULL OR length(mint_address) BETWEEN 32 AND 44)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });
  }

  // =====================================================================
  // events table constraints (if exists)
  // =====================================================================
  
  const eventsExists = await knex.schema.hasTable('events');
  
  if (eventsExists) {
    // Check constraint on event_pda length
    await knex.raw(`
      ALTER TABLE events
      ADD CONSTRAINT chk_events_pda_length
      CHECK (event_pda IS NULL OR length(event_pda) BETWEEN 32 AND 44)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Check constraint on ticket price (must be non-negative)
    await knex.raw(`
      ALTER TABLE events
      ADD CONSTRAINT chk_events_ticket_price_non_negative
      CHECK (ticket_price IS NULL OR ticket_price >= 0)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Check constraint on total_tickets (must be positive)
    await knex.raw(`
      ALTER TABLE events
      ADD CONSTRAINT chk_events_total_tickets_positive
      CHECK (total_tickets IS NULL OR total_tickets > 0)
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });
  }

  // =====================================================================
  // tenant_id validation (all tables with tenant_id)
  // =====================================================================
  
  // Get all tables with tenant_id column
  const tablesWithTenantId = await knex.raw(`
    SELECT table_name 
    FROM information_schema.columns 
    WHERE column_name = 'tenant_id' 
    AND table_schema = 'public'
  `);

  // Add UUID format check for tenant_id (if not already a UUID type, add length check)
  for (const row of tablesWithTenantId.rows || []) {
    const tableName = row.table_name;
    const constraintName = `chk_${tableName}_tenant_id_format`;
    
    await knex.raw(`
      ALTER TABLE "${tableName}"
      ADD CONSTRAINT "${constraintName}"
      CHECK (tenant_id IS NOT NULL AND tenant_id != '00000000-0000-0000-0000-000000000000')
    `).catch(err => {
      // Ignore if constraint already exists or table doesn't exist
      if (!err.message.includes('already exists') && !err.message.includes('does not exist')) {
        console.warn(`Warning: Could not add tenant_id constraint to ${tableName}: ${err.message}`);
      }
    });
  }

  console.log('CHECK constraints migration completed successfully');
}

export async function down(knex: Knex): Promise<void> {
  // =====================================================================
  // Remove blockchain_transactions constraints
  // =====================================================================
  
  await knex.raw(`
    ALTER TABLE blockchain_transactions 
    DROP CONSTRAINT IF EXISTS chk_blockchain_transactions_type
  `);
  await knex.raw(`
    ALTER TABLE blockchain_transactions 
    DROP CONSTRAINT IF EXISTS chk_blockchain_transactions_status
  `);
  await knex.raw(`
    ALTER TABLE blockchain_transactions 
    DROP CONSTRAINT IF EXISTS chk_blockchain_transactions_slot_non_negative
  `);
  await knex.raw(`
    ALTER TABLE blockchain_transactions 
    DROP CONSTRAINT IF EXISTS chk_blockchain_transactions_signature_length
  `);
  await knex.raw(`
    ALTER TABLE blockchain_transactions 
    DROP CONSTRAINT IF EXISTS chk_blockchain_transactions_mint_address_length
  `);

  // =====================================================================
  // Remove tickets constraints
  // =====================================================================
  
  const ticketsExists = await knex.schema.hasTable('tickets');
  if (ticketsExists) {
    await knex.raw('ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_status');
    await knex.raw('ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_token_id_length');
    await knex.raw('ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_mint_address_length');
    await knex.raw('ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_mint_tx_id_length');
    await knex.raw('ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_price_non_negative');
  }

  // =====================================================================
  // Remove wallets constraints
  // =====================================================================
  
  const walletsExists = await knex.schema.hasTable('wallets');
  if (walletsExists) {
    await knex.raw('ALTER TABLE wallets DROP CONSTRAINT IF EXISTS chk_wallets_address_length');
    await knex.raw('ALTER TABLE wallets DROP CONSTRAINT IF EXISTS chk_wallets_type');
    await knex.raw('ALTER TABLE wallets DROP CONSTRAINT IF EXISTS chk_wallets_balance_non_negative');
  }

  // =====================================================================
  // Remove nft_mints constraints
  // =====================================================================
  
  const nftMintsExists = await knex.schema.hasTable('nft_mints');
  if (nftMintsExists) {
    await knex.raw('ALTER TABLE nft_mints DROP CONSTRAINT IF EXISTS chk_nft_mints_status');
    await knex.raw('ALTER TABLE nft_mints DROP CONSTRAINT IF EXISTS chk_nft_mints_retry_count_non_negative');
    await knex.raw('ALTER TABLE nft_mints DROP CONSTRAINT IF EXISTS chk_nft_mints_signature_length');
    await knex.raw('ALTER TABLE nft_mints DROP CONSTRAINT IF EXISTS chk_nft_mints_address_length');
  }

  // =====================================================================
  // Remove events constraints
  // =====================================================================
  
  const eventsExists = await knex.schema.hasTable('events');
  if (eventsExists) {
    await knex.raw('ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_pda_length');
    await knex.raw('ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_ticket_price_non_negative');
    await knex.raw('ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_total_tickets_positive');
  }

  // =====================================================================
  // Remove tenant_id constraints (dynamic)
  // =====================================================================
  
  const tablesWithTenantId = await knex.raw(`
    SELECT table_name 
    FROM information_schema.columns 
    WHERE column_name = 'tenant_id' 
    AND table_schema = 'public'
  `);

  for (const row of tablesWithTenantId.rows || []) {
    const tableName = row.table_name;
    const constraintName = `chk_${tableName}_tenant_id_format`;
    
    await knex.raw(`
      ALTER TABLE "${tableName}" 
      DROP CONSTRAINT IF EXISTS "${constraintName}"
    `).catch(() => {});
  }

  console.log('CHECK constraints migration rolled back');
}
