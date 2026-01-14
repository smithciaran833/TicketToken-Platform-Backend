/**
 * Load Shedding Middleware
 * 
 * AUDIT FIX #53: Add priority-based load shedding
 * 
 * Features:
 * - Priority-based request handling
 * - Progressive shedding under high load
 * - Event loop lag and memory monitoring
 * - Never shed CRITICAL requests
 * - Detailed metrics and logging
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

// Node.js globals
declare const process: { 
  env: Record<string, string | undefined>;
  memoryUsage: () => { heapUsed: number; heapTotal: number; rss: number };
};
declare function setInterval(callback: () => void, ms: number): ReturnType<typeof globalThis.setInterval>;

// =============================================================================
// CONFIGURATION
// =============================================================================

// Enable/disable load shedding
const LOAD_SHEDDING_ENABLED = process.env.LOAD_SHEDDING_ENABLED !== 'false';

// Event loop lag thresholds (ms)
const EVENT_LOOP_LAG_WARNING = parseInt(process.env.LOAD_SHEDDING_LAG_WARNING || '50', 10);
const EVENT_LOOP_LAG_HIGH = parseInt(process.env.LOAD_SHEDDING_LAG_HIGH || '100', 10);
const EVENT_LOOP_LAG_CRITICAL = parseInt(process.env.LOAD_SHEDDING_LAG_CRITICAL || '200', 10);

// Memory thresholds (percentage of heap)
const MEMORY_WARNING_PERCENT = parseInt(process.env.LOAD_SHEDDING_MEM_WARNING || '70', 10);
const MEMORY_HIGH_PERCENT = parseInt(process.env.LOAD_SHEDDING_MEM_HIGH || '85', 10);
const MEMORY_CRITICAL_PERCENT = parseInt(process.env.LOAD_SHEDDING_MEM_CRITICAL || '95', 10);

// =============================================================================
// REQUEST PRIORITIES
// =============================================================================

export enum RequestPriority {
  CRITICAL = 'critical',  // Health checks, internal service calls - never shed
  HIGH = 'high',          // Mint operations, wallet connections
  NORMAL = 'normal',      // Blockchain queries, status checks
  LOW = 'low'             // Metrics, admin endpoints
}

// Priority numeric values for comparison
const PRIORITY_VALUES: Record<RequestPriority, number> = {
  [RequestPriority.CRITICAL]: 4,
  [RequestPriority.HIGH]: 3,
  [RequestPriority.NORMAL]: 2,
  [RequestPriority.LOW]: 1
};

// =============================================================================
// LOAD LEVELS
// =============================================================================

enum LoadLevel {
  NORMAL = 'normal',
  WARNING = 'warning',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Which priorities to shed at each load level
const SHEDDING_POLICY: Record<LoadLevel, RequestPriority[]> = {
  [LoadLevel.NORMAL]: [],                                    // Shed nothing
  [LoadLevel.WARNING]: [RequestPriority.LOW],               // Shed LOW only
  [LoadLevel.HIGH]: [RequestPriority.LOW, RequestPriority.NORMAL], // Shed LOW + NORMAL
  [LoadLevel.CRITICAL]: [RequestPriority.LOW, RequestPriority.NORMAL, RequestPriority.HIGH] // Shed all except CRITICAL
};

// =============================================================================
// METRICS
// =============================================================================

interface LoadSheddingMetrics {
  shedTotal: number;
  shedByPriority: Record<RequestPriority, number>;
  allowedTotal: number;
  currentLoadLevel: LoadLevel;
  eventLoopLag: number;
  memoryUsagePercent: number;
}

const metrics: LoadSheddingMetrics = {
  shedTotal: 0,
  shedByPriority: {
    [RequestPriority.CRITICAL]: 0,
    [RequestPriority.HIGH]: 0,
    [RequestPriority.NORMAL]: 0,
    [RequestPriority.LOW]: 0
  },
  allowedTotal: 0,
  currentLoadLevel: LoadLevel.NORMAL,
  eventLoopLag: 0,
  memoryUsagePercent: 0
};

/**
 * Get current load shedding metrics
 */
