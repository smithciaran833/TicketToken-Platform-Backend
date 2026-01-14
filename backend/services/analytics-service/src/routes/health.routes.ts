/**
 * Health Check Routes
 * AUDIT FIX: HEALTH-2,3 - Comprehensive health and readiness endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { checkRedisHealth } from '../config/redis';
import { getDb } from '../config/database';
import { getPrometheusMetrics, getMetricsStatus } from '../utils/metrics';
import { getAllCircuits, CircuitState } from '../utils/circuit-breaker';
import { logger } from '../utils/logger';

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

// =============================================================================
// Helper Functions
// =============================================================================

async function checkPostgres(): Promise<{ status: 'up' | 'down'; latencyMs: number }> {
  const start = Date.now();
  try {
    const db = getDb();
    await db.raw('SELECT 1');
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'PostgreSQL health check failed');
    return { status: 'down', latencyMs: Date.now() - start };
  }
}

async function checkInfluxDB(): Promise<{ status: 'up' | 'down' | 'degraded'; latencyMs: number }> {
  const start = Date.now();
  try {
    // Check if InfluxDB URL is configured
    if (!process.env.INFLUXDB_URL) {
      return { status: 'degraded', latencyMs: 0 };
    }
    
    const response = await fetch(`${process.env.INFLUXDB_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      return { status: 'up', latencyMs: Date.now() - start };
    }
    return { status: 'down', latencyMs: Date.now() - start };
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
 * Basic liveness probe - is the service running?
 * Used by Kubernetes liveness probe
 */
async function livenessHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  reply.status(200).send({ status: 'ok' });
}

/**
 * Readiness probe - is the service ready to accept traffic?
 * Used by Kubernetes readiness probe
 */
async function readinessHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const checks = await Promise.all([
    checkPostgres(),
    checkRedisHealth(),
  ]);
  
  const [postgres, redis] = checks;
  
  // Service is ready if database and cache are up
  const isReady = postgres.status === 'up' && redis.healthy;
  
  reply.status(isReady ? 200 : 503).send({
    ready: isReady,
    checks: {
      postgres: postgres.status,
      redis: redis.healthy ? 'up' : 'down',
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
  const checks = await Promise.all([
    checkPostgres(),
    checkRedisHealth(),
    checkInfluxDB(),
  ]);
  
  const [postgres, redis, influxdb] = checks;
  const circuitStatus = checkCircuitBreakers();
  
  // Determine overall status
  let overallStatus: HealthStatus['status'] = 'healthy';
  
  if (postgres.status === 'down' || !redis.healthy) {
    overallStatus = 'unhealthy';
  } else if (influxdb.status === 'down' || circuitStatus.status === 'degraded') {
    overallStatus = 'degraded';
  }
  
  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0',
    service: 'analytics-service',
    checks: {
      postgres: {
        status: postgres.status,
        latencyMs: postgres.latencyMs,
      },
      redis: {
        status: redis.healthy ? 'up' : 'down',
        latencyMs: redis.latencyMs,
      },
      influxdb: {
        status: influxdb.status,
        latencyMs: influxdb.latencyMs,
        message: influxdb.status === 'degraded' ? 'InfluxDB not configured' : undefined,
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
 * Prometheus metrics endpoint
 */
async function metricsHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const metrics = getPrometheusMetrics();
  reply.header('Content-Type', 'text/plain; version=0.0.4').send(metrics);
}

/**
 * Internal status endpoint (not for external use)
 */
async function statusHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const metricsStatus = getMetricsStatus();
  
  reply.send({
    service: 'analytics-service',
    environment: process.env.NODE_ENV,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memory: process.memoryUsage(),
    ...metricsStatus,
  });
}

// =============================================================================
// Route Registration
// =============================================================================

export async function registerHealthRoutes(fastify: FastifyInstance): Promise<void> {
  // Liveness probe - minimal check
  fastify.get('/live', livenessHandler);
  fastify.get('/livez', livenessHandler);
  
  // Readiness probe - check dependencies
  fastify.get('/ready', readinessHandler);
  fastify.get('/readyz', readinessHandler);
  
  // Comprehensive health check
  fastify.get('/health', healthHandler);
  fastify.get('/healthz', healthHandler);
  
  // Prometheus metrics
  fastify.get('/metrics', metricsHandler);
  
  // Internal status (detailed debug info)
  fastify.get('/_status', statusHandler);
  
  logger.info('Health routes registered');
}

export default { registerHealthRoutes };
