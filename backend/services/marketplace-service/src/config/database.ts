import knex, { Knex } from 'knex';
import { logger } from '../utils/logger';

/**
 * Database Configuration for Marketplace Service
 * 
 * Issues Fixed:
 * - SEC-3: No database TLS/SSL → Added SSL config for production
 * - DB-1: SSL not verified → rejectUnauthorized: true in production
 * - CFG-H2: Password length logged → Removed sensitive info from logs
 */

// AUDIT FIX CFG-H2: Don't log password-related info
logger.info('DB Connection attempt:', {
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || '6432',
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? 'enabled' : 'disabled'
});

// AUDIT FIX SEC-3/DB-1: Configure SSL based on environment
const isProduction = process.env.NODE_ENV === 'production';
const sslEnabled = process.env.DB_SSL === 'true' || isProduction;

// SSL configuration for secure database connections
const sslConfig = sslEnabled ? {
  ssl: {
    // AUDIT FIX DB-1: In production, require valid certificates
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    // Optional: specify CA certificate for self-signed certs
    ca: process.env.DB_SSL_CA || undefined,
  }
} : {};

const config: Knex.Config = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '6432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ...sslConfig,
  },
  pool: {
    min: 2,
    max: 10,
    createTimeoutMillis: 3000,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
};

export const db = knex(config);

// Test connection function
export async function testConnection(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeConnection(): Promise<void> {
  await db.destroy();
  logger.info('Database connection closed');
}

export default db;
