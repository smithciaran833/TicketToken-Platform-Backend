/**
 * Enhanced Database Configuration for Transfer Service
 * 
 * AUDIT FIXES:
 * - DB-H1: Missing connection pool config → Proper pool settings
 * - DB-H2: No database SSL → SSL configuration
 * - DB-H3: No statement timeout → Query timeouts
 * - ERR-H3: No pool error handler → Pool event handlers
 * - ERR-H4: No query timeouts → Statement timeout
 * - GD-H2: No circuit breaker on database → Pool circuit breaker
 * 
 * Features:
 * - Connection pool with min/max connections
 * - SSL/TLS encryption in production
 * - Statement and connection timeouts
 * - Pool error handling and logging
 * - Health check queries
 * - Circuit breaker integration
 */

import { Pool, PoolConfig, PoolClient, QueryResult, QueryResultRow } from 'pg';
import logger from '../utils/logger';
import { CircuitBreaker, CircuitState } from '../utils/circuit-breaker';
import { DatabaseConnectionError, DatabaseError } from '../errors';

// =============================================================================
// CONFIGURATION
// =============================================================================

const isProduction = process.env.NODE_ENV === 'production';

// Parse SSL configuration
function getSSLConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
  if (!isProduction && process.env.DB_SSL !== 'true') {
    return false;
  }
  
  return {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    ...(process.env.DB_SSL_CA && { ca: process.env.DB_SSL_CA })
  };
}

// Database configuration
const DB_CONFIG: PoolConfig = {
  // Connection settings
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'transfer_service',
  user: process.env.DB_USER || 'transfer_service',
  password: process.env.DB_PASSWORD,
  
  // AUDIT FIX DB-H1: Connection pool configuration
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  
  // Connection timeout (how long to wait for a connection from pool)
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
  
  // AUDIT FIX DB-H3, ERR-H4: Query/statement timeout
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10),
  
  // Idle timeout (how long a connection can sit idle before being closed)
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  
  // AUDIT FIX DB-H2: SSL configuration
  ssl: getSSLConfig(),
  
  // Application name for monitoring
  application_name: 'transfer-service'
};

// =============================================================================
// POOL MANAGEMENT
// =============================================================================

let pool: Pool | null = null;
let dbCircuitBreaker: CircuitBreaker | null = null;

/**
 * Create and configure the database pool
 */
export function createPool(): Pool {
  if (pool) {
    return pool;
  }
  
  pool = new Pool(DB_CONFIG);
  
  // AUDIT FIX ERR-H3: Pool error handlers
  pool.on('error', (err: Error, _client: PoolClient) => {
    logger.error({
      err,
      message: 'Unexpected database pool error'
    }, 'Database pool error');
    
    // Update circuit breaker on pool errors
    if (dbCircuitBreaker) {
      dbCircuitBreaker.recordFailure();
    }
  });
  
  pool.on('connect', (client: PoolClient) => {
    logger.debug('New database connection established');
    
    // Set session-level settings on each new connection
    client.query(`
      SET statement_timeout = '${DB_CONFIG.statement_timeout}';
      SET lock_timeout = '5000';
      SET idle_in_transaction_session_timeout = '60000';
    `).catch(err => {
      logger.warn({ err }, 'Failed to set session parameters');
    });
  });
  
  pool.on('acquire', () => {
    logger.trace('Database connection acquired from pool');
  });
  
  pool.on('release', () => {
    logger.trace('Database connection released to pool');
  });
  
  pool.on('remove', () => {
    logger.debug('Database connection removed from pool');
  });
  
  // Initialize circuit breaker
  dbCircuitBreaker = new CircuitBreaker({
    name: 'database',
    failureThreshold: 5,
    resetTimeout: 30000,
    halfOpenRequests: 3,
    onStateChange: (state: CircuitState) => {
      logger.warn(`Database circuit breaker state changed to: ${state}`);
    }
  });
  
  logger.info('Database pool created', {
    host: DB_CONFIG.host,
    database: DB_CONFIG.database,
    poolMin: DB_CONFIG.min,
    poolMax: DB_CONFIG.max,
    ssl: !!DB_CONFIG.ssl
  });
  
  return pool;
}

