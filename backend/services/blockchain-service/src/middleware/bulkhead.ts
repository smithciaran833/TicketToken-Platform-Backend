/**
 * Bulkhead Pattern Middleware
 * 
 * AUDIT FIX #51: Add bulkhead pattern for resource isolation
 * 
 * Features:
 * - Separate concurrency limits for different operation types
 * - Resource isolation to prevent cascade failures
 * - 503 responses when bulkhead is full
 * - Retry-After headers with estimated wait time
 * - Metrics tracking for monitoring
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

// Node.js globals
declare const process: { env: Record<string, string | undefined> };

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Bulkhead operation types with default concurrency limits
 */
export enum BulkheadType {
  MINT = 'mint',
  WALLET = 'wallet',
  BLOCKCHAIN_QUERY = 'blockchain_query',
  ADMIN = 'admin'
}

interface BulkheadConfig {
  maxConcurrent: number;
  queueTimeout: number; // ms to wait in queue before rejecting
}

const DEFAULT_CONFIG: Record<BulkheadType, BulkheadConfig> = {
  [BulkheadType.MINT]: {
    maxConcurrent: parseInt(process.env.BULKHEAD_MINT_MAX || '10', 10),
    queueTimeout: 30000 // 30 seconds for minting
  },
  [BulkheadType.WALLET]: {
    maxConcurrent: parseInt(process.env.BULKHEAD_WALLET_MAX || '20', 10),
    queueTimeout: 10000 // 10 seconds for wallet ops
  },
  [BulkheadType.BLOCKCHAIN_QUERY]: {
    maxConcurrent: parseInt(process.env.BULKHEAD_QUERY_MAX || '50', 10),
    queueTimeout: 5000 // 5 seconds for queries
  },
  [BulkheadType.ADMIN]: {
    maxConcurrent: parseInt(process.env.BULKHEAD_ADMIN_MAX || '5', 10),
    queueTimeout: 10000 // 10 seconds for admin
  }
};

// =============================================================================
// BULKHEAD STATE
// =============================================================================

interface BulkheadState {
  active: number;
  queued: number;
  rejected: number;
  completed: number;
}

const bulkheadStates: Record<BulkheadType, BulkheadState> = {
  [BulkheadType.MINT]: { active: 0, queued: 0, rejected: 0, completed: 0 },
  [BulkheadType.WALLET]: { active: 0, queued: 0, rejected: 0, completed: 0 },
  [BulkheadType.BLOCKCHAIN_QUERY]: { active: 0, queued: 0, rejected: 0, completed: 0 },
  [BulkheadType.ADMIN]: { active: 0, queued: 0, rejected: 0, completed: 0 }
};

// =============================================================================
// METRICS
// =============================================================================

interface BulkheadMetrics {
  fullTotal: number;
  timeoutTotal: number;
}

const metrics: Record<BulkheadType, BulkheadMetrics> = {
  [BulkheadType.MINT]: { fullTotal: 0, timeoutTotal: 0 },
  [BulkheadType.WALLET]: { fullTotal: 0, timeoutTotal: 0 },
  [BulkheadType.BLOCKCHAIN_QUERY]: { fullTotal: 0, timeoutTotal: 0 },
  [BulkheadType.ADMIN]: { fullTotal: 0, timeoutTotal: 0 }
};

/**
 * Get bulkhead metrics for all types
 */
export function getBulkheadMetrics(): Record<string, {
  active: number;
  queued: number;
  rejected: number;
  completed: number;
  fullTotal: number;
  timeoutTotal: number;
  maxConcurrent: number;
}> {
  const result: Record<string, any> = {};
  
  for (const type of Object.values(BulkheadType)) {
    result[type] = {
      ...bulkheadStates[type],
      ...metrics[type],
      maxConcurrent: DEFAULT_CONFIG[type].maxConcurrent
    };
  }
  
  return result;
}

// =============================================================================
// BULKHEAD IMPLEMENTATION
// =============================================================================

/**
 * Try to acquire a slot in the bulkhead
 * Returns true if slot acquired, false if bulkhead is full
 */
export function acquireBulkhead(type: BulkheadType): boolean {
  const config = DEFAULT_CONFIG[type];
  const state = bulkheadStates[type];
  
  if (state.active < config.maxConcurrent) {
    state.active++;
    logger.debug('Bulkhead slot acquired', {
      type,
      active: state.active,
      max: config.maxConcurrent
    });
    return true;
  }
  
  // Bulkhead is full
  state.rejected++;
  metrics[type].fullTotal++;
  
  logger.warn('Bulkhead full, rejecting request', {
    type,
    active: state.active,
    max: config.maxConcurrent,
    rejected: state.rejected
  });
  
  return false;
}

/**
 * Release a slot in the bulkhead
 */
