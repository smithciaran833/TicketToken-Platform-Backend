import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Gauge, Histogram } from 'prom-client';
import { getConnection } from '../config/solana';
import { getBalanceMonitor } from '../services/BalanceMonitor';
import { getMintQueue, getStaleJobDetectionStatus } from '../queues/mintQueue';
import { getCircuitBreakerHealth } from '../utils/circuit-breaker';
import db from '../config/database';
import { updateSystemHealth } from '../utils/metrics';
import logger from '../utils/logger';
import Redis from 'ioredis';
import crypto from 'crypto';

// Redis client for health checks
let redisClient: Redis | null = null;

// =============================================================================
// EVENT LOOP MONITORING
// =============================================================================

// Event loop lag gauge
const eventLoopLagGauge = new Gauge({
  name: 'minting_event_loop_lag_ms',
  help: 'Node.js event loop lag in milliseconds'
});

// Event loop lag histogram
const eventLoopLagHistogram = new Histogram({
  name: 'minting_event_loop_lag_histogram_ms',
  help: 'Distribution of event loop lag measurements',
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000]
});

// Memory usage gauge
const memoryUsageGauge = new Gauge({
  name: 'minting_memory_usage_bytes',
  help: 'Process memory usage in bytes',
  labelNames: ['type']
});

// Event loop monitoring interval
let eventLoopMonitorInterval: NodeJS.Timeout | null = null;
let lastEventLoopCheck: number = Date.now();
let currentEventLoopLag: number = 0;

/**
 * Start event loop monitoring
 * Measures how long it takes for setTimeout(0) to execute
 */
export function startEventLoopMonitoring(intervalMs: number = 1000): void {
  if (eventLoopMonitorInterval) {
    return;
  }

  function measureEventLoopLag(): void {
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      currentEventLoopLag = lag;
      lastEventLoopCheck = Date.now();
      
      // Update metrics
      eventLoopLagGauge.set(lag);
      eventLoopLagHistogram.observe(lag);

      // Log if lag is excessive (>100ms)
      if (lag > 100) {
        logger.warn('High event loop lag detected', {
          lagMs: lag,
          threshold: 100
        });
      }
    });
  }

  // Measure immediately
  measureEventLoopLag();

  // Then measure periodically
  eventLoopMonitorInterval = setInterval(measureEventLoopLag, intervalMs);

  // Also track memory usage
  setInterval(() => {
    const memUsage = process.memoryUsage();
    memoryUsageGauge.set({ type: 'heapUsed' }, memUsage.heapUsed);
    memoryUsageGauge.set({ type: 'heapTotal' }, memUsage.heapTotal);
    memoryUsageGauge.set({ type: 'rss' }, memUsage.rss);
    memoryUsageGauge.set({ type: 'external' }, memUsage.external);
  }, 5000);

  logger.info('Event loop monitoring started', { intervalMs });
}

/**
 * Stop event loop monitoring
 */
export function stopEventLoopMonitoring(): void {
  if (eventLoopMonitorInterval) {
    clearInterval(eventLoopMonitorInterval);
    eventLoopMonitorInterval = null;
    logger.info('Event loop monitoring stopped');
  }
}

/**
 * Get current event loop status
 */
export function getEventLoopStatus(): {
  lagMs: number;
  lastCheckTimestamp: string;
  healthy: boolean;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
} {
  const memUsage = process.memoryUsage();
  return {
    lagMs: currentEventLoopLag,
    lastCheckTimestamp: new Date(lastEventLoopCheck).toISOString(),
    healthy: currentEventLoopLag < 100, // Consider unhealthy if lag > 100ms
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external
    }
  };
}

// =============================================================================
// AUTH FOR DETAILED HEALTH
// =============================================================================

// Health endpoint API key (separate from admin auth for operational access)
const HEALTH_API_KEY = process.env.HEALTH_API_KEY;

/**
 * Verify health endpoint authentication
 * Only required for detailed/sensitive endpoints
 */
function verifyHealthAuth(request: FastifyRequest): boolean {
  // If no API key configured, skip auth (for backwards compatibility)
  if (!HEALTH_API_KEY) {
    return true;
  }

  // Check for API key in header
  const providedKey = request.headers['x-health-api-key'] || request.headers['authorization']?.replace('Bearer ', '');
  
  if (!providedKey) {
    return false;
  }

  // Timing-safe comparison
  try {
    const keyBuffer = Buffer.from(HEALTH_API_KEY);
    const providedBuffer = Buffer.from(providedKey as string);
    
    if (keyBuffer.length !== providedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(keyBuffer, providedBuffer);
  } catch {
    return false;
  }
}

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
  }
  return redisClient;
}

