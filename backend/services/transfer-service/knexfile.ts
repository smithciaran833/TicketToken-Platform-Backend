/**
 * Knex Configuration for Transfer Service
 *
 * AUDIT FIX LOW-3: No knexfile → Proper migration configuration
 */
import type { Knex } from 'knex';
import { config } from 'dotenv';
// Load environment variables
config();
// =============================================================================
// DATABASE CONNECTION CONFIG
// =============================================================================
const baseConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'transfer_service',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' || process.env.DB_SSL === 'require'
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false,
  },
  pool: {
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
  migrations: {
    directory: './src/migrations',
    tableName: 'knex_migrations_transfer',
    extension: 'ts',
    loadExtensions: ['.ts', '.js'],
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
    loadExtensions: ['.ts', '.js'],
  },
};
// =============================================================================
// ENVIRONMENT-SPECIFIC CONFIGURATIONS
// =============================================================================
const configuration: Record<string, Knex.Config> = {
  development: {
    ...baseConfig,
    debug: true,
    asyncStackTraces: true,
  },
  test: {
    ...baseConfig,
    connection: {
      ...(baseConfig.connection as object),
      database: process.env.DB_NAME_TEST || 'tickettoken_test',
    },
    pool: {
      min: 1,
      max: 5,
    },
  },
  staging: {
    ...baseConfig,
    pool: {
      min: 2,
      max: 20,
      acquireTimeoutMillis: 60000,
    },
  },
  production: {
    ...baseConfig,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '5', 10),
      max: parseInt(process.env.DB_POOL_MAX || '30', 10),
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 60000,
      idleTimeoutMillis: 60000,
    },
    connection: {
      ...(baseConfig.connection as object),
      ssl: { rejectUnauthorized: true },
    },
    debug: false,
    asyncStackTraces: false,
  },
};
// =============================================================================
// EXPORT
// =============================================================================
export default configuration;
// Also export named configurations for direct access
export { configuration };
