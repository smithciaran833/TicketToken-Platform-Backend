import { Knex } from 'knex';

/**
 * Migration: Add CHECK constraints to nft_mints table
 * 
 * This migration adds data validation constraints at the database level
 * to enforce business rules and prevent invalid data.
 */
export async function up(knex: Knex): Promise<void> {
  // Check if nft_mints table exists
  const hasNftMintsTable = await knex.schema.hasTable('nft_mints');
  
  if (!hasNftMintsTable) {
    console.warn('⚠️ nft_mints table does not exist - skipping CHECK constraints');
    return;
  }

  // Add status enum check
  // Ensures status can only be one of the allowed values
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'nft_mints_status_check'
      ) THEN
        ALTER TABLE nft_mints 
        ADD CONSTRAINT nft_mints_status_check 
        CHECK (status IN ('pending', 'minting', 'completed', 'failed', 'cancelled'));
      END IF;
    END $$;
  `);
  console.log('✅ Added status CHECK constraint');

  // Add retry_count range check
  // Ensures retry_count is between 0 and 10 (prevents runaway retries)
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'nft_mints_retry_count_check'
      ) THEN
        ALTER TABLE nft_mints 
        ADD CONSTRAINT nft_mints_retry_count_check 
        CHECK (retry_count >= 0 AND retry_count <= 10);
      END IF;
    END $$;
  `);
  console.log('✅ Added retry_count CHECK constraint');

  // Add blockchain enum check (if blockchain column exists)
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'nft_mints' AND column_name = 'blockchain'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'nft_mints_blockchain_check'
      ) THEN
        ALTER TABLE nft_mints 
        ADD CONSTRAINT nft_mints_blockchain_check 
        CHECK (blockchain IN ('solana', 'solana-devnet', 'solana-testnet'));
      END IF;
    END $$;
  `);
  console.log('✅ Added blockchain CHECK constraint');

  // Add mint_address format check (Solana addresses are 32-44 base58 characters)
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'nft_mints_mint_address_check'
      ) THEN
        ALTER TABLE nft_mints 
        ADD CONSTRAINT nft_mints_mint_address_check 
        CHECK (
          mint_address IS NULL OR 
          (LENGTH(mint_address) >= 32 AND LENGTH(mint_address) <= 64)
        );
      END IF;
    END $$;
  `);
  console.log('✅ Added mint_address length CHECK constraint');

  // Add transaction_signature format check (Solana signatures are 88 base58 characters)
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'nft_mints_signature_check'
      ) THEN
        ALTER TABLE nft_mints 
        ADD CONSTRAINT nft_mints_signature_check 
        CHECK (
          transaction_signature IS NULL OR 
          (LENGTH(transaction_signature) >= 64 AND LENGTH(transaction_signature) <= 128)
        );
      END IF;
    END $$;
  `);
  console.log('✅ Added transaction_signature length CHECK constraint');

  // Add metadata_uri format check (must be a valid URI or null)
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'nft_mints_metadata_uri_check'
      ) THEN
        ALTER TABLE nft_mints 
        ADD CONSTRAINT nft_mints_metadata_uri_check 
        CHECK (
          metadata_uri IS NULL OR 
          metadata_uri ~ '^(https?://|ipfs://|ar://)'
        );
      END IF;
    END $$;
  `);
  console.log('✅ Added metadata_uri format CHECK constraint');

  // Add completed_at consistency check
  // completed_at should only be set when status is 'completed'
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'nft_mints_completed_at_check'
      ) THEN
        ALTER TABLE nft_mints 
        ADD CONSTRAINT nft_mints_completed_at_check 
        CHECK (
          (status = 'completed' AND completed_at IS NOT NULL) OR
          (status != 'completed')
        );
      END IF;
    END $$;
  `);
  console.log('✅ Added completed_at consistency CHECK constraint');

  // Add created_at <= updated_at check
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'nft_mints_timestamps_check'
      ) THEN
        ALTER TABLE nft_mints 
        ADD CONSTRAINT nft_mints_timestamps_check 
        CHECK (created_at <= updated_at);
      END IF;
    END $$;
  `);
  console.log('✅ Added timestamp consistency CHECK constraint');

  console.log('✅ All CHECK constraints added successfully');
}

export async function down(knex: Knex): Promise<void> {
  const hasNftMintsTable = await knex.schema.hasTable('nft_mints');
  
  if (!hasNftMintsTable) {
    return;
  }

  // Drop all CHECK constraints
  const constraints = [
    'nft_mints_status_check',
    'nft_mints_retry_count_check',
    'nft_mints_blockchain_check',
    'nft_mints_mint_address_check',
    'nft_mints_signature_check',
    'nft_mints_metadata_uri_check',
    'nft_mints_completed_at_check',
    'nft_mints_timestamps_check'
  ];

  for (const constraint of constraints) {
    await knex.raw(`
      ALTER TABLE nft_mints 
      DROP CONSTRAINT IF EXISTS ${constraint}
    `);
  }

  console.log('✅ All CHECK constraints removed');
}
