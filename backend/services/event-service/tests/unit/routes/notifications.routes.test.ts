/**
 * Unit tests for notifications.routes.ts
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import notificationsRoutes from '../../../src/routes/notifications.routes';

jest.mock('../../../src/middleware/auth', () => ({
  authenticateFastify: jest.fn((req: any, reply: any, done: any) => {
    req.user = { id: 'user-123', tenant_id: 'tenant-123' };
    done();
  })
}));

jest.mock('../../../src/middleware/tenant', () => ({
  tenantHook: jest.fn((req: any, reply: any, done: any) => {
    req.tenant_id = 'tenant-123';
    done();
  })
}));

jest.mock('../../../src/controllers/notification.controller', () => ({
  createNotification: jest.fn((req: any, reply: any) => reply.status(201).send({ id: 'notif-1' })),
  getUserNotifications: jest.fn((req: any, reply: any) => reply.send({ notifications: [] })),
  markAsRead: jest.fn((req: any, reply: any) => reply.send({ success: true }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import * as notifController from '../../../src/controllers/notification.controller';

describe('Notifications Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(notificationsRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register POST /notifications route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/notifications');
    });

    it('should register GET /users/:userId/notifications route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/users/:userId/notifications');
    });

    it('should register PUT /notifications/:notificationId/read route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/notifications/:notificationId/read');
    });
  });

  describe('POST /notifications', () => {
    it('should call createNotification controller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/notifications',
        payload: { userId: 'user-1', message: 'Test' }
      });

      expect(response.statusCode).toBe(201);
      expect(notifController.createNotification).toHaveBeenCalled();
    });

    it('should apply auth middleware', async () => {
      await app.inject({ method: 'POST', url: '/notifications', payload: {} });
      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({ method: 'POST', url: '/notifications', payload: {} });
      expect(tenantHook).toHaveBeenCalled();
    });
  });

  describe('GET /users/:userId/notifications', () => {
    it('should call getUserNotifications controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/user-123/notifications'
      });

      expect(response.statusCode).toBe(200);
      expect(notifController.getUserNotifications).toHaveBeenCalled();
    });
  });

  describe('PUT /notifications/:notificationId/read', () => {
    it('should call markAsRead controller', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/notifications/notif-1/read'
      });

      expect(response.statusCode).toBe(200);
      expect(notifController.markAsRead).toHaveBeenCalled();
    });
  });
});
