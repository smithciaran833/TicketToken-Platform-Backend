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

    // Set tenant context for each query
    db.on('query', (query: any) => {
      if ((global as any).currentTenant) {
        query.on('query', () => {
          db.raw(`SET app.current_tenant = '${(global as any).currentTenant}'`);
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
