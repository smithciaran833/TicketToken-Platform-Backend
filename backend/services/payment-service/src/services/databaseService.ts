import { Pool } from 'pg';
import { promisify } from 'util';
import { resolve4 } from 'dns';
import { logger } from '../utils/logger';

const resolveDns = promisify(resolve4);
const log = logger.child({ component: 'DatabaseService' });

class DatabaseServiceClass {
  private pool: Pool | null = null;

  async initialize(): Promise<void> {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 2000; // Base delay in milliseconds

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log.info(`Database connection attempt ${attempt}/${MAX_RETRIES}`);

        // Force DNS resolution to bypass Node.js DNS cache
        const dbHost = process.env.DB_HOST || 'pgbouncer';
        const dbIps = await resolveDns(dbHost);
        const dbIp = dbIps[0];
        log.info(`Resolved ${dbHost} to ${dbIp}`);

        // Create pool using resolved IP and individual config vars
        this.pool = new Pool({
          host: dbIp, // Use resolved IP instead of hostname
          port: parseInt(process.env.DB_PORT || '6432', 10),
          database: process.env.DB_NAME || 'tickettoken_db',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });

        this.pool.on('error', (err) => {
          log.error('Unexpected error on idle database client', { error: err });
        });

        // Test connection
        await this.pool.query('SELECT 1');

        log.info('Database connection pool initialized successfully');
        return; // Success! Exit the retry loop

      } catch (error) {
        log.error(`Connection attempt ${attempt} failed`, { error });

        // Clean up failed pool
        if (this.pool) {
          await this.pool.end().catch(() => {});
          this.pool = null;
        }

        // If we've exhausted all retries, throw the error
        if (attempt === MAX_RETRIES) {
          log.error('Failed to connect to database after all retries');
          throw error;
        }

        // Wait before retrying with exponential backoff
        const delayMs = RETRY_DELAY * attempt;
        log.info(`Waiting ${delayMs}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  getPool(): Pool {
    if (!this.pool) throw new Error('Database not initialized');
    return this.pool;
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const DatabaseService = new DatabaseServiceClass();
