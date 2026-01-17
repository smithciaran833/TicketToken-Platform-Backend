import knex from 'knex';
import path from 'path';

const parsePort = (port: string | undefined, defaultPort: number): number => {
  if (!port || port === '') return defaultPort;
  const parsed = parseInt(port);
  return isNaN(parsed) ? defaultPort : parsed;
};

export const db = knex({
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parsePort(process.env.DB_PORT, 6432),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: path.join(__dirname, '../migrations'),
    tableName: 'knex_migrations_monitoring',
    extension: 'js'
  }
});

export default db;
