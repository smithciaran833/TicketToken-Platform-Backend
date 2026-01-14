/**
 * Load Shedding and Bulkhead Middleware
 * 
 * Implements two key patterns for graceful degradation:
 * 
 * 1. Priority Shedding: Under load, reject low-priority requests first
 *    - Priority determined by endpoint and tenant tier
 *    - Configurable thresholds based on system load
 * 
 * 2. Bulkhead Pattern: Isolate different workloads
 *    - Separate concurrency pools for different operations
 *    - Prevents one slow operation from blocking others
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Counter, Gauge } from 'prom-client';
import logger from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Maximum concurrent requests before shedding starts
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS || '100', 10);

// High water mark - start shedding low priority at this level
const HIGH_WATER_MARK = parseInt(process.env.LOAD_HIGH_WATER_MARK || '75', 10);

// Critical water mark - only allow critical requests
const CRITICAL_WATER_MARK = parseInt(process.env.LOAD_CRITICAL_WATER_MARK || '90', 10);

// Enable/disable load shedding
const LOAD_SHEDDING_ENABLED = process.env.LOAD_SHEDDING_ENABLED !== 'false';

// =============================================================================
// METRICS
// =============================================================================

const currentConcurrencyGauge = new Gauge({
  name: 'minting_concurrent_requests',
  help: 'Current number of concurrent requests',
  labelNames: ['bulkhead']
});

const loadSheddingCounter = new Counter({
  name: 'minting_load_shedding_total',
  help: 'Total number of requests shed due to load',
  labelNames: ['reason', 'priority', 'endpoint']
});

const bulkheadRejectCounter = new Counter({
  name: 'minting_bulkhead_rejections_total',
  help: 'Total number of requests rejected by bulkhead',
  labelNames: ['bulkhead', 'reason']
});

// =============================================================================
// PRIORITY DEFINITIONS
// =============================================================================

export enum RequestPriority {
  CRITICAL = 'critical',    // Health checks, metrics
  HIGH = 'high',            // Webhooks, internal service calls
  NORMAL = 'normal',        // Standard API requests
  LOW = 'low'               // Batch operations, background tasks
}

// Map endpoints to priorities
const ENDPOINT_PRIORITIES: Record<string, RequestPriority> = {
  '/health': RequestPriority.CRITICAL,
  '/health/live': RequestPriority.CRITICAL,
  '/health/ready': RequestPriority.CRITICAL,
  '/health/startup': RequestPriority.CRITICAL,
  '/metrics': RequestPriority.CRITICAL,
  '/api/webhook': RequestPriority.HIGH,
  '/internal/mint': RequestPriority.HIGH,
  '/admin': RequestPriority.NORMAL,
  '/api/mint/batch': RequestPriority.LOW
};

/**
 * Get request priority based on path and other factors
 */
function getRequestPriority(request: FastifyRequest): RequestPriority {
  const path = request.url.split('?')[0];
  
  // Check exact match
  if (ENDPOINT_PRIORITIES[path]) {
    return ENDPOINT_PRIORITIES[path];
  }
  
  // Check prefix match
  for (const [endpoint, priority] of Object.entries(ENDPOINT_PRIORITIES)) {
    if (path.startsWith(endpoint)) {
      return priority;
    }
  }
  
  // Check for internal service header
  if (request.headers['x-internal-service']) {
    return RequestPriority.HIGH;
  }
  
  return RequestPriority.NORMAL;
}

// =============================================================================
// BULKHEAD PATTERN
// =============================================================================

interface BulkheadConfig {
  name: string;
  maxConcurrent: number;
  queueSize: number;
  timeout: number; // ms
}

interface BulkheadState {
  current: number;
  queued: number;
  queue: Array<() => void>;
}

