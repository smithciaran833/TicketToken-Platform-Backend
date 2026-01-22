import knex, { Knex } from 'knex';
import { promisify } from 'util';
import { resolve4 } from 'dns';
import { config } from './index';
import { pino } from 'pino';
import pg from 'pg';

const logger = pino({ name: 'database' });

/**
 * PostgreSQL error codes for retry logic
 */
const PG_ERROR_CODES = {
  DEADLOCK_DETECTED: '40P01',
  SERIALIZATION_FAILURE: '40001',
  LOCK_NOT_AVAILABLE: '55P03',
} as const;

/**
 * Default deadlock retry configuration
 */
const DEADLOCK_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
};
const resolveDns = promisify(resolve4);

// Configure pg to parse NUMERIC and DECIMAL types as numbers instead of strings
// Type IDs: 1700 = NUMERIC/DECIMAL
pg.types.setTypeParser(1700, (val: string) => parseFloat(val));

// Query timeout (30 seconds)
const QUERY_TIMEOUT_MS = 30000;

/**
 * LOW FIX (Issue #9): Private database connection variable
 * Prevents external code from accidentally reassigning the connection
 */
let _db: Knex;

/**
 * LOW FIX (Issue #9): Getter function for database connection
 * Use this instead of directly importing `db` to prevent accidental reassignment
 * 
 * @returns The Knex database connection
 * @throws Error if database is not initialized
 */
export const getDb = (): Knex => {
  if (!_db) {
    throw new Error('Database not initialized. Call connectDatabase() first.');
  }
  return _db;
};

/**
 * @deprecated Use getDb() instead. This export will be removed in a future version.
 */
export let db: Knex;

/**
 * Database error types for proper HTTP status mapping
 */
export class DatabaseConnectionError extends Error {
  public readonly statusCode = 503;
  public readonly code = 'DATABASE_CONNECTION_ERROR';
  
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

export class DatabaseTimeoutError extends Error {
  public readonly statusCode = 504;
  public readonly code = 'DATABASE_TIMEOUT';
  
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'DatabaseTimeoutError';
  }
}

/**
 * Wrap a database operation with timeout and connection error handling
 * Returns proper 503/504 errors for connection/timeout issues
 */
export async function withDatabaseErrorHandling<T>(
  operation: () => Promise<T>,
  operationName = 'database operation'
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // Connection refused / connection lost
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        error.message?.includes('connection') ||
        error.message?.includes('pool')) {
      logger.error({ error, operationName }, 'Database connection error');
      throw new DatabaseConnectionError(
        `Database unavailable: ${operationName}`,
        error
      );
    }
    
    // Query timeout
    if (error.code === '57014' || // PostgreSQL query_canceled
        error.message?.includes('timeout') ||
        error.message?.includes('canceling statement')) {
      logger.error({ error, operationName }, 'Database query timeout');
      throw new DatabaseTimeoutError(
        `Database query timeout: ${operationName}`,
        error
      );
    }
    
    // Re-throw other errors
    throw error;
  }
}

