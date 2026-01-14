/**
 * Migration: Add Wallet Soft Delete Columns
 * 
 * AUDIT FIX #80: Convert wallet operations to soft delete with audit trail
 * 
 * Adds columns to wallet_addresses table:
 * - deleted_at: Timestamp for soft delete
 * - deleted_by: Who performed the deletion (user_id or admin_id)
 * - disconnection_reason: Reason for disconnection (audit trail)
 * 
 * Adds columns to user_wallet_connections table:
 * - connection_ip: IP address for connection (audit/security)
 * - connection_type: Type of connection event (CONNECT/DISCONNECT)
 * - disconnection_reason: Reason for disconnection
 */

import { Knex } from 'knex';

// Declare console for TypeScript (available at runtime)
declare const console: { log: (...args: any[]) => void };

// Apply migration safety timeouts
async function applyMigrationSafety(knex: Knex): Promise<void> {
  await knex.raw('SET lock_timeout = ?', ['10s']);
  await knex.raw('SET statement_timeout = ?', ['60s']);
}

export async function up(knex: Knex): Promise<void> {
  await applyMigrationSafety(knex);

  // Add soft delete columns to wallet_addresses
  const hasWalletAddresses = await knex.schema.hasTable('wallet_addresses');
  
  if (hasWalletAddresses) {
    // Check if columns already exist
    const hasDeletedAt = await knex.schema.hasColumn('wallet_addresses', 'deleted_at');
    const hasDeletedBy = await knex.schema.hasColumn('wallet_addresses', 'deleted_by');
    const hasDisconnectionReason = await knex.schema.hasColumn('wallet_addresses', 'disconnection_reason');

    if (!hasDeletedAt || !hasDeletedBy || !hasDisconnectionReason) {
      await knex.schema.alterTable('wallet_addresses', (table) => {
        if (!hasDeletedAt) {
          table.timestamp('deleted_at').nullable();
        }
        if (!hasDeletedBy) {
          table.uuid('deleted_by').nullable();
        }
        if (!hasDisconnectionReason) {
          table.string('disconnection_reason', 500).nullable();
        }
      });

      // Add index for soft delete queries (WHERE deleted_at IS NULL)
      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_addresses_active
        ON wallet_addresses (user_id, is_primary)
        WHERE deleted_at IS NULL
      `);

      console.log('✅ wallet_addresses soft delete columns added');
    } else {
      console.log('ℹ️  wallet_addresses soft delete columns already exist');
    }
  }

  // Add audit columns to user_wallet_connections
  const hasWalletConnections = await knex.schema.hasTable('user_wallet_connections');
  
  if (hasWalletConnections) {
    const hasConnectionIp = await knex.schema.hasColumn('user_wallet_connections', 'connection_ip');
    const hasConnectionType = await knex.schema.hasColumn('user_wallet_connections', 'connection_type');
    const hasDisconnectReason = await knex.schema.hasColumn('user_wallet_connections', 'disconnection_reason');

    if (!hasConnectionIp || !hasConnectionType || !hasDisconnectReason) {
      await knex.schema.alterTable('user_wallet_connections', (table) => {
        if (!hasConnectionIp) {
          table.string('connection_ip', 45).nullable(); // IPv6 max length
        }
        if (!hasConnectionType) {
          table.string('connection_type', 20).defaultTo('CONNECT');
        }
        if (!hasDisconnectReason) {
          table.string('disconnection_reason', 500).nullable();
        }
      });

      console.log('✅ user_wallet_connections audit columns added');
    } else {
      console.log('ℹ️  user_wallet_connections audit columns already exist');
    }
  }

  console.log('✅ Migration 005: Wallet soft delete columns complete');
}

export async function down(knex: Knex): Promise<void> {
  await applyMigrationSafety(knex);

  // Remove soft delete columns from wallet_addresses
  const hasWalletAddresses = await knex.schema.hasTable('wallet_addresses');
  
  if (hasWalletAddresses) {
    // Drop index first
    await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_wallet_addresses_active');

    await knex.schema.alterTable('wallet_addresses', (table) => {
      table.dropColumn('deleted_at');
      table.dropColumn('deleted_by');
      table.dropColumn('disconnection_reason');
    });

    console.log('✅ wallet_addresses soft delete columns removed');
  }

  // Remove audit columns from user_wallet_connections
  const hasWalletConnections = await knex.schema.hasTable('user_wallet_connections');
  
  if (hasWalletConnections) {
    await knex.schema.alterTable('user_wallet_connections', (table) => {
      table.dropColumn('connection_ip');
      table.dropColumn('connection_type');
      table.dropColumn('disconnection_reason');
    });

    console.log('✅ user_wallet_connections audit columns removed');
  }

  console.log('✅ Migration 005 rollback complete');
}
