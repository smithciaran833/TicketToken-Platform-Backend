import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { healthService } from '../services/health.service';
import { logger } from '../utils/logger';

class HealthController {
  async getHealth(request: FastifyRequest, reply: FastifyReply) {
    try {
      const health = await healthService.getOverallHealth();
      reply.code(health.status === 'healthy' ? 200 : 503).send(health);
    } catch (error) {
      logger.error('Error getting health:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async getServiceHealth(
    request: FastifyRequest<{ Params: { service: string } }>,
    reply: FastifyReply
  ) {
    try {
      const { service } = request.params;
      const health = await healthService.getServiceHealth(service);
      reply.code(health.status === 'healthy' ? 200 : 503).send(health);
    } catch (error) {
      logger.error('Error getting service health:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async getAllServicesHealth(request: FastifyRequest, reply: FastifyReply) {
    try {
      const health = await healthService.getAllServicesHealth();
      reply.send(health);
    } catch (error) {
      logger.error('Error getting all services health:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async getDependenciesHealth(request: FastifyRequest, reply: FastifyReply) {
    try {
      const health = await healthService.getDependenciesHealth();
      reply.send(health);
    } catch (error) {
      logger.error('Error getting dependencies health:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }
}

export const healthController = new HealthController();
