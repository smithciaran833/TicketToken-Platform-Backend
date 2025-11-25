import { Pool } from 'pg';
import { config } from './index';
import { logger } from '../utils/logger';
import knex from 'knex';

const log = logger.child({ component: 'Database' });

export const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  log.error('Unexpected error on idle database client', { error: err });
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    log.warn('Slow query detected', { text, duration, rows: res.rowCount });
  }
  return res;
}

export async function getClient() {
  const client = await pool.connect();
  const originalRelease = client.release.bind(client);
  
  // Timeout after 60 seconds
  const timeout = setTimeout(() => {
    log.error('Client checked out for more than 60 seconds');
  }, 60000);

  const release = () => {
    clearTimeout(timeout);
    originalRelease();
  };

  return {
    query: client.query.bind(client),
    release,
    client
  };
}

export const db = knex({
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '6432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    tableName: 'knex_migrations_payment',
    directory: './src/migrations'
  }
});
