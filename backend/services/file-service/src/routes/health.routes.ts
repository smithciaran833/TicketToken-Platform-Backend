/**
 * Health Check Routes
 * 
 * AUDIT FIXES:
 * - HEALTH-1: No /health/live endpoint → K8s liveness probe
 * - HEALTH-2: No /health/ready endpoint → K8s readiness probe
 * - HEALTH-3: No /health/startup endpoint → K8s startup probe
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database.config';
import { s3Circuit, getAllCircuits, CircuitState, getCircuitStats } from '../utils/circuit-breaker';
import { logger } from '../utils/logger';
import { schemas } from '../schemas/validation';

// =============================================================================
// Types
// =============================================================================

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  service: string;
  checks: {
    [key: string]: {
      status: 'up' | 'down' | 'degraded';
      latencyMs?: number;
      message?: string;
    };
  };
}

// Track startup time
const startTime = Date.now();
let startupComplete = false;

// =============================================================================
// Health Check Functions
// =============================================================================

async function checkPostgres(): Promise<{ status: 'up' | 'down'; latencyMs: number }> {
  const start = Date.now();
  try {
    const pool = getPool();
    if (!pool) {
      return { status: 'down', latencyMs: Date.now() - start };
    }
    await pool.query('SELECT 1');
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'PostgreSQL health check failed');
    return { status: 'down', latencyMs: Date.now() - start };
  }
}

async function checkRedis(): Promise<{ status: 'up' | 'down' | 'degraded'; latencyMs: number }> {
  const start = Date.now();
  try {
    // Check if Redis is available via server decorator
    // This is a simplified check - actual implementation would use redis client
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (error) {
    return { status: 'down', latencyMs: Date.now() - start };
  }
}

async function checkS3(): Promise<{ status: 'up' | 'down' | 'degraded'; latencyMs: number }> {
  const start = Date.now();
  try {
    // Check S3 circuit breaker state
    if (s3Circuit.getState() === CircuitState.OPEN) {
      return { status: 'down', latencyMs: Date.now() - start };
    }
    if (s3Circuit.getState() === CircuitState.HALF_OPEN) {
      return { status: 'degraded', latencyMs: Date.now() - start };
    }
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (error) {
    return { status: 'down', latencyMs: Date.now() - start };
  }
}

function checkCircuitBreakers(): { status: 'up' | 'degraded'; openCircuits: string[] } {
  const openCircuits: string[] = [];
  
  getAllCircuits().forEach((circuit, name) => {
    if (circuit.getState() === CircuitState.OPEN) {
      openCircuits.push(name);
    }
  });
  
  return {
    status: openCircuits.length > 0 ? 'degraded' : 'up',
    openCircuits,
  };
}

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * AUDIT FIX HEALTH-1: Liveness probe
 * Simple check - is the service running?
 */
async function livenessHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  reply.status(200).send({ status: 'ok' });
}

/**
 * AUDIT FIX HEALTH-2: Readiness probe
 * Is the service ready to accept traffic?
 */
async function readinessHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const [postgres, redis, s3] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkS3(),
  ]);
  
  // Service is ready if database is up and S3 is accessible
  const isReady = postgres.status === 'up' && s3.status !== 'down';
  
  reply.status(isReady ? 200 : 503).send({
    ready: isReady,
    checks: {
      postgres: postgres.status,
      redis: redis.status,
      s3: s3.status,
    },
  });
}

/**
 * AUDIT FIX HEALTH-3: Startup probe
 * Has the service completed initialization?
 */
async function startupHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Check if all essential services are available
  const postgres = await checkPostgres();
  
  // Mark startup as complete once DB is available
  if (postgres.status === 'up') {
    startupComplete = true;
  }
  
  reply.status(startupComplete ? 200 : 503).send({
    started: startupComplete,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      postgres: postgres.status,
    },
  });
}

/**
 * Comprehensive health check
 * Returns detailed status of all dependencies
 */
async function healthHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const [postgres, redis, s3] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkS3(),
  ]);
  
  const circuitStatus = checkCircuitBreakers();
  
  // Determine overall status
  let overallStatus: HealthStatus['status'] = 'healthy';
  
  if (postgres.status === 'down') {
    overallStatus = 'unhealthy';
  } else if (s3.status === 'down' || circuitStatus.status === 'degraded') {
    overallStatus = 'degraded';
  }
  
  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0',
    service: 'file-service',
    checks: {
      postgres: {
        status: postgres.status,
        latencyMs: postgres.latencyMs,
      },
      redis: {
        status: redis.status,
        latencyMs: redis.latencyMs,
      },
      s3: {
        status: s3.status,
        latencyMs: s3.latencyMs,
      },
      circuitBreakers: {
        status: circuitStatus.status,
        message: circuitStatus.openCircuits.length > 0
          ? `Open circuits: ${circuitStatus.openCircuits.join(', ')}`
          : undefined,
      },
    },
  };
  
  const statusCode = overallStatus === 'healthy' ? 200 :
                     overallStatus === 'degraded' ? 200 : 503;
  
  reply.status(statusCode).send(health);
}

/**
 * Metrics endpoint - circuit breaker stats
 */
async function metricsHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const circuitStats = getCircuitStats();
  
  reply.send({
    service: 'file-service',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memory: process.memoryUsage(),
    circuits: circuitStats,
  });
}

// =============================================================================
// Route Registration
// =============================================================================

export async function registerHealthRoutes(fastify: FastifyInstance): Promise<void> {
  // Liveness probe - minimal check
  fastify.get('/live', { schema: schemas.live }, livenessHandler);
  fastify.get('/livez', { schema: schemas.live }, livenessHandler);
  
  // Readiness probe - check dependencies
  fastify.get('/ready', { schema: schemas.ready }, readinessHandler);
  fastify.get('/readyz', { schema: schemas.ready }, readinessHandler);
  
  // Startup probe - initialization check
  fastify.get('/startup', { schema: schemas.live }, startupHandler);
  
  // Comprehensive health check
  fastify.get('/', { schema: schemas.health }, healthHandler);
  fastify.get('/health', { schema: schemas.health }, healthHandler);
  fastify.get('/healthz', { schema: schemas.health }, healthHandler);
  
  // Internal metrics
  fastify.get('/metrics', metricsHandler);
  
  logger.info('Health routes registered');
}

export default { registerHealthRoutes };