// =============================================================================
// STANDARDIZED STATUS VALUES
// =============================================================================
// Use consistent status values across all health endpoints:
// - 'ok': Component/service is functioning normally
// - 'degraded': Component/service is partially functional
// - 'error': Component/service is not functioning
// - 'unknown': Status cannot be determined

type HealthStatus = 'ok' | 'degraded' | 'error' | 'unknown';

interface ComponentHealth {
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
}

interface HealthResponse {
  status: HealthStatus;
  service: string;
  timestamp: string;
  version?: string;  // Only include in authenticated endpoints
  uptime?: number;   // Only include in authenticated endpoints (security: hides restart time)
  components?: Record<string, ComponentHealth>;
}

// =============================================================================
// TIMEOUT UTILITY
// =============================================================================

/**
 * Execute a promise with a timeout
 * @param promise The promise to execute
 * @param ms Timeout in milliseconds
 * @param name Name of the operation (for error message)
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  name: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${name} health check timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]);
}

// Default timeout for health checks (2 seconds)
const HEALTH_CHECK_TIMEOUT = 2000;

// =============================================================================
// HEALTH ROUTES
// =============================================================================

export default async function healthRoutes(
  fastify: FastifyInstance,
  options: any
): Promise<void> {

  // =========================================================================
  // Basic health check (fast, for load balancers)
  // Does NOT expose uptime or version (security: hides restart time info)
  // =========================================================================
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const response: HealthResponse = {
      status: 'ok',
      service: 'minting-service',
      timestamp: new Date().toISOString()
      // Note: uptime and version omitted for security (issue #9 - SEC5)
    };

    return reply.send(response);
  });

  // =========================================================================
  // Startup probe (for Kubernetes - checks all dependencies are ready)
  // Does NOT expose uptime (security)
  // =========================================================================
  fastify.get('/health/startup', async (request: FastifyRequest, reply: FastifyReply) => {
    const components: HealthResponse['components'] = {};
    let allReady = true;

    // Check database
    try {
      const startTime = Date.now();
      await withTimeout(db.raw('SELECT 1'), HEALTH_CHECK_TIMEOUT, 'database');
      components.database = {
        status: 'ok',
        latencyMs: Date.now() - startTime,
        message: 'Database connection ready'
      };
    } catch (error) {
      components.database = {
        status: 'error',
        message: (error as Error).message
      };
      allReady = false;
    }

    // Check Redis
    try {
      const startTime = Date.now();
      const redis = getRedisClient();
      await withTimeout(redis.ping(), HEALTH_CHECK_TIMEOUT, 'redis');
      components.redis = {
        status: 'ok',
        latencyMs: Date.now() - startTime,
        message: 'Redis connection ready'
      };
    } catch (error) {
      components.redis = {
        status: 'error',
        message: (error as Error).message
      };
      allReady = false;
    }

    // Check queue is ready
    try {
      const startTime = Date.now();
      const queue = getMintQueue();
      await withTimeout(queue.isReady(), HEALTH_CHECK_TIMEOUT, 'queue');
      components.queue = {
        status: 'ok',
        latencyMs: Date.now() - startTime,
        message: 'Mint queue ready'
      };
    } catch (error) {
      components.queue = {
        status: 'error',
        message: (error as Error).message
      };
      allReady = false;
    }

    // Check Solana connection
    try {
      const startTime = Date.now();
      const connection = getConnection();
      await withTimeout(connection.getSlot(), HEALTH_CHECK_TIMEOUT, 'solana');
      components.solana = {
        status: 'ok',
        latencyMs: Date.now() - startTime,
        message: 'Solana RPC ready'
      };
    } catch (error) {
      components.solana = {
        status: 'error',
        message: (error as Error).message
      };
      allReady = false;
    }

    const response: HealthResponse = {
      status: allReady ? 'ok' : 'error',
      service: 'minting-service',
      timestamp: new Date().toISOString(),
      // Note: version and uptime omitted for security
      components
    };

    if (allReady) {
      return reply.send(response);
    } else {
      return reply.code(503).send(response);
    }
  });

  // =========================================================================
  // Detailed health check (includes all component statuses)
  // PROTECTED: Requires HEALTH_API_KEY if configured (issue #35 - SEC4)
  // =========================================================================
  fastify.get('/health/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify authentication if HEALTH_API_KEY is configured
    if (!verifyHealthAuth(request)) {
      logger.warn('Unauthorized access attempt to detailed health endpoint', {
        ip: request.ip,
        headers: {
          'x-health-api-key': request.headers['x-health-api-key'] ? '[PRESENT]' : '[MISSING]',
          'authorization': request.headers['authorization'] ? '[PRESENT]' : '[MISSING]'
        }
      });
      
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Valid HEALTH_API_KEY required for detailed health information',
        hint: 'Provide key via X-Health-API-Key header or Authorization: Bearer <key>'
      });
    }

    const components: HealthResponse['components'] = {};
    let overallStatus: HealthStatus = 'ok';

    // Check event loop health (issue #32 - LP3)
    const eventLoopStatus = getEventLoopStatus();
    components.eventLoop = {
      status: eventLoopStatus.healthy ? 'ok' : 'error',
      latencyMs: eventLoopStatus.lagMs,
      message: `Event loop lag: ${eventLoopStatus.lagMs}ms`
    };
    if (!eventLoopStatus.healthy) {
      overallStatus = 'degraded';
    }

    // Check Solana connection with timeout
    try {
      const startTime = Date.now();
      const connection = getConnection();
      await withTimeout(connection.getVersion(), HEALTH_CHECK_TIMEOUT, 'solana');
      const latencyMs = Date.now() - startTime;

      components.solana = {
        status: 'ok',
        latencyMs,
        message: 'Connected to Solana RPC'
      };
      updateSystemHealth('solana', true);
    } catch (error) {
      components.solana = {
        status: 'error',
        message: (error as Error).message
      };
      updateSystemHealth('solana', false);
      overallStatus = 'error';
    }

    // Check database connection with timeout
    try {
      const startTime = Date.now();
      await withTimeout(db.raw('SELECT 1'), HEALTH_CHECK_TIMEOUT, 'database');
      const latencyMs = Date.now() - startTime;

      components.database = {
        status: 'ok',
        latencyMs,
        message: 'Database connection OK'
      };
      updateSystemHealth('database', true);
    } catch (error) {
      components.database = {
        status: 'error',
        message: (error as Error).message
      };
      updateSystemHealth('database', false);
      overallStatus = 'error';
    }

    // Check Redis connection with timeout
    try {
      const startTime = Date.now();
      const redis = getRedisClient();
      await withTimeout(redis.ping(), HEALTH_CHECK_TIMEOUT, 'redis');
      const latencyMs = Date.now() - startTime;

      components.redis = {
        status: 'ok',
        latencyMs,
        message: 'Redis connection OK'
      };
      updateSystemHealth('redis', true);
    } catch (error) {
      components.redis = {
        status: 'error',
        message: (error as Error).message
      };
      updateSystemHealth('redis', false);
      overallStatus = 'error';
    }

    // Check wallet balance
    try {
      const balanceMonitor = getBalanceMonitor();
      const balanceStatus = await withTimeout(
        balanceMonitor.getBalanceStatus(),
        HEALTH_CHECK_TIMEOUT,
        'wallet'
      );

      components.wallet = {
        status: balanceStatus.sufficient ? 'ok' : 'error',
        message: balanceStatus.balance 
          ? `Balance: ${balanceStatus.balance.toFixed(4)} SOL` 
          : 'Balance unavailable'
      };
      updateSystemHealth('wallet', balanceStatus.sufficient);

      if (!balanceStatus.sufficient) {
        overallStatus = overallStatus === 'error' ? 'error' : 'degraded';
      }
    } catch (error) {
      components.wallet = {
        status: 'error',
        message: (error as Error).message
      };
      updateSystemHealth('wallet', false);
      overallStatus = overallStatus === 'error' ? 'error' : 'degraded';
    }

    // Check circuit breakers
    try {
      const cbHealth = getCircuitBreakerHealth();
      
      components.circuitBreakers = {
        status: cbHealth.solana.healthy && cbHealth.ipfs.healthy ? 'ok' : 'error',
        message: `Solana: ${cbHealth.solana.state}, IPFS: ${cbHealth.ipfs.state}`
      };

      if (!cbHealth.solana.healthy || !cbHealth.ipfs.healthy) {
        overallStatus = overallStatus === 'error' ? 'error' : 'degraded';
      }
    } catch (error) {
      components.circuitBreakers = {
        status: 'error',
        message: (error as Error).message
      };
    }

    // Only authenticated detailed endpoint includes uptime and version
    const response: HealthResponse = {
      status: overallStatus,
      service: 'minting-service',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      components
    };

    const statusCode = overallStatus === 'ok' ? 200 : overallStatus === 'degraded' ? 207 : 503;
    return reply.code(statusCode).send(response);
  });

  // =========================================================================
  // Liveness probe (for Kubernetes - is the process alive?)
  // =========================================================================
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    // Service is alive if it can respond
    return reply.send({ 
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  });

  // =========================================================================
  // Readiness probe (for Kubernetes - can it handle traffic?)
  // =========================================================================
  // 
  // IMPORTANT: Readiness should only check INTERNAL dependencies
  // - Database: Required for storing mint records
  // - Redis: Required for queues, caching, rate limiting
  // - Queue: Required for job processing
  //
  // DO NOT include Solana RPC here because:
  // - It's an EXTERNAL service we don't control
  // - Temporary RPC issues shouldn't make the service "not ready"
  // - Solana health is checked in /health/detailed for monitoring
  // =========================================================================
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, { status: string; latency?: number; message?: string }> = {};
    let isReady = true;

    // Check database with timeout (REQUIRED - internal dependency)
    try {
      const startTime = Date.now();
      await withTimeout(db.raw('SELECT 1'), HEALTH_CHECK_TIMEOUT, 'database');
      checks.database = {
        status: 'ok',
        latency: Date.now() - startTime
      };
    } catch (error) {
      checks.database = {
        status: 'error',
        message: (error as Error).message
      };
      isReady = false;
    }

    // Check Redis with timeout (REQUIRED - internal dependency)
    try {
      const startTime = Date.now();
      const redis = getRedisClient();
      await withTimeout(redis.ping(), HEALTH_CHECK_TIMEOUT, 'redis');
      checks.redis = {
        status: 'ok',
        latency: Date.now() - startTime
      };
    } catch (error) {
      checks.redis = {
        status: 'error',
        message: (error as Error).message
      };
      isReady = false;
    }

    // Check queue with timeout (REQUIRED - internal dependency)
    try {
      const startTime = Date.now();
      const queue = getMintQueue();
      await withTimeout(queue.isReady(), HEALTH_CHECK_TIMEOUT, 'queue');
      checks.queue = {
        status: 'ok',
        latency: Date.now() - startTime
      };
    } catch (error) {
      checks.queue = {
        status: 'error',
        message: (error as Error).message
      };
      isReady = false;
    }

    // NOTE: Solana RPC is NOT checked here - it's an external dependency
    // Solana status is available in /health/detailed for monitoring

    if (isReady) {
      return reply.send({ 
        status: 'ready',
        checks,
        timestamp: new Date().toISOString(),
        note: 'Solana RPC status available at /health/detailed'
      });
    } else {
      logger.warn('Readiness check failed', { checks });
      return reply.code(503).send({ 
        status: 'not_ready',
        checks,
        timestamp: new Date().toISOString()
      });
    }
  });

  // =========================================================================
  // Solana status (separate endpoint for monitoring external dependency)
  // =========================================================================
  fastify.get('/health/solana', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const startTime = Date.now();
      const connection = getConnection();
      
      const [slot, version] = await Promise.all([
        withTimeout(connection.getSlot(), HEALTH_CHECK_TIMEOUT, 'solana-slot'),
        withTimeout(connection.getVersion(), HEALTH_CHECK_TIMEOUT, 'solana-version')
      ]);

      const latency = Date.now() - startTime;

      // Check wallet balance too
      let walletInfo = null;
      try {
        const balanceMonitor = getBalanceMonitor();
        const balanceStatus = await balanceMonitor.getBalanceStatus();
        walletInfo = {
          balance: balanceStatus.balance,
          sufficient: balanceStatus.sufficient
        };
      } catch (e) {
        // Wallet check is optional here
      }

      return reply.send({
        status: 'connected',
        rpc: {
          slot,
          version: version['solana-core'],
          latency
        },
        wallet: walletInfo,
        timestamp: new Date().toISOString(),
        note: 'This is an external dependency - failures do not affect readiness'
      });
    } catch (error) {
      logger.warn('Solana health check failed', { 
        error: (error as Error).message 
      });
      
      return reply.code(503).send({
        status: 'disconnected',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
        note: 'This is an external dependency - failures do not affect readiness'
      });
    }
  });
}
