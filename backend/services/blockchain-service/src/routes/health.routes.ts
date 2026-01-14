import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getInfrastructure } from '../app';
import { logger } from '../utils/logger';

/**
 * Health Routes for Blockchain Service
 * 
 * Issues Fixed:
 * - #12: Health endpoint checking all dependencies with timeouts
 * - #13: Liveness probe → /health/live
 * - #14: Readiness probe → /health/ready
 * - #47: Use getHealth() instead of getSlot() for Solana
 * - #50: Hide treasury balance from public health endpoints
 * - #54: Optimize RPC health check with caching
 */

// Node.js globals - declared for TypeScript
declare const process: { env: Record<string, string | undefined> };
declare function setTimeout(callback: () => void, ms: number): ReturnType<typeof globalThis.setTimeout>;
declare function clearTimeout(timer: ReturnType<typeof globalThis.setTimeout>): void;
declare const fetch: typeof globalThis.fetch;

// =============================================================================
// CONFIGURATION
// =============================================================================

// Timeout for individual health checks
const CHECK_TIMEOUT_MS = 2000; // AUDIT FIX #54: Reduced to 2 seconds
const SLOW_RPC_THRESHOLD_MS = 1000; // If RPC takes > 1s, mark as degraded

// AUDIT FIX #50: Treasury balance thresholds (only show status, not amounts)
const TREASURY_LOW_THRESHOLD_SOL = 1.0;
const TREASURY_CRITICAL_THRESHOLD_SOL = 0.1;

// AUDIT FIX #54: Health check cache to reduce RPC load
const HEALTH_CACHE_TTL_MS = 10000; // Cache for 10 seconds

interface HealthCacheEntry {
  result: any;
  timestamp: number;
}

const healthCache = new Map<string, HealthCacheEntry>();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Execute a health check with timeout
 * AUDIT FIX #54: Use Promise.race for all external checks
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<{ result: T; timedOut: boolean; durationMs: number }> {
  const startTime = Date.now();
  let timeoutHandle: ReturnType<typeof setTimeout>;
  
  const timeoutPromise = new Promise<{ result: T; timedOut: boolean; durationMs: number }>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({ result: fallbackValue, timedOut: true, durationMs: Date.now() - startTime });
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      promise.then(r => ({ result: r, timedOut: false, durationMs: Date.now() - startTime })),
      timeoutPromise
    ]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    return { result: fallbackValue, timedOut: false, durationMs: Date.now() - startTime };
  }
}

/**
 * Get cached health check result or execute check
 * AUDIT FIX #54: Cache health check results for 10 seconds
 */
function getCachedOrExecute<T>(
  key: string,
  checkFn: () => Promise<T>
): Promise<T> {
  const cached = healthCache.get(key);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < HEALTH_CACHE_TTL_MS) {
    logger.debug('Using cached health check result', { key });
    return Promise.resolve(cached.result as T);
  }
  
  return checkFn().then(result => {
    healthCache.set(key, { result, timestamp: now });
    return result;
  });
}

/**
 * AUDIT FIX #47: Check Solana health using /health endpoint instead of getSlot()
 * This is lightweight and returns 'ok', 'behind', or error
 */
async function checkSolanaHealth(rpcUrl: string): Promise<{
  status: 'ok' | 'behind' | 'error';
  message: string;
  durationMs: number;
}> {
  const startTime = Date.now();
  
  try {
    // Use the /health endpoint which is lightweight
    const healthUrl = rpcUrl.replace(/\/$/, '') + '/health';
    
    const response = await withTimeout(
      fetch(healthUrl).then(r => r.text()),
      CHECK_TIMEOUT_MS,
      'timeout'
    );
    
    const durationMs = response.durationMs;
    
    if (response.timedOut) {
      return {
        status: 'error',
        message: 'Health check timed out',
        durationMs
      };
    }
    
    const healthText = response.result.toLowerCase().trim();
    
    if (healthText === 'ok') {
      // AUDIT FIX #54: Mark as degraded if slow but healthy
      if (durationMs > SLOW_RPC_THRESHOLD_MS) {
        return {
          status: 'behind',
          message: `Node is healthy but slow (${durationMs}ms)`,
          durationMs
        };
      }
      return {
        status: 'ok',
        message: 'Node is healthy',
        durationMs
      };
    } else if (healthText === 'behind') {
      return {
        status: 'behind',
        message: 'Node is catching up to the cluster',
        durationMs
      };
    } else {
      return {
        status: 'error',
        message: `Unexpected health response: ${healthText}`,
        durationMs
      };
    }
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message || 'Health check failed',
      durationMs: Date.now() - startTime
    };
  }
}