export async function connectDatabase() {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 2000; // Base delay in milliseconds
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`Database connection attempt ${attempt}/${MAX_RETRIES}...`);
      
      // Try DNS resolution, but fall back to hostname if it fails
      let host = config.database.host;
      try {
        const dbIps = await resolveDns(config.database.host);
        host = dbIps[0];
        logger.info(`Resolved ${config.database.host} to ${host}`);
      } catch (dnsError) {
        logger.warn({ error: dnsError }, `DNS resolution failed, using hostname directly: ${config.database.host}`);
        // Continue with original hostname
      }
      
      // Create database connection
      _db = knex({
        client: 'postgresql',
        connection: {
          host, // Use resolved IP or original hostname
          port: config.database.port,
          user: config.database.user,
          password: config.database.password,
          database: config.database.database,
          // CRITICAL FIX: TLS certificate validation enabled for production
          // Note: In production, ensure DATABASE_CA_CERT env var is set if using self-signed certs
          ssl: config.environment === 'production' ? { 
            rejectUnauthorized: true,
            // Optionally specify CA cert for self-signed certificates:
            // ca: process.env.DATABASE_CA_CERT
          } : false,
          // CRITICAL FIX: Query timeout (DB3/DB4) - prevents long-running queries
          statement_timeout: QUERY_TIMEOUT_MS,
          query_timeout: QUERY_TIMEOUT_MS
        },
        pool: {
          // AUDIT FIX (LOW): pool.min = 0 for better elasticity
          // Allows pool to shrink to 0 during low traffic, reducing resource usage
          min: 0,
          max: 10,
          acquireTimeoutMillis: 30000,
          idleTimeoutMillis: 30000,
          propagateCreateError: true, // Changed to true to properly surface connection errors
          // CRITICAL FIX: Validate connections before use
          afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
            // Set statement timeout on each new connection
            conn.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`, (err: Error | null) => {
              done(err, conn);
            });
          }
        },
        migrations: {
          directory: './src/migrations',
          tableName: 'knex_migrations_event'
        }
      });

      // Test connection
      await _db.raw('SELECT 1');
      
      // Set the deprecated export for backward compatibility
      db = _db;
      
      logger.info('Database connection established successfully');
      return; // Success! Exit the retry loop
      
    } catch (error) {
      logger.error({ error }, `Connection attempt ${attempt} failed`);
      
      // If we've exhausted all retries, throw the error
      if (attempt === MAX_RETRIES) {
        logger.error('Failed to connect to database after all retries');
        throw error;
      }
      
      // Wait before retrying with exponential backoff
      const delayMs = RETRY_DELAY * attempt;
      logger.info(`Waiting ${delayMs}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// Keep legacy function for backward compatibility
export const createDatabaseConnection = (): Knex => {
  return getDb();
};

/**
 * Check if an error is a retryable PostgreSQL error (deadlock, serialization, lock timeout)
 * 
 * @param error - The error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: any): boolean {
  const retryableCodes = [
    PG_ERROR_CODES.DEADLOCK_DETECTED,
    PG_ERROR_CODES.SERIALIZATION_FAILURE,
    PG_ERROR_CODES.LOCK_NOT_AVAILABLE,
  ];
  return error?.code && retryableCodes.includes(error.code);
}

/**
 * Calculate exponential backoff delay with jitter
 * 
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay cap
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter (random 0-50% of delay)
  const jitter = cappedDelay * Math.random() * 0.5;
  return Math.floor(cappedDelay + jitter);
}

/**
 * AUDIT FIX (DB5): Execute a database operation with automatic retry on deadlock.
 * 
 * Handles PostgreSQL error 40P01 (deadlock_detected) by retrying the operation
 * with exponential backoff and jitter.
 * 
 * @param operation - Async function to execute
 * @param options - Retry configuration
 * @returns Result of the operation
 * @throws Last error if all retries are exhausted
 * 
 * @example
 * ```typescript
 * const result = await withDeadlockRetry(async () => {
 *   return await db.transaction(async (trx) => {
 *     // Your transaction logic here
 *   });
 * });
 * ```
 */
export async function withDeadlockRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const {
    maxRetries = DEADLOCK_RETRY_CONFIG.maxRetries,
    baseDelayMs = DEADLOCK_RETRY_CONFIG.baseDelayMs,
    maxDelayMs = DEADLOCK_RETRY_CONFIG.maxDelayMs,
    operationName = 'database operation',
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Only retry on deadlock/serialization errors
      if (!isRetryableError(error)) {
        throw error;
      }

      // Log the retry attempt
      logger.warn({
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        errorCode: error.code,
        operationName,
      }, `Retryable database error, attempting retry`);

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        logger.error({
          errorCode: error.code,
          operationName,
          totalAttempts: attempt + 1,
        }, 'Database operation failed after all retry attempts');
        break;
      }

      // Calculate delay and wait
      const delayMs = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Execute a database transaction with automatic deadlock retry.
 * 
 * Combines transaction handling with deadlock retry logic for common patterns.
 * 
 * @param callback - Transaction callback
 * @param options - Retry configuration
 * @returns Result of the transaction
 * 
 * @example
 * ```typescript
 * const result = await withTransactionRetry(async (trx) => {
 *   await trx('events').where({ id }).update({ status: 'PUBLISHED' });
 *   await trx('event_logs').insert({ event_id: id, action: 'published' });
 *   return trx('events').where({ id }).first();
 * });
 * ```
 */
export async function withTransactionRetry<T>(
  callback: (trx: Knex.Transaction) => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  return withDeadlockRetry(
    () => getDb().transaction(callback),
    options
  );
}
