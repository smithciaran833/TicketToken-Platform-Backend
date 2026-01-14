/**
 * Health Check Routes
 *
 * AUDIT FIX: HC-2 - Redis health check in runtime endpoint
 * AUDIT FIX: HC-3 - Health check timeout configurable
 * AUDIT FIX: INP-5/DB-7 - Explicit column selection instead of SELECT *
 *
 * Provides Kubernetes-style health endpoints: /live, /ready, /startup
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import db from '../utils/database';
import logger from '../utils/logger';
import { isHealthy } from '../utils/metrics';
import { CacheManager } from '../utils/cache';

// =============================================================================
// CONFIGURATION
// =============================================================================

// AUDIT FIX: HC-3 - Configurable health check timeout
const HEALTH_CHECK_TIMEOUT_MS = parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || '5000', 10);
const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-indexer';

// =============================================================================
// EXPLICIT COLUMN DEFINITIONS
// AUDIT FIX: INP-5/DB-7 - Avoid SELECT *, use explicit columns
// =============================================================================

const COLUMNS = {
  indexer_state: [
    'id',
    'last_processed_slot',
    'last_processed_signature',
    'indexer_version',
    'is_running',
    'started_at',
    'updated_at'
  ].join(', ')
};

// =============================================================================
// HEALTH CHECK HELPERS
// =============================================================================

interface HealthCheckResult {
  status: 'ok' | 'failed' | 'degraded';
  responseTimeMs?: number;
  error?: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  timestamp: string;
  version: string;
  checks: {
    postgresql: HealthCheckResult;
    mongodb: HealthCheckResult;
    redis: HealthCheckResult;
    indexer: HealthCheckResult;
  };
  indexer?: {
    lastProcessedSlot: number | null;
    lag: number;
    isRunning: boolean;
  };
}

/**
 * Execute health check with timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Check PostgreSQL connectivity
 */
async function checkPostgres(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await withTimeout(
      db.query('SELECT 1'),
      HEALTH_CHECK_TIMEOUT_MS,
      'PostgreSQL health check timeout'
    );
    return {
      status: 'ok',
      responseTimeMs: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'failed',
      responseTimeMs: Date.now() - start,
      error: (error as Error).message
    };
  }
}

/**
 * Check MongoDB connectivity
 * AUDIT FIX: HC-1 - MongoDB health check
 */
async function checkMongoDB(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    // Dynamically import to avoid circular dependency
    const { mongoose } = await import('../config/mongodb');

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        if (mongoose.connection.readyState === 1) {
          // Run a simple command to verify connection
          mongoose.connection.db?.admin().ping()
            .then(() => resolve())
            .catch(reject);
        } else {
          reject(new Error(`MongoDB not connected: state=${mongoose.connection.readyState}`));
        }
      }),
      HEALTH_CHECK_TIMEOUT_MS,
      'MongoDB health check timeout'
    );

    return {
      status: 'ok',
      responseTimeMs: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'failed',
      responseTimeMs: Date.now() - start,
      error: (error as Error).message
    };
  }
}

/**
 * Check Redis connectivity
 * AUDIT FIX: HC-2 - Redis health check
 */
async function checkRedis(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const { getCache } = await import('../utils/cache');

    // Try to get cache instance
    let cache: CacheManager;
    try {
      cache = getCache();
    } catch {
      // Cache not initialized - return degraded instead of failed
      return {
        status: 'degraded',
        responseTimeMs: Date.now() - start,
        error: 'Cache not initialized'
      };
    }

    // Ping Redis by setting and getting a test key
    const testKey = `__health_check_${Date.now()}`;
    await cache.set(testKey, 'ok', 1);
    const result = await cache.get<string>(testKey);

    if (result === 'ok') {
      return {
        status: 'ok',
        responseTimeMs: Date.now() - start
      };
    } else {
      return {
        status: 'degraded',
        responseTimeMs: Date.now() - start,
        error: 'Redis read/write mismatch'
      };
    }
  } catch (error) {
    return {
      status: 'failed',
      responseTimeMs: Date.now() - start,
      error: (error as Error).message
    };
  }
}

/**
 * Check indexer status
 */
