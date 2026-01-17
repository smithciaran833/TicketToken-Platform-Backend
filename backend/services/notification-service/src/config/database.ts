import knex, { Knex } from 'knex';
import path from 'path';
import { logger } from './logger';
import { metricsService } from '../services/metrics.service';

/**
 * Database connection pool configuration
 */
const poolConfig: Knex.PoolConfig = {
  min: parseInt(process.env.DB_POOL_MIN || '2'),
  max: parseInt(process.env.DB_POOL_MAX || '10'),

  // Time to wait for a connection before timing out
  acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '30000'),

  // Time a connection can be idle before being destroyed
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),

  // Time to wait for connection destruction
  reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL || '1000'),

  // Log pool activity
  log: (message: string, logLevel: string) => {
    if (process.env.DB_POOL_DEBUG === 'true') {
      logger.debug(`Database pool: ${message}`, { logLevel });
    }
  },

  // Validate connection before use
  afterCreate: async (conn: any, done: any) => {
    try {
      // Test the connection
      await conn.query('SELECT 1');
      logger.debug('Database connection created and validated');
      done(null, conn);
    } catch (error) {
      logger.error('Failed to validate database connection', { error });
      done(error, conn);
    }
  },
};

/**
 * Database configuration
 */
export const db = knex({
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '6432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',

    // Connection timeout
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),

    // Statement timeout (30 seconds default)
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'),

    // Keep connection alive
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  },
  pool: poolConfig,
  migrations: {
    directory: path.join(__dirname, '../migrations'),
    tableName: 'knex_migrations_notification',
    extension: 'ts',
    loadExtensions: ['.ts']
  },
  // Enable query debugging in development
  debug: process.env.DB_DEBUG === 'true',
});

/**
 * Database connection health checker
 */
class DatabaseHealthMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private isHealthy: boolean = true;

  /**
   * Start monitoring database health
   */
  start(): void {
    // Check every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkHealth();
    }, 30000);

    logger.info('Database health monitor started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('Database health monitor stopped');
  }

  /**
   * Check database health
   */
  async checkHealth(): Promise<boolean> {
    try {
      await db.raw('SELECT 1');

      if (!this.isHealthy) {
        logger.info('Database connection restored');
        this.isHealthy = true;
      }

      // Update metrics
      metricsService.setGauge('database_health', 1);

      return true;
    } catch (error) {
      logger.error('Database health check failed', { error });

      if (this.isHealthy) {
        logger.error('Database connection lost');
        this.isHealthy = false;
      }

      // Update metrics
      metricsService.setGauge('database_health', 0);

      return false;
    }
  }

  /**
   * Get health status
   */
  getHealthStatus(): boolean {
    return this.isHealthy;
  }
}

export const dbHealthMonitor = new DatabaseHealthMonitor();

// Store interval reference for cleanup
let poolMetricsInterval: NodeJS.Timeout | null = null;

/**
 * Track pool metrics periodically
 */
function trackPoolMetrics(): void {
  // Clear any existing interval
  if (poolMetricsInterval) {
    clearInterval(poolMetricsInterval);
  }

  poolMetricsInterval = setInterval(() => {
    try {
      const pool = (db.client as any).pool;

      if (pool) {
        // Track pool statistics
        metricsService.setGauge('db_pool_size', pool.numUsed() + pool.numFree());
        metricsService.setGauge('db_pool_used', pool.numUsed());
        metricsService.setGauge('db_pool_free', pool.numFree());
        metricsService.setGauge('db_pool_pending', pool.numPendingAcquires());
        metricsService.setGauge('db_pool_pending_creates', pool.numPendingCreates());
      }
    } catch (error) {
      logger.error('Failed to track pool metrics', { error });
    }
  }, 10000); // Every 10 seconds
}

/**
 * Stop pool metrics tracking
 */
export function stopPoolMetrics(): void {
  if (poolMetricsInterval) {
    clearInterval(poolMetricsInterval);
    poolMetricsInterval = null;
  }
}

/**
 * Initialize database connection with retry
 */
export async function connectDatabase(): Promise<void> {
  const maxRetries = 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // Test the connection
      await db.raw('SELECT 1');

      logger.info('Database connected successfully', {
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        poolMin: poolConfig.min,
        poolMax: poolConfig.max,
      });

      // Start health monitoring
      dbHealthMonitor.start();

      // Start tracking pool metrics
      trackPoolMetrics();

      return;
    } catch (error) {
      attempt++;
      logger.error(`Database connection attempt ${attempt}/${maxRetries} failed`, { error });

      if (attempt >= maxRetries) {
        throw new Error('Failed to connect to database after maximum retries');
      }

      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Close database connections gracefully
 */
export async function closeDatabaseConnections(): Promise<void> {
  try {
    // Stop health monitoring
    dbHealthMonitor.stop();

    // Stop pool metrics tracking
    stopPoolMetrics();

    // Close all connections
    await db.destroy();

    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Error closing database connections', { error });
    throw error;
  }
}

/**
 * Get pool statistics
 */
export function getPoolStats(): {
  size: number;
  used: number;
  free: number;
  pending: number;
  pendingCreates: number;
} {
  try {
    const pool = (db.client as any).pool;

    if (!pool) {
      return {
        size: 0,
        used: 0,
        free: 0,
        pending: 0,
        pendingCreates: 0,
      };
    }

    return {
      size: pool.numUsed() + pool.numFree(),
      used: pool.numUsed(),
      free: pool.numFree(),
      pending: pool.numPendingAcquires(),
      pendingCreates: pool.numPendingCreates(),
    };
  } catch (error) {
    logger.error('Failed to get pool stats', { error });
    return {
      size: 0,
      used: 0,
      free: 0,
      pending: 0,
      pendingCreates: 0,
    };
  }
}

/**
 * Check if database is connected
 */
export async function isDatabaseConnected(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch (error) {
    return false;
  }
}
