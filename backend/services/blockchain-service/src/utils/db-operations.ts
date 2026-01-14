/**
 * Database Operations Utilities
 * 
 * AUDIT FIX #106: Add RETURNING clause to all write operations
 * 
 * This module provides wrapper functions for database operations
 * that always return the affected rows using RETURNING clauses.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from './logger';

/**
 * Insert a record and return the inserted row
 * AUDIT FIX #106: Always use RETURNING
 */
export async function insertReturning<T>(
  client: Pool | PoolClient,
  table: string,
  data: Record<string, any>,
  returning: string[] | '*' = '*'
): Promise<T> {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  
  const returningClause = returning === '*' 
    ? '*' 
    : returning.join(', ');

  const query = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING ${returningClause}
  `;

  const result = await client.query(query, values);
  
  logger.debug('Insert with RETURNING', {
    table,
    columns,
    returningCount: result.rowCount
  });

  return result.rows[0] as T;
}

/**
 * Insert multiple records and return all inserted rows
 * AUDIT FIX #106: Always use RETURNING
 */
export async function insertManyReturning<T>(
  client: Pool | PoolClient,
  table: string,
  records: Record<string, any>[],
  returning: string[] | '*' = '*'
): Promise<T[]> {
  if (records.length === 0) return [];

  const columns = Object.keys(records[0]);
  const returningClause = returning === '*' 
    ? '*' 
    : returning.join(', ');

  // Build multi-row VALUES clause
  const values: any[] = [];
  const valueGroups: string[] = [];
  
  records.forEach((record, rowIndex) => {
    const placeholders = columns.map((col, colIndex) => {
      const paramIndex = rowIndex * columns.length + colIndex + 1;
      values.push(record[col]);
      return `$${paramIndex}`;
    });
    valueGroups.push(`(${placeholders.join(', ')})`);
  });

  const query = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES ${valueGroups.join(', ')}
    RETURNING ${returningClause}
  `;

  const result = await client.query(query, values);
  
  logger.debug('Insert many with RETURNING', {
    table,
    insertedCount: result.rowCount
  });

  return result.rows as T[];
}

/**
 * Update records and return the updated rows
 * AUDIT FIX #106: Always use RETURNING
 */
export async function updateReturning<T>(
  client: Pool | PoolClient,
  table: string,
  data: Record<string, any>,
  where: Record<string, any>,
  returning: string[] | '*' = '*'
): Promise<T[]> {
  const setColumns = Object.keys(data);
  const whereColumns = Object.keys(where);
  
  const setValues = Object.values(data);
  const whereValues = Object.values(where);
  const allValues = [...setValues, ...whereValues];

  const setClause = setColumns
    .map((col, i) => `${col} = $${i + 1}`)
    .join(', ');
  
  const whereClause = whereColumns
    .map((col, i) => `${col} = $${setColumns.length + i + 1}`)
    .join(' AND ');

  const returningClause = returning === '*' 
    ? '*' 
    : returning.join(', ');

  const query = `
    UPDATE ${table}
    SET ${setClause}, updated_at = NOW()
    WHERE ${whereClause}
    RETURNING ${returningClause}
  `;

  const result = await client.query(query, allValues);
  
  logger.debug('Update with RETURNING', {
    table,
    setColumns,
    whereColumns,
    updatedCount: result.rowCount
  });

  return result.rows as T[];
}

/**
 * Update single record and return it
 * AUDIT FIX #106: Always use RETURNING
 */
export async function updateOneReturning<T>(
  client: Pool | PoolClient,
  table: string,
  data: Record<string, any>,
  where: Record<string, any>,
  returning: string[] | '*' = '*'
): Promise<T | null> {
  const results = await updateReturning<T>(client, table, data, where, returning);
  return results.length > 0 ? results[0] : null;
}

/**
 * Upsert (INSERT ON CONFLICT UPDATE) and return the row
 * AUDIT FIX #106: Always use RETURNING
 */