/**
 * Get the database pool (creates if not exists)
 */
export function getPool(): Pool {
  if (!pool) {
    return createPool();
  }
  return pool;
}

/**
 * AUDIT FIX GD-H2: Execute query with circuit breaker
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  values?: any[],
  options?: { timeout?: number }
): Promise<QueryResult<T>> {
  const queryPool = getPool();
  
  // Check circuit breaker
  if (dbCircuitBreaker && !dbCircuitBreaker.canExecute()) {
    throw new DatabaseConnectionError('Database circuit breaker is open');
  }
  
  const startTime = Date.now();
  
  try {
    let queryText = text;
    
    // Apply custom timeout if provided
    if (options?.timeout) {
      queryText = `SET LOCAL statement_timeout = '${options.timeout}'; ${text}`;
    }
    
    const result = await queryPool.query<T>(queryText, values);
    
    const duration = Date.now() - startTime;
    
    // Record success for circuit breaker
    if (dbCircuitBreaker) {
      dbCircuitBreaker.recordSuccess();
    }
    
    // Log slow queries
    if (duration > 1000) {
      logger.warn({
        queryText: text.substring(0, 200),
        duration,
        rowCount: result.rowCount
      }, 'Slow database query');
    }
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Record failure for circuit breaker
    if (dbCircuitBreaker) {
      dbCircuitBreaker.recordFailure();
    }
    
    const err = error as Error;
    
    logger.error({
      err,
      queryText: text.substring(0, 200),
      duration
    }, 'Database query failed');
    
    // Wrap and rethrow
    throw new DatabaseError({
      message: err.message,
      query: text.substring(0, 200),
      cause: err
    });
  }
}

/**
 * Get a client from the pool with circuit breaker check
 */
export async function getClient(): Promise<PoolClient> {
  const queryPool = getPool();
  
  // Check circuit breaker
  if (dbCircuitBreaker && !dbCircuitBreaker.canExecute()) {
    throw new DatabaseConnectionError('Database circuit breaker is open');
  }
  
  try {
    const client = await queryPool.connect();
    
    if (dbCircuitBreaker) {
      dbCircuitBreaker.recordSuccess();
    }
    
    return client;
    
  } catch (error) {
    if (dbCircuitBreaker) {
      dbCircuitBreaker.recordFailure();
    }
    
    throw new DatabaseConnectionError('Failed to get database connection');
  }
}

/**
 * Execute a transaction with automatic rollback on error
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
    
  } finally {
    client.release();
  }
}

// =============================================================================
// HEALTH CHECKS
// =============================================================================

/**
 * Check database connectivity
 */
export async function checkHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  poolSize: number;
  idleConnections: number;
  waitingClients: number;
  circuitState?: CircuitState;
}> {
  const queryPool = getPool();
  const startTime = Date.now();
  
  try {
    await queryPool.query('SELECT 1');
    
    return {
      healthy: true,
      latencyMs: Date.now() - startTime,
      poolSize: queryPool.totalCount,
      idleConnections: queryPool.idleCount,
      waitingClients: queryPool.waitingCount,
      circuitState: dbCircuitBreaker?.getState()
    };
    
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - startTime,
      poolSize: queryPool.totalCount,
      idleConnections: queryPool.idleCount,
      waitingClients: queryPool.waitingCount,
      circuitState: dbCircuitBreaker?.getState()
    };
  }
}

/**
 * Get pool statistics
 */
export function getPoolStats(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  circuitState?: CircuitState;
} {
  const queryPool = getPool();
  
  return {
    totalCount: queryPool.totalCount,
    idleCount: queryPool.idleCount,
    waitingCount: queryPool.waitingCount,
    circuitState: dbCircuitBreaker?.getState()
  };
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Close the database pool gracefully
 */
export async function closePool(): Promise<void> {
  if (pool) {
    logger.info('Closing database pool...');
    await pool.end();
    pool = null;
    dbCircuitBreaker = null;
    logger.info('Database pool closed');
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createPool,
  getPool,
  query,
  getClient,
  withTransaction,
  checkHealth,
  getPoolStats,
  closePool,
  DB_CONFIG
};
