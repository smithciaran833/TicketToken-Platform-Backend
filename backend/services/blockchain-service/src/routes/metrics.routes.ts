import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { register } from '../utils/metrics';
import { circuitBreakerManager } from '../utils/circuitBreaker';

export default async function metricsRoutes(fastify: FastifyInstance) {
  /**
   * GET /metrics
   * Prometheus metrics endpoint
   */
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      reply.header('Content-Type', register.contentType);
      return register.metrics();
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Failed to generate metrics',
        message: error.message
      });
    }
  });

  /**
   * GET /metrics/circuit-breakers
   * Get circuit breaker statistics
   */
  fastify.get('/metrics/circuit-breakers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = circuitBreakerManager.getAllStats();
      
      return {
        timestamp: new Date().toISOString(),
        circuitBreakers: stats
      };
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Failed to get circuit breaker stats',
        message: error.message
      });
    }
  });

  /**
   * POST /metrics/circuit-breakers/:name/reset
   * Reset a specific circuit breaker
   */
  fastify.post('/metrics/circuit-breakers/:name/reset', async (
    request: FastifyRequest<{ Params: { name: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { name } = request.params;
      
      circuitBreakerManager.reset(name);
      
      return {
        success: true,
        message: `Circuit breaker ${name} reset successfully`,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Failed to reset circuit breaker',
        message: error.message
      });
    }
  });
}
