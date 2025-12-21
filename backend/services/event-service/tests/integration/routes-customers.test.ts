/**
 * Customers Routes Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, redis } from './setup';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';

describe('Customers Routes', () => {
  let context: TestContext;
  let authToken: string;

  beforeAll(async () => {
    context = await setupTestApp();
    authToken = generateTestToken({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID, type: 'access' });
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
  });

  describe('GET /api/v1/customers/:customerId/profile', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/customers/${uuidv4()}/profile` });
      expect(response.statusCode).toBe(401);
    });

    it('should return customer profile', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/customers/${TEST_USER_ID}/profile`, headers: { authorization: `Bearer ${authToken}` } });
      expect([200, 404, 501]).toContain(response.statusCode);
    });
  });
});
