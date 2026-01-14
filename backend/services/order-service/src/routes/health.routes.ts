import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database';
import { RedisService } from '../services/redis.service';
import { logger } from '../utils/logger';

// HIGH: Health check configuration
const HEALTH_CHECK_TIMEOUT_MS = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10);
const DB_CHECK_TIMEOUT_MS = parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT || '3000', 10);
const REDIS_CHECK_TIMEOUT_MS = parseInt(process.env.REDIS_HEALTH_CHECK_TIMEOUT || '2000', 10);

// Track service startup state
let serviceStartupComplete = false;
let startupError: string | null = null;

/**
 * HIGH: Execute operation with timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

export function markStartupComplete() {
  serviceStartupComplete = true;
  logger.info('Service startup complete');
}

export function markStartupFailed(error: string) {
  startupError = error;
  logger.error('Service startup failed', { error });
}

/**
 * MEDIUM: Auth check for detailed health endpoint
 * Only allows admin users or internal services to see detailed health info
 */
async function requireAdminOrInternal(request: FastifyRequest, reply: FastifyReply) {
  // Allow internal service calls (identified by header)
  const internalSecret = request.headers['x-internal-secret'];
  if (internalSecret === process.env.INTERNAL_SERVICE_SECRET) {
    return;
  }

  // Check for authenticated admin user
  const user = (request as any).user;
  if (!user) {
    reply.status(401).send({ 
      error: 'Unauthorized', 
      message: 'Authentication required for detailed health info' 
    });
    return;
  }

  if (user.role !== 'admin' && user.role !== 'superadmin') {
    reply.status(403).send({ 
      error: 'Forbidden', 
      message: 'Admin access required for detailed health info' 
    });
    return;
  }
}

export async function healthRoutes(fastify: FastifyInstance) {
  // CRITICAL: Startup probe - K8s uses this to know when to start sending traffic
  // Returns 200 only when service has completed initialization
  // PUBLIC: K8s needs access without auth
  fastify.get('/health/startup', async (_request, reply) => {
    if (startupError) {
      reply.status(503).send({
        status: 'startup_failed',
        error: startupError,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!serviceStartupComplete) {
      reply.status(503).send({
        status: 'starting',
        message: 'Service is still initializing',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    reply.send({
      status: 'started',
      timestamp: new Date().toISOString(),
    });
  });

  // Liveness probe - check if service is alive
  // PUBLIC: K8s needs access without auth
  fastify.get('/health/live', async (_request, reply) => {
    reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness probe - check if service is ready to accept traffic
  // PUBLIC: K8s needs access without auth
  // HIGH: Includes timeouts on all checks
  fastify.get('/health/ready', async (_request, reply) => {
    const checks = {
      database: false,
      redis: false,
    };

    try {
      // HIGH: Check database connection with timeout
      const pool = getDatabase();
      await withTimeout(
        pool.query('SELECT 1'),
        DB_CHECK_TIMEOUT_MS,
        'Database health check'
      );
      checks.database = true;
    } catch (error) {
      fastify.log.error({ err: error }, 'Database health check failed');
    }

    try {
      // HIGH: Check Redis connection with timeout
      const redis = RedisService.getClient();
      await withTimeout(
        redis.ping(),
        REDIS_CHECK_TIMEOUT_MS,
        'Redis health check'
      );
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

  // Detailed health check with latency measurements
  // MEDIUM: Protected - only admin users or internal services can access
  // Exposes sensitive info like version, uptime, latency
  fastify.get('/health', {
    preHandler: requireAdminOrInternal,
  }, async (_request, reply) => {
    const checks = {
      database: { healthy: false, latency: 0, timeout: DB_CHECK_TIMEOUT_MS },
      redis: { healthy: false, latency: 0, timeout: REDIS_CHECK_TIMEOUT_MS },
    };

    // HIGH: Check database with timeout and statement_timeout
    try {
      const start = Date.now();
      const pool = getDatabase();
      await withTimeout(
        pool.query('SELECT 1'),
        DB_CHECK_TIMEOUT_MS,
        'Database health check'
      );
      checks.database = { healthy: true, latency: Date.now() - start, timeout: DB_CHECK_TIMEOUT_MS };
    } catch (error) {
      fastify.log.error({ err: error }, 'Database health check failed');
    }

    // HIGH: Check Redis with timeout
    try {
      const start = Date.now();
      const redis = RedisService.getClient();
      await withTimeout(
        redis.ping(),
        REDIS_CHECK_TIMEOUT_MS,
        'Redis health check'
      );
      checks.redis = { healthy: true, latency: Date.now() - start, timeout: REDIS_CHECK_TIMEOUT_MS };
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

  // MEDIUM: Public simple health endpoint for load balancers
  // Returns minimal info without sensitive details
  fastify.get('/health/simple', async (_request, reply) => {
    const pool = getDatabase();
    try {
      await withTimeout(pool.query('SELECT 1'), DB_CHECK_TIMEOUT_MS, 'DB check');
      reply.send({ status: 'ok' });
    } catch {
      reply.status(503).send({ status: 'error' });
    }
  });
}
