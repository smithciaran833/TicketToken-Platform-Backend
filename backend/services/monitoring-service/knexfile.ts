import type { Knex } from 'knex';
import * as dotenv from 'dotenv';
dotenv.config();

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    },
    pool: { min: 2, max: 10 },
    migrations: {
      tableName: 'knex_migrations_monitoring',
      directory: './src/migrations',
      extension: 'ts',
      loadExtensions: ['.ts']
    }
  }
};

export default config;
