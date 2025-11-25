import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { circuitBreakerRegistry } from '../utils/circuit-breaker';

/**
 * HEALTH CHECK ROUTES
 * 
 * Provides detailed health status for monitoring and orchestration
 * Phase 7: Production Readiness & Reliability
 */

interface HealthCheckDependencies {
  db: Pool;
  redis: Redis;
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  deps: HealthCheckDependencies
) {
  /**
   * Basic liveness probe
   * Returns 200 if service is running
   */
  app.get('/health', async (request, reply) => {
    return reply.code(200).send({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Readiness probe
   * Returns 200 if service is ready to accept requests
   */
  app.get('/health/ready', async (request, reply) => {
    try {
      // Check database connection
      await deps.db.query('SELECT 1');

      // Check Redis connection
      await deps.redis.ping();

      return reply.code(200).send({
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'ok',
          redis: 'ok'
        }
      });
    } catch (error) {
      return reply.code(503).send({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Detailed health check
   * Provides comprehensive status of all dependencies
   */
  app.get('/health/detailed', async (request, reply) => {
    const checks: any = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      dependencies: {}
    };

    // Check database
    try {
      const dbStart = Date.now();
      const result = await deps.db.query('SELECT NOW()');
      checks.dependencies.database = {
        status: 'ok',
        responseTime: Date.now() - dbStart,
        serverTime: result.rows[0].now
      };
    } catch (error) {
      checks.status = 'degraded';
      checks.dependencies.database = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      await deps.redis.ping();
      checks.dependencies.redis = {
        status: 'ok',
        responseTime: Date.now() - redisStart
      };
    } catch (error) {
      checks.status = 'degraded';
      checks.dependencies.redis = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Check circuit breakers
    const circuitBreakers = circuitBreakerRegistry.getAllStats();
    if (circuitBreakers.length > 0) {
      checks.circuitBreakers = circuitBreakers;
      
      // Mark as degraded if any circuit is open
      if (circuitBreakers.some(cb => cb.state === 'OPEN')) {
        checks.status = 'degraded';
      }
    }

    const statusCode = checks.status === 'healthy' ? 200 : 503;
    return reply.code(statusCode).send(checks);
  });

  /**
   * Database pool statistics
   */
  app.get('/health/db-pool', async (request, reply) => {
    return reply.send({
      totalCount: deps.db.totalCount,
      idleCount: deps.db.idleCount,
      waitingCount: deps.db.waitingCount
    });
  });

  /**
   * Memory statistics
   */
  app.get('/health/memory', async (request, reply) => {
    const memory = process.memoryUsage();
    return reply.send({
      rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memory.external / 1024 / 1024).toFixed(2)} MB`,
      arrayBuffers: `${(memory.arrayBuffers / 1024 / 1024).toFixed(2)} MB`
    });
  });
}
