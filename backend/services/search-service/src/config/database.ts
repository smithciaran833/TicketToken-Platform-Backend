import knex from 'knex';
import { logger } from '../utils/logger';

export const dbConfig = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '6432', 10),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  pool: {
    min: 5,
    max: 20
  }
};

export const db = knex(dbConfig);

export async function connectDatabase(): Promise<void> {
  try {
    await db.raw('SELECT 1');
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}
