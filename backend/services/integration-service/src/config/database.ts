import knex, { Knex } from 'knex';
import { promisify } from 'util';
import { resolve4 } from 'dns';
import { logger } from '../utils/logger';

const resolveDns = promisify(resolve4);

export let db: Knex;

export async function initializeDatabase() {
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
      
      // Create database connection using resolved IP
      db = knex({
        client: 'postgresql',
        connection: {
          host: dbIp, // Use resolved IP instead of hostname
          port: parseInt(process.env.DB_PORT || '6432', 10),
          database: process.env.DB_NAME || 'tickettoken_db',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
        },
        pool: {
          min: 2,
          max: 10
        }
      });

      // Test connection
      await db.raw('SELECT 1');
      
      logger.info('Database connection established successfully');
      return; // Success! Exit the retry loop
      
    } catch (error) {
      logger.error(`Connection attempt ${attempt} failed:`, error);
      
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
}