async function checkIndexer(indexer: any): Promise<HealthCheckResult> {
  try {
    if (!indexer) {
      return { status: 'failed', error: 'Indexer not initialized' };
    }

    const isRunning = indexer.isRunning;
    const lag = indexer.syncStats?.lag || 0;

    // Consider unhealthy if lag is too high
    if (lag > 10000) {
      return { status: 'degraded', error: `High lag: ${lag} slots` };
    }

    return {
      status: isRunning ? 'ok' : 'failed',
      error: isRunning ? undefined : 'Indexer not running'
    };
  } catch (error) {
    return {
      status: 'failed',
      error: (error as Error).message
    };
  }
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Store indexer reference (set by main index.ts)
  let indexerRef: any = null;

  // Allow setting indexer reference
  (app as any).setIndexer = (indexer: any) => {
    indexerRef = indexer;
  };

  /**
   * Liveness probe - Is the process alive?
   * Used by Kubernetes to restart container if it crashes
   */
  app.get('/live', async (request: FastifyRequest, reply: FastifyReply) => {
    return { status: 'alive', service: SERVICE_NAME };
  });

  /**
   * Startup probe - Has the service started?
   * Used by Kubernetes to wait for service to be ready
   */
  app.get('/startup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check minimum requirements for startup
      const pgCheck = await checkPostgres();
      const mongoCheck = await checkMongoDB();

      const isStarted = pgCheck.status === 'ok' && mongoCheck.status === 'ok';

      if (!isStarted) {
        return reply.code(503).send({
          status: 'starting',
          service: SERVICE_NAME,
          checks: {
            postgresql: pgCheck,
            mongodb: mongoCheck
          }
        });
      }

      return {
        status: 'started',
        service: SERVICE_NAME,
        checks: {
          postgresql: pgCheck,
          mongodb: mongoCheck
        }
      };
    } catch (error) {
      logger.error({ error }, 'Startup check failed');
      return reply.code(503).send({
        status: 'starting',
        error: (error as Error).message
      });
    }
  });

  /**
   * Readiness probe - Is the service ready to accept traffic?
   * Used by Kubernetes load balancer
   */
  app.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const pgCheck = await checkPostgres();
      const mongoCheck = await checkMongoDB();
      const redisCheck = await checkRedis();

      // Consider ready if core dependencies are up
      // Redis can be degraded (service works without cache)
      const isReady = pgCheck.status === 'ok' &&
                      mongoCheck.status === 'ok' &&
                      redisCheck.status !== 'failed';

      if (!isReady) {
        isHealthy.set(0);
        return reply.code(503).send({
          status: 'not_ready',
          service: SERVICE_NAME,
          checks: {
            postgresql: pgCheck,
            mongodb: mongoCheck,
            redis: redisCheck
          }
        });
      }

      isHealthy.set(1);
      return {
        status: 'ready',
        service: SERVICE_NAME,
        checks: {
          postgresql: pgCheck,
          mongodb: mongoCheck,
          redis: redisCheck
        }
      };
    } catch (error) {
      isHealthy.set(0);
      logger.error({ error }, 'Readiness check failed');
      return reply.code(503).send({
        status: 'not_ready',
        error: (error as Error).message
      });
    }
  });

  /**
   * Full health check - Detailed status of all components
   */
  app.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [pgCheck, mongoCheck, redisCheck, indexerCheck] = await Promise.all([
        checkPostgres(),
        checkMongoDB(),
        checkRedis(),
        checkIndexer(indexerRef)
      ]);

      // Get indexer state from database - AUDIT FIX: INP-5 - explicit columns
      let indexerState: any = null;
      try {
        const result = await db.query(
          `SELECT ${COLUMNS.indexer_state} FROM indexer_state WHERE id = 1`
        );
        if (result.rows.length > 0) {
          indexerState = result.rows[0];
        }
      } catch (err) {
        logger.error({ error: err }, 'Failed to get indexer state');
      }

      // Determine overall health
      const allOk = pgCheck.status === 'ok' &&
                    mongoCheck.status === 'ok' &&
                    redisCheck.status === 'ok' &&
                    indexerCheck.status === 'ok';

      const hasFailed = pgCheck.status === 'failed' ||
                        mongoCheck.status === 'failed';

      const overallStatus = allOk ? 'healthy' : hasFailed ? 'unhealthy' : 'degraded';

      // Update Prometheus metric
      isHealthy.set(overallStatus === 'healthy' ? 1 : 0);

      const healthStatus: HealthStatus = {
        status: overallStatus,
        service: SERVICE_NAME,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        checks: {
          postgresql: pgCheck,
          mongodb: mongoCheck,
          redis: redisCheck,
          indexer: indexerCheck
        }
      };

      if (indexerState) {
        healthStatus.indexer = {
          lastProcessedSlot: indexerState.last_processed_slot,
          lag: indexerRef?.syncStats?.lag || 0,
          isRunning: indexerState.is_running
        };
      }

      const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
      return reply.code(statusCode).send(healthStatus);

    } catch (error) {
      isHealthy.set(0);
      logger.error({ error }, 'Health check error');
      return reply.code(503).send({
        status: 'unhealthy',
        service: SERVICE_NAME,
        timestamp: new Date().toISOString(),
        error: (error as Error).message
      });
    }
  });
}
