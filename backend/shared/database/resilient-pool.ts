// WP-12 Phase 3: Resilient Database Connection Pool

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { EventEmitter } from 'events';

interface PoolConfig {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  retryDelay?: number;
  maxRetries?: number;
  backoffFactor?: number;
}

interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
}

class ResilientPool extends EventEmitter {
  private config: Required<PoolConfig>;
  private pool: Pool | null;
  private retryCount: number;
  private connected: boolean;

  constructor(config: PoolConfig) {
    super();

    this.config = {
      connectionString: config.connectionString,
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
      // Retry configuration
      retryDelay: config.retryDelay || 1000,
      maxRetries: config.maxRetries || 10,
      backoffFactor: config.backoffFactor || 1.5,
    };

    this.pool = null;
    this.retryCount = 0;
    this.connected = false;

    this.connect();
  }

  async connect(): Promise<void> {
    try {
      this.pool = new Pool(this.config);

      // Test connection
      await this.pool.query('SELECT 1');

      this.connected = true;
      this.retryCount = 0;
      console.log('✅ Database connected');
      this.emit('connected');

      // Setup error handlers
      this.pool.on('error', (err: Error) => this.handleError(err));
    } catch (error) {
      await this.handleConnectionFailure(error as Error);
    }
  }

  async handleConnectionFailure(error: Error): Promise<void> {
    this.connected = false;
    this.retryCount++;

    if (this.retryCount <= this.config.maxRetries) {
      const delay = this.calculateBackoff();
      console.log(
        `⚠️  Database connection failed, retry ${this.retryCount}/${this.config.maxRetries} in ${delay}ms`
      );

      setTimeout(() => this.connect(), delay);
    } else {
      console.error('❌ Database connection failed after max retries');
      this.emit('error', error);
    }
  }

  calculateBackoff(): number {
    return Math.min(
      this.config.retryDelay * Math.pow(this.config.backoffFactor, this.retryCount - 1),
      30000 // Max 30 seconds
    );
  }

  async query<R extends QueryResultRow = any>(
    queryTextOrConfig: string | object,
    values?: any[]
  ): Promise<QueryResult<R>> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    try {
      if (values) {
        return await this.pool!.query<R>(queryTextOrConfig as string, values);
      } else {
        return await this.pool!.query<R>(queryTextOrConfig as any);
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        await this.handleConnectionFailure(error);
        throw error;
      }
      throw error;
    }
  }

  async handleError(error: Error): Promise<void> {
    console.error('Database pool error:', error.message);

    const errorCode = (error as any).code;
    if (errorCode === 'ECONNREFUSED' || errorCode === 'PROTOCOL_CONNECTION_LOST') {
      await this.connect();
    }
  }

  async end(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
    }
  }
}

export default ResilientPool;
