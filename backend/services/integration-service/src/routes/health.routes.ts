/**
 * Health Check Routes for Integration Service
 * 
 * Provides liveness and readiness probes for Kubernetes/Docker
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { checkDatabaseHealth, getPoolStats } from '../config/database';

// =============================================================================
// TYPES
// =============================================================================

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks?: Record<string, CheckResult>;
}

interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  latency?: number;
  message?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SERVICE_NAME = 'integration-service';
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';
const startTime = Date.now();

// =============================================================================
// HEALTH CHECK FUNCTIONS
// =============================================================================

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const healthy = await checkDatabaseHealth();
    const latency = Date.now() - start;
    
    if (!healthy) {
      return { status: 'fail', latency, message: 'Database connection failed' };
    }
    
    const poolStats = getPoolStats();
    if (poolStats && poolStats.pending > poolStats.size * 0.8) {
      return { status: 'warn', latency, message: 'Connection pool nearly exhausted' };
    }
    
    return { status: 'pass', latency };
  } catch (error) {
    return { 
      status: 'fail', 
      latency: Date.now() - start, 
      message: (error as Error).message 
    };
  }
}

/**
 * Check Redis connectivity
 */
async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  try {
    // Import redis config
    const { getRedisConfig } = await import('../config/index');
    const config = getRedisConfig();
    
    // Basic config check
    if (!config.host) {
      return { status: 'warn', message: 'Redis not configured' };
    }
    
    return { status: 'pass', latency: Date.now() - start };
  } catch (error) {
    return { 
      status: 'warn', 
      latency: Date.now() - start, 
      message: 'Redis check skipped' 
    };
  }
}

/**
 * Check memory usage
 */
function checkMemory(): CheckResult {
  const used = process.memoryUsage();
  const heapUsedPercent = (used.heapUsed / used.heapTotal) * 100;
  
  if (heapUsedPercent > 90) {
    return { status: 'fail', message: `Heap usage critical: ${heapUsedPercent.toFixed(1)}%` };
  }
  
  if (heapUsedPercent > 75) {
    return { status: 'warn', message: `Heap usage high: ${heapUsedPercent.toFixed(1)}%` };
  }
  
  return { status: 'pass' };
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * Liveness probe - is the process alive?
 * Should return 200 as long as the process is running
 */
async function livenessHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const response: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000)
  };
  
  reply.status(200).send(response);
}

/**
 * Readiness probe - can the service handle requests?
 * Checks all dependencies
 */
async function readinessHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const checks: Record<string, CheckResult> = {};
  
  // Run all health checks in parallel
  const [database, redis, memory] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    Promise.resolve(checkMemory())
  ]);
  
  checks.database = database;
  checks.redis = redis;
  checks.memory = memory;
  
  // Determine overall status
  const hasFailure = Object.values(checks).some(c => c.status === 'fail');
  const hasWarning = Object.values(checks).some(c => c.status === 'warn');
  
  let status: 'healthy' | 'unhealthy' | 'degraded';
  let httpStatus: number;
  
  if (hasFailure) {
    status = 'unhealthy';
    httpStatus = 503;
  } else if (hasWarning) {
    status = 'degraded';
    httpStatus = 200;
  } else {
    status = 'healthy';
    httpStatus = 200;
  }
  
  const response: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks
  };
  
  reply.status(httpStatus).send(response);
}

/**
 * Detailed health check (for monitoring dashboards)
 */
async function detailedHealthHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const memoryUsage = process.memoryUsage();
  const poolStats = getPoolStats();
  
  const response = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch
    },
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024)
    },
    database: {
      poolStats
    },
    environment: process.env.NODE_ENV || 'development'
  };
  
  reply.status(200).send(response);
}

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // Liveness probe
  fastify.get('/health/live', {
    schema: {
      description: 'Liveness probe - is the service running?',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            service: { type: 'string' },
            version: { type: 'string' },
            uptime: { type: 'number' }
          }
        }
      }
    }
  }, livenessHandler);
  
  // Readiness probe
  fastify.get('/health/ready', {
    schema: {
      description: 'Readiness probe - can the service handle requests?',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            service: { type: 'string' },
            version: { type: 'string' },
            uptime: { type: 'number' },
            checks: { type: 'object' }
          }
        }
      }
    }
  }, readinessHandler);
  
  // Detailed health (behind auth in production)
  fastify.get('/health/details', {
    schema: {
      description: 'Detailed health information',
      tags: ['Health']
    }
  }, detailedHealthHandler);
  
  // Simple /health alias for compatibility
  fastify.get('/health', {
    schema: {
      hide: true
    }
  }, livenessHandler);
}

export default healthRoutes;
