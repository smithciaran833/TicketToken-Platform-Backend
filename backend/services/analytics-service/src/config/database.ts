import knex from 'knex';
import { config } from './index';
import { logger } from '../utils/logger';

let db: any;
let analyticsDb: any;

export async function connectDatabases() {
  try {
    // Main database connection (through PgBouncer)
    db = knex({
      client: 'postgresql',
      connection: {
        host: config.database.host,
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

    // Analytics database connection (direct for read replicas)
    analyticsDb = knex({
      client: 'postgresql',
      connection: {
        host: config.analyticsDatabase.host,
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

    logger.info('Database connections established');
  } catch (error) {
    logger.error('Failed to connect to databases:', error);
    throw error;
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
