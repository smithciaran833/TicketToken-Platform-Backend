import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import { cache } from '../services/cache-integration';
import { logger } from '../utils/logger';

export class HealthController {
  async health(request: FastifyRequest, reply: FastifyReply) {
    reply.send({
      status: 'healthy',
      service: 'marketplace-service',
      timestamp: new Date().toISOString()
    });
  }

  async detailed(request: FastifyRequest, reply: FastifyReply) {
    const checks = {
      database: false,
      redis: false,
      dependencies: false
    };

    // Check database
    try {
      await db.raw('SELECT 1');
      checks.database = true;
    } catch (error) {
      logger.error('Database health check failed:', error);
    }

    // Check Redis
    try {
      await cache.set('health_check', 'ok', { ttl: 10 });
      const value = await cache.get('health_check');
      checks.redis = value === 'ok';
    } catch (error) {
      logger.error('Redis health check failed:', error);
    }

    // Check dependencies (simplified)
    checks.dependencies = true;

    const isHealthy = Object.values(checks).every(v => v === true);

    reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString()
    });
  }

  async readiness(request: FastifyRequest, reply: FastifyReply) {
    try {
      await db.raw('SELECT 1');
      reply.send({ ready: true });
    } catch (error) {
      reply.status(503).send({ ready: false, error: 'Database not ready' });
    }
  }

  async liveness(request: FastifyRequest, reply: FastifyReply) {
    reply.send({ alive: true });
  }
}

export const healthController = new HealthController();
