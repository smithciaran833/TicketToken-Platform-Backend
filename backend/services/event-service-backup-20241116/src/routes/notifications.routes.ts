import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as notificationController from '../controllers/notification.controller';

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
