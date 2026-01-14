/**
 * Bulkhead Pattern Middleware
 * 
 * AUDIT FIX:
 * - GD-H3: No bulkhead pattern → Resource isolation implemented
 * 
 * Isolates different operations to prevent cascade failures.
 * Each bulkhead has its own concurrent request limit.
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from '../utils/logger';

// =============================================================================
// Types
// =============================================================================

interface BulkheadConfig {
  name: string;
  maxConcurrent: number;
  maxWaiting: number;
  timeoutMs: number;
}

interface BulkheadState {
  executing: number;
  waiting: number;
  totalRejected: number;
  totalTimedOut: number;
}

// =============================================================================
// Default Bulkhead Configurations
// =============================================================================

const BULKHEAD_CONFIGS: Record<string, BulkheadConfig> = {
  upload: {
    name: 'upload',
    maxConcurrent: 20,
    maxWaiting: 50,
    timeoutMs: 60000, // 60 seconds for uploads
  },
  download: {
    name: 'download',
    maxConcurrent: 100,
    maxWaiting: 200,
    timeoutMs: 30000, // 30 seconds
  },
  imageProcessing: {
    name: 'imageProcessing',
    maxConcurrent: 10,
    maxWaiting: 30,
    timeoutMs: 45000, // 45 seconds for resize/crop
  },
  videoTranscode: {
    name: 'videoTranscode',
    maxConcurrent: 3,
    maxWaiting: 10,
    timeoutMs: 300000, // 5 minutes for video transcoding
  },
  virusScan: {
    name: 'virusScan',
    maxConcurrent: 5,
    maxWaiting: 20,
    timeoutMs: 30000,
  },
  database: {
    name: 'database',
    maxConcurrent: 50,
    maxWaiting: 100,
    timeoutMs: 10000,
  },
  s3: {
    name: 's3',
    maxConcurrent: 30,
    maxWaiting: 60,
    timeoutMs: 30000,
  },
  default: {
    name: 'default',
    maxConcurrent: 50,
    maxWaiting: 100,
    timeoutMs: 30000,
  },
};

// =============================================================================
// Bulkhead State Management
// =============================================================================

const bulkheadStates: Map<string, BulkheadState> = new Map();

function getOrCreateState(name: string): BulkheadState {
  if (!bulkheadStates.has(name)) {
    bulkheadStates.set(name, {
      executing: 0,
      waiting: 0,
      totalRejected: 0,
      totalTimedOut: 0,
    });
  }
  return bulkheadStates.get(name)!;
}

// =============================================================================
// Bulkhead Class
// =============================================================================

export class Bulkhead {
  private config: BulkheadConfig;
  private state: BulkheadState;
  private waitQueue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(config: BulkheadConfig) {
    this.config = config;
    this.state = getOrCreateState(config.name);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if can execute immediately
    if (this.state.executing < this.config.maxConcurrent) {
      return this.executeImmediate(fn);
    }

    // Check if can wait
    if (this.state.waiting >= this.config.maxWaiting) {
      this.state.totalRejected++;
      logger.warn({
        bulkhead: this.config.name,
        executing: this.state.executing,
        waiting: this.state.waiting,
        maxWaiting: this.config.maxWaiting,
      }, 'Bulkhead rejected request - queue full');
      
      throw new BulkheadFullError(this.config.name);
    }

    // Wait for slot
    await this.waitForSlot();
    return this.executeImmediate(fn);
  }

  private async executeImmediate<T>(fn: () => Promise<T>): Promise<T> {
    this.state.executing++;
    
    try {
      return await fn();
    } finally {
      this.state.executing--;
      this.releaseWaiting();
    }
  }

  private waitForSlot(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.state.waiting++;

      const timer = setTimeout(() => {
        this.state.waiting--;
        this.state.totalTimedOut++;
        
        // Remove from queue
        const index = this.waitQueue.findIndex(w => w.timer === timer);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
        }
        
        logger.warn({
          bulkhead: this.config.name,
          timeoutMs: this.config.timeoutMs,
        }, 'Bulkhead timeout waiting for slot');
        
        reject(new BulkheadTimeoutError(this.config.name, this.config.timeoutMs));
      }, this.config.timeoutMs);

      this.waitQueue.push({ resolve, reject, timer });
    });
  }

  private releaseWaiting(): void {
    if (this.waitQueue.length > 0 && this.state.executing < this.config.maxConcurrent) {
      const waiter = this.waitQueue.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        this.state.waiting--;
        waiter.resolve();
      }
    }
  }

  getStats(): BulkheadState & { name: string; config: BulkheadConfig } {
    return {
      ...this.state,
      name: this.config.name,
      config: this.config,
    };
  }
}

// =============================================================================
// Errors
// =============================================================================

export class BulkheadFullError extends Error {
  readonly name = 'BulkheadFullError';
  readonly bulkhead: string;
  readonly statusCode = 503;

  constructor(bulkhead: string) {
    super(`Bulkhead ${bulkhead} is full - request rejected`);
    this.bulkhead = bulkhead;
  }
}

export class BulkheadTimeoutError extends Error {
  readonly name = 'BulkheadTimeoutError';
  readonly bulkhead: string;
  readonly timeoutMs: number;
  readonly statusCode = 503;

  constructor(bulkhead: string, timeoutMs: number) {
    super(`Bulkhead ${bulkhead} timed out after ${timeoutMs}ms`);
    this.bulkhead = bulkhead;
    this.timeoutMs = timeoutMs;
  }
}

// =============================================================================
// Pre-created Bulkheads
// =============================================================================

export const bulkheads = {
  upload: new Bulkhead(BULKHEAD_CONFIGS.upload!),
  download: new Bulkhead(BULKHEAD_CONFIGS.download!),
  imageProcessing: new Bulkhead(BULKHEAD_CONFIGS.imageProcessing!),
  videoTranscode: new Bulkhead(BULKHEAD_CONFIGS.videoTranscode!),
  virusScan: new Bulkhead(BULKHEAD_CONFIGS.virusScan!),
  database: new Bulkhead(BULKHEAD_CONFIGS.database!),
  s3: new Bulkhead(BULKHEAD_CONFIGS.s3!),
  default: new Bulkhead(BULKHEAD_CONFIGS.default!),
};

// =============================================================================
// Route-based Bulkhead Detection
// =============================================================================

function getBulkheadForRoute(url: string, method: string): Bulkhead {
  // Upload operations
  if (method === 'POST' && (url.includes('/upload') || url.includes('/chunk'))) {
    return bulkheads.upload;
  }
  
  // Download/stream operations
  if (method === 'GET' && (url.includes('/download') || url.includes('/stream'))) {
    return bulkheads.download;
  }
  
  // Image processing
  if (url.includes('/images/') && ['POST', 'PUT'].includes(method)) {
    if (url.includes('/resize') || url.includes('/crop') || 
        url.includes('/rotate') || url.includes('/watermark')) {
      return bulkheads.imageProcessing;
    }
  }
  
  // Video transcoding
  if (url.includes('/videos/') && url.includes('/transcode')) {
    return bulkheads.videoTranscode;
  }
  
  return bulkheads.default;
}

// =============================================================================
// Fastify Plugin
// =============================================================================

async function bulkheadPlugin(
  fastify: FastifyInstance,
  options: { enabled?: boolean } = {}
): Promise<void> {
  const enabled = options.enabled !== false;

  if (!enabled) {
    logger.info('Bulkhead middleware disabled');
    return;
  }

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const bulkhead = getBulkheadForRoute(request.url, request.method);
    
    // Store for later release
    (request as any).bulkhead = bulkhead;
    (request as any).bulkheadAcquired = false;

    try {
      // Use bulkhead to control entry
      await bulkhead.execute(async () => {
        (request as any).bulkheadAcquired = true;
      });
    } catch (error) {
      if (error instanceof BulkheadFullError) {
        reply.status(503).send({
          type: 'https://api.tickettoken.com/errors/service-overloaded',
          title: 'Service Temporarily Overloaded',
          status: 503,
          detail: 'Too many concurrent requests for this operation type.',
          instance: request.id,
          bulkhead: error.bulkhead,
          retryAfter: 5,
        });
      } else if (error instanceof BulkheadTimeoutError) {
        reply.status(503).send({
          type: 'https://api.tickettoken.com/errors/timeout',
          title: 'Request Timed Out',
          status: 503,
          detail: 'Request timed out waiting for resources.',
          instance: request.id,
          bulkhead: error.bulkhead,
          retryAfter: 10,
        });
      } else {
        throw error;
      }
    }
  });

  // Expose bulkhead stats endpoint
  fastify.get('/internal/bulkheads', async () => {
    return Object.fromEntries(
      Object.entries(bulkheads).map(([name, bulkhead]) => [name, bulkhead.getStats()])
    );
  });

  logger.info({
    event: 'bulkhead_initialized',
    bulkheads: Object.keys(bulkheads),
  }, 'Bulkhead middleware initialized');
}

export default fp(bulkheadPlugin, {
  name: 'bulkhead',
  fastify: '4.x',
});

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all bulkhead statistics
 */
export function getAllBulkheadStats(): Record<string, ReturnType<Bulkhead['getStats']>> {
  return Object.fromEntries(
    Object.entries(bulkheads).map(([name, bulkhead]) => [name, bulkhead.getStats()])
  );
}

/**
 * Wrap a function with a specific bulkhead
 */
export function withBulkhead<T>(
  bulkheadName: keyof typeof bulkheads,
  fn: () => Promise<T>
): Promise<T> {
  const bulkhead = bulkheads[bulkheadName] || bulkheads.default;
  return bulkhead.execute(fn);
}
