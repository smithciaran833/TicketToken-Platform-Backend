import { Pool } from 'pg';
import { config } from './index';

export const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;

  if (duration > 1000) {
    console.warn('Slow query:', { text, duration, rows: res.rowCount });
  }

  return res;
}

export async function getClient() {
  const client = await pool.connect();
  const originalRelease = client.release.bind(client);
  
  // Timeout after 60 seconds
  const timeout = setTimeout(() => {
    console.error('Client has been checked out for more than 60 seconds!');
    console.error(`Database error occurred`);
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

export const db = require('knex')(require('./knexfile'));