// Bulkhead configurations for different operation types
const BULKHEADS: Record<string, BulkheadConfig> = {
  mint: {
    name: 'mint',
    maxConcurrent: parseInt(process.env.BULKHEAD_MINT_MAX || '20', 10),
    queueSize: parseInt(process.env.BULKHEAD_MINT_QUEUE || '50', 10),
    timeout: parseInt(process.env.BULKHEAD_MINT_TIMEOUT || '30000', 10)
  },
  webhook: {
    name: 'webhook',
    maxConcurrent: parseInt(process.env.BULKHEAD_WEBHOOK_MAX || '10', 10),
    queueSize: parseInt(process.env.BULKHEAD_WEBHOOK_QUEUE || '100', 10),
    timeout: parseInt(process.env.BULKHEAD_WEBHOOK_TIMEOUT || '5000', 10)
  },
  admin: {
    name: 'admin',
    maxConcurrent: parseInt(process.env.BULKHEAD_ADMIN_MAX || '5', 10),
    queueSize: parseInt(process.env.BULKHEAD_ADMIN_QUEUE || '10', 10),
    timeout: parseInt(process.env.BULKHEAD_ADMIN_TIMEOUT || '10000', 10)
  },
  default: {
    name: 'default',
    maxConcurrent: parseInt(process.env.BULKHEAD_DEFAULT_MAX || '50', 10),
    queueSize: parseInt(process.env.BULKHEAD_DEFAULT_QUEUE || '100', 10),
    timeout: parseInt(process.env.BULKHEAD_DEFAULT_TIMEOUT || '10000', 10)
  }
};

// Bulkhead state tracking
const bulkheadStates: Record<string, BulkheadState> = {};

// Initialize bulkhead states
for (const config of Object.values(BULKHEADS)) {
  bulkheadStates[config.name] = {
    current: 0,
    queued: 0,
    queue: []
  };
  currentConcurrencyGauge.set({ bulkhead: config.name }, 0);
}

/**
 * Get bulkhead name for a request
 */
function getBulkheadName(request: FastifyRequest): string {
  const path = request.url.split('?')[0];
  
  if (path.includes('/mint') || path.includes('/internal/mint')) {
    return 'mint';
  }
  if (path.includes('/webhook')) {
    return 'webhook';
  }
  if (path.includes('/admin')) {
    return 'admin';
  }
  return 'default';
}

/**
 * Acquire a slot in the bulkhead
 * Returns true if acquired, false if rejected
 */
async function acquireBulkhead(name: string): Promise<boolean> {
  const config = BULKHEADS[name] || BULKHEADS.default;
  const state = bulkheadStates[name] || bulkheadStates.default;
  
  // If under limit, acquire immediately
  if (state.current < config.maxConcurrent) {
    state.current++;
    currentConcurrencyGauge.set({ bulkhead: name }, state.current);
    return true;
  }
  
  // If queue is full, reject
  if (state.queued >= config.queueSize) {
    bulkheadRejectCounter.inc({ bulkhead: name, reason: 'queue_full' });
    return false;
  }
  
  // Queue the request
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      // Remove from queue on timeout
      const index = state.queue.indexOf(release);
      if (index > -1) {
        state.queue.splice(index, 1);
        state.queued--;
      }
      bulkheadRejectCounter.inc({ bulkhead: name, reason: 'timeout' });
      resolve(false);
    }, config.timeout);
    
    const release = () => {
      clearTimeout(timeoutId);
      state.current++;
      currentConcurrencyGauge.set({ bulkhead: name }, state.current);
      resolve(true);
    };
    
    state.queue.push(release);
    state.queued++;
  });
}

/**
 * Release a slot in the bulkhead
 */
function releaseBulkhead(name: string): void {
  const state = bulkheadStates[name] || bulkheadStates.default;
  
  state.current = Math.max(0, state.current - 1);
  currentConcurrencyGauge.set({ bulkhead: name }, state.current);
  
  // Process next in queue
  if (state.queue.length > 0) {
    const next = state.queue.shift();
    state.queued--;
    if (next) {
      next();
    }
  }
}

// =============================================================================
// LOAD SHEDDING
// =============================================================================

// Global request counter
let globalConcurrentRequests = 0;

/**
 * Check if a request should be shed based on current load
 */
function shouldShedRequest(priority: RequestPriority): boolean {
  if (!LOAD_SHEDDING_ENABLED) {
    return false;
  }
  
  const loadPercent = (globalConcurrentRequests / MAX_CONCURRENT_REQUESTS) * 100;
  
  // Critical requests always pass
  if (priority === RequestPriority.CRITICAL) {
    return false;
  }
  
  // At critical water mark, only critical requests
  if (loadPercent >= CRITICAL_WATER_MARK) {
    return true;
  }
  
  // At high water mark, shed low priority
  if (loadPercent >= HIGH_WATER_MARK && priority === RequestPriority.LOW) {
    return true;
  }
  
  return false;
}

