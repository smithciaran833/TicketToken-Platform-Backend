import type { Knex } from 'knex';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

// Configure pg to parse NUMERIC and DECIMAL types as numbers instead of strings
// Type IDs: 1700 = NUMERIC/DECIMAL
pg.types.setTypeParser(1700, (val: string) => parseFloat(val));

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: './src/migrations',
      tableName: 'knex_migrations_search',
      extension: 'ts',
      loadExtensions: ['.ts']
    }
  },
  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: './src/migrations',
      tableName: 'knex_migrations_search',
      extension: 'ts',
      loadExtensions: ['.ts']
    }
  }
};

export default config;
