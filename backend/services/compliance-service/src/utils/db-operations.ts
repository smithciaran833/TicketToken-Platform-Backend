/**
 * Database Operations Helper for Compliance Service
 * 
 * AUDIT FIXES:
 * - DB-H1: Wrap multi-step operations in transactions
 * - DB-H2: Use FOR UPDATE for concurrent access
 * - DB-H3: Set pool acquire timeout
 * - GD-H4: Handle database disconnect gracefully
 */
import { Knex } from 'knex';
import { db } from '../config/database';
import { logger } from './logger';
import { incrementMetric } from './metrics';

// =============================================================================
// TRANSACTION WRAPPER (DB-H1)
// =============================================================================

export interface TransactionOptions {
  isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

const DEFAULT_TX_OPTIONS: TransactionOptions = {
  isolationLevel: 'read committed',
  timeout: 30000,
  retries: 3,
  retryDelay: 100
};

/**
 * DB-H1: Execute operation within a database transaction
 * Automatically handles commit/rollback and retries on serialization failures
 */
export async function withTransaction<T>(
  operation: (trx: Knex.Transaction) => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_TX_OPTIONS, ...options };
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= (config.retries || 1); attempt++) {
    const trx = await db.transaction();
    const timeoutHandle = setTimeout(() => {
      trx.rollback(new Error('Transaction timeout'));
    }, config.timeout);
    
    try {
      // Set isolation level if specified
      if (config.isolationLevel) {
        await trx.raw(`SET TRANSACTION ISOLATION LEVEL ${config.isolationLevel.toUpperCase()}`);
      }
      
      const result = await operation(trx);
      await trx.commit();
      clearTimeout(timeoutHandle);
      
      incrementMetric('db_transaction_success_total');
      return result;
      
    } catch (error: any) {
      clearTimeout(timeoutHandle);
      await trx.rollback();
      lastError = error;
      
      // Check if error is retryable (serialization failure, deadlock)
      const isRetryable = 
        error.code === '40001' || // serialization_failure
        error.code === '40P01' || // deadlock_detected
        error.code === '57P01';   // admin_shutdown (connection issue)
      
      if (isRetryable && attempt < (config.retries || 1)) {
        logger.warn({
          attempt,
          maxRetries: config.retries,
          errorCode: error.code,
          message: error.message
        }, 'Transaction retry after failure');
        
        incrementMetric('db_transaction_retry_total');
        await sleep(config.retryDelay || 100);
        continue;
      }
      
      logger.error({
        attempt,
        errorCode: error.code,
        message: error.message
      }, 'Transaction failed');
      
      incrementMetric('db_transaction_failure_total');
      throw error;
    }
  }
  
  throw lastError || new Error('Transaction failed after retries');
}

// =============================================================================
// FOR UPDATE LOCK (DB-H2)
// =============================================================================

/**
 * DB-H2: Acquire a row-level lock for update
 * Prevents concurrent modifications to the same row
 */
export async function selectForUpdate<T>(
  trx: Knex.Transaction,
  table: string,
  where: Record<string, any>,
  columns: string[] = ['*']
): Promise<T | undefined> {
  const result = await trx(table)
    .select(columns)
    .where(where)
    .forUpdate()
    .first();
  
  return result as T | undefined;
}

/**
 * DB-H2: Acquire multiple row-level locks for update
 */
export async function selectManyForUpdate<T>(
  trx: Knex.Transaction,
  table: string,
  where: Record<string, any>,
  columns: string[] = ['*']
): Promise<T[]> {
  const results = await trx(table)
    .select(columns)
    .where(where)
    .forUpdate();
  
  return results as T[];
}

/**
 * Try to acquire lock with NOWAIT - fails immediately if lock unavailable
 */
export async function selectForUpdateNoWait<T>(
  trx: Knex.Transaction,
  table: string,
  where: Record<string, any>,
  columns: string[] = ['*']
): Promise<T | undefined> {
  const result = await trx(table)
    .select(columns)
    .where(where)
    .forUpdate()
    .noWait()
    .first();
  
  return result as T | undefined;
}

/**
 * Try to acquire lock with SKIP LOCKED - skips rows that are locked
 */
export async function selectForUpdateSkipLocked<T>(
  trx: Knex.Transaction,
  table: string,
  where: Record<string, any>,
  columns: string[] = ['*'],
  limit?: number
): Promise<T[]> {
  let query = trx(table)
    .select(columns)
    .where(where)
    .forUpdate()
    .skipLocked();
  
  if (limit) {
    query = query.limit(limit);
  }
  
  return await query as T[];
}

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Execute batch insert within transaction
 */
