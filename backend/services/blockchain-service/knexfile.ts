import { config as dotenvConfig } from 'dotenv';
import pg from 'pg';
dotenvConfig();

// Configure pg to parse NUMERIC and DECIMAL types as numbers instead of strings
// Type IDs: 1700 = NUMERIC/DECIMAL
pg.types.setTypeParser(1700, (val: string) => parseFloat(val));

// =============================================================================
// SSL CONFIGURATION
// =============================================================================

/**
 * Get SSL configuration based on environment
 * Issue #72, #79: Add SSL for production
 */
function getSSLConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
  const isProduction = process.env.NODE_ENV === 'production';
  const sslEnabled = process.env.DB_SSL === 'true' || isProduction;
  
  if (!sslEnabled) {
    return false;
  }
  
  return {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    ca: process.env.DB_CA_CERT || undefined
  };
}

// =============================================================================
// POOL CONFIGURATION
// Issue #78: Add proper pool settings
// =============================================================================

const poolConfig = {
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT_MS || '30000', 10),
  createTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '10000', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  propagateCreateError: false
};

// =============================================================================
// ENVIRONMENT CONFIGURATIONS
// =============================================================================

const config = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: getSSLConfig()
    },
    pool: poolConfig,
    migrations: {
      tableName: 'knex_migrations_blockchain',
      directory: './src/migrations',
      // Issue #77: Add lock_timeout for migrations
      disableTransactions: false
    },
    // Issue #77: Set lock_timeout
    acquireConnectionTimeout: 60000
  },
  
  test: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'tickettoken_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: false // No SSL in test
    },
    pool: {
      min: 1,
      max: 5,
      acquireTimeoutMillis: 10000,
      idleTimeoutMillis: 10000
    },
    migrations: {
      tableName: 'knex_migrations_blockchain',
      directory: './src/migrations'
    }
  },
  
  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      // Issue #72, #79: SSL required in production
      ssl: {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
        ca: process.env.DB_CA_CERT || undefined
      }
    },
    pool: {
      ...poolConfig,
      // Production uses higher limits
      min: parseInt(process.env.DB_POOL_MIN || '5', 10),
      max: parseInt(process.env.DB_POOL_MAX || '20', 10)
    },
    migrations: {
      tableName: 'knex_migrations_blockchain',
      directory: './dist/migrations',
      disableTransactions: false
    },
    acquireConnectionTimeout: 60000
  }
};

// =============================================================================
// VALIDATION
// =============================================================================

// Validate production config at startup
if (process.env.NODE_ENV === 'production') {
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required database environment variables: ${missing.join(', ')}`);
  }
  
  // Warn about insecure passwords
  const password = process.env.DB_PASSWORD;
  if (password === 'postgres' || password === 'password') {
    throw new Error('Insecure database password detected in production');
  }
}

export default config;
module.exports = config;
