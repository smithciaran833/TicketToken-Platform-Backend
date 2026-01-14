/**
 * Health Check Routes for Notification Service
 * 
 * AUDIT FIX:
 * - HC-H1: No startup probe endpoint → Added /health/startup
 * 
 * Features:
 * - Kubernetes-compliant health endpoints
 * - /health/live - Liveness probe (is the process running?)
 * - /health/ready - Readiness probe (can it accept traffic?)
 * - /health/startup - Startup probe (has it finished initializing?)
 * - Dependency health checks (DB, Redis, RabbitMQ)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import { rabbitmqService } from '../config/rabbitmq';
import { env } from '../config/env';
import Redis from 'ioredis';

// =============================================================================
// STATE
// =============================================================================

// Startup tracking
let startupComplete = false;
let startupTimestamp: Date | null = null;

// Service info
const serviceInfo = {
  name: 'notification-service',
  version: process.env.npm_package_version || '1.0.0',
  nodeVersion: process.version,
  environment: env.NODE_ENV
};

// =============================================================================
// DEPENDENCY CHECKS
// =============================================================================

async function checkDatabase(): Promise<{ status: string; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    await db.raw('SELECT 1');
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (error) {
    return { status: 'unhealthy', error: (error as Error).message };
  }
}

async function checkRedis(): Promise<{ status: string; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000
    });
    
    await redis.ping();
    await redis.quit();
    
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (error) {
    return { status: 'unhealthy', error: (error as Error).message };
  }
}

async function checkRabbitMQ(): Promise<{ status: string; error?: string }> {
  try {
    const connected = rabbitmqService.getConnectionStatus();
    return { status: connected ? 'healthy' : 'unhealthy' };
  } catch (error) {
    return { status: 'unhealthy', error: (error as Error).message };
  }
}

// =============================================================================
// ROUTES
// =============================================================================

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Basic health check - always returns 200 if process is running
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      ...serviceInfo
    });
  });

  /**
   * AUDIT FIX HC-H1: Startup probe - checks if service has finished initializing
   * Returns 503 until startup is complete
   */
  fastify.get('/health/startup', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!startupComplete) {
      return reply.status(503).send({
        status: 'starting',
        message: 'Service is still initializing',
        timestamp: new Date().toISOString(),
        ...serviceInfo
      });
    }

    return reply.send({
      status: 'started',
      startedAt: startupTimestamp?.toISOString(),
      timestamp: new Date().toISOString(),
      ...serviceInfo
    });
  });

  /**
   * Liveness probe - is the process still running?
   * Only fails if the process is truly hung
   */
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    // Process is alive if we can respond
    return reply.send({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      ...serviceInfo
    });
  });

  /**
   * Readiness probe - can the service accept traffic?
   * Checks critical dependencies
   */
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const [dbHealth, redisHealth, mqHealth] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkRabbitMQ()
    ]);

    const dependencies = {
      database: dbHealth,
      redis: redisHealth,
      rabbitmq: mqHealth
    };

    // Critical dependencies that must be healthy
    const criticalHealthy = dbHealth.status === 'healthy';
    
    // RabbitMQ and Redis are important but not critical for basic operation
    const allHealthy = criticalHealthy && 
                       redisHealth.status === 'healthy' && 
                       mqHealth.status === 'healthy';

    const status = criticalHealthy ? (allHealthy ? 'ready' : 'degraded') : 'not_ready';
    const statusCode = criticalHealthy ? 200 : 503;

    return reply.status(statusCode).send({
      status,
      timestamp: new Date().toISOString(),
      dependencies,
      ...serviceInfo
    });
  });

  /**
   * Detailed health check - for monitoring dashboards
   */
  fastify.get('/health/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    const [dbHealth, redisHealth, mqHealth] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkRabbitMQ()
    ]);

    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      ...serviceInfo,
      startup: {
        complete: startupComplete,
        timestamp: startupTimestamp?.toISOString()
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid,
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
          external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB'
        },
        cpu: cpuUsage
      },
      dependencies: {
        database: dbHealth,
        redis: redisHealth,
        rabbitmq: mqHealth
      }
    });
  });

  /**
   * Database health check
   */
  fastify.get('/health/db', async (request: FastifyRequest, reply: FastifyReply) => {
    const health = await checkDatabase();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    return reply.status(statusCode).send({
      timestamp: new Date().toISOString(),
      ...health
    });
  });
}

// =============================================================================
// STARTUP MANAGEMENT
// =============================================================================

/**
 * Mark service as fully started
 * Call this after all initialization is complete
 */
export function markStartupComplete(): void {
  startupComplete = true;
  startupTimestamp = new Date();
}

/**
 * Check if startup is complete
 */
export function isStartupComplete(): boolean {
  return startupComplete;
}

/**
 * Reset startup status (for testing)
 */
export function resetStartupStatus(): void {
  startupComplete = false;
  startupTimestamp = null;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default healthRoutes;