export function getLoadSheddingMetrics(): LoadSheddingMetrics {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetLoadSheddingMetrics(): void {
  metrics.shedTotal = 0;
  metrics.allowedTotal = 0;
  metrics.shedByPriority = {
    [RequestPriority.CRITICAL]: 0,
    [RequestPriority.HIGH]: 0,
    [RequestPriority.NORMAL]: 0,
    [RequestPriority.LOW]: 0
  };
}

// =============================================================================
// LOAD MONITORING
// =============================================================================

let lastLoopTime = Date.now();
let currentEventLoopLag = 0;

/**
 * Monitor event loop lag
 * Run every 50ms to detect lag
 */
setInterval(() => {
  const now = Date.now();
  const expectedInterval = 50;
  const actualInterval = now - lastLoopTime;
  
  // Lag is the difference between actual and expected
  currentEventLoopLag = Math.max(0, actualInterval - expectedInterval);
  metrics.eventLoopLag = currentEventLoopLag;
  
  lastLoopTime = now;
}, 50);

/**
 * Get current memory usage percentage
 */
function getMemoryUsagePercent(): number {
  const memUsage = process.memoryUsage();
  const usedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  metrics.memoryUsagePercent = usedPercent;
  return usedPercent;
}

/**
 * Determine current load level based on event loop lag and memory
 */
function getCurrentLoadLevel(): LoadLevel {
  const memoryPercent = getMemoryUsagePercent();
  const eventLoopLag = currentEventLoopLag;

  // Check critical first
  if (eventLoopLag >= EVENT_LOOP_LAG_CRITICAL || memoryPercent >= MEMORY_CRITICAL_PERCENT) {
    return LoadLevel.CRITICAL;
  }

  // Check high
  if (eventLoopLag >= EVENT_LOOP_LAG_HIGH || memoryPercent >= MEMORY_HIGH_PERCENT) {
    return LoadLevel.HIGH;
  }

  // Check warning
  if (eventLoopLag >= EVENT_LOOP_LAG_WARNING || memoryPercent >= MEMORY_WARNING_PERCENT) {
    return LoadLevel.WARNING;
  }

  return LoadLevel.NORMAL;
}

// =============================================================================
// PRIORITY DETERMINATION
// =============================================================================

/**
 * Determine request priority based on path and headers
 */
export function getRequestPriority(request: FastifyRequest): RequestPriority {
  const path = request.url.toLowerCase();
  const isInternal = (request as any).internalService || 
                     request.headers['x-internal-service'];

  // CRITICAL: Health checks and internal service calls
  if (path.includes('/health') || 
      path.includes('/live') || 
      path.includes('/ready') ||
      isInternal) {
    return RequestPriority.CRITICAL;
  }

  // HIGH: Minting and wallet operations
  if (path.includes('/mint') || 
      path.includes('/nft') || 
      path.includes('/wallet') ||
      path.includes('/connect') ||
      path.includes('/disconnect')) {
    return RequestPriority.HIGH;
  }

  // LOW: Metrics and admin
  if (path.includes('/metrics') || 
      path.includes('/admin') ||
      path.includes('/debug') ||
      path.includes('/bull-board')) {
    return RequestPriority.LOW;
  }

  // NORMAL: Everything else
  return RequestPriority.NORMAL;
}

/**
 * Check if request should be shed based on current load
 */
function shouldShedRequest(priority: RequestPriority, loadLevel: LoadLevel): boolean {
  // Never shed CRITICAL
  if (priority === RequestPriority.CRITICAL) {
    return false;
  }

  const prioritiesToShed = SHEDDING_POLICY[loadLevel];
  return prioritiesToShed.includes(priority);
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Calculate retry-after based on load level
 */
function calculateRetryAfter(loadLevel: LoadLevel): number {
  switch (loadLevel) {
    case LoadLevel.CRITICAL:
      return 30; // Wait longer during critical load
    case LoadLevel.HIGH:
      return 15;
    case LoadLevel.WARNING:
      return 5;
    default:
      return 1;
  }
}

/**
 * Load shedding middleware
 * Should be registered early in the middleware chain
 */
export async function loadSheddingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip if disabled
  if (!LOAD_SHEDDING_ENABLED) {
    return;
  }

  const priority = getRequestPriority(request);
  const loadLevel = getCurrentLoadLevel();
  metrics.currentLoadLevel = loadLevel;

  // Check if we should shed this request
  if (shouldShedRequest(priority, loadLevel)) {
    const retryAfter = calculateRetryAfter(loadLevel);
    
    // Update metrics
    metrics.shedTotal++;
    metrics.shedByPriority[priority]++;

    // Log the shed event
    logger.warn('Request shed due to high load', {
      event: 'load_shed',
      priority,
      loadLevel,
      path: request.url,
      method: request.method,
      eventLoopLag: currentEventLoopLag,
      memoryUsagePercent: metrics.memoryUsagePercent,
      retryAfter
    });

    // Return 503 with helpful information
    reply.header('Retry-After', retryAfter);
    reply.header('X-Load-Level', loadLevel);
    reply.header('X-Request-Priority', priority);

    reply.code(503).send({
      type: 'https://api.tickettoken.com/errors/SERVICE_UNAVAILABLE',
      title: 'Service Temporarily Overloaded',
      status: 503,
      detail: `Server is currently experiencing high load. Priority ${priority} requests are being temporarily deferred. Please retry after ${retryAfter} seconds.`,
      code: 'LOAD_SHEDDING',
      loadLevel,
      priority,
      retryAfter,
      instance: request.url,
      timestamp: new Date().toISOString()
    });

    return;
  }

  // Request allowed - update metrics
  metrics.allowedTotal++;

  // Add load info headers for debugging
  reply.header('X-Load-Level', loadLevel);
  reply.header('X-Request-Priority', priority);
}

/**
 * Create load shedding middleware with custom priority function
 */
export function createLoadSheddingMiddleware(
  priorityFn?: (request: FastifyRequest) => RequestPriority
) {
  return async function customLoadSheddingMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!LOAD_SHEDDING_ENABLED) {
      return;
    }

    const priority = priorityFn ? priorityFn(request) : getRequestPriority(request);
    const loadLevel = getCurrentLoadLevel();
    metrics.currentLoadLevel = loadLevel;

    if (shouldShedRequest(priority, loadLevel)) {
      const retryAfter = calculateRetryAfter(loadLevel);
      
      metrics.shedTotal++;
      metrics.shedByPriority[priority]++;

      logger.warn('Request shed due to high load', {
        event: 'load_shed',
        priority,
        loadLevel,
        path: request.url
      });

      reply.header('Retry-After', retryAfter);
      reply.code(503).send({
        type: 'https://api.tickettoken.com/errors/SERVICE_UNAVAILABLE',
        title: 'Service Temporarily Overloaded',
        status: 503,
        detail: `Server is overloaded. Please retry after ${retryAfter} seconds.`,
        code: 'LOAD_SHEDDING',
        retryAfter,
        instance: request.url,
        timestamp: new Date().toISOString()
      });

      return;
    }

    metrics.allowedTotal++;
  };
}

// =============================================================================
// HEALTH CHECK HELPERS
// =============================================================================

/**
 * Check if load shedding is active
 */
export function isLoadSheddingActive(): boolean {
  if (!LOAD_SHEDDING_ENABLED) {
    return false;
  }
  return getCurrentLoadLevel() !== LoadLevel.NORMAL;
}

/**
 * Get current load status for health checks
 */
export function getLoadStatus(): {
  enabled: boolean;
  level: LoadLevel;
  eventLoopLag: number;
  memoryUsagePercent: number;
  shedding: boolean;
} {
  return {
    enabled: LOAD_SHEDDING_ENABLED,
    level: getCurrentLoadLevel(),
    eventLoopLag: currentEventLoopLag,
    memoryUsagePercent: getMemoryUsagePercent(),
    shedding: isLoadSheddingActive()
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  LoadLevel,
  LOAD_SHEDDING_ENABLED
};
