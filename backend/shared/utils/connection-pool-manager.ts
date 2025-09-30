import { Pool, PoolClient, PoolConfig } from 'pg';
import { logger } from './logger';
import { EventEmitter } from 'events';

interface PoolMetrics {
  totalConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalRequests: number;
  errors: number;
  avgResponseTime: number;
  lastError?: Date;
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

interface EnhancedPoolConfig extends PoolConfig {
  name: string;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
  maxWaitingRequests?: number;
  healthCheckInterval?: number;
  slowQueryThreshold?: number;
}

export class ConnectionPoolManager extends EventEmitter {
  private pool: Pool;
  private config: EnhancedPoolConfig;
  private metrics: PoolMetrics;
  private circuitBreakerFailures: number = 0;
  private circuitBreakerLastFailure?: Date;
  private healthCheckTimer?: NodeJS.Timeout;
  private requestQueue: Array<{
    resolve: (client: PoolClient) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private activeClients: Map<PoolClient, { query: string; startTime: number }> = new Map();
  private log: any;

  constructor(config: EnhancedPoolConfig) {
    super();

    // Explicitly type the config object
    const defaultConfig: EnhancedPoolConfig = {
      max: 20,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000,
      query_timeout: 30000,
      application_name: config.name,
      name: config.name,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
      maxWaitingRequests: 100,
      healthCheckInterval: 30000,
      slowQueryThreshold: 5000
    };

    this.config = { ...defaultConfig, ...config };

    this.metrics = {
      totalConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      totalRequests: 0,
      errors: 0,
      avgResponseTime: 0,
      circuitState: 'CLOSED'
    };

    this.log = logger.child({
      component: 'ConnectionPoolManager',
      pool: this.config.name
    });

    this.initializePool();
  }

  private initializePool(): void {
    this.pool = new Pool(this.config);

    this.pool.on('error', (err, client) => {
      this.handlePoolError(err, client);
    });

    this.pool.on('connect', (client) => {
      this.metrics.totalConnections++;
      this.log.debug('New client connected', {
        total: this.metrics.totalConnections
      });
      this.onClientConnect(client).catch(err =>
        this.log.error('Failed to configure client', err)
      );
    });

    this.pool.on('acquire', (client) => {
      this.metrics.idleConnections = Math.max(0, this.metrics.idleConnections - 1);
    });

    this.pool.on('release', (client) => {
      this.metrics.idleConnections++;
      this.activeClients.delete(client as unknown as PoolClient);
    });

    this.pool.on('remove', (clientOrError: any) => {
      this.metrics.totalConnections = Math.max(0, this.metrics.totalConnections - 1);
      if (clientOrError && typeof clientOrError.query === 'function') {
        this.activeClients.delete(clientOrError);
      }
    });

    this.startHealthCheck();
  }

  private async onClientConnect(client: PoolClient): Promise<void> {
    try {
      const statementTimeout = this.config.statement_timeout || 30000;
      await client.query(`
        SET statement_timeout = ${statementTimeout};
        SET lock_timeout = 5000;
        SET idle_in_transaction_session_timeout = 60000;
        SET work_mem = '4MB';
      `);
    } catch (error) {
      this.log.error('Failed to set session parameters', error);
    }
  }

  private handlePoolError(err: Error | any, client?: PoolClient): void {
    this.metrics.errors++;
    this.metrics.lastError = new Date();

    this.log.error('Pool error', {
      error: err.message,
      code: err.code,
      totalErrors: this.metrics.errors
    });

    this.circuitBreakerFailures++;
    this.circuitBreakerLastFailure = new Date();

    if (this.circuitBreakerFailures >= (this.config.circuitBreakerThreshold || 5)) {
      this.openCircuitBreaker();
    }

    this.emit('error', err);
  }

  private openCircuitBreaker(): void {
    if (this.metrics.circuitState === 'OPEN') return;

    this.metrics.circuitState = 'OPEN';
    this.log.warn('Circuit breaker OPENED', {
      failures: this.circuitBreakerFailures,
      lastFailure: this.circuitBreakerLastFailure
    });

    setTimeout(() => {
      this.metrics.circuitState = 'HALF_OPEN';
      this.log.info('Circuit breaker moved to HALF_OPEN');
    }, this.config.circuitBreakerTimeout || 60000);

    this.emit('circuit-open');
  }

  private closeCircuitBreaker(): void {
    if (this.metrics.circuitState === 'CLOSED') return;

    this.metrics.circuitState = 'CLOSED';
    this.circuitBreakerFailures = 0;
    this.circuitBreakerLastFailure = undefined;

    this.log.info('Circuit breaker CLOSED');
    this.emit('circuit-closed');
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval || 30000);
  }

