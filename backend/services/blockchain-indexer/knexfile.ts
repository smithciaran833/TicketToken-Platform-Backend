import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

const config = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'tickettoken',
      password: process.env.DB_PASSWORD
    },
    migrations: {
      tableName: 'knex_migrations_blockchain_indexer',
      directory: process.env.NODE_ENV === 'production' ? './dist/migrations' : './src/migrations'
    }
  },
  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    },
    migrations: {
      tableName: 'knex_migrations_blockchain_indexer',
      directory: './dist/migrations'
    }
  }
};

export default config;
module.exports = config;
