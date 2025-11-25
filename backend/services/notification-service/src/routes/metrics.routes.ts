import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { metricsService } from '../services/metrics.service';
import { logger } from '../config/logger';

export default async function metricsRoutes(fastify: FastifyInstance) {
  /**
   * Prometheus metrics endpoint
   * No authentication required - Prometheus needs access
   */
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await metricsService.getMetrics();
      
      reply
        .type('text/plain; version=0.0.4; charset=utf-8')
        .send(metrics);
    } catch (error: any) {
      logger.error('Failed to generate metrics', { error: error.message });
      reply.status(500).send({ error: 'Failed to generate metrics' });
    }
  });
}
