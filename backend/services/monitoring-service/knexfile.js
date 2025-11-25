module.exports = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'pgbouncer',
      port: parseInt(process.env.DB_PORT || '6432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: './dist/migrations',
      tableName: 'knex_migrations_monitoring',
      extension: 'js',
      loadExtensions: ['.js']  // Only load .js files, ignore .d.ts
    }
  },
  production: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: './dist/migrations',
      tableName: 'knex_migrations_monitoring',
      extension: 'js',
      loadExtensions: ['.js']  // Only load .js files, ignore .d.ts
    }
  }
};
