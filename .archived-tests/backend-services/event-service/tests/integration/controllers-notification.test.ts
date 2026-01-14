/**
 * Notification Controller Integration Tests
 * Note: All endpoints return 501 as notifications are handled by notification-service
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, redis } from './setup';
import * as notificationController from '../../src/controllers/notification.controller';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';

describe('Notification Controller', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
  });

  function createMockRequest(overrides: any = {}): any {
    return {
      params: overrides.params || {},
      body: overrides.body || {},
      headers: overrides.headers || { authorization: `Bearer ${generateTestToken({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID, type: 'access' })}` },
      tenantId: TEST_TENANT_ID,
      container: (context.app as any).container,
      log: { error: jest.fn() },
    };
  }

  function createMockReply(): any {
    const reply: any = {
      statusCode: 200,
      sentData: null,
      status: jest.fn((code: number) => { reply.statusCode = code; return reply; }),
      send: jest.fn((data: any) => { reply.sentData = data; return reply; }),
    };
    return reply;
  }

  describe('createNotification', () => {
    it('should return 501 (handled by notification-service)', async () => {
      const request = createMockRequest({ body: { user_id: TEST_USER_ID, message: 'Test' } });
      const reply = createMockReply();

      await notificationController.createNotification(request, reply);

      expect(reply.statusCode).toBe(501);
      expect(reply.sentData.success).toBe(false);
    });
  });

  describe('getUserNotifications', () => {
    it('should return 501 (handled by notification-service)', async () => {
      const request = createMockRequest({ params: { userId: TEST_USER_ID } });
      const reply = createMockReply();

      await notificationController.getUserNotifications(request, reply);

      expect(reply.statusCode).toBe(501);
      expect(reply.sentData.userId).toBe(TEST_USER_ID);
    });
  });

  describe('markAsRead', () => {
    it('should return 501 (handled by notification-service)', async () => {
      const notificationId = uuidv4();
      const request = createMockRequest({ params: { notificationId } });
      const reply = createMockReply();

      await notificationController.markAsRead(request, reply);

      expect(reply.statusCode).toBe(501);
      expect(reply.sentData.notificationId).toBe(notificationId);
    });
  });
});
