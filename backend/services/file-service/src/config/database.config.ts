/**
 * Database Configuration with Pool Error Handling
 * 
 * AUDIT FIXES:
 * - ERR-6: No database pool error handler → pool.on('error') added
 */

import { Pool, PoolConfig, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { postgresCircuit } from '../utils/circuit-breaker';

// =============================================================================
// Configuration
// =============================================================================

const DATABASE_URL = process.env.DATABASE_URL;
const DB_POOL_MIN = parseInt(process.env.DB_POOL_MIN || '2', 10);
const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX || '10', 10);
const DB_IDLE_TIMEOUT_MS = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
const DB_CONNECTION_TIMEOUT_MS = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10);

// =============================================================================
// Pool Instance
// =============================================================================

let pool: Pool | null = null;

// =============================================================================
// Pool Configuration
// =============================================================================

function createPoolConfig(): PoolConfig {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  return {
    connectionString: DATABASE_URL,
    min: DB_POOL_MIN,
    max: DB_POOL_MAX,
    idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    // SSL for production
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    // Application name for debugging
    application_name: 'file-service',
  };
}

// =============================================================================
// Pool Initialization
// =============================================================================

export function initializePool(): Pool {
  if (pool) {
    return pool;
  }

  const config = createPoolConfig();
  pool = new Pool(config);

  // ==========================================================================
  // AUDIT FIX ERR-6: Database Pool Error Handler
  // Handle unexpected errors on idle clients
  // ==========================================================================
  pool.on('error', (err: Error, _client: PoolClient) => {
    logger.error({
      event: 'database_pool_error',
      error: err.message,
      stack: err.stack,
    }, 'Unexpected error on idle database client');

    // Don't crash - the pool will handle reconnection
    // But log for monitoring and alerting
  });

  // Log when a new client is created
  pool.on('connect', (client: PoolClient) => {
    logger.debug({
      event: 'database_client_connected',
    }, 'New database client connected');
    
    // Set default application settings for RLS
    client.query("SET application_name = 'file-service'").catch((err) => {
      logger.warn({ error: err.message }, 'Failed to set application_name');
    });
  });

  // Log when a client is acquired from the pool
  pool.on('acquire', (_client: PoolClient) => {
    logger.debug({
      event: 'database_client_acquired',
      totalCount: pool?.totalCount,
      idleCount: pool?.idleCount,
      waitingCount: pool?.waitingCount,
    }, 'Database client acquired');
  });

  // Log when a client is removed from the pool
  pool.on('remove', (_client: PoolClient) => {
    logger.debug({
      event: 'database_client_removed',
      totalCount: pool?.totalCount,
      idleCount: pool?.idleCount,
    }, 'Database client removed');
  });

  logger.info({
    event: 'database_pool_initialized',
    min: DB_POOL_MIN,
    max: DB_POOL_MAX,
    idleTimeout: DB_IDLE_TIMEOUT_MS,
    connectionTimeout: DB_CONNECTION_TIMEOUT_MS,
  }, 'Database pool initialized');

  return pool;
}

// =============================================================================
// Pool Access
// =============================================================================

export function getPool(): Pool {
  if (!pool) {
    return initializePool();
  }
  return pool;
}

// =============================================================================
// Query with Circuit Breaker
// =============================================================================

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  return postgresCircuit.execute(async () => {
    const pool = getPool();
    const result = await pool.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount || 0 };
  });
}

// =============================================================================
// Transaction Support
// =============================================================================

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  return postgresCircuit.execute(async () => {
    const pool = getPool();
    const client = await pool.connect();
    
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
  });
}

// =============================================================================
// Tenant Context for RLS
// =============================================================================

export async function withTenantContext<T>(
  tenantId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  return postgresCircuit.execute(async () => {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      // Set tenant context for RLS
      await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);
      const result = await callback(client);
      return result;
    } finally {
      client.release();
    }
  });
}

// =============================================================================
// Health Check
// =============================================================================

export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  poolStats: {
    total: number;
    idle: number;
    waiting: number;
  };
}> {
  const start = Date.now();
  
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    
    return {
      healthy: true,
      latencyMs: Date.now() - start,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  } catch (error) {
    logger.error({
      error: (error as Error).message,
    }, 'Database health check failed');
    
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      poolStats: {
        total: pool?.totalCount || 0,
        idle: pool?.idleCount || 0,
        waiting: pool?.waitingCount || 0,
      },
    };
  }
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

export async function closePool(): Promise<void> {
  if (pool) {
    logger.info({
      event: 'database_pool_closing',
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
    }, 'Closing database pool');
    
    await pool.end();
    pool = null;
    
    logger.info({ event: 'database_pool_closed' }, 'Database pool closed');
  }
}

// =============================================================================
// Export Aliases (for compatibility with index.ts)
// =============================================================================

export const connectDatabase = initializePool;
export const disconnectDatabase = closePool;

// =============================================================================
// Export
// =============================================================================

export default {
  initializePool,
  getPool,
  query,
  withTransaction,
  withTenantContext,
  checkDatabaseHealth,
  closePool,
  connectDatabase: initializePool,
  disconnectDatabase: closePool,
};
