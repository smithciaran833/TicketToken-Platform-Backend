import { FastifyInstance } from 'fastify';
import { mappingController } from '../controllers/mapping.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export async function mappingRoutes(fastify: FastifyInstance) {
  // All mapping routes require authentication and admin access
  fastify.addHook('onRequest', authenticate);
  fastify.addHook('onRequest', authorize('admin', 'venue_admin'));

  fastify.get('/:provider/fields', mappingController.getAvailableFields);
  fastify.get('/:provider/mappings', mappingController.getCurrentMappings);
  fastify.put('/:provider/mappings', mappingController.updateMappings);
  fastify.post('/:provider/mappings/test', mappingController.testMappings);
  fastify.post('/:provider/mappings/apply-template', mappingController.applyTemplate);
  fastify.post('/:provider/mappings/reset', mappingController.resetMappings);
  fastify.post('/:provider/mappings/heal', mappingController.healMappings);
}
