import { FastifyInstance } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance) {
  const healthCheckService = fastify.container.resolve('healthCheckService');

  // Liveness probe - for Kubernetes
  fastify.get('/health/live', async (request, reply) => {
    const result = await healthCheckService.getLiveness();
    reply.code(200).send(result);
  });

  // Readiness probe - for Kubernetes
  fastify.get('/health/ready', async (request, reply) => {
    const result = await healthCheckService.getReadiness();
    const httpCode = result.status === 'unhealthy' ? 503 : 200;
    reply.code(httpCode).send(result);
  });

  // Full health check - detailed status
  fastify.get('/health/full', async (request, reply) => {
    const result = await healthCheckService.getFullHealth();
    const httpCode = result.status === 'unhealthy' ? 503 : 
                     result.status === 'degraded' ? 200 : 200;
    reply.code(httpCode).send(result);
  });

  // Keep existing simple health endpoint for backward compatibility
  fastify.get('/health', async (request, reply) => {
    const { db, redis } = fastify.container.cradle;
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'venue-service',
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database: 'unknown',
        redis: 'unknown',
      }
    };

    try {
      await db.raw('SELECT 1');
      health.checks.database = 'ok';
    } catch (error) {
      health.checks.database = 'error';
      health.status = 'unhealthy';
    }

    try {
      await redis.ping();
      health.checks.redis = 'ok';
    } catch (error) {
      health.checks.redis = 'error';
      if (health.status === 'ok') {
        health.status = 'degraded';
      }
    }

    const httpCode = health.status === 'unhealthy' ? 503 : 200;
    reply.code(httpCode).send(health);
  });
}
