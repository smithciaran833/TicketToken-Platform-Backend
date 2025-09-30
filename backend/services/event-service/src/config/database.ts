import knex from 'knex';
import { config } from './index';
import { pino } from 'pino';

const logger = pino({ name: 'database' });

export const createDatabaseConnection = () => {
  const db = knex({
    client: 'postgresql',
    connection: {
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      ssl: config.environment === 'production' ? { rejectUnauthorized: false } : false
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      propagateCreateError: false
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    }
  });

  // Test connection
  db.raw('SELECT 1')
    .then(() => {
      logger.info('Database connection established');
    })
    .catch((error) => {
      logger.error({ error }, 'Database connection failed');
      process.exit(1);
    });

  return db;
};
