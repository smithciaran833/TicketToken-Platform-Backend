import knex from 'knex';

export const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tickettoken',
  pool: {
    min: 2,
    max: 10
  }
});
