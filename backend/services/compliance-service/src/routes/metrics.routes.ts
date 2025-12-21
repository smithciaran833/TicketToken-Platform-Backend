import { FastifyInstance } from 'fastify';
import { prometheusMetrics } from '../services/prometheus-metrics.service';
import { logger } from '../utils/logger';

/**
 * METRICS ROUTES
 * 
 * Exposes Prometheus metrics endpoint
 * Phase 5: Production Infrastructure
 */

export async function metricsRoutes(fastify: FastifyInstance) {
  // Prometheus metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    try {
      const metrics = await prometheusMetrics.getMetrics();
      reply.header('Content-Type', 'text/plain; version=0.0.4');
      return reply.send(metrics);
    } catch (error) {
      logger.error({ error }, 'Failed to generate metrics:');
      return reply.code(500).send({ error: 'Failed to generate metrics' });
    }
  });

  // Metrics JSON endpoint (for debugging)
  fastify.get('/metrics/json', async (request, reply) => {
    try {
      const metrics = await prometheusMetrics.getMetricsJSON();
      return reply.send({
        success: true,
        metrics,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate metrics JSON:');
      return reply.code(500).send({ error: 'Failed to generate metrics JSON' });
    }
  });

  logger.info('Metrics routes registered');
}
