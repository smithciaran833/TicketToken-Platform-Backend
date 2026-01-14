/**
 * Health Check Routes
 * 
 * CRITICAL: Readiness probe should ONLY check local dependencies (DB, Redis).
 * External services like Stripe should NOT be in readiness check because:
 * - A Stripe outage would cause all instances to report unhealthy
 * - This leads to cascading failures where healthy services are killed
 * - Stripe availability is checked separately in /health/integrations (informational only)
 * 
 * MEDIUM FIXES:
 * - LP-2: Event loop monitoring with lag detection
 * - LP-3: Liveness return time measured and reported
 * - PG-3: Query timeout on health checks (already implemented via withTimeout)
 * - PG-5: Pool exhaustion detection
 * - RD-3: Timeout configured on Redis health (already implemented)
 * - LOW-1: /health/live endpoint for K8s convention
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../config/database';
import { RedisService } from '../services/redisService';
import { config, SERVICE_VERSION, SERVICE_NAME } from '../config';
import Stripe from 'stripe';

const stripe = config.stripe.secretKey 
  ? new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' })
  : null;

// Health check timeouts (PG-3, RD-3)
const DB_TIMEOUT = config.database.healthCheckTimeoutMs || 5000;
const REDIS_TIMEOUT = config.redis.healthCheckTimeoutMs || 2000;
const STRIPE_TIMEOUT = config.stripe.healthCheckTimeoutMs || 5000;

// LP-2: Event loop monitoring thresholds
const EVENT_LOOP_LAG_WARNING_MS = 100;  // Warning threshold
const EVENT_LOOP_LAG_CRITICAL_MS = 500; // Critical threshold

// LP-3: Liveness timing threshold
const LIVENESS_MAX_RESPONSE_MS = 100;

// PG-5: Pool exhaustion thresholds
const POOL_USAGE_WARNING_PERCENT = 80;
const POOL_USAGE_CRITICAL_PERCENT = 95;

// =============================================================================
// LP-2: EVENT LOOP MONITORING
// =============================================================================

let lastEventLoopLagMs = 0;
let eventLoopInterval: NodeJS.Timeout | null = null;

/**
 * Monitor event loop lag (LP-2)
 * This detects when the event loop is blocked
 */
function startEventLoopMonitoring(): void {
  let lastCheck = Date.now();
  
  eventLoopInterval = setInterval(() => {
    const now = Date.now();
    const expectedDelay = 100; // Check every 100ms
    const actualDelay = now - lastCheck;
    
    // Calculate lag (how much longer than expected)
    lastEventLoopLagMs = Math.max(0, actualDelay - expectedDelay);
    lastCheck = now;
  }, 100);

  // Prevent keeping process alive
  if (eventLoopInterval.unref) {
    eventLoopInterval.unref();
  }
}

/**
 * Get current event loop status
 */
function getEventLoopStatus(): { lagMs: number; status: 'healthy' | 'warning' | 'critical' } {
  const lagMs = lastEventLoopLagMs;
  
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (lagMs >= EVENT_LOOP_LAG_CRITICAL_MS) {
    status = 'critical';
  } else if (lagMs >= EVENT_LOOP_LAG_WARNING_MS) {
    status = 'warning';
  }
  
  return { lagMs, status };
}

// Start monitoring on module load
startEventLoopMonitoring();

// =============================================================================
// PG-5: POOL EXHAUSTION DETECTION
// =============================================================================

interface PoolStatus {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  usagePercent: number;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
}

/**
 * Get database pool status (PG-5)
 */