export async function batchInsert<T>(
  trx: Knex.Transaction,
  table: string,
  rows: Partial<T>[],
  batchSize: number = 100
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await trx(table).insert(batch);
  }
}

/**
 * Execute batch update within transaction
 */
export async function batchUpdate<T>(
  trx: Knex.Transaction,
  table: string,
  updates: { where: Record<string, any>; data: Partial<T> }[]
): Promise<number> {
  let totalUpdated = 0;
  
  for (const { where, data } of updates) {
    const count = await trx(table).where(where).update(data);
    totalUpdated += count;
  }
  
  return totalUpdated;
}

// =============================================================================
// CONNECTION HEALTH (DB-H3, GD-H4)
// =============================================================================

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
  poolInfo: {
    used: number;
    free: number;
    pending: number;
  };
}> {
  const start = Date.now();
  
  try {
    await db.raw('SELECT 1');
    const latencyMs = Date.now() - start;
    
    const pool = db.client.pool;
    
    return {
      connected: true,
      latencyMs,
      poolInfo: {
        used: pool?.numUsed?.() ?? 0,
        free: pool?.numFree?.() ?? 0,
        pending: pool?.numPendingAcquires?.() ?? 0
      }
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      poolInfo: { used: 0, free: 0, pending: 0 }
    };
  }
}

/**
 * GD-H4: Gracefully handle database disconnect
 */
export async function handleDatabaseDisconnect(): Promise<void> {
  logger.warn('Database disconnect detected, attempting reconnection');
  
  try {
    // Destroy existing pool
    await db.destroy();
    
    // Wait before reconnecting
    await sleep(1000);
    
    // Reinitialize (Knex will create new pool on next query)
    await db.raw('SELECT 1');
    
    logger.info('Database reconnection successful');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Database reconnection failed');
    throw error;
  }
}

// =============================================================================
// SET TENANT CONTEXT FOR RLS
// =============================================================================

/**
 * Set tenant context for RLS policies
 */
export async function setTenantContext(
  trx: Knex.Transaction,
  tenantId: string
): Promise<void> {
  await trx.raw("SELECT set_config('app.current_tenant_id', ?, true)", [tenantId]);
}

/**
 * Set user context for RLS policies
 */
export async function setUserContext(
  trx: Knex.Transaction,
  userId: string
): Promise<void> {
  await trx.raw("SELECT set_config('app.current_user_id', ?, true)", [userId]);
}

/**
 * Set full RLS context
 */
export async function setRLSContext(
  trx: Knex.Transaction,
  context: { tenantId: string; userId?: string }
): Promise<void> {
  await setTenantContext(trx, context.tenantId);
  if (context.userId) {
    await setUserContext(trx, context.userId);
  }
}

// =============================================================================
// UPSERT HELPER
// =============================================================================

/**
 * Upsert (insert or update) with conflict handling
 */
export async function upsert<T>(
  trx: Knex.Transaction,
  table: string,
  data: Partial<T>,
  conflictColumns: string[],
  updateColumns: string[]
): Promise<T> {
  const result = await trx(table)
    .insert(data)
    .onConflict(conflictColumns)
    .merge(updateColumns.reduce((acc, col) => {
      acc[col] = (data as any)[col];
      return acc;
    }, {} as Record<string, any>))
    .returning('*');
  
  return result[0] as T;
}

// =============================================================================
// HELPERS
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

/**
 * Example: Create GDPR deletion request with transaction
 * 
 * await withTransaction(async (trx) => {
 *   await setTenantContext(trx, tenantId);
 *   
 *   // Lock the user record
 *   const user = await selectForUpdate(trx, 'users', { id: userId });
 *   if (!user) throw new Error('User not found');
 *   
 *   // Create deletion request
 *   await trx('gdpr_requests').insert({
 *     user_id: userId,
 *     type: 'deletion',
 *     status: 'pending'
 *   });
 *   
 *   // Update user status
 *   await trx('users').where({ id: userId }).update({ deletion_requested: true });
 * });
 */

export default {
  withTransaction,
  selectForUpdate,
  selectManyForUpdate,
  selectForUpdateNoWait,
  selectForUpdateSkipLocked,
  batchInsert,
  batchUpdate,
  checkDatabaseHealth,
  handleDatabaseDisconnect,
  setTenantContext,
  setUserContext,
  setRLSContext,
  upsert
};
