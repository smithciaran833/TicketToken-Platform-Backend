import knex from 'knex';
import path from 'path';

export const db = knex({
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'tickettoken',
    password: process.env.DB_PASSWORD || ''
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: path.join(__dirname, '../migrations')
  }
});

export async function closeDatabaseConnections(): Promise<void> {
  await db.destroy();
}
