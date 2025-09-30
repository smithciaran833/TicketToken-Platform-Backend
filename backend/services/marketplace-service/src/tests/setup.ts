import { db } from '../config/database';

// Before all tests
beforeAll(async () => {
  // Run migrations for test database
  await db.migrate.latest();
});

// Before each test - start a transaction
beforeEach(async () => {
  await db.raw('BEGIN');
});

// After each test - rollback to keep tests isolated
afterEach(async () => {
  await db.raw('ROLLBACK');
});

// After all tests - clean up
afterAll(async () => {
  await db.destroy();
});
