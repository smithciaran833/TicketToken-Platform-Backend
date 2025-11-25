import { Pool } from 'pg';
import { logger } from '../utils/logger';

class DatabaseServiceClass {
  private pool: Pool | null = null;

  async initialize(): Promise<void> {
    // Use DATABASE_URL if provided, otherwise construct from parts
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL
      });
    } else {
      this.pool = new Pool({
        host: process.env.DB_HOST || 'tickettoken-postgres',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'tickettoken_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'localdev123'
      });
    }

    await this.pool.query('SELECT NOW()');
    logger.info('Database pool connection verified');
  }

  getPool(): Pool {
    if (!this.pool) throw new Error('Database not initialized');
    return this.pool;
  }
}

export const DatabaseService = new DatabaseServiceClass();
