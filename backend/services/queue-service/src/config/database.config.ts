import { Pool } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

export async function connectDatabase(): Promise<Pool> {
  if (pool) return pool;
  
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000
  });
  
  pool.on('connect', () => {
    logger.info('PostgreSQL connected');
  });
  
  pool.on('error', (error) => {
    logger.error('PostgreSQL error:', error);
  });
  
  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
}
