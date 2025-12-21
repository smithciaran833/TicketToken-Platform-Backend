import type { Knex } from 'knex';
import * as dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

// Configure pg to parse NUMERIC and DECIMAL types as numbers instead of strings
// Type IDs: 1700 = NUMERIC/DECIMAL
pg.types.setTypeParser(1700, (val: string) => parseFloat(val));

/**
 * IMPORTANT: PgBouncer Configuration Notes
 * 
 * This service is configured to use PgBouncer (port 6432) for connection pooling.
 * 
 * PgBouncer Limitations:
 * - Does NOT support LISTEN/NOTIFY
 * - Does NOT support advisory locks
 * - Does NOT support prepared statements in transaction pooling mode
 * - Session-level SET commands may not persist across queries in transaction pooling
 * 
 * For operations requiring these features, use direct PostgreSQL connection (port 5432).
 * Set DB_PORT=5432 in environment variables when needed.
 */

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '6432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations_queue',
      directory: './src/migrations',
      extension: 'ts',
      loadExtensions: ['.ts']
    },
    seeds: {
      directory: './src/seeds'
    }
  },

  production: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '6432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations_queue',
      directory: './src/migrations',
      extension: 'ts',
      loadExtensions: ['.ts']
    }
  }
};

export default config;
