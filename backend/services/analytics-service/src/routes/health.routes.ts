import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { healthController } from '../controllers/health.controller';

export default async function healthRoutes(app: FastifyInstance) {
  // Basic health check
  app.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return healthController.health(request, reply);
  });

  // Detailed health check
  app.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    return healthController.readiness(request, reply);
  });

  // Liveness check
  app.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    return healthController.liveness(request, reply);
  });

  // Service dependencies check
  app.get('/health/dependencies', async (request: FastifyRequest, reply: FastifyReply) => {
    return healthController.dependencies(request, reply);
  });
}
