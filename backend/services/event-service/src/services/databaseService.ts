import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

/**
 * HIGH PRIORITY RESILIENCE FIXES:
 * - Issue #10: Added connection pool configuration
 * - Issue #11: Added retry logic for connection failures
 * - Issue #12: Added error handling and monitoring
 * - Issue #13: Added query timeout configuration
 */

class DatabaseServiceClass {
  private pool: Pool | null = null;
  private isShuttingDown: boolean = false;

  async initialize(): Promise<void> {
    // HIGH PRIORITY FIX: Add retry logic for database initialization
    await withRetry(
      async () => {
        const poolConfig: PoolConfig = this.getPoolConfig();
        
        this.pool = new Pool(poolConfig);

        // Set up error handlers
        this.setupErrorHandlers();

        // Test connection
        await this.pool.query('SELECT NOW()');
        logger.info('Database pool connection verified');
      },
      {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        operationName: 'database-initialize',
        retryOn: (error: any) => {
          // Retry on connection errors
          return error.code === 'ECONNREFUSED' ||
                 error.code === 'ENOTFOUND' ||
                 error.code === 'ETIMEDOUT' ||
                 error.message?.includes('connect');
        },
      }
    );
  }

  /**
   * HIGH PRIORITY FIX: Get pool configuration with resilience settings
   */
  private getPoolConfig(): PoolConfig {
    const baseConfig: PoolConfig = {
      // HIGH PRIORITY FIX: Connection pool limits
      max: parseInt(process.env.DB_POOL_MAX || '20'), // Maximum connections
      min: parseInt(process.env.DB_POOL_MIN || '2'),  // Minimum connections
      
      // HIGH PRIORITY FIX: Timeout configurations
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 5000, // Timeout acquiring connection after 5s
      
      // HIGH PRIORITY FIX: Query timeout (statement_timeout in PostgreSQL)
      statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'), // 30s default
      
      // Allow graceful pool shutdown
      allowExitOnIdle: false,
    };

    // Use DATABASE_URL if provided, otherwise construct from parts
    if (process.env.DATABASE_URL) {
      return {
        ...baseConfig,
        connectionString: process.env.DATABASE_URL,
      };
    } else {
      return {
        ...baseConfig,
        host: process.env.DB_HOST || 'tickettoken-postgres',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'tickettoken_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'localdev123',
      };
    }
  }

  /**
   * HIGH PRIORITY FIX: Setup error handlers for monitoring
   */
  private setupErrorHandlers(): void {
    if (!this.pool) return;

    // Handle pool errors
    this.pool.on('error', (err, client) => {
      logger.error({ error: err.message, stack: err.stack }, 'Unexpected database pool error');
    });

    // Log pool connection events
    this.pool.on('connect', (client) => {
      logger.debug('New database client connected to pool');
    });

    this.pool.on('acquire', (client) => {
      logger.debug('Database client acquired from pool');
    });

    this.pool.on('remove', (client) => {
      logger.debug('Database client removed from pool');
    });
  }

  getPool(): Pool {
    if (!this.pool) throw new Error('Database not initialized');
    if (this.isShuttingDown) throw new Error('Database is shutting down');
    return this.pool;
  }

  /**
   * HIGH PRIORITY FIX: Get pool statistics for monitoring
   */
  getPoolStats(): {
    total: number;
    idle: number;
    waiting: number;
  } {
    if (!this.pool) {
      return { total: 0, idle: 0, waiting: 0 };
    }

    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  /**
   * HIGH PRIORITY FIX: Graceful shutdown
   */
  async close(): Promise<void> {
    if (!this.pool) return;

    this.isShuttingDown = true;
    logger.info('Closing database pool...');

    try {
      await this.pool.end();
      logger.info('Database pool closed successfully');
    } catch (error) {
      logger.error({ error }, 'Error closing database pool');
    } finally {
      this.pool = null;
      this.isShuttingDown = false;
    }
  }
}

export const DatabaseService = new DatabaseServiceClass();
