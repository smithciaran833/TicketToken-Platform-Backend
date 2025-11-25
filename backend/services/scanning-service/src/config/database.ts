import { Pool, PoolClient } from 'pg';
import { promisify } from 'util';
import { resolve4 } from 'dns';
import logger from '../utils/logger';

const resolveDns = promisify(resolve4);

let pool: Pool | undefined;

export async function initializeDatabase(): Promise<Pool> {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 2000; // Base delay in milliseconds

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`Database connection attempt ${attempt}/${MAX_RETRIES}...`);

      // Force DNS resolution to bypass Node.js DNS cache
      const dbHost = process.env.DB_HOST || 'pgbouncer';
      const dbIps = await resolveDns(dbHost);
      const dbIp = dbIps[0];
      logger.info(`Resolved ${dbHost} to ${dbIp}`);

      // Create pool using resolved IP and individual config vars
      pool = new Pool({
        host: dbIp, // Use resolved IP instead of hostname
        port: parseInt(process.env.DB_PORT || '6432', 10),
        database: process.env.DB_NAME || 'tickettoken_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      pool.on('error', (err) => {
        logger.error('Unexpected error on idle database client', err);
      });

      // Test connection
      const client: PoolClient = await pool.connect();
      await client.query('SELECT 1');
      client.release();

      logger.info('✅ Database connection pool initialized successfully');
      return pool; // Success! Exit the retry loop

    } catch (error) {
      logger.error(`Connection attempt ${attempt} failed:`, error);

      // Clean up failed pool
      if (pool) {
        await pool.end().catch(() => {});
        pool = undefined;
      }

      // If we've exhausted all retries, throw the error
      if (attempt === MAX_RETRIES) {
        logger.error('Failed to connect to database after all retries');
        throw error;
      }

      // Wait before retrying with exponential backoff
      const delayMs = RETRY_DELAY * attempt;
      logger.info(`Waiting ${delayMs}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('Failed to initialize database');
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}
