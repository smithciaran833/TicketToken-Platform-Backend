/**
 * Bulkhead Pattern Middleware for Compliance Service
 * 
 * AUDIT FIX: GD-M2 - Implement bulkhead pattern for resource isolation
 * 
 * Bulkhead pattern isolates failures and prevents cascading failures
 * by limiting concurrent operations per resource type.
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { incrementMetric, setGauge } from '../utils/metrics';

// =============================================================================
// TYPES
// =============================================================================

export interface BulkheadConfig {
  name: string;
  maxConcurrent: number;
  maxQueued: number;
  queueTimeout: number;
}

interface BulkheadState {
  active: number;
  queued: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_CONFIGS: Record<string, BulkheadConfig> = {
  // GDPR operations - heavy, isolated
  gdpr: {
    name: 'gdpr',
    maxConcurrent: 5,
    maxQueued: 10,
    queueTimeout: 30000
  },
  // Risk assessment - computational
  risk: {
    name: 'risk',
    maxConcurrent: 10,
    maxQueued: 20,
    queueTimeout: 10000
  },
  // OFAC screening - external dependency
  ofac: {
    name: 'ofac',
    maxConcurrent: 3,
    maxQueued: 50,
    queueTimeout: 5000
  },
  // Tax/1099 operations - batch processing
  tax: {
    name: 'tax',
    maxConcurrent: 5,
    maxQueued: 100,
    queueTimeout: 60000
  },
  // Database operations
  database: {
    name: 'database',
    maxConcurrent: 20,
    maxQueued: 50,
    queueTimeout: 10000
  },
  // Default for unclassified operations
  default: {
    name: 'default',
    maxConcurrent: 50,
    maxQueued: 100,
    queueTimeout: 5000
  }
};

// =============================================================================
// BULKHEAD IMPLEMENTATION
// =============================================================================

const bulkheads: Map<string, BulkheadState> = new Map();

/**
 * Initialize bulkhead state for a resource
 */
function initBulkhead(name: string): BulkheadState {
  if (!bulkheads.has(name)) {
    bulkheads.set(name, {
      active: 0,
      queued: []
    });
  }
  return bulkheads.get(name)!;
}

/**
 * Try to acquire a slot in the bulkhead
 */
async function acquireSlot(config: BulkheadConfig): Promise<void> {
  const state = initBulkhead(config.name);
  
  // If under limit, acquire immediately
  if (state.active < config.maxConcurrent) {
    state.active++;
    updateMetrics(config.name, state);
    return;
  }
  
  // Check queue limit
  if (state.queued.length >= config.maxQueued) {
    incrementMetric('bulkhead_rejected_total', { bulkhead: config.name });
    throw new BulkheadFullError(config.name);
  }
  
  // Wait in queue
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const index = state.queued.findIndex(q => q.resolve === resolve);
      if (index !== -1) {
        state.queued.splice(index, 1);
        incrementMetric('bulkhead_timeout_total', { bulkhead: config.name });
        reject(new BulkheadTimeoutError(config.name));
      }
    }, config.queueTimeout);
    
    state.queued.push({ resolve, reject, timeout });
    updateMetrics(config.name, state);
  });
}

/**
 * Release a slot in the bulkhead
 */
function releaseSlot(config: BulkheadConfig): void {
  const state = bulkheads.get(config.name);
  if (!state) return;
  
  state.active--;
  
  // Process queued request if any
  if (state.queued.length > 0) {
    const next = state.queued.shift()!;
    clearTimeout(next.timeout);
    state.active++;
    next.resolve();
  }
  
  updateMetrics(config.name, state);
}

/**
 * Update metrics for observability
 */
function updateMetrics(name: string, state: BulkheadState): void {
  setGauge('bulkhead_active', state.active, { bulkhead: name });
  setGauge('bulkhead_queued', state.queued.length, { bulkhead: name });
}

// =============================================================================
// ERRORS
// =============================================================================

export class BulkheadFullError extends Error {
  readonly code = 'BULKHEAD_FULL';
  readonly statusCode = 503;
  
  constructor(bulkheadName: string) {
    super(`Bulkhead '${bulkheadName}' is full - too many concurrent requests`);
    this.name = 'BulkheadFullError';
  }
}

export class BulkheadTimeoutError extends Error {
  readonly code = 'BULKHEAD_TIMEOUT';
  readonly statusCode = 503;
  
  constructor(bulkheadName: string) {
    super(`Bulkhead '${bulkheadName}' queue timeout - request waited too long`);
    this.name = 'BulkheadTimeoutError';
  }
}

// =============================================================================
// MIDDLEWARE FACTORY
// =============================================================================

/**
 * Create bulkhead middleware for a specific resource
 */
export function createBulkheadMiddleware(
  configOrName: BulkheadConfig | string
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const config = typeof configOrName === 'string'
    ? DEFAULT_CONFIGS[configOrName] || DEFAULT_CONFIGS.default
    : configOrName;
  
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const startTime = Date.now();
    
    try {
      await acquireSlot(config);
      
      // Store release function for onResponse hook
      (request as any).bulkheadConfig = config;
      
      incrementMetric('bulkhead_acquired_total', { bulkhead: config.name });
      
      const waitTime = Date.now() - startTime;
      if (waitTime > 100) {
        logger.debug({
          bulkhead: config.name,
          waitTimeMs: waitTime
        }, 'Bulkhead slot acquired after waiting');
      }
      
    } catch (error) {
      if (error instanceof BulkheadFullError || error instanceof BulkheadTimeoutError) {
        logger.warn({
          bulkhead: config.name,
          error: error.message,
          requestId: request.id
        }, 'Bulkhead rejected request');
        
        reply.code(503).send({
          type: 'urn:error:compliance-service:service-unavailable',
          title: 'Service Unavailable',
          status: 503,
          detail: 'Service is currently at capacity. Please retry later.',
          instance: request.id,
          retryAfter: 5
        });
        return;
      }
      throw error;
    }
  };
}

/**
 * Release bulkhead slot (should be called in onResponse hook)
 */
export function releaseBulkheadSlot(request: FastifyRequest): void {
  const config = (request as any).bulkheadConfig as BulkheadConfig | undefined;
  if (config) {
    releaseSlot(config);
    delete (request as any).bulkheadConfig;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Execute function with bulkhead protection
 */
export async function withBulkhead<T>(
  configOrName: BulkheadConfig | string,
  fn: () => Promise<T>
): Promise<T> {
  const config = typeof configOrName === 'string'
    ? DEFAULT_CONFIGS[configOrName] || DEFAULT_CONFIGS.default
    : configOrName;
  
  await acquireSlot(config);
  
  try {
    return await fn();
  } finally {
    releaseSlot(config);
  }
}

/**
 * Get current bulkhead status
 */
export function getBulkheadStatus(): Record<string, {
  active: number;
  queued: number;
  maxConcurrent: number;
  maxQueued: number;
}> {
  const status: Record<string, any> = {};
  
  for (const [name, config] of Object.entries(DEFAULT_CONFIGS)) {
    const state = bulkheads.get(name);
    status[name] = {
      active: state?.active || 0,
      queued: state?.queued.length || 0,
      maxConcurrent: config.maxConcurrent,
      maxQueued: config.maxQueued
    };
  }
  
  return status;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const bulkheadConfigs = DEFAULT_CONFIGS;

export default {
  createBulkheadMiddleware,
  releaseBulkheadSlot,
  withBulkhead,
  getBulkheadStatus,
  BulkheadFullError,
  BulkheadTimeoutError,
  bulkheadConfigs
};
