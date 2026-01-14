/**
 * Migration: Add Partial Unique Indexes for Soft Delete
 * 
 * AUDIT FIX #21: Add partial unique index for soft delete
 * AUDIT FIX #23: Add tenant_id to unique constraints
 * 
 * Changes:
 * - Creates partial unique indexes that only apply to active (non-deleted) records
 * - Includes tenant_id in unique constraints for multi-tenant isolation
 * - Drops old unique constraints that don't account for soft delete
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Set lock_timeout to avoid blocking production for too long
  await knex.raw('SET lock_timeout = \'5s\'');

  // =========================================================================
  // WALLET_ADDRESSES TABLE
  // =========================================================================
  
  // Drop old unique constraint if it exists (may not exist)
  await knex.raw(`
    DROP INDEX IF EXISTS idx_wallet_addresses_user_address;
    DROP INDEX IF EXISTS wallet_addresses_user_id_wallet_address_key;
  `);

  // AUDIT FIX #21, #23: Create partial unique index for active records only
  // Includes tenant_id for multi-tenant isolation
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_addresses_tenant_user_active
    ON wallet_addresses (tenant_id, user_id, wallet_address)
    WHERE deleted_at IS NULL;
  `);

  // Add comment explaining the index
  await knex.raw(`
    COMMENT ON INDEX idx_wallet_addresses_tenant_user_active IS 
    'Partial unique index ensuring wallet address uniqueness per tenant/user for active records only (soft delete support)';
  `);

  // =========================================================================
  // USER_WALLET_CONNECTIONS TABLE
  // =========================================================================

  // Drop old unique constraint if it exists
  await knex.raw(`
    DROP INDEX IF EXISTS idx_user_wallet_connections_user_address;
    DROP INDEX IF EXISTS user_wallet_connections_user_id_wallet_address_key;
  `);

  // AUDIT FIX #21, #23: Create partial unique index for active records only
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallet_connections_tenant_user_active
    ON user_wallet_connections (tenant_id, user_id, wallet_address)
    WHERE deleted_at IS NULL;
  `);

  await knex.raw(`
    COMMENT ON INDEX idx_user_wallet_connections_tenant_user_active IS 
    'Partial unique index ensuring wallet connection uniqueness per tenant/user for active records only';
  `);

  // =========================================================================
  // NFT_MINTS TABLE (if exists)
  // =========================================================================

  // Check if nft_mints table exists
  const nftMintsExists = await knex.schema.hasTable('nft_mints');
  
  if (nftMintsExists) {
    // Ensure tenant_id is in uniqueness for ticket_id
    await knex.raw(`
      DROP INDEX IF EXISTS idx_nft_mints_ticket;
    `);

    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_mints_tenant_ticket_active
      ON nft_mints (tenant_id, ticket_id)
      WHERE deleted_at IS NULL OR deleted_at IS NOT NULL;
    `);

    // Actually, for mints we probably want to track all including deleted
    // Let's use a simpler approach - just ensure tenant isolation
    await knex.raw(`
      DROP INDEX IF EXISTS idx_nft_mints_tenant_ticket_active;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_mints_tenant_ticket
      ON nft_mints (tenant_id, ticket_id);
    `);

    await knex.raw(`
      COMMENT ON INDEX idx_nft_mints_tenant_ticket IS 
      'Unique index ensuring one mint per ticket per tenant';
    `);
  }

  // =========================================================================
  // IDEMPOTENCY_KEYS TABLE (if exists)
  // =========================================================================

  const idempotencyExists = await knex.schema.hasTable('idempotency_keys');
  
  if (idempotencyExists) {
    // Idempotency keys should include tenant_id
    await knex.raw(`
      DROP INDEX IF EXISTS idx_idempotency_keys_key;
    `);

    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_tenant_key
      ON idempotency_keys (tenant_id, idempotency_key);
    `);

    await knex.raw(`
      COMMENT ON INDEX idx_idempotency_keys_tenant_key IS 
      'Unique index ensuring idempotency key uniqueness per tenant';
    `);
  }

  // =========================================================================
  // SUPPORTING INDEXES
  // =========================================================================

  // Index for soft-deleted records lookup (useful for admin/audit)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_wallet_addresses_deleted
    ON wallet_addresses (deleted_at)
    WHERE deleted_at IS NOT NULL;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_user_wallet_connections_deleted
    ON user_wallet_connections (deleted_at)
    WHERE deleted_at IS NOT NULL;
  `);

  // Tenant-scoped lookups for active wallets
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_wallet_addresses_tenant_active
    ON wallet_addresses (tenant_id)
    WHERE deleted_at IS NULL;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_user_wallet_connections_tenant_active
    ON user_wallet_connections (tenant_id)
    WHERE deleted_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove partial unique indexes
  await knex.raw(`
    DROP INDEX IF EXISTS idx_wallet_addresses_tenant_user_active;
    DROP INDEX IF EXISTS idx_user_wallet_connections_tenant_user_active;
    DROP INDEX IF EXISTS idx_nft_mints_tenant_ticket;
    DROP INDEX IF EXISTS idx_idempotency_keys_tenant_key;
  `);

  // Remove supporting indexes
  await knex.raw(`
    DROP INDEX IF EXISTS idx_wallet_addresses_deleted;
    DROP INDEX IF EXISTS idx_user_wallet_connections_deleted;
    DROP INDEX IF EXISTS idx_wallet_addresses_tenant_active;
    DROP INDEX IF EXISTS idx_user_wallet_connections_tenant_active;
  `);

  // Note: Not recreating old indexes as they may cause issues
  // If rollback is needed, old indexes should be manually assessed
}
