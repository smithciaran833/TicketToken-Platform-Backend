import { FastifyInstance } from 'fastify';
import { GDPRController } from '../controllers/gdpr.controller';

export async function gdprRoutes(fastify: FastifyInstance) {
  const gdprController = new GDPRController();

  // GDPR routes
  fastify.post('/gdpr/request-data', gdprController.requestDeletion);
  fastify.post('/gdpr/delete-data', gdprController.requestDeletion);
  fastify.get('/gdpr/status/:requestId', gdprController.getDeletionStatus);
}
