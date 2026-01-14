/**
 * RPC Rate Limiting Utility
 * 
 * AUDIT FIX #31: Add outbound RPC rate limiting
 * 
 * Features:
 * - Token bucket rate limiting for Solana RPC calls
 * - Per-endpoint rate limiting
 * - Request queueing when limit reached
 * - Timeout handling for queued requests
 * - Metrics tracking
 */

import { logger } from './logger';

// Node.js globals - declared for TypeScript (available at runtime)
declare const process: { env: Record<string, string | undefined> };
declare function setTimeout(callback: () => void, ms: number): ReturnType<typeof globalThis.setTimeout>;
declare function clearTimeout(timer: ReturnType<typeof globalThis.setTimeout>): void;
declare function setInterval(callback: () => void, ms: number): ReturnType<typeof globalThis.setInterval>;
declare const URL: typeof globalThis.URL;

// =============================================================================
// CONFIGURATION
// =============================================================================

// Default: 50 requests per second per endpoint
const DEFAULT_RPS_LIMIT = parseInt(process.env.RPC_RATE_LIMIT_RPS || '50', 10);

// Queue timeout: 5 seconds
const DEFAULT_QUEUE_TIMEOUT_MS = parseInt(process.env.RPC_RATE_LIMIT_TIMEOUT_MS || '5000', 10);

// Maximum queue size per endpoint
const MAX_QUEUE_SIZE = parseInt(process.env.RPC_RATE_LIMIT_MAX_QUEUE || '100', 10);

// =============================================================================
// METRICS
// =============================================================================

interface RPCRateLimitMetrics {
  totalRequests: number;
  rateLimitedRequests: number;
  queuedRequests: number;
  timedOutRequests: number;
  successfulRequests: number;
  rejectedRequests: number;
}

const metricsPerEndpoint = new Map<string, RPCRateLimitMetrics>();

/**
 * Get or create metrics for an endpoint
 */
function getMetrics(endpoint: string): RPCRateLimitMetrics {
  if (!metricsPerEndpoint.has(endpoint)) {
    metricsPerEndpoint.set(endpoint, {
      totalRequests: 0,
      rateLimitedRequests: 0,
      queuedRequests: 0,
      timedOutRequests: 0,
      successfulRequests: 0,
      rejectedRequests: 0
    });
  }
  return metricsPerEndpoint.get(endpoint)!;
}

/**
 * Get all RPC rate limit metrics
 */
export function getRPCRateLimitMetrics(): Record<string, RPCRateLimitMetrics> {
  const result: Record<string, RPCRateLimitMetrics> = {};
  for (const [endpoint, metrics] of metricsPerEndpoint.entries()) {
    // Sanitize endpoint URL for logging (remove auth tokens if any)
    const sanitizedEndpoint = sanitizeEndpoint(endpoint);
    result[sanitizedEndpoint] = { ...metrics };
  }
  return result;
}

/**
 * Sanitize endpoint URL for logging (remove auth tokens)
 */
function sanitizeEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    // Hide any auth parameters
    url.password = '';
    url.username = '';
    // Remove potentially sensitive query params
    url.searchParams.delete('api_key');
    url.searchParams.delete('apiKey');
    url.searchParams.delete('key');
    url.searchParams.delete('token');
    return url.toString();
  } catch {
    return endpoint.substring(0, 50) + '...';
  }
}

// =============================================================================
// TOKEN BUCKET IMPLEMENTATION
// =============================================================================

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per ms
  queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>;
}

const buckets = new Map<string, TokenBucket>();

/**
 * Get or create a token bucket for an endpoint
 */
function getBucket(endpoint: string, rpsLimit: number = DEFAULT_RPS_LIMIT): TokenBucket {
  if (!buckets.has(endpoint)) {
    buckets.set(endpoint, {
      tokens: rpsLimit,
      lastRefill: Date.now(),
      maxTokens: rpsLimit,
      refillRate: rpsLimit / 1000, // tokens per ms
      queue: []
    });
  }
  return buckets.get(endpoint)!;
}

/**
 * Refill tokens based on elapsed time
 */
function refillTokens(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = elapsed * bucket.refillRate;
  
  bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
}

/**
 * Process the queue for a bucket
 */
function processQueue(bucket: TokenBucket): void {
  refillTokens(bucket);
  
  while (bucket.queue.length > 0 && bucket.tokens >= 1) {
    const request = bucket.queue.shift()!;
    bucket.tokens--;
    clearTimeout(request.timeout);
    request.resolve();
  }
}

// =============================================================================
// RATE LIMITER CLASS
// =============================================================================

export class RPCRateLimiter {
  private endpoint: string;
  private rpsLimit: number;
  private queueTimeoutMs: number;

