import { Pool } from 'pg';
import { config } from './index';

// Create singleton database pool
export const pool = new Pool({
  connectionString: config.database.url,
  ...config.database.pool,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
  process.exit(-1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool');
  await pool.end();
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database pool');
  await pool.end();
});
