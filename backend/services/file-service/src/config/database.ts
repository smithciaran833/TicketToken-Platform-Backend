import { Pool } from 'pg';
import knex from 'knex';

export const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '6432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

export const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '6432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  }
});
