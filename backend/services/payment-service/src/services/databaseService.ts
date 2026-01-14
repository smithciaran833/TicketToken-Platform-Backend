import { Pool, PoolConfig } from 'pg';
import { promisify } from 'util';
import { resolve4 } from 'dns';
import { logger } from '../utils/logger';

const resolveDns = promisify(resolve4);
const log = logger.child({ component: 'DatabaseService' });

// =============================================================================
// POOL METRICS
// =============================================================================

interface PoolMetrics {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  lastExhaustion?: Date;
  exhaustionCount: number;
}

// =============================================================================
// DATABASE SERVICE
// =============================================================================

class DatabaseServiceClass {
  private pool: Pool | null = null;
  private metrics: PoolMetrics = {
    totalConnections: 0,
    idleConnections: 0,
    waitingClients: 0,
    exhaustionCount: 0,
  };

  // MEDIUM FIX: Statement timeout configuration
  private readonly statementTimeoutMs = parseInt(
    process.env.DB_STATEMENT_TIMEOUT_MS || '30000',
    10
  );

  // Pool exhaustion threshold
  private readonly poolExhaustionThreshold = parseInt(
    process.env.DB_POOL_EXHAUSTION_THRESHOLD || '5',
    10
  );

  async initialize(): Promise<void> {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 2000; // Base delay in milliseconds

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log.info({ attempt, maxRetries: MAX_RETRIES }, 'Database connection attempt');

        // Force DNS resolution to bypass Node.js DNS cache
        const dbHost = process.env.DB_HOST || 'pgbouncer';
        const dbIps = await resolveDns(dbHost);
        const dbIp = dbIps[0];
        log.info({ host: dbHost, ip: dbIp }, 'DNS resolved');

        // MEDIUM FIX: Add statement_timeout to pool config
        const poolConfig: PoolConfig = {
          host: dbIp,
          port: parseInt(process.env.DB_PORT || '6432', 10),
          database: process.env.DB_NAME || 'tickettoken_db',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          max: parseInt(process.env.DB_POOL_MAX || '20', 10),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          // MEDIUM FIX: Statement timeout to prevent long-running queries
          statement_timeout: this.statementTimeoutMs,
          query_timeout: this.statementTimeoutMs,
          // Application name for monitoring
          application_name: 'payment-service',
        };

        // Create pool
        this.pool = new Pool(poolConfig);

        // Error handler
        this.pool.on('error', (err) => {
          log.error({ error: err.message }, 'Unexpected error on idle database client');
        });

        // MEDIUM FIX: Connection event handlers for pool exhaustion detection
        this.pool.on('connect', () => {
          this.metrics.totalConnections++;
          this.updateMetrics();
        });

        this.pool.on('acquire', () => {
          this.updateMetrics();
          this.checkPoolExhaustion();
        });

        this.pool.on('release', () => {
          this.updateMetrics();
        });

        this.pool.on('remove', () => {
          this.metrics.totalConnections--;
          this.updateMetrics();
        });

        // Test connection with timeout
        await this.pool.query('SELECT 1');

        // Set statement_timeout at session level for all connections
        this.pool.on('connect', async (client) => {
          try {
            await client.query(`SET statement_timeout = '${this.statementTimeoutMs}ms'`);
            log.debug('Statement timeout configured for new connection');
          } catch (err) {
            log.warn({ error: err }, 'Failed to set statement timeout');
          }
        });

        log.info({
          maxConnections: poolConfig.max,
          statementTimeout: this.statementTimeoutMs,
        }, 'Database connection pool initialized');
        return;

      } catch (error: any) {
        log.error({ error: error.message, attempt }, 'Connection attempt failed');

        if (this.pool) {
          await this.pool.end().catch(() => {});
          this.pool = null;
        }

        if (attempt === MAX_RETRIES) {
          log.error('Failed to connect to database after all retries');
          throw error;
        }

        const delayMs = RETRY_DELAY * attempt;
        log.info({ delayMs }, 'Waiting before retry');
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  /**
   * Update pool metrics
   */
  private updateMetrics(): void {
    if (!this.pool) return;
    
    this.metrics.totalConnections = this.pool.totalCount;
    this.metrics.idleConnections = this.pool.idleCount;
    this.metrics.waitingClients = this.pool.waitingCount;
  }

  /**
   * MEDIUM FIX: Check for pool exhaustion condition
   */
  private checkPoolExhaustion(): void {
    if (!this.pool) return;

    const waitingClients = this.pool.waitingCount;
    
    if (waitingClients >= this.poolExhaustionThreshold) {
      this.metrics.exhaustionCount++;
      this.metrics.lastExhaustion = new Date();
      
      log.warn({
        waitingClients,
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount,
        exhaustionCount: this.metrics.exhaustionCount,
      }, 'Pool exhaustion detected - clients waiting for connections');
    }
  }

  /**
   * Get pool instance
   */
  getPool(): Pool {
    if (!this.pool) throw new Error('Database not initialized');
    return this.pool;
  }

  /**
   * MEDIUM FIX: Get pool health metrics for monitoring
   */
  getPoolMetrics(): PoolMetrics & { healthy: boolean } {
    this.updateMetrics();
    
    return {
      ...this.metrics,
      healthy: this.isPoolHealthy(),
    };
  }

  /**
   * Check if pool is healthy
   */
  isPoolHealthy(): boolean {
    if (!this.pool) return false;
    
    // Unhealthy if too many clients waiting
    if (this.pool.waitingCount >= this.poolExhaustionThreshold) {
      return false;
    }
    
    // Unhealthy if no idle connections and at max capacity
    const maxConnections = parseInt(process.env.DB_POOL_MAX || '20', 10);
    if (this.pool.totalCount >= maxConnections && this.pool.idleCount === 0) {
      return false;
    }
    
    return true;
  }

  /**
   * Execute query with timeout
   */
  async queryWithTimeout<T>(
    queryText: string,
    params?: any[],
    timeoutMs?: number
  ): Promise<T> {
    if (!this.pool) throw new Error('Database not initialized');

    const timeout = timeoutMs || this.statementTimeoutMs;
    const client = await this.pool.connect();
    
    try {
      // Set statement timeout for this query
      await client.query(`SET statement_timeout = '${timeout}ms'`);
      const result = await client.query(queryText, params);
      return result.rows as T;
    } finally {
      client.release();
    }
  }

  /**
   * Close pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const DatabaseService = new DatabaseServiceClass();
