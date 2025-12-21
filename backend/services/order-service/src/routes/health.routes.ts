import { FastifyInstance } from 'fastify';
import { getDatabase } from '../config/database';
import { RedisService } from '../services/redis.service';

export async function healthRoutes(fastify: FastifyInstance) {
  // Liveness probe - check if service is alive
  fastify.get('/health/live', async (_request, reply) => {
    reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness probe - check if service is ready to accept traffic
  fastify.get('/health/ready', async (_request, reply) => {
    const checks = {
      database: false,
      redis: false,
    };

    try {
      // Check database connection
      const pool = getDatabase();
      await pool.query('SELECT 1');
      checks.database = true;
    } catch (error) {
      fastify.log.error({ err: error }, 'Database health check failed');
    }

    try {
      // Check Redis connection
      const redis = RedisService.getClient();
      await redis.ping();
      checks.redis = true;
    } catch (error) {
      fastify.log.error({ err: error }, 'Redis health check failed');
    }

    const allHealthy = checks.database && checks.redis;
    const statusCode = allHealthy ? 200 : 503;

    reply.status(statusCode).send({
      status: allHealthy ? 'ready' : 'not ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  // Detailed health check
  fastify.get('/health', async (_request, reply) => {
    const checks = {
      database: { healthy: false, latency: 0 },
      redis: { healthy: false, latency: 0 },
    };

    // Check database
    try {
      const start = Date.now();
      const pool = getDatabase();
      await pool.query('SELECT 1');
      checks.database = { healthy: true, latency: Date.now() - start };
    } catch (error) {
      fastify.log.error({ err: error }, 'Database health check failed');
    }

    // Check Redis
    try {
      const start = Date.now();
      const redis = RedisService.getClient();
      await redis.ping();
      checks.redis = { healthy: true, latency: Date.now() - start };
    } catch (error) {
      fastify.log.error({ err: error }, 'Redis health check failed');
    }

    const allHealthy = checks.database.healthy && checks.redis.healthy;
    const statusCode = allHealthy ? 200 : 503;

    reply.status(statusCode).send({
      status: allHealthy ? 'healthy' : 'unhealthy',
      service: 'order-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks,
      timestamp: new Date().toISOString(),
    });
  });
}
