/**
 * Database Transaction Utilities
 * 
 * HIGH FIX: Provides consistent FOR UPDATE locking and SERIALIZABLE isolation
 * for critical payment operations to prevent race conditions and double-spending.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'DatabaseTransaction' });

// =============================================================================
// TRANSACTION ISOLATION LEVELS
// =============================================================================

export enum IsolationLevel {
  /**
   * Default isolation level - suitable for most read operations
   */
  READ_COMMITTED = 'READ COMMITTED',
  
  /**
   * Prevents dirty reads - suitable for reports and analytics
   */
  REPEATABLE_READ = 'REPEATABLE READ',
  
  /**
   * Highest isolation level - REQUIRED for financial operations
   * Prevents phantom reads and ensures complete transaction isolation
   */
  SERIALIZABLE = 'SERIALIZABLE',
}

// =============================================================================
// LOCK MODES
// =============================================================================

export enum LockMode {
  /**
   * Shared lock - allows other transactions to read but not write
   */
  FOR_SHARE = 'FOR SHARE',
  
  /**
   * Exclusive lock - prevents other transactions from reading or writing
   * REQUIRED for payment processing, refunds, and balance updates
   */
  FOR_UPDATE = 'FOR UPDATE',
  
  /**
   * Exclusive lock that skips locked rows
   * Useful for queue processing where you want to pick unlocked items
   */
  FOR_UPDATE_SKIP_LOCKED = 'FOR UPDATE SKIP LOCKED',
  
  /**
   * Exclusive lock that fails immediately if row is locked
   * Useful for operations that shouldn't wait
   */
  FOR_UPDATE_NOWAIT = 'FOR UPDATE NOWAIT',
}

// =============================================================================
// TRANSACTION OPTIONS
// =============================================================================

export interface TransactionOptions {
  /**
   * Transaction isolation level
   */
  isolationLevel?: IsolationLevel;
  
  /**
   * Maximum time to wait for locks (milliseconds)
   */
  lockTimeout?: number;
  
  /**
   * Maximum time for entire transaction (milliseconds)
   */
  statementTimeout?: number;
  
  /**
   * Whether to set read-only mode
   */
  readOnly?: boolean;
  
  /**
   * Whether to set deferrable mode (for long-running read-only queries)
   */
  deferrable?: boolean;
  
  /**
   * Tenant ID for RLS context
   */
  tenantId?: string;
  
  /**
   * Number of retry attempts for serialization failures
   */
  maxRetries?: number;
  
  /**
   * Base delay between retries (milliseconds)
   */
  retryDelayMs?: number;
}

// =============================================================================
// QUERY WITH LOCK
// =============================================================================

/**
 * Build a SELECT query with appropriate locking
 */
export function buildLockedQuery(
  baseQuery: string,
  lockMode: LockMode = LockMode.FOR_UPDATE
): string {
  // Remove any trailing semicolons
  const cleanQuery = baseQuery.trim().replace(/;+$/, '');
  return `${cleanQuery} ${lockMode}`;
}

/**
 * Query builder for locked selections
 */
export class LockedQuery {
  private baseQuery: string;
  private params: unknown[];
  private lockMode: LockMode;
  private additionalClauses: string[] = [];

  constructor(baseQuery: string, params: unknown[] = []) {
    this.baseQuery = baseQuery;
    this.params = params;
    this.lockMode = LockMode.FOR_UPDATE;
  }

  /**
   * Set the lock mode
   */
  withLock(mode: LockMode): this {
    this.lockMode = mode;
    return this;
  }

  /**
   * Add FOR UPDATE lock (most common for payments)
   */
  forUpdate(): this {
    this.lockMode = LockMode.FOR_UPDATE;
    return this;
  }

  /**
   * Add FOR UPDATE SKIP LOCKED (for queue processing)
   */
  forUpdateSkipLocked(): this {
    this.lockMode = LockMode.FOR_UPDATE_SKIP_LOCKED;
    return this;
  }

  /**
   * Add FOR UPDATE NOWAIT (fails immediately if locked)
   */
  forUpdateNowait(): this {
    this.lockMode = LockMode.FOR_UPDATE_NOWAIT;
    return this;
  }

  /**
   * Add FOR SHARE lock
   */
  forShare(): this {
    this.lockMode = LockMode.FOR_SHARE;
    return this;
  }

  /**
   * Build the final query string
   */
  build(): { query: string; params: unknown[] } {
    const cleanQuery = this.baseQuery.trim().replace(/;+$/, '');
    const query = `${cleanQuery} ${this.lockMode}`;
    return { query, params: this.params };
  }

