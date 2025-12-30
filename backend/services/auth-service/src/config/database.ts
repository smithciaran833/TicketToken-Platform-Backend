import { Pool } from 'pg';
import knex from 'knex';
import { logger } from '../utils/logger';
import { env } from './env';

// SSL/TLS configuration for secure database connections
const sslConfig = env.NODE_ENV === 'production'
  ? {
      rejectUnauthorized: true,
      ca: process.env.DB_CA_CERT,  // For cloud providers (AWS RDS, Azure, etc.)
    }
  : process.env.DB_SSL === 'true'
  ? { rejectUnauthorized: false }  // Allow local testing with self-signed certs
  : false;  // Disable SSL for local development

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '6432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: sslConfig,
};

export const pool = new Pool({
  ...dbConfig,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Set search_path, statement timeout, and transaction timeout on each new connection
pool.on('connect', async (client) => {
  await client.query('SET search_path TO public');
  await client.query('SET statement_timeout = 30000'); // 30 second statement timeout
  await client.query('SET idle_in_transaction_session_timeout = 60000'); // 60 second transaction timeout
  await client.query('SET lock_timeout = 10000'); // 10 second lock timeout
  logger.info('Database client connected', {
    searchPath: 'public',
    statementTimeout: '30s',
    transactionTimeout: '60s',
    lockTimeout: '10s',
  });
});

// Pool error handler - log and monitor, don't crash
pool.on('error', (err, client) => {
  logger.error('Unexpected database pool error', {
    error: err.message,
    stack: env.NODE_ENV !== 'production' ? err.stack : undefined,
    code: (err as any).code,
  });
  // Don't exit - pool will remove the errored client automatically
});

export const db = knex({
  client: 'pg',
  connection: dbConfig,
  pool: { min: 0, max: 5 },
  searchPath: ['public']
});
