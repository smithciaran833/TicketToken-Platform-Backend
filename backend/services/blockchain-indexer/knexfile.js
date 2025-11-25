require('dotenv').config();

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken',
      user: process.env.DB_USER || 'tickettoken_user',
      password: process.env.DB_PASSWORD || 'your_password'
    },
    migrations: {
      directory: './dist/migrations',
      tableName: 'knex_migrations_indexer'
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
      directory: './dist/migrations',
      tableName: 'knex_migrations_indexer'
    }
  }
};
