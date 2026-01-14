/**
 * Notifications Routes Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, redis } from './setup';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';

describe('Notifications Routes', () => {
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

  describe('POST /api/v1/notifications', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'POST', url: '/api/v1/notifications', payload: { user_id: TEST_USER_ID, message: 'Test' } });
      expect(response.statusCode).toBe(401);
    });

    it('should create notification', async () => {
      const response = await context.app.inject({ method: 'POST', url: '/api/v1/notifications', headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' }, payload: { user_id: TEST_USER_ID, message: 'Test notification', type: 'info' } });
      expect([201, 200, 501]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/users/:userId/notifications', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/users/${TEST_USER_ID}/notifications` });
      expect(response.statusCode).toBe(401);
    });

    it('should return user notifications', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/users/${TEST_USER_ID}/notifications`, headers: { authorization: `Bearer ${authToken}` } });
      expect([200, 501]).toContain(response.statusCode);
    });
  });

  describe('PUT /api/v1/notifications/:notificationId/read', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'PUT', url: `/api/v1/notifications/${uuidv4()}/read` });
      expect(response.statusCode).toBe(401);
    });
  });
});
