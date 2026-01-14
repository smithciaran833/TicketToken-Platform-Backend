/**
 * Health Check Routes for Compliance Service
 * 
 * AUDIT FIXES:
 * - HEALTH-H1: /health/live endpoint for Kubernetes liveness probe
 * - HEALTH-H2: /health/ready endpoint for Kubernetes readiness probe
 * - HEALTH-H3: Event loop monitoring via event loop lag check
 * - HEALTH-H4: Timeouts on health checks
 * - HEALTH-M1: Error message sanitized - no details leaked
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../services/database.service';
import { redis } from '../services/redis.service';
import { logger } from '../utils/logger';

// Health check timeout (5 seconds)
const HEALTH_CHECK_TIMEOUT_MS = 5000;

// Event loop lag threshold (100ms is concerning, 500ms is critical)
const EVENT_LOOP_LAG_WARNING_MS = 100;
const EVENT_LOOP_LAG_CRITICAL_MS = 500;

// Track service start time for uptime calculation
const SERVICE_START_TIME = Date.now();

// Track if service is shutting down
let isShuttingDown = false;

export function setShuttingDown(value: boolean) {
  isShuttingDown = value;
}

/**
 * Measure event loop lag
 */
async function measureEventLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const start = Date.now();
    setImmediate(() => {
      resolve(Date.now() - start);
    });
  });
}

/**
 * Execute with timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => 
      setTimeout(() => resolve(fallback), timeoutMs)
    )
  ]);
}

/**
 * Check database connectivity with timeout
 */
async function checkDatabase(): Promise<{ healthy: boolean; latencyMs?: number }> {
  const start = Date.now();
  try {
    await withTimeout(
      db.query('SELECT 1'),
      HEALTH_CHECK_TIMEOUT_MS,
      null
    );
    return { healthy: true, latencyMs: Date.now() - start };
  } catch {
    return { healthy: false };
  }
}

/**
 * Check Redis connectivity with timeout
 */
async function checkRedis(): Promise<{ healthy: boolean; latencyMs?: number }> {
  const start = Date.now();
  try {
    const client = redis.getClient();
    if (!client) return { healthy: false };
    
    const result = await withTimeout(
      client.ping(),
      HEALTH_CHECK_TIMEOUT_MS,
      null
    );
    return { healthy: result === 'PONG', latencyMs: Date.now() - start };
  } catch {
    return { healthy: false };
  }
}

