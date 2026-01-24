import { Pool } from 'pg';
import { config } from './index';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'Database' });

// Create singleton database pool
export const pool = new Pool({
  connectionString: config.database.url,
  ...config.database.pool,
});

// Handle pool errors
pool.on('error', (err) => {
  log.error('Unexpected error on idle database client', { error: err });
  process.exit(-1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, closing database pool');
  await pool.end();
});

process.on('SIGINT', async () => {
  log.info('SIGINT received, closing database pool');
  await pool.end();
});
