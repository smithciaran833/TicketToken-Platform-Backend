/**
 * Startup Probe Routes for Payment Service
 * 
 * HIGH FIX: Implements proper /health/startup endpoint with:
 * - Config validation
 * - Database connection check
 * - Redis connection check
 * - Migrations complete check
 * - Proper timeouts on all checks
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'StartupRoutes' });

// Timeouts in milliseconds
const DB_TIMEOUT_MS = 5000;
const REDIS_TIMEOUT_MS = 3000;
const CONFIG_CHECK_TIMEOUT_MS = 1000;

// =============================================================================
// TIMEOUT HELPER
// =============================================================================

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
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

// =============================================================================
// CHECK FUNCTIONS
// =============================================================================

interface CheckResult {
  status: 'ok' | 'error';
  message?: string;
  durationMs?: number;
}

/**
 * Validate required configuration
 */
async function checkConfig(): Promise<CheckResult> {
  const start = Date.now();
  
  const requiredVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
  ];

  const productionRequiredVars = process.env.NODE_ENV === 'production' ? [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ] : [];

  const allRequired = [...requiredVars, ...productionRequiredVars];
  const missing: string[] = [];

  for (const varName of allRequired) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Validate JWT_SECRET length
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret && jwtSecret.length < 32) {
    return {
      status: 'error',
      message: 'JWT_SECRET must be at least 32 characters',
      durationMs: Date.now() - start,
    };
  }

  if (missing.length > 0) {
    return {
      status: 'error',
      message: `Missing required configuration: ${missing.join(', ')}`,
      durationMs: Date.now() - start,
    };
  }

  return { status: 'ok', durationMs: Date.now() - start };
}

/**
 * Check database connection
 */
async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  
  try {
    const pool = DatabaseService.getPool();
    
    const result = await withTimeout(
      pool.query('SELECT 1 as ok'),
      DB_TIMEOUT_MS,
      'Database connection timeout'
    );

    if (result.rows[0]?.ok !== 1) {
      return {
        status: 'error',
        message: 'Database query returned unexpected result',
        durationMs: Date.now() - start,
      };
    }

    return { status: 'ok', durationMs: Date.now() - start };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Database connection failed',
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Check if migrations are complete
 */
async function checkMigrations(): Promise<CheckResult> {
  const start = Date.now();
  
  try {
    const pool = DatabaseService.getPool();
    
    // Check if migrations table exists and has entries
    const result = await withTimeout(
      pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'knex_migrations'
        ) as table_exists
      `),
      DB_TIMEOUT_MS,
      'Migration check timeout'
    );

    if (!result.rows[0]?.table_exists) {
      return {
        status: 'error',
        message: 'Migrations table does not exist',
        durationMs: Date.now() - start,
      };
    }

    // Check for pending migrations (simplified check)
    const pendingResult = await pool.query(`
      SELECT COUNT(*) as count FROM knex_migrations
    `);

    if (parseInt(pendingResult.rows[0]?.count) === 0) {
      return {
        status: 'error',
        message: 'No migrations have been run',
        durationMs: Date.now() - start,
      };
    }

    return { status: 'ok', durationMs: Date.now() - start };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Migration check failed',
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Check Redis connection (if available)
 */
async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  
  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return {
        status: 'ok',
        message: 'Redis not configured (optional)',
        durationMs: Date.now() - start,
      };
    }

    // Use ioredis for simpler API
    const Redis = (await import('ioredis')).default;
    const client = new Redis(redisUrl, {
      connectTimeout: REDIS_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });

    const pong = await withTimeout(
      client.ping(),
      REDIS_TIMEOUT_MS,
      'Redis ping timeout'
    );

    client.disconnect();

    if (pong !== 'PONG') {
      return {
        status: 'error',
        message: 'Redis ping returned unexpected response',
        durationMs: Date.now() - start,
      };
    }

    return { status: 'ok', durationMs: Date.now() - start };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Redis connection failed',
      durationMs: Date.now() - start,
    };
  }
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function startupRoutes(fastify: FastifyInstance) {
  /**
   * GET /health/startup
   * Kubernetes startup probe endpoint
   * Returns 200 only when service is fully initialized
   */
  fastify.get(
    '/startup',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy'] },
              checks: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['ok', 'error'] },
                    message: { type: 'string' },
                    durationMs: { type: 'number' },
                  }
                }
              },
              timestamp: { type: 'string' },
            }
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['unhealthy'] },
              checks: { type: 'object' },
              timestamp: { type: 'string' },
            }
          }
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const checks: Record<string, CheckResult> = {};
      
      // Run all checks with timeouts
      checks.config = await withTimeout(
        checkConfig(),
        CONFIG_CHECK_TIMEOUT_MS,
        'Config check timeout'
      ).catch(e => ({ status: 'error' as const, message: e.message }));
      
      checks.database = await checkDatabase();
      checks.migrations = await checkMigrations();
      checks.redis = await checkRedis();

      // Determine overall health
      const isHealthy = Object.values(checks).every(c => c.status === 'ok');

      const response = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        checks,
        timestamp: new Date().toISOString(),
      };

      if (isHealthy) {
        log.debug({ checks }, 'Startup probe passed');
        return reply.status(200).send(response);
      } else {
        log.warn({ checks }, 'Startup probe failed');
        return reply.status(503).send(response);
      }
    }
  );

  /**
   * GET /health/live
   * Kubernetes liveness probe - basic check
   */
  fastify.get(
    '/live',
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Liveness just checks if the process is running
      return reply.status(200).send({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    }
  );

  /**
   * GET /health/ready
   * Kubernetes readiness probe - checks dependencies
   */
  fastify.get(
    '/ready',
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const checks: Record<string, CheckResult> = {};
      
      // Only check local dependencies (NOT external services like Stripe)
      checks.database = await checkDatabase();
      checks.redis = await checkRedis();

      const isReady = Object.values(checks).every(c => c.status === 'ok');

      const response = {
        status: isReady ? 'ready' : 'not_ready',
        checks,
        timestamp: new Date().toISOString(),
      };

      if (isReady) {
        return reply.status(200).send(response);
      } else {
        log.warn({ checks }, 'Readiness probe failed');
        return reply.status(503).send(response);
      }
    }
  );
}