  private async performHealthCheck(): Promise<void> {
    if (this.metrics.circuitState === 'OPEN') {
      return;
    }

    try {
      const client = await this.pool.connect();
      const start = Date.now();

      try {
        await client.query('SELECT 1');
        const duration = Date.now() - start;

        this.metrics.avgResponseTime =
          (this.metrics.avgResponseTime * 0.9) + (duration * 0.1);

        if (this.metrics.circuitState === 'HALF_OPEN') {
          this.closeCircuitBreaker();
        }

      } finally {
        client.release();
      }

    } catch (error) {
      this.log.error('Health check failed', error);
      this.handlePoolError(error as Error);
    }
  }

  async getClient(): Promise<PoolClient> {
    if (this.metrics.circuitState === 'OPEN') {
      throw new Error(`Database circuit breaker is OPEN for pool ${this.config.name}`);
    }

    if (this.requestQueue.length >= (this.config.maxWaitingRequests || 100)) {
      this.metrics.errors++;
      throw new Error('Too many pending database requests');
    }

    this.metrics.totalRequests++;

    try {
      const client = await this.acquireWithTimeout(5000);

      const originalQuery = client.query.bind(client);
      client.query = (async (...args: any[]) => {
        const start = Date.now();
        const queryText = typeof args[0] === 'string' ? args[0] : args[0].text;

        this.activeClients.set(client, {
          query: queryText?.substring(0, 100) || 'unknown',
          startTime: start
        });

        try {
          const result = await originalQuery(...args);
          const duration = Date.now() - start;

          if (duration > (this.config.slowQueryThreshold || 5000)) {
            this.log.warn('Slow query detected', {
              query: queryText?.substring(0, 100),
              duration
            });
          }

          this.metrics.avgResponseTime =
            (this.metrics.avgResponseTime * 0.95) + (duration * 0.05);

          if (this.metrics.circuitState === 'HALF_OPEN') {
            this.closeCircuitBreaker();
          }

          return result;
        } catch (error) {
          this.handlePoolError(error as Error, client);
          throw error;
        }
      }) as any;

      return client;

    } catch (error) {
      this.metrics.errors++;
      this.circuitBreakerFailures++;

      if (this.circuitBreakerFailures >= (this.config.circuitBreakerThreshold || 5)) {
        this.openCircuitBreaker();
      }

      throw error;
    }
  }

  private async acquireWithTimeout(timeout: number): Promise<PoolClient> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Failed to acquire database connection within ${timeout}ms`));
      }, timeout);

      this.pool.connect()
        .then(client => {
          clearTimeout(timer);
          resolve(client);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  async query<T = any>(
    text: string,
    params?: any[]
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    const client = await this.getClient();

    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();

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

  getMetrics(): PoolMetrics {
    const poolStats = (this.pool as any);

    return {
      ...this.metrics,
      totalConnections: poolStats.totalCount || this.metrics.totalConnections,
      idleConnections: poolStats.idleCount || this.metrics.idleConnections,
      waitingRequests: poolStats.waitingCount || this.requestQueue.length
    };
  }

  getActiveQueries(): Array<{ query: string; duration: number }> {
    const now = Date.now();
    return Array.from(this.activeClients.values()).map(info => ({
      query: info.query,
      duration: now - info.startTime
    }));
  }

  async shutdown(): Promise<void> {
    this.log.info('Shutting down connection pool', { name: this.config.name });

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    for (const request of this.requestQueue) {
      request.reject(new Error('Pool is shutting down'));
    }
    this.requestQueue = [];

    await this.pool.end();

    this.log.info('Connection pool shut down', { name: this.config.name });
  }

  async adjustPoolSize(targetSize: number): Promise<void> {
    if (targetSize < 1 || targetSize > 100) {
      throw new Error('Invalid pool size (must be 1-100)');
    }

    this.log.info('Adjusting pool size', {
      from: this.config.max,
      to: targetSize
    });

    const oldPool = this.pool;
    this.config.max = targetSize;
    this.initializePool();
    await oldPool.end();
  }

  async killLongRunningQueries(thresholdMs: number = 60000): Promise<number> {
    const killed: string[] = [];

    try {
      const appName = this.config.application_name || this.config.name;
      const result = await this.query<{ pid: number; query: string; duration: string }>(`
        SELECT
          pid,
          query,
          now() - pg_stat_activity.query_start AS duration
        FROM pg_stat_activity
        WHERE
          state != 'idle'
          AND query NOT ILIKE '%pg_stat_activity%'
          AND now() - pg_stat_activity.query_start > interval '${thresholdMs} milliseconds'
          AND application_name = $1
      `, [appName]);

      for (const row of result.rows) {
        try {
          await this.query(`SELECT pg_terminate_backend($1)`, [row.pid]);
          killed.push(`PID ${row.pid}: ${row.query.substring(0, 100)}`);
        } catch (error) {
          this.log.error(`Failed to kill query PID ${row.pid}`, error);
        }
      }

      if (killed.length > 0) {
        this.log.warn(`Killed ${killed.length} long-running queries`, { killed });
      }

    } catch (error) {
      this.log.error('Failed to check for long-running queries', error);
    }

    return killed.length;
  }
}
