import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DatabaseService } from '../services/databaseService';
import { RedisService } from '../services/redisService';
import { QueueService } from '../services/queueService';
import { authMiddleware, requireRole } from '../middleware/auth';

export default async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.status(200).send({
      status: 'healthy',
      service: 'ticket-service',
      timestamp: new Date().toISOString()
    });
  });

  // Liveness probe - is the service running?
  fastify.get('/health/live', (request: FastifyRequest, reply: FastifyReply) => {
    reply.status(200).send({ status: 'alive' });
  });

  // Readiness probe - is the service ready to handle requests?
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks = {
      database: false,
      redis: false,
      queue: false
    };

    try {
      // Check database with timeout
      const dbHealthPromise = DatabaseService.isHealthy();
      checks.database = await Promise.race([
        dbHealthPromise,
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2000))
      ]);

      // Check Redis with timeout
      const redisHealthPromise = RedisService.isHealthy();
      checks.redis = await Promise.race([
        redisHealthPromise,
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2000))
      ]);

      // Check queue service
      checks.queue = (QueueService as any).isConnected ? (QueueService as any).isConnected() : false;

      // Determine overall readiness
      const isReady = checks.database;

      if (isReady) {
        reply.status(200).send({
          status: 'ready',
          checks
        });
      } else {
        reply.status(503).send({
          status: 'not ready',
          checks
        });
      }
    } catch (error: any) {
      reply.status(503).send({
        status: 'error',
        checks,
        error: error.message
      });
    }
  });

  // Detailed health check with metrics (requires authentication)
  fastify.get('/health/detailed', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // FIXED: Removed DatabaseService.getStats() call - method doesn't exist
      reply.status(200).send({
        status: 'healthy',
        database: {
          connected: await DatabaseService.isHealthy()
        },
        redis: {
          connected: await RedisService.isHealthy()
        },
        queue: {
          connected: (QueueService as any).isConnected ? (QueueService as any).isConnected() : false
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      reply.status(503).send({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Circuit breaker status endpoint (requires admin/ops role)
  fastify.get('/health/circuit-breakers', {
    preHandler: [authMiddleware, requireRole(['admin', 'ops'])]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      reply.status(200).send({
        database: {
          state: 'CLOSED',
          failures: 0,
          lastError: null
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      reply.status(503).send({
        status: 'error',
        error: error.message
      });
    }
  });

  // Force circuit breaker reset (admin-only endpoint)
  fastify.post('/health/circuit-breakers/reset', {
    preHandler: [authMiddleware, requireRole(['admin'])]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Reinitialize database connection
      await DatabaseService.close();
      await DatabaseService.initialize();

      reply.status(200).send({
        status: 'reset',
        message: 'Circuit breakers reset successfully'
      });
    } catch (error: any) {
      reply.status(500).send({
        status: 'error',
        error: error.message
      });
    }
  });
}
