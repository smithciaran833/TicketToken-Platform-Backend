import { Pool } from 'pg';
import knex, { Knex } from 'knex';
import { Histogram, Counter } from 'prom-client';
import logger from '../utils/logger';

let pool: Pool | null = null;

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

// Query timeout in milliseconds (30 seconds default)
const QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '30000');

// Slow query threshold for logging (1 second)
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.DB_SLOW_QUERY_THRESHOLD_MS || '1000');

// =============================================================================
// METRICS
// =============================================================================

// Query duration histogram
const queryDurationHistogram = new Histogram({
  name: 'minting_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'table', 'success'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]
});

// Query error counter
const queryErrorCounter = new Counter({
  name: 'minting_db_query_errors_total',
  help: 'Total number of database query errors',
  labelNames: ['operation', 'error_type']
});

// Slow query counter
const slowQueryCounter = new Counter({
  name: 'minting_db_slow_queries_total',
  help: 'Total number of slow database queries',
  labelNames: ['operation', 'table']
});

// =============================================================================
// QUERY TIMING TRACKING
// =============================================================================

// Map to track query start times (keyed by query UID)
const queryStartTimes = new Map<string, number>();

/**
 * Extract table name from SQL query
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
    if (match) {
      return match[1];
    }
  }
  return 'unknown';
}

/**
 * Extract operation type from SQL query
 */
function extractOperation(sql: string): string {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'select';
  if (trimmed.startsWith('INSERT')) return 'insert';
  if (trimmed.startsWith('UPDATE')) return 'update';
  if (trimmed.startsWith('DELETE')) return 'delete';
  if (trimmed.startsWith('BEGIN')) return 'transaction_begin';
  if (trimmed.startsWith('COMMIT')) return 'transaction_commit';
  if (trimmed.startsWith('ROLLBACK')) return 'transaction_rollback';
  if (trimmed.startsWith('SET')) return 'set';
  return 'other';
}

/**
 * Sanitize SQL for logging (remove sensitive data)
 */
function sanitizeSql(sql: string): string {
  // Truncate very long queries
  const maxLength = 500;
  let sanitized = sql.length > maxLength ? sql.substring(0, maxLength) + '...' : sql;
  
  // Remove potential sensitive values (simple pattern matching)
  sanitized = sanitized.replace(/'[^']{20,}'/g, "'[REDACTED]'");
  
  return sanitized;
}

// =============================================================================
// DATABASE CONFIGURATION
// =============================================================================

// Validate required environment variables in production
function validateDatabaseConfig(): void {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.DB_PASSWORD) {
      throw new Error('DB_PASSWORD environment variable is required in production');
    }
    if (!process.env.DB_HOST) {
      throw new Error('DB_HOST environment variable is required in production');
    }
    if (!process.env.DB_USER) {
      throw new Error('DB_USER environment variable is required in production');
    }
  }
}

// Get SSL configuration based on environment
function getSSLConfig(): boolean | { rejectUnauthorized: boolean; ca?: string } {
  if (process.env.NODE_ENV === 'production') {
    return {
      rejectUnauthorized: true,
      ca: process.env.DB_CA_CERT
    };
  }
  return false;
}

export async function initializeDatabase(): Promise<Pool> {
  // Validate config before attempting connection
  validateDatabaseConfig();

  pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '6432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: getSSLConfig(),
    // Add statement timeout for all queries
    statement_timeout: QUERY_TIMEOUT_MS
  });

  // Test connection
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('✅ Database connected:', result.rows[0].now);
    return pool;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

// =============================================================================
// KNEX INSTANCE WITH QUERY TIMING
// =============================================================================

// Knex instance for models
export const db: Knex = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '6432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: getSSLConfig(),
  },
  pool: { 
    min: 0, 
    max: 10,
    // Acquire timeout
    acquireTimeoutMillis: 30000,
    // Create timeout
    createTimeoutMillis: 30000,
    // Idle timeout
    idleTimeoutMillis: 30000
  },
  // Add acquireConnectionTimeout
  acquireConnectionTimeout: 10000,
  // Enable debug mode in development
  debug: process.env.NODE_ENV === 'development' && process.env.DB_DEBUG === 'true'
});