  /**
   * Execute the query on a client
   */
  async execute(client: PoolClient): Promise<QueryResult<any>> {
    const { query, params } = this.build();
    return client.query(query, params);
  }
}

// =============================================================================
// TRANSACTION MANAGER
// =============================================================================

export class TransactionManager {
  private pool: Pool;
  private defaultOptions: TransactionOptions;

  constructor(pool: Pool, defaultOptions: TransactionOptions = {}) {
    this.pool = pool;
    this.defaultOptions = {
      isolationLevel: IsolationLevel.READ_COMMITTED,
      lockTimeout: 10000,
      statementTimeout: 30000,
      maxRetries: 3,
      retryDelayMs: 100,
      ...defaultOptions,
    };
  }

  /**
   * Execute a function within a transaction
   * Automatically handles commit/rollback
   */
  async withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const opts = { ...this.defaultOptions, ...options };
    const txId = uuidv4().slice(0, 8);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= (opts.maxRetries || 1); attempt++) {
      const client = await this.pool.connect();
      
      try {
        // Start transaction with isolation level
        await this.beginTransaction(client, opts, txId);
        
        // Execute the function
        const result = await fn(client);
        
        // Commit
        await client.query('COMMIT');
        
        log.debug({ txId, attempt }, 'Transaction committed');
        
        return result;
      } catch (error: unknown) {
        await client.query('ROLLBACK').catch(() => {});
        
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;
        
        // Check if this is a serialization failure (retry-able)
        const isSerializationFailure = 
          err.message.includes('could not serialize') ||
          err.message.includes('deadlock detected') ||
          (err as any).code === '40001' ||
          (err as any).code === '40P01';
        
        if (isSerializationFailure && attempt < (opts.maxRetries || 1)) {
          log.warn({
            txId,
            attempt,
            maxRetries: opts.maxRetries,
            error: err.message,
          }, 'Transaction serialization failure, retrying');
          
          // Exponential backoff
          const delay = (opts.retryDelayMs || 100) * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        log.error({
          txId,
          attempt,
          error: err.message,
          stack: err.stack,
        }, 'Transaction failed');
        
        throw error;
      } finally {
        client.release();
      }
    }

    throw lastError || new Error('Transaction failed after all retries');
  }

  /**
   * Execute a SERIALIZABLE transaction (for critical payment operations)
   */
  async withSerializableTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
    options: Omit<TransactionOptions, 'isolationLevel'> = {}
  ): Promise<T> {
    return this.withTransaction(fn, {
      ...options,
      isolationLevel: IsolationLevel.SERIALIZABLE,
      maxRetries: options.maxRetries ?? 5, // More retries for serializable
    });
  }

  /**
   * Execute a read-only transaction with REPEATABLE READ isolation
   */
  async withReadOnlyTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
    options: Omit<TransactionOptions, 'readOnly' | 'isolationLevel'> = {}
  ): Promise<T> {
    return this.withTransaction(fn, {
      ...options,
      isolationLevel: IsolationLevel.REPEATABLE_READ,
      readOnly: true,
    });
  }

  /**
   * Begin transaction with appropriate settings
   */
  private async beginTransaction(
    client: PoolClient,
    options: TransactionOptions,
    txId: string
  ): Promise<void> {
    // Build BEGIN statement
    const beginParts = ['BEGIN'];
    
    if (options.isolationLevel) {
      beginParts.push(`ISOLATION LEVEL ${options.isolationLevel}`);
    }
    
    if (options.readOnly) {
      beginParts.push('READ ONLY');
    }
    
    if (options.deferrable && options.readOnly) {
      beginParts.push('DEFERRABLE');
    }
    
    await client.query(beginParts.join(' '));
    
    // Set timeouts
    if (options.lockTimeout) {
      await client.query(`SET LOCAL lock_timeout = '${options.lockTimeout}ms'`);
    }
    
    if (options.statementTimeout) {
      await client.query(`SET LOCAL statement_timeout = '${options.statementTimeout}ms'`);
    }
    
    // Set tenant context for RLS
    if (options.tenantId) {
      await client.query(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        [options.tenantId]
      );
    }
    
    log.debug({
      txId,
      isolationLevel: options.isolationLevel,
      readOnly: options.readOnly,
      tenantId: options.tenantId,
    }, 'Transaction started');
  }
}

