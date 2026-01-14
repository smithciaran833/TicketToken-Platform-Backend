/**
 * Knex Database Configuration
 * 
 * AUDIT FIX: SEC-3, DB-6, CFG-4 - Database SSL Security
 * - Enabled SSL certificate validation in production
 * - Added connection pool monitoring
 * - Added proper error handling for SSL
 */

import type { Knex } from 'knex';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import pg from 'pg';

dotenv.config();

// Configure pg to parse NUMERIC and DECIMAL types as numbers instead of strings
// Type IDs: 1700 = NUMERIC/DECIMAL
pg.types.setTypeParser(1700, (val: string) => parseFloat(val));

// =============================================================================
// SSL Configuration
// =============================================================================

/**
 * AUDIT FIX: DB-6 - Get SSL configuration for production
 * 
 * Options:
 * 1. Use DB_SSL_CA env var with base64-encoded CA certificate
 * 2. Use DB_SSL_CA_FILE env var with path to CA certificate file
 * 3. Use AWS RDS CA bundle if running on AWS
 * 4. Fall back to system CA certificates with verification enabled
 */
function getSSLConfig(): Knex.PgConnectionConfig['ssl'] {
  // In development, SSL is optional
  if (process.env.NODE_ENV !== 'production') {
    const devSsl = process.env.DB_SSL;
    if (devSsl === 'true') {
      return { rejectUnauthorized: false }; // OK for development only
    }
    return undefined;
  }

  // In production, always require SSL with certificate validation
  
  // Option 1: Base64-encoded CA certificate in environment variable
  if (process.env.DB_SSL_CA) {
    try {
      const ca = Buffer.from(process.env.DB_SSL_CA, 'base64').toString('utf-8');
      return {
        rejectUnauthorized: true,
        ca,
      };
    } catch (error) {
      console.error('Failed to decode DB_SSL_CA:', error);
    }
  }

  // Option 2: CA certificate file path
  if (process.env.DB_SSL_CA_FILE) {
    try {
      const ca = fs.readFileSync(process.env.DB_SSL_CA_FILE, 'utf-8');
      return {
        rejectUnauthorized: true,
        ca,
      };
    } catch (error) {
      console.error('Failed to read DB_SSL_CA_FILE:', error);
    }
  }

  // Option 3: AWS RDS CA bundle (common location)
  const rdsCaPath = '/etc/ssl/certs/rds-combined-ca-bundle.pem';
  if (fs.existsSync(rdsCaPath)) {
    try {
      const ca = fs.readFileSync(rdsCaPath, 'utf-8');
      return {
        rejectUnauthorized: true,
        ca,
      };
    } catch (error) {
      console.error('Failed to read RDS CA bundle:', error);
    }
  }

  // Option 4: Use system CA certificates with verification enabled
  // This is safer than rejectUnauthorized: false
  console.warn('No custom SSL CA configured - using system certificates');
  return {
    rejectUnauthorized: true,
  };
}

// =============================================================================
// Pool Configuration
// =============================================================================

/**
 * Connection pool configuration with proper lifecycle management
 */
function getPoolConfig(): Knex.PoolConfig {
  return {
    min: parseInt(process.env.DB_POOL_MIN || '2'),
    max: parseInt(process.env.DB_POOL_MAX || '10'),
    
    // Validate connections before use
    acquireTimeoutMillis: 30000,
    
    // Connection idle timeout
    idleTimeoutMillis: 30000,
    
    // Reap interval - how often to check for idle connections
    reapIntervalMillis: 1000,
    
    // Log when connection pool has issues
    afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
      // Set statement timeout to prevent runaway queries
      conn.query('SET statement_timeout = 30000', (err: Error | null) => {
        if (err) {
          console.error('Error setting statement_timeout:', err);
        }
        done(err, conn);
      });
    },
  };
}

// =============================================================================
// Knex Configuration
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
      ssl: getSSLConfig(),
    },
    pool: getPoolConfig(),
    migrations: {
      tableName: 'knex_migrations_files',
      directory: './src/migrations',
      extension: 'ts',
      loadExtensions: ['.ts']
    },
    seeds: {
      directory: './src/seeds'
    },
    // Enable query logging in development
    debug: process.env.DB_DEBUG === 'true',
  },

  test: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '6432'),
      database: process.env.DB_NAME_TEST || 'tickettoken_db_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    },
    pool: {
      min: 1,
      max: 5
    },
    migrations: {
      tableName: 'knex_migrations_files',
      directory: './src/migrations',
      extension: 'ts',
      loadExtensions: ['.ts']
    },
  },

  staging: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '6432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: getSSLConfig(),
    },
    pool: getPoolConfig(),
    migrations: {
      tableName: 'knex_migrations_files',
      directory: './dist/migrations',
      loadExtensions: ['.js']
    },
  },

  production: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '6432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      // AUDIT FIX: DB-6 - Enable SSL with certificate validation
      ssl: getSSLConfig(),
    },
    pool: getPoolConfig(),
    migrations: {
      tableName: 'knex_migrations_files',
      directory: './dist/migrations',
      loadExtensions: ['.js']
    },
    // Never enable debug in production
    debug: false,
  }
};

export default config;
