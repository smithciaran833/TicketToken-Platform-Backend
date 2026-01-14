/**
 * Database Configuration for Integration Service
 *
 * AUDIT FIXES:
 * - SEC-4: Database SSL disabled → Proper SSL configuration
 * - MIG-1: rejectUnauthorized: false → Proper CA verification
 * - DB-1: No connection timeouts → Lock and statement timeouts
 * - DB-2: Direct process.env access → Use centralized config
 */

import knex from 'knex'
import Knex = require('knex');
import { getDatabaseConfig, isProduction, getConfig } from './index';
import { logger } from '../utils/logger';

// =============================================================================
// DATABASE INSTANCE
// =============================================================================

let dbInstance: Knex | null = null;

/**
 * Get database connection configuration
 * AUDIT FIX SEC-4, MIG-1: Proper SSL configuration
 */
function getConnectionConfig(): Knex.Config {
  const dbConfig = getDatabaseConfig();
  const config = getConfig();

  const connectionConfig: Record<string, any> = {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
  };

  // AUDIT FIX SEC-4: Enable SSL in production with proper verification
  if (dbConfig.ssl) {
    (connectionConfig as any).ssl = {
      // In production, verify the server certificate
      rejectUnauthorized: isProduction(),
    };
  }

  return {
    client: 'postgresql',
    connection: connectionConfig,
    pool: {
      min: dbConfig.pool.min,
      max: dbConfig.pool.max,
      // AUDIT FIX DB-1: Connection timeout
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      // Run on each connection to set timeouts
      afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
        // AUDIT FIX DB-1: Set lock and statement timeouts
        conn.query('SET lock_timeout = 30000', (err: Error | null) => {
          if (err) {
            logger.error('Failed to set lock_timeout', { error: err.message });
            return done(err, conn);
          }
          conn.query('SET statement_timeout = 60000', (err2: Error | null) => {
            if (err2) {
              logger.error('Failed to set statement_timeout', { error: err2.message });
            }
            done(err2, conn);
          });
        });
      }
    },
    searchPath: ['public', 'integration'],
    asyncStackTraces: !isProduction(),
    debug: config.LOG_LEVEL === 'debug' && !isProduction(),
  };
}

/**
 * Get or create database instance
 */
export function getDatabase(): Knex {
  if (!dbInstance) {
    const config = getConnectionConfig();
    dbInstance = knex(config);

    // Log connection info (without password)
    const connInfo = config.connection as Record<string, any>;
    logger.info('Database connection configured', {
      host: connInfo.host,
      port: connInfo.port,
      database: connInfo.database,
      ssl: !!connInfo.ssl,
      poolMin: (config.pool as any)?.min,
      poolMax: (config.pool as any)?.max
    });
  }

  return dbInstance;
}

/**
 * Initialize database - call at startup
 */
export function initializeDatabase(): Knex {
  return getDatabase();
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy();
    dbInstance = null;
    logger.info('Database connection closed');
  }
}

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const db = getDatabase();
    await db.raw('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database health check failed', {
      error: (error as Error).message
    });
    return false;
  }
}

/**
 * Get database connection pool stats
 */
export function getPoolStats(): { used: number; free: number; pending: number; size: number } | null {
  if (!dbInstance) {
    return null;
  }

  const pool = (dbInstance.client as any).pool;
  if (!pool) {
    return null;
  }

  return {
    used: pool.numUsed?.() || 0,
    free: pool.numFree?.() || 0,
    pending: pool.numPendingAcquires?.() || 0,
    size: pool.numUsed?.() + pool.numFree?.() || 0
  };
}

/**
 * Execute with tenant context for RLS
 */
export async function withTenantContext<T>(
  db: Knex,
  tenantId: string,
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (trx: any) => {
    // Set tenant context for Row Level Security
    await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
    return callback(trx);
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export the callable Knex instance directly
export const db: Knex = getDatabase();

export default db;
