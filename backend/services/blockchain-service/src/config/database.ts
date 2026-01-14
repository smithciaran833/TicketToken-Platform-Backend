import { Pool, PoolClient } from 'pg';
import knex, { Knex } from 'knex';
import { logger } from '../utils/logger';

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
const ACQUIRE_TIMEOUT_MS = parseInt(process.env.DB_ACQUIRE_TIMEOUT_MS || '30000', 10);

let pool: Pool | null = null;

// =============================================================================
// DATABASE CONFIGURATION VALIDATION
// =============================================================================

/**
 * Validate required environment variables in production
 * Issue #70: Remove insecure default password
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
 * Issue #72, #79: Add SSL for production
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

/**
 * Get database connection configuration
 */
function getConnectionConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: getSSLConfig()
  };
}

// =============================================================================
// PG POOL (for raw queries)
// =============================================================================

/**
 * Initialize the pg Pool
 * Issue #78: Add pool config
 * Issue #9, #31: Transaction support
 */
export async function initializePool(): Promise<Pool> {
  // Validate config before attempting connection
  validateDatabaseConfig();

  pool = new Pool({
    ...getConnectionConfig(),
    max: POOL_MAX,
    min: POOL_MIN,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    // Statement timeout for queries
    statement_timeout: QUERY_TIMEOUT_MS
  });

  // Pool error handler - Issue #33 (pool config)
  pool.on('error', (err: Error, client: PoolClient) => {
    logger.error('Unexpected database pool error', {
      error: err.message,
      stack: err.stack
    });
  });

  pool.on('connect', (client: PoolClient) => {
    logger.debug('New database connection established');
  });

  // Test connection
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as now, current_database() as db');
    client.release();
    
    logger.info('✅ Database pool connected', {
      database: result.rows[0].db,
      serverTime: result.rows[0].now,
      poolSize: POOL_MAX,
      ssl: getSSLConfig() !== false
    });
    
    return pool;
  } catch (error: any) {
    logger.error('❌ Database connection failed', {
      error: error.message,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME
    });
    throw error;
  }
}

/**
 * Get the pg Pool instance
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializePool() first.');
  }
  return pool;
}

// =============================================================================
// KNEX INSTANCE (for query building and migrations)
// =============================================================================

/**
 * Knex instance with proper configuration
 * Issue #72: SSL, #78: Pool settings
 */
export const db: Knex = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || getConnectionConfig(),
  pool: {
    min: POOL_MIN,
    max: POOL_MAX,
    acquireTimeoutMillis: ACQUIRE_TIMEOUT_MS,
    createTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    // Validate connection before use
    validateAsync: async (connection: any) => {
      try {
        await connection.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    }
  },
  acquireConnectionTimeout: ACQUIRE_TIMEOUT_MS,
  debug: process.env.NODE_ENV === 'development' && process.env.DB_DEBUG === 'true'
});

// =============================================================================
// QUERY HOOKS FOR TIMING AND LOGGING
// =============================================================================

let queryIdCounter = 0;
const queryStartTimes = new Map<string, number>();

/**
 * Extract operation type from SQL
 */
function extractOperation(sql: string): string {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'select';
  if (trimmed.startsWith('INSERT')) return 'insert';
  if (trimmed.startsWith('UPDATE')) return 'update';
  if (trimmed.startsWith('DELETE')) return 'delete';
  if (trimmed.startsWith('BEGIN')) return 'begin';
  if (trimmed.startsWith('COMMIT')) return 'commit';
  if (trimmed.startsWith('ROLLBACK')) return 'rollback';
  if (trimmed.startsWith('SET')) return 'set';
  return 'other';
}

/**
 * Extract table name from SQL
 */
function extractTableName(sql: string): string {
  const patterns = [
    /FROM\s+["']?(\w+)["']?/i,
    /INTO\s+["']?(\w+)["']?/i,
    /UPDATE\s+["']?(\w+)["']?/i,
    /DELETE\s+FROM\s+["']?(\w+)["']?/i
  ];
  for (const pattern of patterns) {
    const match = sql.match(pattern);
    if (match) return match[1];
  }
  return 'unknown';
}

/**
 * Sanitize SQL for logging
 */
function sanitizeSql(sql: string): string {
  const maxLength = 500;
  let sanitized = sql.length > maxLength ? sql.substring(0, maxLength) + '...' : sql;
  // Redact long string literals (potential sensitive data)
  sanitized = sanitized.replace(/'[^']{20,}'/g, "'[REDACTED]'");
  return sanitized;
}

// Query timing hooks
db.on('query', (data: any) => {
  const queryId = `q_${++queryIdCounter}_${Date.now()}`;
  data.__queryId = queryId;
  queryStartTimes.set(queryId, Date.now());
});

db.on('query-response', (response: any, data: any) => {
  const queryId = data.__queryId;
  if (!queryId) return;

  const startTime = queryStartTimes.get(queryId);
  queryStartTimes.delete(queryId);

  if (startTime) {
    const duration = Date.now() - startTime;
    const sql = data.sql || '';
    const operation = extractOperation(sql);
    const table = extractTableName(sql);

    // Log slow queries
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      logger.warn('Slow database query detected', {
        duration,
        threshold: SLOW_QUERY_THRESHOLD_MS,
        operation,
        table,
        sql: sanitizeSql(sql),
        bindings: data.bindings?.length || 0,
        rowCount: Array.isArray(response) ? response.length : undefined
      });
    }
  }
});

db.on('query-error', (error: Error, data: any) => {
  const queryId = data.__queryId;
  if (queryId) {
    const startTime = queryStartTimes.get(queryId);
    queryStartTimes.delete(queryId);

    const duration = startTime ? Date.now() - startTime : 0;
    const sql = data.sql || '';
    const operation = extractOperation(sql);
    const table = extractTableName(sql);

    logger.error('Database query error', {
      error: error.message,
      duration,
      operation,
      table,
      sql: sanitizeSql(sql)
    });
  }
});

// =============================================================================
// TRANSACTION HELPER
// =============================================================================

/**
 * Execute function within a database transaction
 * Issue #9, #31: DB transactions
 */
export async function withTransaction<T>(
  fn: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (trx) => {
    return fn(trx);
  });
}

/**
 * Execute pg query with timeout
 */
export async function queryWithTimeout(
  sql: string,
  params: any[] = [],
  timeoutMs: number = QUERY_TIMEOUT_MS
): Promise<any> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    // Set statement timeout for this query
    await client.query(`SET statement_timeout = ${timeoutMs}`);
    const result = await client.query(sql, params);
    return result;
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
    await db.raw('SELECT 1').timeout(5000);
    const latencyMs = Date.now() - start;
    
    const poolInfo = pool ? {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    } : { total: 0, idle: 0, waiting: 0 };

    return {
      healthy: true,
      latencyMs,
      poolInfo,
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

/**
 * Close all database connections
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
  
  await db.destroy();
  logger.info('Knex connection destroyed');
}

export default db;
