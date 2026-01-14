/**
 * Health Check Routes for Transfer Service
 *
 * AUDIT FIX LOW-1: No health check routes → Comprehensive health endpoints
 *
 * Endpoints:
 * - GET /health - Full health check
 * - GET /health/live - Liveness probe (Kubernetes)
 * - GET /health/ready - Readiness probe (Kubernetes)
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getPool } from '../config/database';
import logger from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: Record<string, ComponentHealth>;
}

interface ComponentHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latencyMs?: number;
  message?: string;
}

// =============================================================================
// HEALTH CHECK FUNCTIONS
// =============================================================================

const startTime = Date.now();

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const pool = getPool();
    await pool.query('SELECT 1');

    return {
      status: 'healthy',
      latencyMs: Date.now() - start
    };
  } catch (error) {
    logger.error({ error }, 'Database health check failed');
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check Redis connectivity
 */
async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const cacheModule = await import('../services/cache.service');
    // Try to get redis from the module - handle various export patterns
    const cacheService = cacheModule.default || cacheModule;
    const redis = (cacheService as any).redis || (cacheService as any).getRedis?.() || null;

    if (!redis) {
      return {
        status: 'degraded',
        message: 'Redis not configured'
      };
    }

    await redis.ping();

    return {
      status: 'healthy',
      latencyMs: Date.now() - start
    };
  } catch (error) {
    logger.error({ error }, 'Redis health check failed');
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check Solana RPC connectivity
 */
async function checkSolanaRpc(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const rpcModule = await import('../utils/rpc-failover');
    // Try to get connection from the module - handle various export patterns
    const rpcService = rpcModule.default || rpcModule;
    const rpcUrl = process.env.SOLANA_RPC_URL;
    
    if (!rpcUrl) {
      return {
        status: 'degraded',
        message: 'Solana RPC URL not configured'
      };
    }

    const getConn = (rpcService as any).getConnection;
    if (!getConn) {
      return {
        status: 'degraded',
        message: 'Solana RPC module not properly initialized'
      };
    }

    const rpc = getConn(rpcUrl);
    await rpc.getLatestBlockhash('confirmed');

    return {
      status: 'healthy',
      latencyMs: Date.now() - start
    };
  } catch (error) {
    logger.error({ error }, 'Solana RPC health check failed');
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Calculate overall health status
 */
function calculateOverallStatus(
  checks: Record<string, ComponentHealth>
): 'healthy' | 'unhealthy' | 'degraded' {
  const statuses = Object.values(checks).map(c => c.status);

  if (statuses.includes('unhealthy')) {
    return 'unhealthy';
  }

  if (statuses.includes('degraded')) {
    return 'degraded';
  }

  return 'healthy';
}

// =============================================================================
// ROUTES
// =============================================================================

export async function healthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  /**
   * Full health check
   */
  fastify.get('/health', async (_request, reply) => {
    const checks: Record<string, ComponentHealth> = {};

    const [database, redis, solana] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkSolanaRpc()
    ]);

    checks.database = database;
    checks.redis = redis;
    checks.solana = solana;

    const status = calculateOverallStatus(checks);

    const healthStatus: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks
    };

    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

    return reply.status(statusCode).send(healthStatus);
  });

  /**
   * Liveness probe
   */
  fastify.get('/health/live', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Readiness probe
   */
  fastify.get('/health/ready', async (_request, reply) => {
    try {
      const database = await checkDatabase();

      if (database.status === 'unhealthy') {
        return reply.status(503).send({
          status: 'not_ready',
          reason: 'Database unavailable',
          timestamp: new Date().toISOString()
        });
      }

      return reply.status(200).send({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error({ error }, 'Readiness check failed');
      return reply.status(503).send({
        status: 'not_ready',
        reason: 'Health check error',
        timestamp: new Date().toISOString()
      });
    }
  });
}

export default healthRoutes;
