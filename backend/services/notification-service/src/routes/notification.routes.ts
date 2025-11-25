import { FastifyInstance } from 'fastify';
import { notificationController } from '../controllers/notification.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { channelRateLimitMiddleware, batchRateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validateSendRequest, validateBatchSendRequest } from '../middleware/validation.middleware';

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Send single notification
  fastify.post('/send', {
    preHandler: [authMiddleware, validateSendRequest, channelRateLimitMiddleware]
  }, notificationController.send.bind(notificationController));

  // Send batch notifications
  fastify.post('/send-batch', {
    preHandler: [authMiddleware, validateBatchSendRequest, batchRateLimitMiddleware]
  }, notificationController.sendBatch.bind(notificationController));

  // Get notification status
  fastify.get('/status/:id', {
    preHandler: [authMiddleware]
  }, notificationController.getStatus.bind(notificationController));
}
