import { FastifyInstance } from 'fastify';
import { connectionController } from '../controllers/connection.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export async function connectionRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('onRequest', authenticate);

  fastify.get('/', connectionController.listIntegrations);
  fastify.get('/:provider', connectionController.getIntegration);
  
  fastify.post('/connect/:provider', {
    onRequest: [authenticate, authorize('admin', 'venue_admin')]
  }, connectionController.connectIntegration);
  
  fastify.post('/:provider/disconnect', {
    onRequest: [authenticate, authorize('admin', 'venue_admin')]
  }, connectionController.disconnectIntegration);
  
  fastify.post('/:provider/reconnect', {
    onRequest: [authenticate, authorize('admin', 'venue_admin')]
  }, connectionController.reconnectIntegration);
  
  fastify.post('/:provider/api-key', {
    onRequest: [authenticate, authorize('admin', 'venue_admin')]
  }, connectionController.validateApiKey);
}
