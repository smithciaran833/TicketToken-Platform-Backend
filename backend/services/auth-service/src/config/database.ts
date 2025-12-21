import { Pool } from 'pg';
import knex from 'knex';

// SSL/TLS configuration for secure database connections
const sslConfig = process.env.NODE_ENV === 'production'
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
