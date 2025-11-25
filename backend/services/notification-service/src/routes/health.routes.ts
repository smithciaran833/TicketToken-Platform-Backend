import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, dbHealthMonitor, getPoolStats, isDatabaseConnected } from '../config/database';
import { redis, redisHealthMonitor, isRedisConnected, getRedisStats } from '../config/redis';
import { ProviderFactory } from '../providers/provider-factory';
import { circuitBreakerManager } from '../utils/circuit-breaker';
import { logger } from '../config/logger';

/**
 * Health check routes with comprehensive dependency monitoring
 */
export default async function healthRoutes(fastify: FastifyInstance) {
  
  /**
   * Basic health check
   * GET /health
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ 
      status: 'ok', 
      service: 'notification-service',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Readiness check - is service ready to handle traffic?
   * GET /health/ready
   */
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check critical dependencies
      const [dbConnected, redisConnected] = await Promise.all([
        isDatabaseConnected(),
        isRedisConnected(),
      ]);

      const isReady = dbConnected && redisConnected;

      if (!isReady) {
        return reply.status(503).send({
          status: 'not_ready',
          database: dbConnected ? 'connected' : 'disconnected',
          redis: redisConnected ? 'connected' : 'disconnected',
          service: 'notification-service',
        });
      }

      reply.send({
        status: 'ready',
        database: 'connected',
        redis: 'connected',
        service: 'notification-service',
      });
    } catch (error: any) {
      logger.error('Readiness check failed', { error });
      reply.status(503).send({
        status: 'not_ready',
        error: error.message,
        service: 'notification-service',
      });
    }
  });

  /**
   * Liveness check - is service alive?
   * GET /health/live
   */
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    // Simple liveness check - if we can respond, we're alive
    reply.send({
      status: 'alive',
      service: 'notification-service',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Comprehensive health check
   * GET /health/detailed
   */
  fastify.get('/health/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const startTime = Date.now();

      // Check all dependencies in parallel
      const [
        dbConnected,
        redisConnected,
        dbStats,
        redisStats,
        providersStatus,
      ] = await Promise.all([
        isDatabaseConnected().catch(() => false),
        isRedisConnected().catch(() => false),
        getPoolStats(),
        getRedisStats(),
        ProviderFactory.getProvidersStatus().catch(() => ({})),
      ]);

      // Get circuit breaker states
      const circuitBreakers = circuitBreakerManager.getAllStats();

      // Calculate overall health
      const isHealthy = dbConnected && redisConnected;
      const checkDuration = Date.now() - startTime;

      const healthReport = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        checkDuration: `${checkDuration}ms`,
        service: {
          name: 'notification-service',
          version: process.env.SERVICE_VERSION || '1.0.0',
          uptime: process.uptime(),
          environment: process.env.NODE_ENV || 'development',
        },
        dependencies: {
          database: {
            status: dbConnected ? 'up' : 'down',
            healthy: dbHealthMonitor.getHealthStatus(),
            pool: {
              size: dbStats.size,
              used: dbStats.used,
              free: dbStats.free,
              pending: dbStats.pending,
              utilization: dbStats.size > 0 
                ? Math.round((dbStats.used / dbStats.size) * 100) 
                : 0,
            },
          },
          redis: {
            status: redisConnected ? 'up' : 'down',
            healthy: redisHealthMonitor.getHealthStatus(),
            clients: redisStats.clients,
            memoryUsed: redisStats.memoryUsed,
            memoryPeak: redisStats.memoryPeak,
          },
          providers: providersStatus,
        },
        resilience: {
          circuitBreakers,
        },
        system: {
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            unit: 'MB',
          },
          cpu: {
            usage: process.cpuUsage(),
          },
        },
      };

      const statusCode = isHealthy ? 200 : 503;
      reply.status(statusCode).send(healthReport);

    } catch (error: any) {
      logger.error('Detailed health check failed', { error });
      reply.status(503).send({
        status: 'error',
        error: error.message,
        service: 'notification-service',
      });
    }
  });

  /**
   * Database health check
   * GET /health/db
   */
  fastify.get('/health/db', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await db.raw('SELECT 1');
      const poolStats = getPoolStats();

      reply.send({
        status: 'ok',
        database: 'connected',
        healthy: dbHealthMonitor.getHealthStatus(),
        pool: poolStats,
        service: 'notification-service',
      });
    } catch (error: any) {
      reply.status(503).send({
        status: 'error',
        database: 'disconnected',
        error: error.message,
        service: 'notification-service',
      });
    }
  });

  /**
   * Redis health check
   * GET /health/redis
   */
  fastify.get('/health/redis', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await redis.ping();
      const redisStats = await getRedisStats();

      reply.send({
        status: 'ok',
        redis: 'connected',
        healthy: redisHealthMonitor.getHealthStatus(),
        stats: redisStats,
        service: 'notification-service',
      });
    } catch (error: any) {
      reply.status(503).send({
        status: 'error',
        redis: 'disconnected',
        error: error.message,
        service: 'notification-service',
      });
    }
  });

  /**
   * Providers health check
   * GET /health/providers
   */
  fastify.get('/health/providers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const providersStatus = await ProviderFactory.getProvidersStatus();
      const providersOk = await ProviderFactory.verifyProviders();
      
      reply.send({
        status: providersOk ? 'ok' : 'degraded',
        providers: providersStatus,
        service: 'notification-service',
      });
    } catch (error: any) {
      reply.status(503).send({
        status: 'error',
        error: error.message,
        service: 'notification-service',
      });
    }
  });

  /**
   * Circuit breaker status
   * GET /health/circuit-breakers
   */
  fastify.get('/health/circuit-breakers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const circuitBreakers = circuitBreakerManager.getAllStats();
      
      // Check if any circuit breakers are open
      const hasOpenCircuits = Object.values(circuitBreakers).some(
        (breaker: any) => breaker.state === 'OPEN'
      );

      reply.send({
        status: hasOpenCircuits ? 'degraded' : 'ok',
        circuitBreakers,
        service: 'notification-service',
      });
    } catch (error: any) {
      reply.status(500).send({
        status: 'error',
        error: error.message,
        service: 'notification-service',
      });
    }
  });

  /**
   * System metrics
   * GET /health/metrics
   */
  fastify.get('/health/system', async (request: FastifyRequest, reply: FastifyReply) => {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    reply.send({
      status: 'ok',
      system: {
        uptime: process.uptime(),
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
          external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB',
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
        },
        cpu: {
          user: cpuUsage.user / 1000 + ' ms',
          system: cpuUsage.system / 1000 + ' ms',
        },
        process: {
          pid: process.pid,
          version: process.version,
          platform: process.platform,
        },
      },
      service: 'notification-service',
    });
  });
}
