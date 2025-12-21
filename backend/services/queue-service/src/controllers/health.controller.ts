import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database.config';
import { QueueFactory } from '../queues/factories/queue.factory';
import { logger } from '../utils/logger';

export class HealthController {
  async checkHealth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const checks = {
        service: 'healthy',
        database: 'unknown',
        queues: 'unknown'
      };

      // Check database
      try {
        const pool = getPool();
        await pool.query('SELECT 1');
        checks.database = 'healthy';
      } catch (error) {
        checks.database = 'unhealthy';
        logger.error('Database health check failed:', error);
      }

      // Check queues (pg-boss)
      try {
        await QueueFactory.getQueueMetrics('money');
        checks.queues = 'healthy';
      } catch (error) {
        checks.queues = 'unhealthy';
        logger.error('Queue health check failed:', error);
      }

      const isHealthy = Object.values(checks).every(status => status === 'healthy');

      return reply.code(isHealthy ? 200 : 503).send({
        status: isHealthy ? 'healthy' : 'degraded',
        checks,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      return reply.code(503).send({
        status: 'unhealthy',
        error: 'Health check failed'
      });
    }
  }

  async checkReadiness(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      // Check if service is ready to accept traffic
      const pool = getPool();
      await pool.query('SELECT 1');

      return reply.send({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Readiness check failed:', error);
      return reply.code(503).send({
        status: 'not ready',
        error: 'Service not ready'
      });
    }
  }
}
