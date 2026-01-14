/**
 * Database Configuration for Compliance Service
 * 
 * AUDIT FIX SEC-1, CFG-1: Remove hardcoded password fallback
 * All credentials must come from environment variables - no fallbacks allowed.
 */
import dotenv from 'dotenv';
import { Pool, PoolClient, QueryResult } from 'pg';
import Knex from 'knex';
import { logger } from '../utils/logger';

dotenv.config();

// =============================================================================
// VALIDATION - Fail fast if required config is missing
// =============================================================================

const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_NAME = process.env.DB_NAME;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;

// Fail fast in production if credentials are missing
if (!DB_PASSWORD) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: DB_PASSWORD environment variable is required in production');
  }
  logger.warn('DB_PASSWORD not set - this would fail in production');
}

if (!DB_HOST || !DB_NAME || !DB_USER) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: Database configuration (DB_HOST, DB_NAME, DB_USER) is required');
  }
  logger.warn('Database configuration incomplete - using development defaults');
}

// =============================================================================
// DATABASE CONFIGURATION
// =============================================================================

export const dbConfig = {
  // Connection settings - no insecure fallbacks in production
  host: DB_HOST || (process.env.NODE_ENV !== 'production' ? 'postgres' : undefined),
  port: parseInt(DB_PORT || '6432'),
  database: DB_NAME || (process.env.NODE_ENV !== 'production' ? 'tickettoken_db' : undefined),
  user: DB_USER || (process.env.NODE_ENV !== 'production' ? 'postgres' : undefined),
  password: DB_PASSWORD, // NO FALLBACK - must be provided
  
  // Connection pool settings
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  min: parseInt(process.env.DB_POOL_MIN || '2'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'),
  
  // Statement timeout for query safety
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'),
  
  // SSL configuration
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  } : undefined,
};

// =============================================================================
// CONNECTION STRING (for Knex)
// =============================================================================

export function getConnectionString(): string {
  if (!dbConfig.host || !dbConfig.database || !dbConfig.user || !dbConfig.password) {
    throw new Error('Database configuration is incomplete');
  }
  
  const ssl = dbConfig.ssl ? '?sslmode=require' : '';
  return `postgresql://${dbConfig.user}:${encodeURIComponent(dbConfig.password)}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}${ssl}`;
}

// =============================================================================
// LOGGING (without sensitive data)
// =============================================================================

if (process.env.NODE_ENV !== 'test') {
  logger.info({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    max: dbConfig.max,
    ssl: !!dbConfig.ssl
  }, 'Database config loaded');
}

// =============================================================================
// CONNECTION POOL (pg)
// =============================================================================

let pool: Pool | null = null;

/**
 * Get or create PostgreSQL connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      max: dbConfig.max,
      min: dbConfig.min,
      idleTimeoutMillis: dbConfig.idleTimeoutMillis,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
      ssl: dbConfig.ssl
    });

    pool.on('error', (err) => {
      logger.error({ error: err.message }, 'Database pool error');
    });
  }
  return pool;
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}

// =============================================================================
// KNEX INSTANCE
// =============================================================================

export const db = Knex({
  client: 'pg',
  connection: {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: dbConfig.ssl
  },
  pool: {
    min: dbConfig.min,
    max: dbConfig.max,
    idleTimeoutMillis: dbConfig.idleTimeoutMillis,
    acquireTimeoutMillis: dbConfig.connectionTimeoutMillis
  }
});

export default dbConfig;
