import { Pool, PoolClient } from 'pg';
import { logger } from './logger';

/**
 * Execute a function within a database transaction
 * Automatically handles BEGIN, COMMIT, and ROLLBACK
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    logger.debug('Transaction started');
    
    const result = await fn(client);
    
    await client.query('COMMIT');
    logger.debug('Transaction committed');
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', { error });
    throw error;
  } finally {
    client.release();
  }
}
