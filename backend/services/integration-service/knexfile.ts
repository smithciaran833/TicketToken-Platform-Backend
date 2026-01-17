/**
 * Knex Configuration for Integration Service
 *
 * AUDIT FIXES:
 * - SEC-4/MIG-1: SSL rejectUnauthorized: false → Proper SSL verification in production
 * - DB-1: No timeouts → Lock and statement timeouts configured
 * - DB-2: Direct process.env → Still needed for CLI, but with proper defaults
 */

import Knex from 'knex';
import * as dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

// Configure pg to parse NUMERIC and DECIMAL types as numbers instead of strings
pg.types.setTypeParser(1700, (val: string) => parseFloat(val));

// =============================================================================
// ENVIRONMENT HELPERS
// =============================================================================

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// SSL configuration based on environment
function getSslConfig(): false | { rejectUnauthorized: boolean } {
  const sslEnabled = process.env.DB_SSL === 'true' || process.env.DB_SSL === 'require';

  if (!sslEnabled) {
    return false;
  }

  return {
    // AUDIT FIX MIG-1: In production, verify SSL certificates
    rejectUnauthorized: isProduction
  };
}

// Pool configuration with timeouts
const poolConfig = {
  min: parseInt(process.env.DB_POOL_MIN || '2'),
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  // AUDIT FIX DB-1: Connection timeouts
  acquireTimeoutMillis: 30000,
  createTimeoutMillis: 30000,
  destroyTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  reapIntervalMillis: 1000,
  createRetryIntervalMillis: 200,
  // Set lock and statement timeouts on each connection
  afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
    conn.query('SET lock_timeout = 30000', (err: Error | null) => {
      if (err) {
        return done(err, conn);
      }
      conn.query('SET statement_timeout = 60000', (err2: Error | null) => {
        done(err2, conn);
      });
    });
  }
};

// =============================================================================
// KNEX CONFIGURATIONS
// =============================================================================

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '6432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ssl: getSslConfig()
    },
    pool: poolConfig,
    migrations: {
      tableName: 'knex_migrations_integration',
      directory: './src/migrations'
    },
    seeds: {
      directory: './src/seeds'
    },
    searchPath: ['public', 'integration'],
    debug: process.env.LOG_LEVEL === 'debug'
  },

  test: {
    client: 'postgresql',
    connection: {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'tickettoken_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
      ssl: false
    },
    pool: {
      min: 1,
      max: 5
    },
    migrations: {
      tableName: 'knex_migrations_integration',
      directory: './src/migrations'
    },
    seeds: {
      directory: './src/seeds'
    }
  },

  staging: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: {
        // Staging should verify SSL but can be more lenient
        rejectUnauthorized: false
      }
    },
    pool: poolConfig,
    migrations: {
      tableName: 'knex_migrations_integration',
      directory: './src/migrations'
    },
    searchPath: ['public', 'integration']
  },

  production: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      // AUDIT FIX SEC-4, MIG-1: Proper SSL verification in production
      ssl: {
        rejectUnauthorized: true
      }
    },
    pool: {
      ...poolConfig,
      // Production can have larger pool
      min: parseInt(process.env.DB_POOL_MIN || '5'),
      max: parseInt(process.env.DB_POOL_MAX || '20')
    },
    migrations: {
      tableName: 'knex_migrations_integration',
      directory: './src/migrations'
    },
    searchPath: ['public', 'integration']
  }
};

export default config;