// =============================================================================
// MIDDLEWARE REGISTRATION
// =============================================================================

/**
 * Register load shedding and bulkhead middleware
 */
export function registerLoadSheddingMiddleware(fastify: FastifyInstance): void {
  // Pre-handler for load shedding
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const priority = getRequestPriority(request);
    const bulkhead = getBulkheadName(request);
    
    // Store for later use
    (request as any).priority = priority;
    (request as any).bulkhead = bulkhead;
    
    // Increment global counter
    globalConcurrentRequests++;
    
    // Check load shedding
    if (shouldShedRequest(priority)) {
      globalConcurrentRequests--;
      
      loadSheddingCounter.inc({
        reason: 'high_load',
        priority,
        endpoint: request.url.split('?')[0]
      });
      
      logger.warn('Request shed due to high load', {
        requestId: request.id,
        path: request.url,
        priority,
        currentLoad: globalConcurrentRequests,
        maxLoad: MAX_CONCURRENT_REQUESTS
      });
      
      return reply.status(503).send({
        error: 'Service Temporarily Unavailable',
        code: 'LOAD_SHEDDING',
        message: 'Server is under heavy load. Please retry later.',
        retryAfter: 5
      });
    }
    
    // Try to acquire bulkhead
    const acquired = await acquireBulkhead(bulkhead);
    if (!acquired) {
      globalConcurrentRequests--;
      
      loadSheddingCounter.inc({
        reason: 'bulkhead_full',
        priority,
        endpoint: request.url.split('?')[0]
      });
      
      logger.warn('Request rejected by bulkhead', {
        requestId: request.id,
        path: request.url,
        bulkhead,
        priority
      });
      
      return reply.status(503).send({
        error: 'Service Temporarily Unavailable',
        code: 'BULKHEAD_FULL',
        message: `Too many concurrent ${bulkhead} requests. Please retry later.`,
        retryAfter: 2
      });
    }
    
    // Mark that we acquired the bulkhead
    (request as any).bulkheadAcquired = true;
  });
  
  // Release resources after response
  fastify.addHook('onResponse', async (request: FastifyRequest) => {
    const bulkhead = (request as any).bulkhead;
    const acquired = (request as any).bulkheadAcquired;
    
    // Decrement global counter
    globalConcurrentRequests = Math.max(0, globalConcurrentRequests - 1);
    
    // Release bulkhead if acquired
    if (acquired && bulkhead) {
      releaseBulkhead(bulkhead);
    }
  });
  
  // Also release on error
  fastify.addHook('onError', async (request: FastifyRequest) => {
    const bulkhead = (request as any).bulkhead;
    const acquired = (request as any).bulkheadAcquired;
    
    globalConcurrentRequests = Math.max(0, globalConcurrentRequests - 1);
    
    if (acquired && bulkhead) {
      releaseBulkhead(bulkhead);
    }
  });
  
  logger.info('Load shedding middleware registered', {
    enabled: LOAD_SHEDDING_ENABLED,
    maxConcurrent: MAX_CONCURRENT_REQUESTS,
    highWaterMark: HIGH_WATER_MARK,
    criticalWaterMark: CRITICAL_WATER_MARK,
    bulkheads: Object.keys(BULKHEADS)
  });
}

// =============================================================================
// STATUS EXPORTS
// =============================================================================

/**
 * Get current load shedding status
 */
export function getLoadSheddingStatus(): {
  enabled: boolean;
  currentRequests: number;
  maxRequests: number;
  loadPercent: number;
  bulkheads: Record<string, { current: number; max: number; queued: number }>;
} {
  const bulkheadStatus: Record<string, { current: number; max: number; queued: number }> = {};
  
  for (const [name, config] of Object.entries(BULKHEADS)) {
    const state = bulkheadStates[name];
    bulkheadStatus[name] = {
      current: state.current,
      max: config.maxConcurrent,
      queued: state.queued
    };
  }
  
  return {
    enabled: LOAD_SHEDDING_ENABLED,
    currentRequests: globalConcurrentRequests,
    maxRequests: MAX_CONCURRENT_REQUESTS,
    loadPercent: (globalConcurrentRequests / MAX_CONCURRENT_REQUESTS) * 100,
    bulkheads: bulkheadStatus
  };
}

export default registerLoadSheddingMiddleware;
