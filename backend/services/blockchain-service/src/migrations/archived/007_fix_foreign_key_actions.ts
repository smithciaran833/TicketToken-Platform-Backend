/**
 * Migration: Fix Foreign Key Actions (CASCADE → RESTRICT)
 * 
 * AUDIT FIX #63: Change CASCADE to RESTRICT on user FKs
 * 
 * Changes:
 * - Alters foreign keys from ON DELETE CASCADE to ON DELETE RESTRICT
 * - Prevents accidental data loss when deleting users
 * - Applies to all tables with user_id foreign key
 * - Use soft delete pattern instead of hard delete
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Set lock_timeout to avoid blocking production
  await knex.raw('SET lock_timeout = \'10s\'');

  // =========================================================================
  // Helper function to safely alter foreign key
  // =========================================================================
  const alterForeignKey = async (
    tableName: string,
    constraintName: string,
    columnName: string,
    referencedTable: string,
    referencedColumn: string,
    onDelete: 'RESTRICT' | 'CASCADE' | 'SET NULL' = 'RESTRICT'
  ) => {
    // Check if table exists
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
      console.log(`Table ${tableName} does not exist, skipping...`);
      return;
    }

    // Check if constraint exists
    const constraintExists = await knex.raw(`
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = ? 
      AND table_name = ?
    `, [constraintName, tableName]);

    if (constraintExists.rows.length === 0) {
      console.log(`Constraint ${constraintName} does not exist on ${tableName}, creating...`);
    }

    // Drop existing constraint if it exists
    await knex.raw(`
      ALTER TABLE ${tableName}
      DROP CONSTRAINT IF EXISTS ${constraintName};
    `);

    // Add new constraint with RESTRICT
    await knex.raw(`
      ALTER TABLE ${tableName}
      ADD CONSTRAINT ${constraintName}
      FOREIGN KEY (${columnName})
      REFERENCES ${referencedTable}(${referencedColumn})
      ON DELETE ${onDelete};
    `);

    console.log(`Updated ${tableName}.${constraintName} to ON DELETE ${onDelete}`);
  };

  // =========================================================================
  // WALLET_ADDRESSES TABLE
  // =========================================================================
  
  await alterForeignKey(
    'wallet_addresses',
    'wallet_addresses_user_id_fkey',
    'user_id',
    'users',
    'id',
    'RESTRICT'
  );

  // =========================================================================
  // USER_WALLET_CONNECTIONS TABLE
  // =========================================================================

  await alterForeignKey(
    'user_wallet_connections',
    'user_wallet_connections_user_id_fkey',
    'user_id',
    'users',
    'id',
    'RESTRICT'
  );

  // =========================================================================
  // NFT_MINTS TABLE (if exists)
  // =========================================================================

  await alterForeignKey(
    'nft_mints',
    'nft_mints_user_id_fkey',
    'user_id',
    'users',
    'id',
    'RESTRICT'
  );

  // =========================================================================
  // MINT_REQUESTS TABLE (if exists)
  // =========================================================================

  await alterForeignKey(
    'mint_requests',
    'mint_requests_user_id_fkey',
    'user_id',
    'users',
    'id',
    'RESTRICT'
  );

  // =========================================================================
  // IDEMPOTENCY_KEYS TABLE - Can use SET NULL for user_id (optional)
  // =========================================================================

  await alterForeignKey(
    'idempotency_keys',
    'idempotency_keys_user_id_fkey',
    'user_id',
    'users',
    'id',
    'SET NULL' // Idempotency keys should remain even if user is deleted
  );

  // =========================================================================
  // Add helpful comments
  // =========================================================================

  await knex.raw(`
    COMMENT ON CONSTRAINT wallet_addresses_user_id_fkey ON wallet_addresses IS 
    'RESTRICT delete - use soft delete (deleted_at) instead of hard deleting users';
  `).catch(() => {/* Constraint may not exist */});

  await knex.raw(`
    COMMENT ON CONSTRAINT user_wallet_connections_user_id_fkey ON user_wallet_connections IS 
    'RESTRICT delete - use soft delete (deleted_at) instead of hard deleting users';
  `).catch(() => {/* Constraint may not exist */});
}

export async function down(knex: Knex): Promise<void> {
  // Restore CASCADE behavior (not recommended, but here for rollback capability)
  
  const alterForeignKeyBack = async (
    tableName: string,
    constraintName: string,
    columnName: string,
    referencedTable: string,
    referencedColumn: string
  ) => {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) return;

    await knex.raw(`
      ALTER TABLE ${tableName}
      DROP CONSTRAINT IF EXISTS ${constraintName};
    `);

    await knex.raw(`
      ALTER TABLE ${tableName}
      ADD CONSTRAINT ${constraintName}
      FOREIGN KEY (${columnName})
      REFERENCES ${referencedTable}(${referencedColumn})
      ON DELETE CASCADE;
    `);
  };

  await alterForeignKeyBack(
    'wallet_addresses',
    'wallet_addresses_user_id_fkey',
    'user_id',
    'users',
    'id'
  );

  await alterForeignKeyBack(
    'user_wallet_connections',
    'user_wallet_connections_user_id_fkey',
    'user_id',
    'users',
    'id'
  );

  await alterForeignKeyBack(
    'nft_mints',
    'nft_mints_user_id_fkey',
    'user_id',
    'users',
    'id'
  );

  await alterForeignKeyBack(
    'mint_requests',
    'mint_requests_user_id_fkey',
    'user_id',
    'users',
    'id'
  );

  await alterForeignKeyBack(
    'idempotency_keys',
    'idempotency_keys_user_id_fkey',
    'user_id',
    'users',
    'id'
  );
}
