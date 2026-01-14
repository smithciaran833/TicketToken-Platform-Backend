/**
 * Database Operations Utilities for Marketplace Service
 * 
 * Issues Fixed:
 * - DB-2: No deadlock handling → Automatic retry on deadlock/serialization errors
 * - DB-H3: Default isolation level → Support for SERIALIZABLE transactions
 * 
 * Features:
 * - Automatic retry on deadlock (error 40001)
 * - Automatic retry on serialization failure (error 40P01)
 * - Configurable retry limits and backoff
 * - Transaction isolation level support
 */

import { Knex } from 'knex';
import { logger } from './logger';

const log = logger.child({ component: 'DbOperations' });

// PostgreSQL error codes for retryable errors
const RETRYABLE_ERROR_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available
]);

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Check if an error is a PostgreSQL error with a retryable code
 */
function isRetryableError(error: any): boolean {
  // Check PostgreSQL error code
  const errorCode = error?.code;
  if (typeof errorCode === 'string' && RETRYABLE_ERROR_CODES.has(errorCode)) {
    return true;
  }

  // Check for common deadlock-related error messages
  const errorMessage = error?.message?.toLowerCase() || '';
  if (
    errorMessage.includes('deadlock') ||
    errorMessage.includes('serialization failure') ||
    errorMessage.includes('could not serialize access')
  ) {
    return true;
  }

  return false;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoff(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number
): number {
  // Exponential backoff
  const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  // Add jitter (0-25% of delay)
  const jitter = delay * Math.random() * 0.25;
  // Cap at max delay
  return Math.min(delay + jitter, maxDelayMs);
}

/**
 * AUDIT FIX DB-2: Execute operation with automatic deadlock retry
 */
export async function withDeadlockRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if this is a retryable error
      if (!isRetryableError(error)) {
        throw error;
      }

      // Check if we've exhausted retries
      if (attempt > opts.maxRetries) {
        log.error('Exhausted retries for deadlock/serialization error', {
          attempts: attempt,
          errorCode: error.code,
          errorMessage: error.message
        });
        throw error;
      }

      // Calculate backoff delay
      const delay = calculateBackoff(
        attempt,
        opts.initialDelayMs,
        opts.maxDelayMs,
        opts.backoffMultiplier
      );

      log.warn('Retryable database error, attempting retry', {
        attempt,
        maxRetries: opts.maxRetries,
        errorCode: error.code,
        delayMs: Math.round(delay)
      });

      // Call retry callback if provided
      if (opts.onRetry) {
        opts.onRetry(attempt, error);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError || new Error('Unexpected error in withDeadlockRetry');
}

/**
 * AUDIT FIX DB-2/DB-H3: Execute transaction with retry and isolation level
 */
export async function transactionWithRetry<T>(
  knex: Knex,
  callback: (trx: Knex.Transaction) => Promise<T>,
  options: RetryOptions & { isolationLevel?: 'read committed' | 'repeatable read' | 'serializable' } = {}
): Promise<T> {
  const { isolationLevel, ...retryOptions } = options;

  return withDeadlockRetry(async () => {
    // Start transaction with isolation level if specified
    if (isolationLevel) {
      return knex.transaction(async (trx) => {
        // Set isolation level
        await trx.raw(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel.toUpperCase()}`);
        return callback(trx);
      });
    }

    // Standard transaction
    return knex.transaction(callback);
  }, retryOptions);
}

/**
 * Execute a query with retry logic for deadlocks
 */
export async function queryWithRetry<T>(
  queryFn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return withDeadlockRetry(queryFn, options);
}

/**
 * Batch insert with conflict handling
 */
export async function batchInsertWithRetry<T extends Record<string, any>>(
  knex: Knex,
  tableName: string,
  records: T[],
  options: RetryOptions & {
    batchSize?: number;
    onConflict?: string | string[];
    merge?: boolean;
  } = {}
): Promise<number> {
  const { batchSize = 100, onConflict, merge = false, ...retryOptions } = options;
  let insertedCount = 0;

  // Process in batches
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    await withDeadlockRetry(async () => {
      let query = knex(tableName).insert(batch);

      if (onConflict) {
        const conflictColumns = Array.isArray(onConflict) ? onConflict : [onConflict];
        if (merge) {
          query = query.onConflict(conflictColumns).merge();
        } else {
          query = query.onConflict(conflictColumns).ignore();
        }
      }

      const result = await query;
      insertedCount += (result as any)?.rowCount || batch.length;
    }, retryOptions);
  }

  return insertedCount;
}

/**
 * Update with optimistic locking
 */
export async function updateWithOptimisticLock<T>(
  knex: Knex,
  tableName: string,
  id: string | number,
  updates: Record<string, any>,
  currentVersion: number,
  options: RetryOptions = {}
): Promise<{ updated: boolean; newVersion?: number }> {
  return withDeadlockRetry(async () => {
    const newVersion = currentVersion + 1;

    const result = await knex(tableName)
      .where('id', id)
      .where('version', currentVersion)
      .update({
        ...updates,
        version: newVersion,
        updated_at: new Date()
      });

    if (result === 0) {
      // Either row doesn't exist or version mismatch
      const row = await knex(tableName).where('id', id).first();
      
      if (!row) {
        throw new Error(`Row with id ${id} not found in ${tableName}`);
      }
      
      if (row.version !== currentVersion) {
        throw new Error(`Optimistic lock conflict: expected version ${currentVersion}, found ${row.version}`);
      }
    }

    return { updated: result > 0, newVersion: result > 0 ? newVersion : undefined };
  }, options);
}

/**
 * Select for update with retry
 */
export async function selectForUpdateWithRetry<T>(
  knex: Knex,
  tableName: string,
  where: Record<string, any>,
  callback: (row: T, trx: Knex.Transaction) => Promise<void>,
  options: RetryOptions & { timeout?: number } = {}
): Promise<void> {
  const { timeout = 5000, ...retryOptions } = options;

  await transactionWithRetry(knex, async (trx) => {
    // Set lock timeout
    await trx.raw(`SET LOCAL lock_timeout = '${timeout}ms'`);

    // Select with row lock
    const row = await trx(tableName)
      .where(where)
      .forUpdate()
      .first() as T;

    if (!row) {
      throw new Error(`Row not found in ${tableName} with conditions: ${JSON.stringify(where)}`);
    }

    await callback(row, trx);
  }, { ...retryOptions, isolationLevel: 'read committed' });
}
