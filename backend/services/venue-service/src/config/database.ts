import knex, { Knex } from 'knex';

// SECURITY FIX (SEC-DB1): Enable SSL/TLS for database connections in production
const isProduction = process.env.NODE_ENV === 'production';

export const dbConfig: Knex.Config = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '6432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'tickettoken_db',
    application_name: 'venue-service',
    // SECURITY FIX (SEC-DB1): SSL configuration for production
    ...(isProduction && {
      ssl: {
        rejectUnauthorized: true,
        // Optionally specify CA cert path
        // ca: process.env.DB_SSL_CA,
      }
    }),
    // Use sslmode from env if specified
    ...(process.env.DB_SSL_MODE && { ssl: process.env.DB_SSL_MODE === 'require' })
  },
  pool: {
    min: 0,
    max: 10,
    // SECURITY FIX (DC3): Set statement timeout in pool afterCreate hook
    afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
      // Set statement timeout to 30 seconds to prevent long-running queries
      conn.query('SET statement_timeout = 30000', (err: Error | null) => {
        if (err) {
          console.error('Failed to set statement_timeout:', err.message);
        }
        done(err, conn);
      });
    }
  },
  acquireConnectionTimeout: 60000,
  migrations: {
    directory: './src/migrations',
    tableName: 'knex_migrations_venue'
  },
  seeds: {
    directory: './src/seeds'
  }
};

// Create database instance
export const db = knex(dbConfig);

import { logger } from '../utils/logger';
import { Gauge, Counter } from 'prom-client';

const log = logger.child({ component: 'DatabasePool' });

// SECURITY FIX (DC4-DC5): Pool metrics for monitoring
const poolMetrics = {
  size: new Gauge({
    name: 'db_pool_size',
    help: 'Current size of the database connection pool',
    labelNames: ['service']
  }),
  available: new Gauge({
    name: 'db_pool_available',
    help: 'Number of available connections in the pool',
    labelNames: ['service']
  }),
  pending: new Gauge({
    name: 'db_pool_pending',
    help: 'Number of pending connection requests',
    labelNames: ['service']
  }),
  errors: new Counter({
    name: 'db_pool_errors_total',
    help: 'Total number of pool errors',
    labelNames: ['service', 'type']
  }),
  connections: new Counter({
    name: 'db_pool_connections_total',
    help: 'Total connections created/destroyed',
    labelNames: ['service', 'action']
  }),
};

// SECURITY FIX (DB9/DC5): Pool error handler with proper logging
db.client.pool.on('error', (err: Error) => {
  log.error({
    error: err.message,
    stack: err.stack,
    poolSize: db.client.pool.numUsed?.() + db.client.pool.numFree?.() || 0,
  }, 'Database pool error');
  poolMetrics.errors.inc({ service: 'venue-service', type: 'pool_error' });
});

// SECURITY FIX (DC4): Pool event handlers for comprehensive monitoring
db.client.pool.on('createSuccess', () => {
  log.debug('Database pool connection created');
  poolMetrics.connections.inc({ service: 'venue-service', action: 'created' });
  updatePoolMetrics();
});

db.client.pool.on('destroySuccess', () => {
  log.debug('Database pool connection destroyed');
  poolMetrics.connections.inc({ service: 'venue-service', action: 'destroyed' });
  updatePoolMetrics();
});

db.client.pool.on('acquireSuccess', () => {
  updatePoolMetrics();
});

db.client.pool.on('release', () => {
  updatePoolMetrics();
});

// DC5: Handle acquire timeout errors
db.client.pool.on('acquireFail', (err: Error) => {
  log.error({ error: err.message }, 'Failed to acquire database connection');
  poolMetrics.errors.inc({ service: 'venue-service', type: 'acquire_fail' });
});

function updatePoolMetrics() {
  try {
    const pool = db.client.pool;
    poolMetrics.size.set({ service: 'venue-service' },
      (pool.numUsed?.() || 0) + (pool.numFree?.() || 0));
    poolMetrics.available.set({ service: 'venue-service' }, pool.numFree?.() || 0);
    poolMetrics.pending.set({ service: 'venue-service' }, pool.numPendingAcquires?.() || 0);
  } catch (error) {
    // Pool methods may not be available in all knex versions
  }
}

// SECURITY FIX (DC4): Pool monitoring with periodic health checks
export function startPoolMonitoring(intervalMs = 30000) {
  log.info({ intervalMs }, 'Database pool monitoring started');

  setInterval(() => {
    try {
      const pool = db.client.pool;
      const stats = {
        used: pool.numUsed?.() || 0,
        free: pool.numFree?.() || 0,
        pending: pool.numPendingAcquires?.() || 0,
      };

      // Update metrics
      updatePoolMetrics();

      // Log warning if pool is near capacity
      const utilization = stats.used / (stats.used + stats.free) * 100;
      if (utilization > 80) {
        log.warn({ ...stats, utilization: `${utilization.toFixed(1)}%` },
          'Database pool utilization high');
      }

      // Log warning if pending requests
      if (stats.pending > 0) {
        log.warn({ pending: stats.pending }, 'Pending database connection requests');
      }
    } catch (error) {
      log.debug('Pool stats not available');
    }
  }, intervalMs);
}

// Check database connection with retries
export async function checkDatabaseConnection(retries = 10, delay = 3000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempting database connection... (attempt ${i + 1}/${retries})`);
      console.log(`DB Config: host=${process.env.DB_HOST}, port=${process.env.DB_PORT}, db=${process.env.DB_NAME}`);

      await db.raw('SELECT 1');
      console.log('Database connection successful!');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Database connection attempt ${i + 1} failed:`, errorMessage);
      if (i < retries - 1) {
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('Failed to connect to database after all retries');
  return false;
}

export default db;
