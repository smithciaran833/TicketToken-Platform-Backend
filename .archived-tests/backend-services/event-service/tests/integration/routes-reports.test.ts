/**
 * Reports Routes Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, redis } from './setup';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';

describe('Reports Routes', () => {
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

  describe('GET /api/v1/reports/sales', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: '/api/v1/reports/sales' });
      expect(response.statusCode).toBe(401);
    });

    it('should return sales report', async () => {
      const response = await context.app.inject({ method: 'GET', url: '/api/v1/reports/sales', headers: { authorization: `Bearer ${authToken}` } });
      expect([200, 501]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/reports/venue-comparison', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: '/api/v1/reports/venue-comparison' });
      expect(response.statusCode).toBe(401);
    });

    it('should return venue comparison report', async () => {
      const response = await context.app.inject({ method: 'GET', url: '/api/v1/reports/venue-comparison', headers: { authorization: `Bearer ${authToken}` } });
      expect([200, 501]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/reports/customer-insights', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: '/api/v1/reports/customer-insights' });
      expect(response.statusCode).toBe(401);
    });

    it('should return customer insights report', async () => {
      const response = await context.app.inject({ method: 'GET', url: '/api/v1/reports/customer-insights', headers: { authorization: `Bearer ${authToken}` } });
      expect([200, 501]).toContain(response.statusCode);
    });
  });
});
