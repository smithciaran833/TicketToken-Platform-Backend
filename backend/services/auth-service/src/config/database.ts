import { Pool } from 'pg';
import knex from 'knex';

// Simple, working configuration
const dbConfig = {
  host: process.env.DB_HOST || 'tickettoken-postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

export const pool = new Pool({
  ...dbConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = knex({
  client: 'pg',
  connection: dbConfig,
  pool: { min: 2, max: 10 }
});

pool.on('connect', (client) => {
  console.log('New client connected to database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    return !!result.rows[0];
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

export async function closeDatabaseConnections() {
  await db.destroy();
  await pool.end();
}
