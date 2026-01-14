/**
 * Load Shedding Middleware for Compliance Service
 * 
 * AUDIT FIXES:
 * - GD-H3: Implements load shedding under high load
 * - Protects service from cascading failures
 * - Monitors event loop lag, memory, and connection pool
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface LoadSheddingConfig {
  // Event loop lag thresholds (ms)
  eventLoopLagWarning: number;
  eventLoopLagCritical: number;
  
  // Memory thresholds (percentage of max heap)
  memoryWarning: number;
  memoryCritical: number;
  
  // Request queue thresholds
  maxConcurrentRequests: number;
  maxQueuedRequests: number;
  
  // Response configuration
  retryAfterSeconds: number;
  
  // Monitoring interval (ms)
  checkIntervalMs: number;
  
  // Paths to exclude from load shedding (health checks, etc.)
  excludePaths: string[];
}

const DEFAULT_CONFIG: LoadSheddingConfig = {
  eventLoopLagWarning: 100,
  eventLoopLagCritical: 300,
  memoryWarning: 0.80,
  memoryCritical: 0.90,
  maxConcurrentRequests: 1000,
  maxQueuedRequests: 100,
  retryAfterSeconds: 30,
  checkIntervalMs: 1000,
  excludePaths: ['/health', '/health/live', '/health/ready', '/ready', '/metrics']
};

// =============================================================================
// STATE
// =============================================================================

interface LoadState {
  eventLoopLag: number;
  memoryUsage: number;
  concurrentRequests: number;
  lastCheck: number;
  isOverloaded: boolean;
  overloadReason: string | null;
}

let state: LoadState = {
  eventLoopLag: 0,
  memoryUsage: 0,
  concurrentRequests: 0,
  lastCheck: 0,
  isOverloaded: false,
  overloadReason: null
};

let monitorInterval: NodeJS.Timeout | null = null;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Measure current event loop lag
 */
async function measureEventLoopLag(): Promise<number> {
  const start = Date.now();
  return new Promise(resolve => {
    setImmediate(() => {
      resolve(Date.now() - start);
    });
  });
}

/**
 * Get current memory usage as percentage of max heap
 */
function getMemoryUsagePercent(): number {
  const usage = process.memoryUsage();
  // Assume default max old space is ~1.4GB for 64-bit systems
  const maxHeap = Number(process.env.MAX_HEAP_SIZE) || 1400 * 1024 * 1024;
  return usage.heapUsed / maxHeap;
}

/**
 * Check if service is overloaded
 */
async function checkOverload(config: LoadSheddingConfig): Promise<{ overloaded: boolean; reason: string | null }> {
  // Check event loop lag
  const lag = await measureEventLoopLag();
  state.eventLoopLag = lag;
  
  if (lag > config.eventLoopLagCritical) {
    return { overloaded: true, reason: `Event loop lag critical: ${lag}ms` };
  }
  
  // Check memory
  const memPct = getMemoryUsagePercent();
  state.memoryUsage = memPct;
  
  if (memPct > config.memoryCritical) {
    return { overloaded: true, reason: `Memory usage critical: ${(memPct * 100).toFixed(1)}%` };
  }
  
  // Check concurrent requests
  if (state.concurrentRequests > config.maxConcurrentRequests) {
    return { overloaded: true, reason: `Too many concurrent requests: ${state.concurrentRequests}` };
  }
  
  // All checks passed
  return { overloaded: false, reason: null };
}

/**
 * Start background monitoring
 */
