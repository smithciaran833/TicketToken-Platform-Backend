import { Pool } from 'pg';
import knex from 'knex';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '6432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

// Reduced from max: 20 to max: 5 to prevent connection spikes
export const pool = new Pool({
  ...dbConfig,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Set search_path to public schema only
pool.on('connect', async (client) => {
  console.log('Setting search_path to public');
  await client.query('SET search_path TO public');
  console.log('New client connected to database with search_path = public');
});

// IMPORTANT: Remove all existing connections on startup
pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

// Reduced from max: 10, min: 2 to max: 5, min: 1 to prevent connection spikes
export const db = knex({
  client: 'pg',
  connection: dbConfig,
  pool: { min: 1, max: 5 },
  searchPath: ['public']
});
