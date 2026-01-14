/**
 * Setup Sanity Check Test
 * Verifies the test infrastructure works before writing real tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_VENUE_ID,
  db,
  pool
} from './setup';

describe('Integration Test Setup', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  it('should have a working database connection', async () => {
    const result = await pool.query('SELECT 1 as num');
    expect(result.rows[0].num).toBe(1);
  });

  it('should have test tenant seeded', async () => {
    const result = await pool.query('SELECT * FROM tenants WHERE id = $1', [TEST_TENANT_ID]);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].id).toBe(TEST_TENANT_ID);
  });

  it('should have test user seeded', async () => {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [TEST_USER_ID]);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].email).toBe('test@example.com');
  });

  it('should have test venue seeded', async () => {
    const result = await pool.query('SELECT * FROM venues WHERE id = $1', [TEST_VENUE_ID]);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].name).toBe('Test Venue');
  });

  it('should have a working Fastify app', async () => {
    expect(context.app).toBeDefined();
    expect(context.app.ready).toBeDefined();
  });

  it('should have a working Redis connection', async () => {
    await context.redis.set('test:key', 'test-value');
    const value = await context.redis.get('test:key');
    expect(value).toBe('test-value');
    await context.redis.del('test:key');
  });
});