export async function healthRoutes(fastify: FastifyInstance) {
  
  // ==========================================================================
  // HEALTH-H1: Kubernetes Liveness Probe
  // ==========================================================================
  
  /**
   * /health/live - Kubernetes liveness probe
   * Returns 200 if the process is alive and not hung
   * Checks event loop responsiveness
   */
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    // If shutting down, report unhealthy to stop traffic
    if (isShuttingDown) {
      return reply.code(503).send({
        status: 'shutting_down',
        message: 'Service is shutting down'
      });
    }

    // Check event loop lag (HEALTH-H3)
    const eventLoopLag = await measureEventLoopLag();
    
    if (eventLoopLag > EVENT_LOOP_LAG_CRITICAL_MS) {
      logger.warn({
        eventLoopLag,
        threshold: EVENT_LOOP_LAG_CRITICAL_MS
      }, 'Event loop lag critical');
      
      return reply.code(503).send({
        status: 'unhealthy',
        eventLoopLag,
        message: 'Event loop unresponsive'
      });
    }

    return reply.send({
      status: 'alive',
      eventLoopLag,
      uptime: Math.floor((Date.now() - SERVICE_START_TIME) / 1000),
      timestamp: new Date().toISOString()
    });
  });

  // ==========================================================================
  // HEALTH-H2: Kubernetes Readiness Probe  
  // ==========================================================================

  /**
   * /health/ready - Kubernetes readiness probe
   * Returns 200 if the service is ready to accept traffic
   * Checks all dependencies
   */
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    // If shutting down, stop accepting traffic
    if (isShuttingDown) {
      return reply.code(503).send({
        status: 'shutting_down',
        ready: false
      });
    }

    const checks = {
      database: await checkDatabase(),
      redis: await checkRedis(),
      eventLoop: { healthy: true, lagMs: 0 }
    };

    // Check event loop lag
    const eventLoopLag = await measureEventLoopLag();
    checks.eventLoop = {
      healthy: eventLoopLag < EVENT_LOOP_LAG_WARNING_MS,
      lagMs: eventLoopLag
    };

    const allHealthy = 
      checks.database.healthy && 
      checks.redis.healthy && 
      checks.eventLoop.healthy;

    const status = allHealthy ? 200 : 503;

    return reply.code(status).send({
      status: allHealthy ? 'ready' : 'not_ready',
      ready: allHealthy,
      checks: {
        database: checks.database.healthy ? 'ok' : 'fail',
        redis: checks.redis.healthy ? 'ok' : 'fail',
        eventLoop: checks.eventLoop.healthy ? 'ok' : 'degraded'
      },
      latency: {
        database: checks.database.latencyMs,
        redis: checks.redis.latencyMs,
        eventLoop: checks.eventLoop.lagMs
      },
      timestamp: new Date().toISOString()
    });
  });

  // ==========================================================================
  // Legacy Health Endpoints (backwards compatible)
  // ==========================================================================

  /**
   * /health - Simple health check
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'healthy',
      service: 'compliance-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - SERVICE_START_TIME) / 1000),
      timestamp: new Date().toISOString()
    });
  });

  /**
   * /ready - Detailed readiness check with dependency info
   */
  fastify.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks = {
      database: false,
      redis: false,
      ofacData: false
    };
    
    try {
      // Check database with timeout (HEALTH-H4)
      const dbCheck = await checkDatabase();
      checks.database = dbCheck.healthy;
      
      // Check Redis with timeout (HEALTH-H4)
      const redisCheck = await checkRedis();
      checks.redis = redisCheck.healthy;
      
      // Check OFAC data exists (optional for readiness)
      try {
        const result = await withTimeout(
          db.query(
            `SELECT COUNT(*) as count, MAX(created_at) as last_update 
             FROM ofac_sdn_list LIMIT 1`
          ),
          HEALTH_CHECK_TIMEOUT_MS,
          { rows: [{ count: '0', last_update: null }], command: '', rowCount: 0, oid: 0, fields: [] } as any
        );
        const count = parseInt(result.rows[0]?.count || '0');
        checks.ofacData = count > 0;
      } catch {
        checks.ofacData = false;
      }
      
      // Service is ready if core dependencies are up
      const ready = checks.database && checks.redis;
      
      return reply.code(ready ? 200 : 503).send({
        ready,
        checks,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      // HEALTH-M1: Don't leak error details
      logger.error({
        error: error.message
      }, 'Health check failed');
      
      return reply.code(503).send({
        ready: false,
        checks,
        timestamp: new Date().toISOString()
      });
    }
  });

  // ==========================================================================
  // Deep Health Check (Admin only)
  // ==========================================================================

  /**
   * /health/deep - Comprehensive health check
   * Should be protected by authentication in production
   */
  fastify.get('/health/deep', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    const results: any = {
      status: 'checking',
      service: 'compliance-service',
      version: process.env.npm_package_version || '1.0.0',
      node: process.version,
      uptime: Math.floor((Date.now() - SERVICE_START_TIME) / 1000),
      memory: process.memoryUsage(),
      checks: {}
    };

    // Database check
    const dbCheck = await checkDatabase();
    results.checks.database = {
      status: dbCheck.healthy ? 'healthy' : 'unhealthy',
      latencyMs: dbCheck.latencyMs
    };

    // Redis check
    const redisCheck = await checkRedis();
    results.checks.redis = {
      status: redisCheck.healthy ? 'healthy' : 'unhealthy',
      latencyMs: redisCheck.latencyMs
    };

    // Event loop check
    const eventLoopLag = await measureEventLoopLag();
    results.checks.eventLoop = {
      status: eventLoopLag < EVENT_LOOP_LAG_WARNING_MS ? 'healthy' : 
              eventLoopLag < EVENT_LOOP_LAG_CRITICAL_MS ? 'degraded' : 'unhealthy',
      lagMs: eventLoopLag
    };

    // OFAC data check
    try {
      const ofacResult = await withTimeout(
        db.query(`SELECT COUNT(*) as count FROM ofac_sdn_list`),
        HEALTH_CHECK_TIMEOUT_MS,
        { rows: [{ count: '0' }], command: '', rowCount: 0, oid: 0, fields: [] } as any
      );
      results.checks.ofacData = {
        status: parseInt(ofacResult.rows[0]?.count || '0') > 0 ? 'healthy' : 'warning',
        records: parseInt(ofacResult.rows[0]?.count || '0')
      };
    } catch {
      results.checks.ofacData = { status: 'unhealthy', records: 0 };
    }

    // Overall status
    const allHealthy = 
      results.checks.database.status === 'healthy' &&
      results.checks.redis.status === 'healthy' &&
      results.checks.eventLoop.status !== 'unhealthy';

    results.status = allHealthy ? 'healthy' : 'unhealthy';
    results.totalCheckTimeMs = Date.now() - startTime;
    results.timestamp = new Date().toISOString();

    return reply.code(allHealthy ? 200 : 503).send(results);
  });
}

export default healthRoutes;
