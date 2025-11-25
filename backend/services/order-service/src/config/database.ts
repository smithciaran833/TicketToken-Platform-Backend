import { Pool } from 'pg';
import { promisify } from 'util';
import { resolve4 } from 'dns';
import { logger } from '../utils/logger';
import { initializeDatabaseMonitoring } from '../utils/database-monitor';

const resolveDns = promisify(resolve4);

let pool: Pool | null = null;

export async function initializeDatabase(): Promise<Pool> {
  if (pool) {
    return pool;
  }

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
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        // Query timeout settings for production stability
        statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10), // Kill queries after 30s
        query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10), // Alternative timeout setting
        idle_in_transaction_session_timeout: parseInt(process.env.DB_IDLE_TRANSACTION_TIMEOUT || '60000', 10), // Kill idle transactions after 60s
      });

      pool.on('error', (err) => {
        logger.error('Unexpected database error', { error: err });
      });

      pool.on('connect', () => {
        logger.debug('New database connection established');
      });

      // Test connection
      await pool.query('SELECT 1');

      logger.info('Database connection pool initialized successfully');
      
      // Initialize database query monitoring
      initializeDatabaseMonitoring(pool);
      
      return pool; // Success! Exit the retry loop

    } catch (error) {
      logger.error(`Connection attempt ${attempt} failed:`, { error });

      // Clean up failed pool
      if (pool) {
        await pool.end().catch(() => {});
        pool = null;
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

export function getDatabase(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}
