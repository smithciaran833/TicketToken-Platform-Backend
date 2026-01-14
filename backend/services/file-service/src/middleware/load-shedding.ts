/**
 * Load Shedding Middleware
 * 
 * AUDIT FIX:
 * - GD-H2: No load shedding → Implemented with event loop lag monitoring
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from '../utils/logger';

// =============================================================================
// Configuration
// =============================================================================

interface LoadSheddingConfig {
  /** Maximum event loop lag in milliseconds before shedding load */
  maxEventLoopLagMs: number;
  /** Maximum concurrent requests before shedding */
  maxConcurrentRequests: number;
  /** Sample interval for event loop lag measurement */
  sampleIntervalMs: number;
  /** Routes to exclude from load shedding */
  excludePaths: string[];
  /** Enable load shedding */
  enabled: boolean;
}

const DEFAULT_CONFIG: LoadSheddingConfig = {
  maxEventLoopLagMs: 100,
  maxConcurrentRequests: 500,
  sampleIntervalMs: 1000,
  excludePaths: ['/health/live', '/health/ready', '/health/startup', '/metrics'],
  enabled: true,
};

// =============================================================================
// State
// =============================================================================

let eventLoopLag = 0;
let concurrentRequests = 0;
let totalShedRequests = 0;
let lastSampleTime = process.hrtime.bigint();
let sampleInterval: NodeJS.Timeout | null = null;

// =============================================================================
// Event Loop Lag Measurement
// =============================================================================

function measureEventLoopLag(): void {
  const expectedTime = BigInt(DEFAULT_CONFIG.sampleIntervalMs * 1_000_000);
  const actualTime = process.hrtime.bigint() - lastSampleTime;
  const lag = Number(actualTime - expectedTime) / 1_000_000; // Convert to ms
  
  eventLoopLag = Math.max(0, lag);
  lastSampleTime = process.hrtime.bigint();
}

function startEventLoopMonitoring(): void {
  if (sampleInterval) return;
  
  lastSampleTime = process.hrtime.bigint();
  sampleInterval = setInterval(measureEventLoopLag, DEFAULT_CONFIG.sampleIntervalMs);
  sampleInterval.unref(); // Don't prevent process exit
}

function stopEventLoopMonitoring(): void {
  if (sampleInterval) {
    clearInterval(sampleInterval);
    sampleInterval = null;
  }
}

// =============================================================================
// Metrics Export
// =============================================================================

export function getLoadSheddingMetrics(): {
  eventLoopLag: number;
  concurrentRequests: number;
  totalShedRequests: number;
  isOverloaded: boolean;
} {
  return {
    eventLoopLag,
    concurrentRequests,
    totalShedRequests,
    isOverloaded: eventLoopLag > DEFAULT_CONFIG.maxEventLoopLagMs ||
                  concurrentRequests > DEFAULT_CONFIG.maxConcurrentRequests,
  };
}

// =============================================================================
// Load Shedding Middleware
// =============================================================================

async function loadSheddingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip excluded paths (health checks)
  if (DEFAULT_CONFIG.excludePaths.some(path => request.url.startsWith(path))) {
    return;
  }
  
  // Check if load shedding is enabled
  if (!DEFAULT_CONFIG.enabled) {
    return;
  }
  
  // Check event loop lag
  if (eventLoopLag > DEFAULT_CONFIG.maxEventLoopLagMs) {
    totalShedRequests++;
    
    logger.warn({
      event: 'load_shedding_triggered',
      reason: 'event_loop_lag',
      eventLoopLag,
      threshold: DEFAULT_CONFIG.maxEventLoopLagMs,
      correlationId: (request as any).correlationId,
      url: request.url,
    }, 'Request shed due to event loop lag');
    
    reply.status(503).send({
      type: 'https://api.tickettoken.com/errors/service-overloaded',
      title: 'Service Temporarily Overloaded',
      status: 503,
      detail: 'The service is experiencing high load. Please retry later.',
      instance: request.id,
      retryAfter: 5,
    });
    return;
  }
  
  // Check concurrent requests
  if (concurrentRequests >= DEFAULT_CONFIG.maxConcurrentRequests) {
    totalShedRequests++;
    
    logger.warn({
      event: 'load_shedding_triggered',
      reason: 'max_concurrent_requests',
      concurrentRequests,
      threshold: DEFAULT_CONFIG.maxConcurrentRequests,
      correlationId: (request as any).correlationId,
      url: request.url,
    }, 'Request shed due to concurrent request limit');
    
    reply.status(503).send({
      type: 'https://api.tickettoken.com/errors/service-overloaded',
      title: 'Service Temporarily Overloaded',
      status: 503,
      detail: 'Too many concurrent requests. Please retry later.',
      instance: request.id,
      retryAfter: 2,
    });
    return;
  }
  
  // Track concurrent requests
  concurrentRequests++;
}

// =============================================================================
// Response Hook (cleanup)
// =============================================================================

function onResponse(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: () => void
): void {
  // Skip excluded paths
  if (!DEFAULT_CONFIG.excludePaths.some(path => request.url.startsWith(path))) {
    concurrentRequests = Math.max(0, concurrentRequests - 1);
  }
  done();
}

// =============================================================================
// Plugin Registration
// =============================================================================

async function loadSheddingPlugin(
  fastify: FastifyInstance,
  options: Partial<LoadSheddingConfig> = {}
): Promise<void> {
  // Merge options
  Object.assign(DEFAULT_CONFIG, options);
  
  // Start event loop monitoring
  startEventLoopMonitoring();
  
  // Register hooks
  fastify.addHook('preHandler', loadSheddingMiddleware);
  fastify.addHook('onResponse', onResponse);
  
  // Cleanup on close
  fastify.addHook('onClose', () => {
    stopEventLoopMonitoring();
  });
  
  logger.info({
    event: 'load_shedding_initialized',
    config: DEFAULT_CONFIG,
  }, 'Load shedding middleware initialized');
}

export default fp(loadSheddingPlugin, {
  name: 'load-shedding',
  fastify: '4.x',
});

export { loadSheddingMiddleware, loadSheddingPlugin };
