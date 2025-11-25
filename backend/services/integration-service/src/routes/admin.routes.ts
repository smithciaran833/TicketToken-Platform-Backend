import { FastifyInstance } from 'fastify';
import { adminController } from '../controllers/admin.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export async function adminRoutes(fastify: FastifyInstance) {
  // ALL admin routes require authentication AND admin role
  fastify.addHook('onRequest', authenticate);
  fastify.addHook('onRequest', authorize('admin'));

  fastify.get('/all-venues', adminController.getAllVenueIntegrations);
  fastify.get('/health-summary', adminController.getHealthSummary);
  fastify.get('/costs', adminController.getCostAnalysis);
  fastify.post('/force-sync', adminController.forceSync);
  fastify.post('/clear-queue', adminController.clearQueue);
  fastify.post('/process-dead-letter', adminController.processDeadLetter);
  fastify.post('/recover-stale', adminController.recoverStale);
  fastify.get('/queue-metrics', adminController.getQueueMetrics);
}
