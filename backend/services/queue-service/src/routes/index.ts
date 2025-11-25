import { FastifyInstance } from 'fastify';
import jobRoutes from './job.routes';
import queueRoutes from './queue.routes';
import healthRoutes from './health.routes';
import metricsRoutes from './metrics.routes';
import alertsRoutes from './alerts.routes';
import rateLimitRoutes from './rate-limit.routes';

async function routes(fastify: FastifyInstance) {
  // Mount routes
  await fastify.register(jobRoutes, { prefix: '/jobs' });
  await fastify.register(queueRoutes, { prefix: '/queues' });
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(metricsRoutes, { prefix: '/metrics' });
  await fastify.register(alertsRoutes, { prefix: '/alerts' });
  await fastify.register(rateLimitRoutes, { prefix: '/rate-limits' });

  // API info endpoint
  fastify.get('/', async (request, reply) => {
    return reply.send({
      service: 'Queue Service API',
      version: '1.0.0',
      endpoints: {
        jobs: '/api/v1/queue/jobs',
        queues: '/api/v1/queue/queues',
        health: '/api/v1/queue/health',
        metrics: '/api/v1/queue/metrics',
        alerts: '/api/v1/queue/alerts',
        rateLimits: '/api/v1/queue/rate-limits'
      }
    });
  });

  // Cache management endpoints
  fastify.get('/cache/stats', async (request, reply) => {
    const { serviceCache } = require('../services/cache-integration');
    const stats = serviceCache.getStats();
    return reply.send(stats);
  });

  fastify.delete('/cache/flush', async (request, reply) => {
    const { serviceCache } = require('../services/cache-integration');
    await serviceCache.flush();
    return reply.send({ success: true, message: 'Cache flushed' });
  });
}

export default routes;