// =============================================================================
// QUERY HOOKS FOR TIMING AND LOGGING
// =============================================================================

// Generate unique ID for query tracking
let queryIdCounter = 0;

/**
 * Before query hook - start timing
 */
db.on('query', (data: any) => {
  const queryId = `q_${++queryIdCounter}_${Date.now()}`;
  data.__queryId = queryId;
  queryStartTimes.set(queryId, Date.now());
});

/**
 * After query hook - record timing and log slow queries
 */
db.on('query-response', (response: any, data: any) => {
  const queryId = data.__queryId;
  if (!queryId) return;

  const startTime = queryStartTimes.get(queryId);
  queryStartTimes.delete(queryId);

  if (startTime) {
    const duration = Date.now() - startTime;
    const durationSeconds = duration / 1000;
    const sql = data.sql || '';
    const operation = extractOperation(sql);
    const table = extractTableName(sql);

    // Record metrics
    queryDurationHistogram.observe(
      { operation, table, success: 'true' },
      durationSeconds
    );

    // Log slow queries
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      slowQueryCounter.inc({ operation, table });
      
      logger.warn('Slow database query detected', {
        duration,
        threshold: SLOW_QUERY_THRESHOLD_MS,
        operation,
        table,
        sql: sanitizeSql(sql),
        bindings: data.bindings?.length || 0,
        rowCount: Array.isArray(response) ? response.length : undefined
      });
    } else if (process.env.DB_LOG_ALL_QUERIES === 'true') {
      // Optional: log all queries in debug mode
      logger.debug('Database query completed', {
        duration,
        operation,
        table,
        rowCount: Array.isArray(response) ? response.length : undefined
      });
    }
  }
});

/**
 * Query error hook - record errors
 */
db.on('query-error', (error: Error, data: any) => {
  const queryId = data.__queryId;
  if (queryId) {
    const startTime = queryStartTimes.get(queryId);
    queryStartTimes.delete(queryId);

    const duration = startTime ? Date.now() - startTime : 0;
    const sql = data.sql || '';
    const operation = extractOperation(sql);
    const table = extractTableName(sql);

    // Record error metrics
    queryDurationHistogram.observe(
      { operation, table, success: 'false' },
      duration / 1000
    );

    // Categorize error type
    let errorType = 'unknown';
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes('timeout')) {
      errorType = 'timeout';
    } else if (errorMessage.includes('deadlock')) {
      errorType = 'deadlock';
    } else if (errorMessage.includes('connection')) {
      errorType = 'connection';
    } else if (errorMessage.includes('constraint')) {
      errorType = 'constraint';
    } else if (errorMessage.includes('duplicate')) {
      errorType = 'duplicate';
    }

    queryErrorCounter.inc({ operation, error_type: errorType });

    logger.error('Database query error', {
      error: error.message,
      errorType,
      duration,
      operation,
      table,
      sql: sanitizeSql(sql),
      bindings: data.bindings?.length || 0
    });
  }
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Execute a query with explicit timeout
 * @param query - Knex query builder
 * @param timeoutMs - Timeout in milliseconds (defaults to QUERY_TIMEOUT_MS)
 */
export async function withQueryTimeout<T>(
  query: Knex.QueryBuilder,
  timeoutMs: number = QUERY_TIMEOUT_MS
): Promise<T> {
  return query.timeout(timeoutMs, { cancel: true }) as Promise<T>;
}

/**
 * Execute raw SQL with timeout
 */
export async function rawWithTimeout(
  sql: string,
  bindings: any[] = [],
  timeoutMs: number = QUERY_TIMEOUT_MS
): Promise<any> {
  return db.raw(sql, bindings).timeout(timeoutMs, { cancel: true });
}

/**
 * Get database health status
 */
export async function getDatabaseHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  poolInfo: { total: number; idle: number; waiting: number };
}> {
  const start = Date.now();
  
  try {
    await db.raw('SELECT 1').timeout(5000);
    const latencyMs = Date.now() - start;
    
    // Get pool stats if available
    const poolInfo = pool ? {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    } : { total: 0, idle: 0, waiting: 0 };

    return {
      healthy: true,
      latencyMs,
      poolInfo
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      poolInfo: { total: 0, idle: 0, waiting: 0 }
    };
  }
}

export default db;