// =============================================================================
// PAYMENT-SPECIFIC TRANSACTION HELPERS
// =============================================================================

/**
 * Select and lock a payment record for update
 */
export async function selectPaymentForUpdate(
  client: PoolClient,
  paymentId: string,
  tenantId: string
): Promise<any | null> {
  const result = await client.query(
    `SELECT * FROM payment_transactions 
     WHERE id = $1 AND tenant_id = $2 
     FOR UPDATE`,
    [paymentId, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Select and lock multiple payment records for update
 */
export async function selectPaymentsForUpdate(
  client: PoolClient,
  paymentIds: string[],
  tenantId: string
): Promise<any[]> {
  if (paymentIds.length === 0) return [];
  
  const result = await client.query(
    `SELECT * FROM payment_transactions 
     WHERE id = ANY($1) AND tenant_id = $2 
     ORDER BY created_at ASC
     FOR UPDATE`,
    [paymentIds, tenantId]
  );
  return result.rows;
}

/**
 * Select and lock a refund record for update
 */
export async function selectRefundForUpdate(
  client: PoolClient,
  refundId: string,
  tenantId: string
): Promise<any | null> {
  const result = await client.query(
    `SELECT * FROM payment_refunds 
     WHERE id = $1 AND tenant_id = $2 
     FOR UPDATE`,
    [refundId, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Select and lock a venue balance for update
 */
export async function selectVenueBalanceForUpdate(
  client: PoolClient,
  venueId: string,
  tenantId: string
): Promise<any | null> {
  const result = await client.query(
    `SELECT * FROM venue_balances 
     WHERE venue_id = $1 AND tenant_id = $2 
     FOR UPDATE`,
    [venueId, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Select pending transfers for processing (skip locked)
 */
export async function selectPendingTransfersForProcessing(
  client: PoolClient,
  limit: number = 10
): Promise<any[]> {
  const result = await client.query(
    `SELECT * FROM pending_transfers 
     WHERE status = 'pending' 
       AND (retry_after IS NULL OR retry_after < NOW())
     ORDER BY created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit]
  );
  return result.rows;
}

/**
 * Select order for payment processing with lock
 */
export async function selectOrderForPayment(
  client: PoolClient,
  orderId: string,
  tenantId: string
): Promise<any | null> {
  const result = await client.query(
    `SELECT o.*, pi.id as payment_intent_id, pi.status as payment_status
     FROM orders o
     LEFT JOIN payment_intents pi ON o.id = pi.order_id
     WHERE o.id = $1 AND o.tenant_id = $2
     FOR UPDATE OF o`,
    [orderId, tenantId]
  );
  return result.rows[0] || null;
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

let transactionManager: TransactionManager | null = null;

/**
 * Get or create the transaction manager
 */
export function getTransactionManager(pool: Pool): TransactionManager {
  if (!transactionManager) {
    transactionManager = new TransactionManager(pool, {
      isolationLevel: IsolationLevel.READ_COMMITTED,
      lockTimeout: 10000,
      statementTimeout: 30000,
      maxRetries: 3,
    });
  }
  return transactionManager;
}

/**
 * Create a new transaction manager with custom options
 */
export function createTransactionManager(
  pool: Pool,
  options?: TransactionOptions
): TransactionManager {
  return new TransactionManager(pool, options);
}

// =============================================================================
// STANDALONE TRANSACTION FUNCTIONS
// =============================================================================

import { DatabaseService } from '../services/databaseService';

/**
 * Execute a function within a SERIALIZABLE transaction
 * Standalone function for convenience (uses DatabaseService pool)
 */
export async function withSerializableTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  options?: Omit<TransactionOptions, 'isolationLevel'>
): Promise<T> {
  const pool = DatabaseService.getPool();
  const manager = getTransactionManager(pool);
  return manager.withSerializableTransaction(fn, options);
}

/**
 * Execute a function within a transaction with configurable isolation
 * Standalone function for convenience (uses DatabaseService pool)
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  const pool = DatabaseService.getPool();
  const manager = getTransactionManager(pool);
  return manager.withTransaction(fn, options);
}

/**
 * Execute a read-only transaction
 * Standalone function for convenience (uses DatabaseService pool)
 */
export async function withReadOnlyTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  options?: Omit<TransactionOptions, 'readOnly' | 'isolationLevel'>
): Promise<T> {
  const pool = DatabaseService.getPool();
  const manager = getTransactionManager(pool);
  return manager.withReadOnlyTransaction(fn, options);
}
