import { Pool, PoolClient } from 'pg';
import { promisify } from 'util';
import { resolve4 } from 'dns';
import { config } from '../config';
import { logger } from '../utils/logger';

const resolveDns = promisify(resolve4);

class DatabaseServiceClass {
  private pool: Pool | null = null;
  private log = logger.child({ component: 'DatabaseService' });

  async initialize(): Promise<void> {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 2000; // Base delay in milliseconds
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        this.log.info(`Database connection attempt ${attempt}/${MAX_RETRIES}...`);
        
        // Force DNS resolution to bypass Node.js DNS cache
        const dbHost = process.env.DB_HOST || 'pgbouncer';
        const dbIps = await resolveDns(dbHost);
        const dbIp = dbIps[0];
        this.log.info(`Resolved ${dbHost} to ${dbIp}`);
        
        // Create pool using resolved IP and individual config vars
        this.pool = new Pool({
          host: dbIp, // Use resolved IP instead of hostname
          port: parseInt(process.env.DB_PORT || '6432', 10),
          database: process.env.DB_NAME || 'tickettoken_db',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          max: config.database.pool?.max || 20,
          min: config.database.pool?.min || 2,
          idleTimeoutMillis: config.database.pool?.idleTimeoutMillis || 30000,
          connectionTimeoutMillis: config.database.pool?.connectionTimeoutMillis || 5000
        });

        this.pool.on('error', (err) => {
          this.log.error('Database pool error:', err);
        });

        // Test connection
        await this.pool.query('SELECT 1');
        
        this.log.info('Database service initialized successfully');
        return; // Success! Exit the retry loop
        
      } catch (error) {
        this.log.error(`Connection attempt ${attempt} failed:`, error);
        
        // Clean up failed pool
        if (this.pool) {
          await this.pool.end().catch(() => {});
          this.pool = null;
        }
        
        // If we've exhausted all retries, throw the error
        if (attempt === MAX_RETRIES) {
          this.log.error('Failed to connect to database after all retries');
          throw error;
        }
        
        // Wait before retrying with exponential backoff
        const delayMs = RETRY_DELAY * attempt;
        this.log.info(`Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
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
      
      // CRITICAL: Explicitly wait for COMMIT to complete
      const commitResult = await client.query('COMMIT');
      this.log.debug('COMMIT response', { command: commitResult.command });
      
      // Force a flush by querying transaction status
      const statusCheck = await client.query('SELECT txid_current_if_assigned()');
      this.log.debug('Transaction ID after commit', { txid: statusCheck.rows[0] });
      
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
      this.log.info('Closing database pool...');
      await this.pool.end();
      this.pool = null;
      this.log.info('Database pool closed');
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
