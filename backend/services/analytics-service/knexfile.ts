/**
 * Knex Configuration
 * AUDIT FIX: DB-2,3 - Proper database migration configuration
 */

import type { Knex } from 'knex';
import * as dotenv from 'dotenv';

dotenv.config();

// =============================================================================
// SSL Configuration
// =============================================================================

function getSSLConfig(): Knex.PgConnectionConfig['ssl'] | boolean {
  const sslEnabled = process.env.DATABASE_SSL === 'true' || process.env.NODE_ENV === 'production';
  
  if (!sslEnabled) {
    return false;
  }

  const sslConfig: any = {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  };

  if (process.env.DATABASE_SSL_CA) {
    sslConfig.ca = process.env.DATABASE_SSL_CA;
  }
  if (process.env.DATABASE_SSL_CERT) {
    sslConfig.cert = process.env.DATABASE_SSL_CERT;
  }
  if (process.env.DATABASE_SSL_KEY) {
    sslConfig.key = process.env.DATABASE_SSL_KEY;
  }

  return sslConfig;
}

// =============================================================================
// Base Configuration
// =============================================================================

const baseConfig: Knex.Config = {
  client: 'pg',
  migrations: {
    directory: './src/migrations',
    extension: 'ts',
    tableName: 'knex_migrations',
    schemaName: 'public',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
  pool: {
    min: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
    max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
    // Set tenant context on each new connection
    afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
      // Execute any setup queries on new connections
      conn.query('SET statement_timeout = 30000', (err: Error | null) => {
        done(err, conn);
      });
    },
  },
  acquireConnectionTimeout: 30000,
};

// =============================================================================
// Environment Configurations
// =============================================================================

const config: { [key: string]: Knex.Config } = {
  development: {
    ...baseConfig,
    connection: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: process.env.DATABASE_NAME || 'analytics_dev',
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      ssl: false,
    },
    debug: true,
  },

  test: {
    ...baseConfig,
    connection: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: process.env.TEST_DB_NAME || 'tickettoken_test',
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      ssl: false,
    },
    pool: {
      min: 1,
      max: 5,
    },
  },

  staging: {
    ...baseConfig,
    connection: {
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: process.env.DATABASE_NAME,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      ssl: getSSLConfig(),
    },
  },

  production: {
    ...baseConfig,
    connection: {
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: process.env.DATABASE_NAME,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      ssl: getSSLConfig(),
    },
    pool: {
      min: parseInt(process.env.DATABASE_POOL_MIN || '5', 10),
      max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
    },
  },
};

export default config;
module.exports = config;
