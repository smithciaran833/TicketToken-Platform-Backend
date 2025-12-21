/**
 * Routes Index Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, generateTestToken } from './setup';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';

describe('Routes Index', () => {
  let context: TestContext;
  let authToken: string;

  beforeAll(async () => {
    context = await setupTestApp();
    authToken = generateTestToken({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID, type: 'access' });
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  describe('route registration', () => {
    it('should register health routes at root', async () => {
      const response = await context.app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
    });

    it('should register events routes under /api/v1', async () => {
      const response = await context.app.inject({ method: 'GET', url: '/api/v1/events', headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).not.toBe(404);
    });
  });
});
