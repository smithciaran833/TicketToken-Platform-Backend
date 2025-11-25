import knex, { Knex } from 'knex';
import { promisify } from 'util';
import { resolve4 } from 'dns';
import { config } from './index';
import { pino } from 'pino';

const logger = pino({ name: 'database' });
const resolveDns = promisify(resolve4);

export let db: Knex;

export async function connectDatabase() {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 2000; // Base delay in milliseconds
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`Database connection attempt ${attempt}/${MAX_RETRIES}...`);
      
      // Force DNS resolution to bypass Node.js DNS cache
      const dbIps = await resolveDns(config.database.host);
      const dbIp = dbIps[0];
      logger.info(`Resolved ${config.database.host} to ${dbIp}`);
      
      // Create database connection using resolved IP
      db = knex({
        client: 'postgresql',
        connection: {
          host: dbIp, // Use resolved IP instead of hostname
          port: config.database.port,
          user: config.database.user,
          password: config.database.password,
          database: config.database.database,
          ssl: config.environment === 'production' ? { rejectUnauthorized: false } : false
        },
        pool: {
          min: 2,
          max: 10,
          acquireTimeoutMillis: 30000,
          idleTimeoutMillis: 30000,
          propagateCreateError: false
        },
        migrations: {
          directory: './src/migrations',
          tableName: 'knex_migrations_event'
        }
      });

      // Test connection
      await db.raw('SELECT 1');
      
      logger.info('Database connection established successfully');
      return; // Success! Exit the retry loop
      
    } catch (error) {
      logger.error({ error }, `Connection attempt ${attempt} failed`);
      
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

// Keep legacy function for backward compatibility
export const createDatabaseConnection = (): Knex => {
  return db;
};
