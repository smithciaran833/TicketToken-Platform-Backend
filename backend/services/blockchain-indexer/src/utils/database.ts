/**
 * Database Configuration with SSL Support
 * 
 * AUDIT FIX: SEC-2, DB-2 - Add SSL for production
 * AUDIT FIX: DB-5 - Add statement timeout
 * AUDIT FIX: ERR-9 - Add pool error handling
 * 
 * Based on blockchain-service database.ts pattern
 */

import { Pool, QueryResult, PoolClient } from 'pg';
import logger from './logger';

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

// Query timeout in milliseconds (30 seconds default)
const QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '30000', 10);

// Slow query threshold for logging (1 second)
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.DB_SLOW_QUERY_THRESHOLD_MS || '1000', 10);

// Connection pool settings
const POOL_MIN = parseInt(process.env.DB_POOL_MIN || '2', 10);
const POOL_MAX = parseInt(process.env.DB_POOL_MAX || '20', 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
const CONNECTION_TIMEOUT_MS = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '10000', 10);

// =============================================================================
// DATABASE CONFIGURATION VALIDATION
// =============================================================================

/**
 * Validate required environment variables in production
 * AUDIT FIX: Prevent insecure default passwords
 */
function validateDatabaseConfig(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    const missing = requiredVars.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required database environment variables in production: ${missing.join(', ')}`);
    }
  }
  
  // Never allow default password in any environment
  const password = process.env.DB_PASSWORD;
  if (password === 'postgres' || password === 'password' || password === '123456') {
    if (isProduction) {
      throw new Error('Insecure default database password detected in production');
    } else {
      logger.warn('⚠️  Using insecure default database password - acceptable only in development');
    }
  }
}

/**
 * Get SSL configuration based on environment
 * AUDIT FIX: SEC-2, DB-2 - Add SSL for production
 */
function getSSLConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
  const isProduction = process.env.NODE_ENV === 'production';
  const sslEnabled = process.env.DB_SSL === 'true' || isProduction;
  
  if (!sslEnabled) {
    return false;
  }
  
  return {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    ca: process.env.DB_CA_CERT || undefined
  };
}

// =============================================================================
// POOL INITIALIZATION
// =============================================================================

// Validate configuration on module load
validateDatabaseConfig();

const pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'svc_blockchain_indexer',
    password: process.env.DB_PASSWORD,
    // AUDIT FIX: SEC-2, DB-2 - SSL configuration
    ssl: getSSLConfig(),
    // Pool configuration
    max: POOL_MAX,
    min: POOL_MIN,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    // AUDIT FIX: DB-5 - Statement timeout for queries
    statement_timeout: QUERY_TIMEOUT_MS
});

// =============================================================================
// POOL EVENT HANDLERS
// =============================================================================

pool.on('error', (err: Error, client: PoolClient) => {
    logger.error({ 
      error: err.message,
      stack: err.stack 
    }, 'Unexpected database pool error');
});

pool.on('connect', (client: PoolClient) => {
    logger.debug('New database connection established');
});

pool.on('acquire', (client: PoolClient) => {
    logger.debug('Client acquired from pool');
});

pool.on('remove', (client: PoolClient) => {
    logger.debug('Client removed from pool');
});

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

/**
 * Execute a query with timing and slow query detection
 */
export const query = async (text: string, params?: any[]): Promise<QueryResult> => {
    const start = Date.now();
    
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      
      // AUDIT FIX: Log slow queries
      if (duration > SLOW_QUERY_THRESHOLD_MS) {
          logger.warn({ 
            query: sanitizeQuery(text), 
            duration,
            threshold: SLOW_QUERY_THRESHOLD_MS,
            rowCount: res.rowCount
          }, 'Slow query detected');
      }
      
      return res;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error({
        error: (error as Error).message,
        query: sanitizeQuery(text),
        duration
      }, 'Database query failed');
      throw error;
    }
};

/**
 * Execute a query with explicit timeout
 */
export const queryWithTimeout = async (
  text: string, 
  params?: any[], 
  timeoutMs: number = QUERY_TIMEOUT_MS
): Promise<QueryResult> => {
  const client = await pool.connect();
  
  try {
    // Set statement timeout for this query
    await client.query(`SET statement_timeout = ${timeoutMs}`);
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
};

/**
 * Get a client from the pool for transaction use
 */
export const getClient = (): Promise<PoolClient> => pool.connect();

/**
 * Execute function within a database transaction
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute function within a tenant context (RLS enabled)
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  // Validate tenant ID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error('Invalid tenant ID format');
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    // Set RLS context
    await client.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
    
    const result = await fn(client);
    
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
// HEALTH CHECK
// =============================================================================

/**
 * Get database health status
 */
export async function getDatabaseHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  poolInfo: { total: number; idle: number; waiting: number };
  ssl: boolean;
}> {
  const start = Date.now();
  
  try {
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - start;
    
    return {
      healthy: true,
      latencyMs,
      poolInfo: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      },
      ssl: getSSLConfig() !== false
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      poolInfo: { total: 0, idle: 0, waiting: 0 },
      ssl: false
    };
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Sanitize SQL query for logging (redact sensitive data)
 */
function sanitizeQuery(sql: string): string {
  const maxLength = 500;
  let sanitized = sql.length > maxLength ? sql.substring(0, maxLength) + '...' : sql;
  // Redact long string literals (potential sensitive data)
  sanitized = sanitized.replace(/'[^']{20,}'/g, "'[REDACTED]'");
  return sanitized;
}

/**
 * Close all database connections
 */
export async function closeDatabase(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}

export { pool };

export default { query, pool, getClient, queryWithTimeout, withTransaction, withTenantContext, getDatabaseHealth, closeDatabase };
