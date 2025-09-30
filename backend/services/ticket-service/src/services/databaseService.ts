import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

class DatabaseServiceClass {
  private pool: Pool | null = null;
  private log = logger.child({ component: 'DatabaseService' });

  async initialize(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: config.database.url,
        max: config.database.pool?.max || 20,
        min: config.database.pool?.min || 2,
        idleTimeoutMillis: config.database.pool?.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.database.pool?.connectionTimeoutMillis || 5000
      });

      this.pool.on('error', (err) => {
        this.log.error('Database pool error:', err);
      });

      await this.pool.query('SELECT 1');
      this.log.info('Database service initialized');
    } catch (error) {
      this.log.error('Failed to initialize database service:', error);
      throw error;
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
    return this.pool;
  }

  getStats() {
    if (!this.pool) {
      return { total: 0, idle: 0, waiting: 0 };
    }
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount
    };
  }

  getPoolManager() {
    return this.pool;
  }

  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
    const result = await this.pool.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  async transaction<T = any>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
    const client = await this.pool.connect();
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

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

export const DatabaseService = new DatabaseServiceClass();
