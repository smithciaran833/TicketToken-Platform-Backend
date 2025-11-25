import knex from 'knex';
import { promisify } from 'util';
import { resolve4 } from 'dns';
import { config } from './index';
import { logger } from '../utils/logger';

const resolveDns = promisify(resolve4);

export let db: any;
export let analyticsDb: any;

export async function connectDatabases() {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 2000; // Base delay in milliseconds
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`Database connection attempt ${attempt}/${MAX_RETRIES}...`);
      
      // Force DNS resolution to bypass Node.js DNS cache
      const mainDbIps = await resolveDns(config.database.host);
      const mainDbIp = mainDbIps[0];
      logger.info(`Resolved ${config.database.host} to ${mainDbIp}`);
      
      const analyticsDbIps = await resolveDns(config.analyticsDatabase.host);
      const analyticsDbIp = analyticsDbIps[0];
      logger.info(`Resolved ${config.analyticsDatabase.host} to ${analyticsDbIp}`);
      
      // Main database connection (through PgBouncer) using resolved IP
      db = knex({
        client: 'postgresql',
        connection: {
          host: mainDbIp, // Use resolved IP instead of hostname
          port: config.database.port,
          database: config.database.database,
          user: config.database.user,
          password: config.database.password,
        },
        pool: {
          min: config.database.pool.min,
          max: config.database.pool.max,
          createTimeoutMillis: 3000,
          acquireTimeoutMillis: 30000,
          idleTimeoutMillis: 30000,
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 100,
        },
        acquireConnectionTimeout: 30000,
      });

      // Analytics database connection (direct for read replicas) using resolved IP
      analyticsDb = knex({
        client: 'postgresql',
        connection: {
          host: analyticsDbIp, // Use resolved IP instead of hostname
          port: config.analyticsDatabase.port,
          database: config.analyticsDatabase.database,
          user: config.analyticsDatabase.user,
          password: config.analyticsDatabase.password,
        },
        pool: {
          min: 2,
          max: 10,
        },
      });

      // SECURITY FIX: Set tenant context using parameterized query
      db.on('query', (query: any) => {
        if ((global as any).currentTenant) {
          query.on('query', async () => {
            // Use parameterized query to prevent SQL injection
            // PostgreSQL doesn't allow parameterization of SET statements directly,
            // but we can validate the tenant ID format
            const tenantId = (global as any).currentTenant;
            
            // Validate tenant ID (should be UUID or similar safe format)
            if (!isValidTenantId(tenantId)) {
              logger.error(`Invalid tenant ID format: ${tenantId}`);
              throw new Error('Invalid tenant ID');
            }
            
            // Since SET doesn't support parameters, we validate and escape
            const escapedTenantId = escapeTenantId(tenantId);
            await db.raw(`SET app.current_tenant = ?`, [escapedTenantId]);
          });
        }
      });

      // Test connections
      await db.raw('SELECT 1');
      await analyticsDb.raw('SELECT 1');

      logger.info('Database connections established successfully');
      return; // Success! Exit the retry loop
      
    } catch (error) {
      logger.error(`Connection attempt ${attempt} failed:`, error);
      
      // If we've exhausted all retries, throw the error
      if (attempt === MAX_RETRIES) {
        logger.error('Failed to connect to databases after all retries');
        throw error;
      }
      
      // Wait before retrying with exponential backoff
      const delayMs = RETRY_DELAY * attempt;
      logger.info(`Waiting ${delayMs}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// Validate tenant ID format (adjust regex based on your tenant ID format)
function isValidTenantId(tenantId: string): boolean {
  // Example: UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // Or alphanumeric with underscores/hyphens
  const alphanumericRegex = /^[a-zA-Z0-9_-]+$/;
  
  return uuidRegex.test(tenantId) || alphanumericRegex.test(tenantId);
}

// Escape tenant ID for safe SQL usage
function escapeTenantId(tenantId: string): string {
  // Remove any potentially dangerous characters
  // This is a backup in case validation fails
  return tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function getAnalyticsDb() {
  if (!analyticsDb) {
    throw new Error('Analytics database not initialized');
  }
  return analyticsDb;
}

export async function closeDatabases() {
  if (db) {
    await db.destroy();
  }
  if (analyticsDb) {
    await analyticsDb.destroy();
  }
  logger.info('Database connections closed');
}
