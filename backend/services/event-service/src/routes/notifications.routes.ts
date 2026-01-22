import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as notificationController from '../controllers/notification.controller';

/**
 * DEPRECATED: These endpoints return 501 - Not Implemented
 * 
 * Notifications should be handled by the notification-service.
 * These routes are kept for backwards compatibility but should be removed
 * or proxied to the notification-service in a future version.
 * 
 * TODO: Remove or proxy to notification-service
 */

export default async function notificationsRoutes(app: FastifyInstance) {
  app.post('/notifications', {
    preHandler: [authenticateFastify, tenantHook]
  }, notificationController.createNotification as any);

  app.get('/users/:userId/notifications', {
    preHandler: [authenticateFastify, tenantHook]
  }, notificationController.getUserNotifications as any);

  app.put('/notifications/:notificationId/read', {
    preHandler: [authenticateFastify, tenantHook]
  }, notificationController.markAsRead as any);
}