  constructor(
    endpoint: string,
    options?: {
      rpsLimit?: number;
      queueTimeoutMs?: number;
    }
  ) {
    this.endpoint = endpoint;
    this.rpsLimit = options?.rpsLimit || DEFAULT_RPS_LIMIT;
    this.queueTimeoutMs = options?.queueTimeoutMs || DEFAULT_QUEUE_TIMEOUT_MS;

    logger.info('RPC rate limiter initialized', {
      endpoint: sanitizeEndpoint(endpoint),
      rpsLimit: this.rpsLimit,
      queueTimeoutMs: this.queueTimeoutMs
    });
  }

  /**
   * Acquire a permit to make an RPC call
   * Returns a promise that resolves when permit is available
   * Throws if queue is full or timeout is reached
   */
  async acquire(): Promise<void> {
    const bucket = getBucket(this.endpoint, this.rpsLimit);
    const metrics = getMetrics(this.endpoint);
    
    metrics.totalRequests++;
    
    // Refill tokens first
    refillTokens(bucket);

    // If tokens available, consume immediately
    if (bucket.tokens >= 1) {
      bucket.tokens--;
      metrics.successfulRequests++;
      return;
    }

    // Check queue size
    if (bucket.queue.length >= MAX_QUEUE_SIZE) {
      metrics.rejectedRequests++;
      logger.warn('RPC rate limit queue full, rejecting request', {
        endpoint: sanitizeEndpoint(this.endpoint),
        queueSize: bucket.queue.length,
        maxQueueSize: MAX_QUEUE_SIZE
      });
      throw new Error(`RPC rate limit queue full for ${sanitizeEndpoint(this.endpoint)}`);
    }

    // Queue the request
    metrics.queuedRequests++;
    metrics.rateLimitedRequests++;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from queue
        const index = bucket.queue.findIndex(r => r.timeout === timeout);
        if (index !== -1) {
          bucket.queue.splice(index, 1);
        }
        
        metrics.timedOutRequests++;
        logger.warn('RPC rate limit queue timeout', {
          endpoint: sanitizeEndpoint(this.endpoint),
          timeoutMs: this.queueTimeoutMs
        });
        
        reject(new Error(`RPC rate limit timeout after ${this.queueTimeoutMs}ms for ${sanitizeEndpoint(this.endpoint)}`));
      }, this.queueTimeoutMs);

      bucket.queue.push({ resolve, reject, timeout });

      // Schedule queue processing
      // Use a small delay to batch queue processing
      setTimeout(() => processQueue(bucket), 10);
    });
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    
    try {
      const result = await fn();
      return result;
    } catch (error) {
      // Don't count RPC errors against rate limiting
      throw error;
    }
  }

  /**
   * Get current metrics for this endpoint
   */
  getMetrics(): RPCRateLimitMetrics {
    return { ...getMetrics(this.endpoint) };
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return getBucket(this.endpoint, this.rpsLimit).queue.length;
  }

  /**
   * Get available tokens
   */
  getAvailableTokens(): number {
    const bucket = getBucket(this.endpoint, this.rpsLimit);
    refillTokens(bucket);
    return Math.floor(bucket.tokens);
  }
}

// =============================================================================
// GLOBAL RATE LIMITER REGISTRY
// =============================================================================

const rateLimiters = new Map<string, RPCRateLimiter>();

/**
 * Get or create a rate limiter for an RPC endpoint
 */
export function getRPCRateLimiter(
  endpoint: string,
  options?: {
    rpsLimit?: number;
    queueTimeoutMs?: number;
  }
): RPCRateLimiter {
  if (!rateLimiters.has(endpoint)) {
    rateLimiters.set(endpoint, new RPCRateLimiter(endpoint, options));
  }
  return rateLimiters.get(endpoint)!;
}

/**
 * Execute an RPC call with rate limiting
 * Convenience function for one-off rate-limited calls
 */
export async function withRPCRateLimit<T>(
  endpoint: string,
  fn: () => Promise<T>,
  options?: {
    rpsLimit?: number;
    queueTimeoutMs?: number;
  }
): Promise<T> {
  const limiter = getRPCRateLimiter(endpoint, options);
  return limiter.execute(fn);
}

// =============================================================================
// PERIODIC QUEUE PROCESSING
// =============================================================================

// Process all queues periodically to handle token refills
setInterval(() => {
  for (const [endpoint, bucket] of buckets.entries()) {
    if (bucket.queue.length > 0) {
      processQueue(bucket);
    }
  }
}, 50); // Check every 50ms

// =============================================================================
// EXPORTS
// =============================================================================

export {
  DEFAULT_RPS_LIMIT,
  DEFAULT_QUEUE_TIMEOUT_MS,
  MAX_QUEUE_SIZE
};
