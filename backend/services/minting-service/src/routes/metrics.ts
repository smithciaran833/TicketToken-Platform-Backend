import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getMetrics, getMetricsJSON } from '../utils/metrics';

export default async function metricsRoutes(
  fastify: FastifyInstance,
  options: any
): Promise<void> {
  // Prometheus metrics endpoint
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await getMetrics();
      return reply
        .header('Content-Type', 'text/plain; version=0.0.4')
        .send(metrics);
    } catch (error) {
      return reply.code(500).send({
        error: 'METRICS_ERROR',
        message: 'Failed to generate metrics'
      });
    }
  });

  // JSON metrics endpoint (for debugging)
  fastify.get('/metrics/json', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await getMetricsJSON();
      return reply.send(metrics);
    } catch (error) {
      return reply.code(500).send({
        error: 'METRICS_ERROR',
        message: 'Failed to generate JSON metrics'
      });
    }
  });
}