export async function upsertReturning<T>(
  client: Pool | PoolClient,
  table: string,
  data: Record<string, any>,
  conflictColumns: string[],
  updateColumns?: string[],
  returning: string[] | '*' = '*'
): Promise<T> {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  
  // Columns to update on conflict (default: all except conflict columns)
  const toUpdate = updateColumns || columns.filter(c => !conflictColumns.includes(c));
  
  const updateClause = toUpdate.length > 0
    ? toUpdate.map(col => `${col} = EXCLUDED.${col}`).join(', ') + ', updated_at = NOW()'
    : 'updated_at = NOW()';

  const returningClause = returning === '*' 
    ? '*' 
    : returning.join(', ');

  const query = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (${conflictColumns.join(', ')})
    DO UPDATE SET ${updateClause}
    RETURNING ${returningClause}
  `;

  const result = await client.query(query, values);
  
  logger.debug('Upsert with RETURNING', {
    table,
    conflictColumns,
    upsertedCount: result.rowCount
  });

  return result.rows[0] as T;
}

/**
 * Delete records and return the deleted rows
 * AUDIT FIX #106: Always use RETURNING
 */
export async function deleteReturning<T>(
  client: Pool | PoolClient,
  table: string,
  where: Record<string, any>,
  returning: string[] | '*' = '*'
): Promise<T[]> {
  const whereColumns = Object.keys(where);
  const whereValues = Object.values(where);

  const whereClause = whereColumns
    .map((col, i) => `${col} = $${i + 1}`)
    .join(' AND ');

  const returningClause = returning === '*' 
    ? '*' 
    : returning.join(', ');

  const query = `
    DELETE FROM ${table}
    WHERE ${whereClause}
    RETURNING ${returningClause}
  `;

  const result = await client.query(query, whereValues);
  
  logger.debug('Delete with RETURNING', {
    table,
    whereColumns,
    deletedCount: result.rowCount
  });

  return result.rows as T[];
}

// =============================================================================
// BLOCKCHAIN SERVICE SPECIFIC OPERATIONS
// =============================================================================

export interface BlockchainTransaction {
  id: string;
  ticket_id: string;
  tenant_id: string;
  type: string;
  status: string;
  transaction_signature?: string;
  mint_address?: string;
  metadata_uri?: string;
  slot_number?: number;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Ticket {
  id: string;
  tenant_id: string;
  event_id: string;
  user_id?: string;
  status: string;
  is_minted: boolean;
  is_nft: boolean;
  token_id?: string;
  mint_address?: string;
  mint_transaction_id?: string;
  price?: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create or update blockchain transaction record
 * AUDIT FIX #106: Returns the affected row
 */
export async function upsertBlockchainTransaction(
  client: Pool | PoolClient,
  data: {
    ticketId: string;
    tenantId: string;
    type: 'MINT' | 'TRANSFER' | 'BURN';
    status: string;
    signature?: string;
    mintAddress?: string;
    metadataUri?: string;
    slot?: number;
    errorMessage?: string;
  }
): Promise<BlockchainTransaction> {
  return upsertReturning<BlockchainTransaction>(
    client,
    'blockchain_transactions',
    {
      ticket_id: data.ticketId,
      tenant_id: data.tenantId,
      type: data.type,
      status: data.status,
      transaction_signature: data.signature || null,
      mint_address: data.mintAddress || null,
      metadata_uri: data.metadataUri || null,
      slot_number: data.slot || null,
      error_message: data.errorMessage || null,
      created_at: new Date(),
      updated_at: new Date()
    },
    ['ticket_id', 'tenant_id', 'type'],
    ['status', 'transaction_signature', 'mint_address', 'metadata_uri', 'slot_number', 'error_message']
  );
}

/**
 * Update ticket with minting results
 * AUDIT FIX #106: Returns the updated ticket
 */
export async function updateTicketMintStatus(
  client: Pool | PoolClient,
  ticketId: string,
  tenantId: string,
  data: {
    status: string;
    isMinted?: boolean;
    isNft?: boolean;
    tokenId?: string;
    mintAddress?: string;
    mintTransactionId?: string;
  }
): Promise<Ticket | null> {
  const updateData: Record<string, any> = {
    status: data.status
  };

  if (data.isMinted !== undefined) updateData.is_minted = data.isMinted;
  if (data.isNft !== undefined) updateData.is_nft = data.isNft;
  if (data.tokenId !== undefined) updateData.token_id = data.tokenId;
  if (data.mintAddress !== undefined) updateData.mint_address = data.mintAddress;
  if (data.mintTransactionId !== undefined) updateData.mint_transaction_id = data.mintTransactionId;

  return updateOneReturning<Ticket>(
    client,
    'tickets',
    updateData,
    { id: ticketId, tenant_id: tenantId }
  );
}

/**
 * Create wallet record and return it
 * AUDIT FIX #106: Returns the created wallet
 */
export async function createWallet(
  client: Pool | PoolClient,
  data: {
    address: string;
    tenantId: string;
    userId?: string;
    type: 'USER' | 'TREASURY' | 'FEE' | 'ESCROW';
    balance?: number;
  }
): Promise<any> {
  return insertReturning(
    client,
    'wallets',
    {
      address: data.address,
      tenant_id: data.tenantId,
      user_id: data.userId || null,
      type: data.type,
      balance: data.balance || 0,
      created_at: new Date(),
      updated_at: new Date()
    }
  );
}

/**
 * Update wallet balance and return updated wallet
 * AUDIT FIX #106: Returns the updated wallet
 */
export async function updateWalletBalance(
  client: Pool | PoolClient,
  address: string,
  tenantId: string,
  newBalance: number
): Promise<any | null> {
  return updateOneReturning(
    client,
    'wallets',
    { balance: newBalance },
    { address, tenant_id: tenantId }
  );
}

export default {
  insertReturning,
  insertManyReturning,
  updateReturning,
  updateOneReturning,
  upsertReturning,
  deleteReturning,
  upsertBlockchainTransaction,
  updateTicketMintStatus,
  createWallet,
  updateWalletBalance
};