export function releaseBulkhead(type: BulkheadType): void {
  const state = bulkheadStates[type];
  
  if (state.active > 0) {
    state.active--;
    state.completed++;
    
    logger.debug('Bulkhead slot released', {
      type,
      active: state.active,
      completed: state.completed
    });
  }
}

/**
 * Calculate estimated wait time based on current load
 */
function calculateRetryAfter(type: BulkheadType): number {
  const state = bulkheadStates[type];
  const config = DEFAULT_CONFIG[type];
  
  // Estimate based on average request duration (assume 2 seconds per request)
  const avgRequestDuration = 2;
  const queuePosition = state.queued + 1;
  const estimatedWait = Math.ceil((queuePosition / config.maxConcurrent) * avgRequestDuration);
  
  // Return at least 1 second, max 60 seconds
  return Math.min(Math.max(estimatedWait, 1), 60);
}

/**
 * Check if bulkhead is healthy (not at capacity)
 */
export function isBulkheadHealthy(type: BulkheadType): boolean {
  const config = DEFAULT_CONFIG[type];
  const state = bulkheadStates[type];
  
  // Healthy if under 80% capacity
  return state.active < config.maxConcurrent * 0.8;
}

/**
 * Get current utilization percentage
 */
export function getBulkheadUtilization(type: BulkheadType): number {
  const config = DEFAULT_CONFIG[type];
  const state = bulkheadStates[type];
  
  return (state.active / config.maxConcurrent) * 100;
}

// =============================================================================
// FASTIFY MIDDLEWARE
// =============================================================================

/**
 * Create bulkhead middleware for a specific type
 */
export function createBulkheadMiddleware(type: BulkheadType) {
  return async function bulkheadMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const acquired = acquireBulkhead(type);
    
    if (!acquired) {
      const retryAfter = calculateRetryAfter(type);
      const config = DEFAULT_CONFIG[type];
      const state = bulkheadStates[type];
      
      reply.header('Retry-After', retryAfter);
      reply.header('X-Bulkhead-Type', type);
      reply.header('X-Bulkhead-Active', state.active.toString());
      reply.header('X-Bulkhead-Max', config.maxConcurrent.toString());
      
      reply.code(503).send({
        type: 'https://api.tickettoken.com/errors/SERVICE_UNAVAILABLE',
        title: 'Service Temporarily Unavailable',
        status: 503,
        detail: `The ${type} operations capacity is currently full. Please retry after ${retryAfter} seconds.`,
        code: 'BULKHEAD_FULL',
        bulkheadType: type,
        retryAfter,
        instance: request.url,
        timestamp: new Date().toISOString()
      });
      
      return;
    }
    
    // Register cleanup on response finish
    reply.raw.on('finish', () => {
      releaseBulkhead(type);
    });
    
    // Also handle premature close
    reply.raw.on('close', () => {
      // Check if response wasn't finished (premature close)
      if (!reply.raw.writableFinished) {
        releaseBulkhead(type);
      }
    });
  };
}

// =============================================================================
// PRE-CONFIGURED MIDDLEWARE INSTANCES
// =============================================================================

/**
 * Bulkhead middleware for minting operations
 */
export const mintBulkhead = createBulkheadMiddleware(BulkheadType.MINT);

/**
 * Bulkhead middleware for wallet operations
 */
export const walletBulkhead = createBulkheadMiddleware(BulkheadType.WALLET);

/**
 * Bulkhead middleware for blockchain queries
 */
export const queryBulkhead = createBulkheadMiddleware(BulkheadType.BLOCKCHAIN_QUERY);

/**
 * Bulkhead middleware for admin operations
 */
export const adminBulkhead = createBulkheadMiddleware(BulkheadType.ADMIN);

// =============================================================================
// ROUTE HELPERS
// =============================================================================

/**
 * Determine bulkhead type from request path
 */
export function getBulkheadTypeForRoute(path: string): BulkheadType | null {
  if (path.includes('/mint') || path.includes('/nft')) {
    return BulkheadType.MINT;
  }
  if (path.includes('/wallet') || path.includes('/connect') || path.includes('/disconnect')) {
    return BulkheadType.WALLET;
  }
  if (path.includes('/admin') || path.includes('/internal')) {
    return BulkheadType.ADMIN;
  }
  if (path.includes('/blockchain') || path.includes('/query') || path.includes('/balance') || path.includes('/transaction')) {
    return BulkheadType.BLOCKCHAIN_QUERY;
  }
  
  return null;
}

/**
 * Auto-selecting bulkhead middleware based on route
 */
export async function autoBulkheadMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const type = getBulkheadTypeForRoute(request.url);
  
  if (type) {
    const middleware = createBulkheadMiddleware(type);
    await middleware(request, reply);
  }
  // No bulkhead for routes that don't match
}
