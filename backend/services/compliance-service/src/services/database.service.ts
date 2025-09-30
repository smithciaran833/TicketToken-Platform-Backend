import { Pool } from 'pg';
import { dbConfig } from '../config/database';

class DatabaseService {
  private pool: Pool | null = null;

  async connect(): Promise<void> {
    try {
      this.pool = new Pool(dbConfig);
      
      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    return this.pool;
  }

  async query(text: string, params?: any[]) {
    const pool = this.getPool();
    return pool.query(text, params);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log('Database connection closed');
    }
  }
}

export const db = new DatabaseService();
