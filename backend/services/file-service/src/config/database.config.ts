import { Pool } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

export async function connectDatabase(): Promise<void> {
  try {
    const dbUrl = process.env.DATABASE_URL;
    logger.info('Attempting database connection...');
    logger.debug(`Connection string: ${dbUrl?.replace(/:[^:@]+@/, ':****@')}`); // Log URL with hidden password
    
    pool = new Pool({
      connectionString: dbUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Test connection
    await pool.query('SELECT 1');
    logger.info('Database connection established');
  } catch (error: any) {
    logger.error('Database connection failed:', error);
    logger.error('Error code:', error.code);
    
    // In development, show helpful message
    if (process.env.NODE_ENV === 'development') {
      logger.info('Try connecting manually: psql -h localhost -p 5432 -U postgres -d tickettoken_db');
      logger.info('Then update DATABASE_URL in .env.development with the working password');
    }
    throw error;
  }
}

export function getPool(): Pool | null {
  return pool;
}

export function hasDatabase(): boolean {
  return pool !== null;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
  }
}
