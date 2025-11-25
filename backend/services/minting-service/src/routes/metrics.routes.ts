import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { register } from '../utils/metrics';

export default async function metricsRoutes(
  fastify: FastifyInstance,
  options: any
): Promise<void> {
  // Prometheus metrics endpoint
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await register.metrics();
      reply
        .header('Content-Type', register.contentType)
        .send(metrics);
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to generate metrics',
        message: (error as Error).message
      });
    }
  });
}