function startMonitoring(config: LoadSheddingConfig) {
  if (monitorInterval) return;
  
  monitorInterval = setInterval(async () => {
    const result = await checkOverload(config);
    const wasOverloaded = state.isOverloaded;
    
    state.isOverloaded = result.overloaded;
    state.overloadReason = result.reason;
    state.lastCheck = Date.now();
    
    // Log state changes
    if (result.overloaded && !wasOverloaded) {
      logger.warn({
        reason: result.reason,
        eventLoopLag: state.eventLoopLag,
        memoryUsage: (state.memoryUsage * 100).toFixed(1) + '%',
        concurrentRequests: state.concurrentRequests
      }, 'Load shedding activated');
    } else if (!result.overloaded && wasOverloaded) {
      logger.info({
        eventLoopLag: state.eventLoopLag,
        memoryUsage: (state.memoryUsage * 100).toFixed(1) + '%',
        concurrentRequests: state.concurrentRequests
      }, 'Load shedding deactivated');
    }
  }, config.checkIntervalMs);
}

/**
 * Stop background monitoring
 */
export function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Create load shedding middleware
 */
export function createLoadSheddingMiddleware(customConfig?: Partial<LoadSheddingConfig>) {
  const config: LoadSheddingConfig = { ...DEFAULT_CONFIG, ...customConfig };
  
  // Start background monitoring
  startMonitoring(config);
  
  return async function loadSheddingMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    // Check if path is excluded
    const path = request.url.split('?')[0];
    if (config.excludePaths.some(p => path.startsWith(p))) {
      return;
    }
    
    // Increment concurrent request counter
    state.concurrentRequests++;
    
    // Add cleanup on response
    reply.raw.on('finish', () => {
      state.concurrentRequests = Math.max(0, state.concurrentRequests - 1);
    });
    
    // Check if overloaded
    if (state.isOverloaded) {
      // Decrement counter since we're rejecting
      state.concurrentRequests--;
      
      logger.warn({
        requestId: request.requestId,
        path: request.url,
        method: request.method,
        reason: state.overloadReason,
        eventLoopLag: state.eventLoopLag,
        memoryUsage: (state.memoryUsage * 100).toFixed(1) + '%',
        concurrentRequests: state.concurrentRequests
      }, 'Request rejected due to load shedding');
      
      return reply
        .code(503)
        .header('Retry-After', config.retryAfterSeconds)
        .send({
          type: 'urn:error:compliance-service:service-unavailable',
          title: 'Service Unavailable',
          status: 503,
          detail: 'Service is temporarily overloaded. Please retry later.',
          instance: request.requestId,
          retryAfter: config.retryAfterSeconds
        });
    }
    
    // Check event loop lag for this specific request
    const currentLag = await measureEventLoopLag();
    if (currentLag > config.eventLoopLagWarning) {
      logger.warn({
        requestId: request.requestId,
        eventLoopLag: currentLag,
        threshold: config.eventLoopLagWarning
      }, 'Event loop lag elevated');
    }
  };
}

/**
 * Setup load shedding for Fastify
 */
export function setupLoadShedding(
  fastify: FastifyInstance,
  customConfig?: Partial<LoadSheddingConfig>
) {
  const middleware = createLoadSheddingMiddleware(customConfig);
  
  // Register as preHandler hook
  fastify.addHook('preHandler', middleware);
  
  // Add shutdown cleanup
  fastify.addHook('onClose', async () => {
    stopMonitoring();
  });
  
  logger.info({
    config: {
      eventLoopLagCritical: customConfig?.eventLoopLagCritical ?? DEFAULT_CONFIG.eventLoopLagCritical,
      memoryCritical: (customConfig?.memoryCritical ?? DEFAULT_CONFIG.memoryCritical) * 100 + '%',
      maxConcurrentRequests: customConfig?.maxConcurrentRequests ?? DEFAULT_CONFIG.maxConcurrentRequests
    }
  }, 'Load shedding middleware initialized');
}

/**
 * Get current load state (for monitoring/metrics)
 */
export function getLoadState(): Readonly<LoadState> {
  return { ...state };
}

/**
 * Force overload state (for testing)
 */
export function forceOverload(reason: string) {
  state.isOverloaded = true;
  state.overloadReason = reason;
}

/**
 * Clear overload state (for testing)
 */
export function clearOverload() {
  state.isOverloaded = false;
  state.overloadReason = null;
}

export default setupLoadShedding;