/**
 * AUDIT FIX #50: Get treasury status without exposing actual balance
 */
function getTreasuryStatus(balance: number): {
  status: 'ok' | 'low' | 'critical';
  message: string;
} {
  if (balance >= TREASURY_LOW_THRESHOLD_SOL) {
    return {
      status: 'ok',
      message: 'Treasury has sufficient balance'
    };
  } else if (balance >= TREASURY_CRITICAL_THRESHOLD_SOL) {
    return {
      status: 'low',
      message: 'Treasury balance is low, needs funding soon'
    };
  } else {
    return {
      status: 'critical',
      message: 'Treasury balance is critically low, immediate action required'
    };
  }
}

// =============================================================================
// HEALTH ROUTES
// =============================================================================

export default async function healthRoutes(fastify: FastifyInstance) {
  /**
   * Issue #13: Liveness probe - is the service alive?
   * Used by Kubernetes/load balancers to determine if service should be restarted
   */
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    return { 
      status: 'alive', 
      service: 'blockchain-service',
      timestamp: new Date().toISOString()
    };
  });

  /**
   * Issue #14: Readiness probe - is the service ready to accept traffic?
   * AUDIT FIX #47, #50, #54: Optimized checks
   */
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const infrastructure = getInfrastructure();
    
    // Use cached health check results
    const checkResult = await getCachedOrExecute('ready', async () => {
      const checks = {
        database: { status: 'unknown' as string, healthy: false },
        solana: { status: 'unknown' as string, healthy: false },
        treasury: { status: 'unknown' as string, healthy: false }
      };

      // Check database with timeout
      if (infrastructure.db) {
        const dbCheck = await withTimeout(
          infrastructure.db.query('SELECT 1'),
          CHECK_TIMEOUT_MS,
          null
        );
        checks.database.healthy = dbCheck.result !== null && !dbCheck.timedOut;
        checks.database.status = checks.database.healthy ? 'ok' : 'error';
      }

      // AUDIT FIX #47: Use getHealth() endpoint
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const solanaHealth = await checkSolanaHealth(rpcUrl);
      checks.solana.status = solanaHealth.status;
      // 'behind' is degraded but still functional
      checks.solana.healthy = solanaHealth.status === 'ok' || solanaHealth.status === 'behind';

      // AUDIT FIX #50: Check treasury status without exposing balance
      if (infrastructure.treasuryWallet) {
        const balanceCheck = await withTimeout(
          infrastructure.treasuryWallet.getBalance(),
          CHECK_TIMEOUT_MS,
          -1
        );
        
        if (balanceCheck.result >= 0 && !balanceCheck.timedOut) {
          const treasuryStatus = getTreasuryStatus(balanceCheck.result);
          checks.treasury.status = treasuryStatus.status;
          // Critical treasury is unhealthy, low is degraded
          checks.treasury.healthy = treasuryStatus.status !== 'critical';
        }
      }

      return {
        checks,
        isReady: checks.database.healthy && checks.solana.healthy && checks.treasury.healthy
      };
    });

    if (!checkResult.isReady) {
      return reply.status(503).send({
        ready: false,
        checks: {
          database: checkResult.checks.database.status,
          solana: checkResult.checks.solana.status,
          treasury: checkResult.checks.treasury.status
        },
        service: 'blockchain-service',
        timestamp: new Date().toISOString()
      });
    }

    return {
      ready: true,
      checks: {
        database: checkResult.checks.database.status,
        solana: checkResult.checks.solana.status,
        treasury: checkResult.checks.treasury.status
      },
      service: 'blockchain-service',
      timestamp: new Date().toISOString()
    };
  });

  /**
   * Basic health check (legacy compatibility)
   * AUDIT FIX #50: No sensitive info exposed
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return { 
      status: 'healthy', 
      service: 'blockchain-service',
      timestamp: new Date().toISOString()
    };
  });

  /**
   * Comprehensive health check with all dependencies
   * AUDIT FIX #50: Treasury balance ONLY shown in /health/detailed (requires auth in production)
   * AUDIT FIX #47, #54: Optimized RPC check
   */
  fastify.get('/health/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    const infrastructure = getInfrastructure();
    const checks: any = {
      service: 'blockchain-service',
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {}
    };

    let allHealthy = true;
    let hasDegraded = false;

    // Check database
    try {
      if (infrastructure.db) {
        const dbCheck = await withTimeout(
          infrastructure.db.query('SELECT 1'),
          CHECK_TIMEOUT_MS,
          null
        );
        
        if (dbCheck.result !== null && !dbCheck.timedOut) {
          checks.checks.database = {
            status: 'healthy',
            message: 'Database connection active',
            latencyMs: dbCheck.durationMs
          };
        } else {
          checks.checks.database = {
            status: dbCheck.timedOut ? 'timeout' : 'unhealthy',
            message: dbCheck.timedOut ? 'Database check timed out' : 'Database check failed'
          };
          allHealthy = false;
        }
      } else {
        checks.checks.database = {
          status: 'unhealthy',
          message: 'Database not initialized'
        };
        allHealthy = false;
      }
    } catch (error: any) {
      checks.checks.database = {
        status: 'unhealthy',
        message: error.message
      };
      allHealthy = false;
    }

    // AUDIT FIX #47: Check Solana RPC using /health endpoint
    try {
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const solanaHealth = await checkSolanaHealth(rpcUrl);
      
      if (solanaHealth.status === 'ok') {
        checks.checks.solana = {
          status: 'healthy',
          message: solanaHealth.message,
          latencyMs: solanaHealth.durationMs
        };
      } else if (solanaHealth.status === 'behind') {
        checks.checks.solana = {
          status: 'degraded',
          message: solanaHealth.message,
          latencyMs: solanaHealth.durationMs
        };
        hasDegraded = true;
      } else {
        checks.checks.solana = {
          status: 'unhealthy',
          message: solanaHealth.message
        };
        allHealthy = false;
      }
    } catch (error: any) {
      checks.checks.solana = {
        status: 'unhealthy',
        message: error.message
      };
      allHealthy = false;
    }

    // AUDIT FIX #50: Treasury check - ONLY detailed shows balance (this endpoint)
    // In production, this endpoint should require authentication
    try {
      if (infrastructure.treasuryWallet) {
        const balanceCheck = await withTimeout(
          infrastructure.treasuryWallet.getBalance(),
          CHECK_TIMEOUT_MS,
          -1
        );
        
        if (balanceCheck.result >= 0 && !balanceCheck.timedOut) {
          const balance = balanceCheck.result;
          const treasuryStatus = getTreasuryStatus(balance);
          
          checks.checks.treasury = {
            status: treasuryStatus.status === 'ok' ? 'healthy' : 
                    treasuryStatus.status === 'low' ? 'warning' : 'critical',
            message: treasuryStatus.message,
            // AUDIT FIX #50: Balance only in detailed endpoint
            balance: balance,
            balanceSOL: `${balance.toFixed(4)} SOL`,
            thresholds: {
              low: `${TREASURY_LOW_THRESHOLD_SOL} SOL`,
              critical: `${TREASURY_CRITICAL_THRESHOLD_SOL} SOL`
            }
          };
          
          if (treasuryStatus.status === 'critical') {
            allHealthy = false;
          } else if (treasuryStatus.status === 'low') {
            hasDegraded = true;
          }
        } else {
          checks.checks.treasury = {
            status: balanceCheck.timedOut ? 'timeout' : 'unhealthy',
            message: balanceCheck.timedOut ? 'Treasury check timed out' : 'Treasury check failed'
          };
          allHealthy = false;
        }
      } else {
        checks.checks.treasury = {
          status: 'unhealthy',
          message: 'Treasury wallet not initialized'
        };
        allHealthy = false;
      }
    } catch (error: any) {
      checks.checks.treasury = {
        status: 'unhealthy',
        message: error.message
      };
      allHealthy = false;
    }

    // Check listener system
    try {
      if (infrastructure.listenerManager) {
        checks.checks.listeners = {
          status: 'healthy',
          message: 'Event listener system active'
        };
      } else {
        checks.checks.listeners = {
          status: 'warning',
          message: 'Event listener system not configured (PROGRAM_ID not set)'
        };
        hasDegraded = true;
      }
    } catch (error: any) {
      checks.checks.listeners = {
        status: 'unhealthy',
        message: error.message
      };
      allHealthy = false;
    }

    // Check queue system
    try {
      if (infrastructure.queueManager) {
        checks.checks.queues = {
          status: 'healthy',
          message: 'Queue system active'
        };
      } else {
        checks.checks.queues = {
          status: 'unhealthy',
          message: 'Queue system not initialized'
        };
        allHealthy = false;
      }
    } catch (error: any) {
      checks.checks.queues = {
        status: 'unhealthy',
        message: error.message
      };
      allHealthy = false;
    }

    // Determine overall status
    if (!allHealthy) {
      checks.status = 'unhealthy';
    } else if (hasDegraded) {
      checks.status = 'degraded';
    } else {
      checks.status = 'healthy';
    }

    if (!allHealthy) {
      return reply.status(503).send(checks);
    }

    return checks;
  });

  /**
   * Database health check
   */
  fastify.get('/health/db', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const infrastructure = getInfrastructure();
      
      if (!infrastructure.db) {
        return reply.status(503).send({
          status: 'error',
          database: 'not_initialized',
          service: 'blockchain-service'
        });
      }

      const dbCheck = await withTimeout(
        infrastructure.db.query('SELECT 1'),
        CHECK_TIMEOUT_MS,
        null
      );
      
      if (dbCheck.timedOut) {
        return reply.status(503).send({
          status: 'timeout',
          database: 'timeout',
          service: 'blockchain-service'
        });
      }
      
      return {
        status: 'healthy',
        database: 'connected',
        latencyMs: dbCheck.durationMs,
        service: 'blockchain-service'
      };
    } catch (error: any) {
      logger.error('Database health check failed', {
        error: error.message
      });
      
      return reply.status(503).send({
        status: 'error',
        database: 'disconnected',
        error: error.message,
        service: 'blockchain-service'
      });
    }
  });

  /**
   * Solana RPC health check
   * AUDIT FIX #47: Use /health endpoint
   * AUDIT FIX #54: Lightweight check with caching
   */
  fastify.get('/health/solana', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await getCachedOrExecute('solana', async () => {
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
      return checkSolanaHealth(rpcUrl);
    });
    
    if (result.status === 'error') {
      return reply.status(503).send({
        status: 'error',
        solana: result.status,
        message: result.message,
        service: 'blockchain-service'
      });
    }
    
    return {
      status: result.status === 'ok' ? 'healthy' : 'degraded',
      solana: result.status,
      message: result.message,
      latencyMs: result.durationMs,
      service: 'blockchain-service'
    };
  });

  /**
   * Treasury wallet health check
   * AUDIT FIX #50: Public endpoint shows only status, not balance
   */
  fastify.get('/health/treasury', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const infrastructure = getInfrastructure();
      
      if (!infrastructure.treasuryWallet) {
        return reply.status(503).send({
          status: 'error',
          treasury: 'not_initialized',
          service: 'blockchain-service'
        });
      }

      const balanceCheck = await withTimeout(
        infrastructure.treasuryWallet.getBalance(),
        CHECK_TIMEOUT_MS,
        -1
      );
      
      if (balanceCheck.timedOut || balanceCheck.result < 0) {
        return reply.status(503).send({
          status: 'error',
          treasury: balanceCheck.timedOut ? 'timeout' : 'check_failed',
          service: 'blockchain-service'
        });
      }
      
      // AUDIT FIX #50: Only show status, not actual balance
      const treasuryStatus = getTreasuryStatus(balanceCheck.result);
      
      return {
        status: treasuryStatus.status,
        treasury: treasuryStatus.status,
        message: treasuryStatus.message,
        service: 'blockchain-service'
        // NOTE: balance is intentionally NOT exposed in public endpoints
      };
    } catch (error: any) {
      logger.error('Treasury health check failed', {
        error: error.message
      });
      
      return reply.status(503).send({
        status: 'error',
        treasury: 'check_failed',
        error: error.message,
        service: 'blockchain-service'
      });
    }
  });

  /**
   * Clear health cache (for testing/debugging)
   */
  fastify.post('/health/cache/clear', async (request: FastifyRequest, reply: FastifyReply) => {
    healthCache.clear();
    return { 
      status: 'ok',
      message: 'Health check cache cleared',
      service: 'blockchain-service'
    };
  });
}
