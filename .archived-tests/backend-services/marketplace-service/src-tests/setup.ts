import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import { db } from '../config/database';

beforeAll(async () => {
  try {
    await db.raw('SELECT 1');
    console.log('Database connected for tests');
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}, 30000);

beforeEach(async () => {
  await db.raw('BEGIN');
});

afterEach(async () => {
  await db.raw('ROLLBACK');
});

afterAll(async () => {
  await db.destroy();
});
