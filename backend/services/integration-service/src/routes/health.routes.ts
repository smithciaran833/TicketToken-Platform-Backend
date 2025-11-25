import { FastifyInstance } from 'fastify';
import { healthController } from '../controllers/health.controller';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/:provider', healthController.getIntegrationHealth);
  fastify.get('/:provider/metrics', healthController.getMetrics);
  fastify.post('/:provider/test', healthController.testConnection);
}