async function getPoolStatus(): Promise<PoolStatus> {
  try {
    // Access pool stats if available
    const poolStats = pool as any;
    
    const totalCount = poolStats.totalCount ?? poolStats._clients?.length ?? config.database.poolMax;
    const idleCount = poolStats.idleCount ?? poolStats._idle?.length ?? 0;
    const waitingCount = poolStats.waitingCount ?? poolStats._pendingQueue?.length ?? 0;
    
    const activeCount = totalCount - idleCount;
    const maxConnections = config.database.poolMax || 10;
    const usagePercent = Math.round((activeCount / maxConnections) * 100);
    
    let status: PoolStatus['status'] = 'healthy';
    if (usagePercent >= POOL_USAGE_CRITICAL_PERCENT) {
      status = 'critical';
    } else if (usagePercent >= POOL_USAGE_WARNING_PERCENT) {
      status = 'warning';
    }
    
    return {
      totalCount,
      idleCount,
      waitingCount,
      usagePercent,
      status,
    };
  } catch (err) {
    return {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      usagePercent: 0,
      status: 'unknown',
    };
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Execute a promise with timeout (PG-3, RD-3)
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${name} health check timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function healthRoutes(fastify: FastifyInstance) {
  
  // ==========================================================================
  // BASIC LIVENESS PROBE - /health
  // Used by K8s liveness probe to determine if process is running
  // LP-3: Measures response time
  // ==========================================================================
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    const response = { 
      status: 'healthy', 
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString()
    };
    
    // LP-3: Measure response time
    const responseTimeMs = Date.now() - startTime;
    
    // Warn if response time is too high
    if (responseTimeMs > LIVENESS_MAX_RESPONSE_MS) {
      reply.header('X-Response-Time-Warning', `${responseTimeMs}ms exceeds ${LIVENESS_MAX_RESPONSE_MS}ms threshold`);
    }
    
    reply.header('X-Response-Time', `${responseTimeMs}ms`);
    
    return response;
  });

  // ==========================================================================
  // LOW-1: KUBERNETES LIVENESS PROBE - /health/live
  // K8s naming convention for liveness probe
  // LP-2: Includes event loop monitoring
  // LP-3: Measures response time
  // ==========================================================================
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    // LP-2: Check event loop health
    const eventLoop = getEventLoopStatus();
    
    // If event loop is critically lagging, report unhealthy
    if (eventLoop.status === 'critical') {
      reply.status(503);
      return {
        status: 'unhealthy',
        reason: 'Event loop lag critical',
        eventLoop: {
          lagMs: eventLoop.lagMs,
          status: eventLoop.status,
          threshold: EVENT_LOOP_LAG_CRITICAL_MS,
        },
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        timestamp: new Date().toISOString(),
      };
    }
    
    const responseTimeMs = Date.now() - startTime;
    reply.header('X-Response-Time', `${responseTimeMs}ms`);
    
    return { 
      status: 'healthy',
      eventLoop: {
        lagMs: eventLoop.lagMs,
        status: eventLoop.status,
      },
      responseTimeMs,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString()
    };
  });

  // ==========================================================================
  // STARTUP PROBE - /health/startup
  // Checks if service has completed initialization
  // ==========================================================================
  fastify.get('/health/startup', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks = {
      config: false,
      database: false,
      redis: false,
    };
    
    const errors: string[] = [];
    const startTime = Date.now();

    // 1. Check config is valid
    try {
      if (config.jwt.secret && config.jwt.secret.length >= 32) {
        checks.config = true;
      } else {
        errors.push('Configuration: JWT secret not properly configured');
      }
    } catch (err: any) {
      errors.push(`Configuration: ${err.message}`);
    }

    // 2. Check database connection (PG-3: with timeout)
    try {
      await withTimeout(pool.query('SELECT 1'), DB_TIMEOUT, 'Database');
      checks.database = true;
    } catch (err: any) {
      errors.push(`Database: ${err.message}`);
    }

    // 3. Check Redis connection (RD-3: with timeout)
    try {
      const redis = RedisService.getClient();
      await withTimeout(redis.ping(), REDIS_TIMEOUT, 'Redis');
      checks.redis = true;
    } catch (err: any) {
      errors.push(`Redis: ${err.message}`);
    }

    const allHealthy = checks.config && checks.database && checks.redis;
    const duration = Date.now() - startTime;

    if (!allHealthy) {
      reply.status(503);
      return {
        status: 'not_started',
        checks,
        errors,
        duration: `${duration}ms`,
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
      };
    }

    return {
      status: 'started',
      checks,
      duration: `${duration}ms`,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString()
    };
  });

  // ==========================================================================
  // READINESS PROBE - /health/ready
  // CRITICAL: Only checks LOCAL dependencies. NO external services.
  // Used by K8s to determine if service can receive traffic
  // PG-5: Includes pool exhaustion detection
  // LP-2: Includes event loop monitoring
  // ==========================================================================
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, boolean> = {
      database: false,
      redis: false,
      eventLoop: true,
      poolHealth: true,
    };
    
    const errors: string[] = [];
    const startTime = Date.now();

    // LP-2: Check event loop
    const eventLoop = getEventLoopStatus();
    if (eventLoop.status === 'critical') {
      checks.eventLoop = false;
      errors.push(`Event loop lag critical: ${eventLoop.lagMs}ms`);
    }

    // 1. Check database with timeout (PG-3)
    try {
      await withTimeout(pool.query('SELECT 1'), DB_TIMEOUT, 'Database');
      checks.database = true;
    } catch (err: any) {
      errors.push(`Database: ${err.message}`);
    }

    // PG-5: Check pool exhaustion
    const poolStatus = await getPoolStatus();
    if (poolStatus.status === 'critical') {
      checks.poolHealth = false;
      errors.push(`Database pool exhausted: ${poolStatus.usagePercent}% usage`);
    }

    // 2. Check Redis with timeout (RD-3)
    try {
      const redis = RedisService.getClient();
      await withTimeout(redis.ping(), REDIS_TIMEOUT, 'Redis');
      checks.redis = true;
    } catch (err: any) {
      errors.push(`Redis: ${err.message}`);
    }

    const allHealthy = Object.values(checks).every(c => c === true);
    const duration = Date.now() - startTime;

    if (!allHealthy) {
      reply.status(503);
      return {
        status: 'not_ready',
        checks,
        errors,
        eventLoop: {
          lagMs: eventLoop.lagMs,
          status: eventLoop.status,
        },
        pool: poolStatus,
        duration: `${duration}ms`,
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
      };
    }

    return {
      status: 'ready',
      checks,
      eventLoop: {
        lagMs: eventLoop.lagMs,
        status: eventLoop.status,
      },
      pool: poolStatus,
      duration: `${duration}ms`,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString()
    };
  });

  // ==========================================================================
  // DATABASE HEALTH - /health/db
  // Detailed database health check with pool status
  // PG-5: Pool exhaustion detection
  // ==========================================================================
  fastify.get('/health/db', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const start = Date.now();
      
      // PG-3: Query with timeout
      await withTimeout(pool.query('SELECT 1'), DB_TIMEOUT, 'Database');
      const duration = Date.now() - start;
      
      // PG-5: Get pool status
      const poolStatus = await getPoolStatus();
      
      const response: any = {
        status: poolStatus.status === 'critical' ? 'warning' : 'healthy',
        database: 'connected',
        responseTime: `${duration}ms`,
        pool: poolStatus,
        service: SERVICE_NAME,
      };
      
      if (poolStatus.status !== 'healthy') {
        response.warning = `Pool usage at ${poolStatus.usagePercent}%`;
      }
      
      return response;
    } catch (err: any) {
      reply.status(503);
      return {
        status: 'error',
        database: 'disconnected',
        error: err.message,
        pool: await getPoolStatus(),
        service: SERVICE_NAME,
      };
    }
  });

  // ==========================================================================
  // REDIS HEALTH - /health/redis
  // Detailed Redis health check
  // RD-3: With timeout
  // ==========================================================================
  fastify.get('/health/redis', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const start = Date.now();
      const redis = RedisService.getClient();
      
      // RD-3: With timeout
      await withTimeout(redis.ping(), REDIS_TIMEOUT, 'Redis');
      const duration = Date.now() - start;
      
      return {
        status: 'healthy',
        redis: 'connected',
        responseTime: `${duration}ms`,
        service: SERVICE_NAME,
      };
    } catch (err: any) {
      reply.status(503);
      return {
        status: 'error',
        redis: 'disconnected',
        error: err.message,
        service: SERVICE_NAME,
      };
    }
  });

  // ==========================================================================
  // EXTERNAL INTEGRATIONS - /health/integrations
  // INFORMATIONAL ONLY - Not used for K8s probes
  // Reports status of external services like Stripe
  // ==========================================================================
  fastify.get('/health/integrations', async (request: FastifyRequest, reply: FastifyReply) => {
    const integrations = {
      stripe: {
        configured: !!stripe,
        status: 'unknown' as string,
        responseTime: null as string | null,
        error: null as string | null,
      }
    };

    // Check Stripe (informational only)
    if (stripe) {
      try {
        const start = Date.now();
        await withTimeout(stripe.balance.retrieve(), STRIPE_TIMEOUT, 'Stripe');
        const duration = Date.now() - start;
        
        integrations.stripe.status = 'healthy';
        integrations.stripe.responseTime = `${duration}ms`;
      } catch (err: any) {
        integrations.stripe.status = 'unhealthy';
        integrations.stripe.error = err.message;
      }
    } else {
      integrations.stripe.status = 'not_configured';
    }

    return {
      status: 'informational',
      message: 'External integration status - NOT used for service health',
      integrations,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString()
    };
  });

  // ==========================================================================
  // STRIPE HEALTH - /health/stripe (Deprecated)
  // Kept for backwards compatibility
  // ==========================================================================
  fastify.get('/health/stripe', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('X-Deprecated', 'Use /health/integrations instead');
    reply.header('Warning', '299 - "Deprecated endpoint: Use /health/integrations instead"');

    if (!stripe) {
      return {
        status: 'not_configured',
        stripe: 'not_configured',
        message: 'STRIPE_SECRET_KEY not set',
        service: SERVICE_NAME,
        deprecated: true
      };
    }

    try {
      const start = Date.now();
      await withTimeout(stripe.balance.retrieve(), STRIPE_TIMEOUT, 'Stripe');
      const duration = Date.now() - start;
      
      return {
        status: 'healthy',
        stripe: 'connected',
        responseTime: `${duration}ms`,
        service: SERVICE_NAME,
        deprecated: true
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        stripe: 'unreachable',
        error: err.message,
        service: SERVICE_NAME,
        deprecated: true,
      };
    }
  });
}

// Export for testing
export { getEventLoopStatus, getPoolStatus, startEventLoopMonitoring };
