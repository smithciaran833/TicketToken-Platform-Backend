import { FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import logger from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

// TTL for processed webhook events (24 hours)
const WEBHOOK_TTL_SECONDS = 86400;

// Redis key prefix for webhook processing
const WEBHOOK_KEY_PREFIX = 'webhook:processed:';

// =============================================================================
// REDIS CLIENT
// =============================================================================

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      }
    });

    redisClient.on('error', (error) => {
      logger.error('Webhook idempotency Redis error', { error: error.message });
    });
  }
  return redisClient;
}

// =============================================================================
// IDEMPOTENCY FUNCTIONS
// =============================================================================

/**
 * Check if a webhook event has already been processed
 * @param eventId - Unique identifier for the webhook event
 * @returns true if already processed, false otherwise
 */
export async function isWebhookProcessed(eventId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const key = `${WEBHOOK_KEY_PREFIX}${eventId}`;
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error) {
    // If Redis fails, assume not processed to avoid blocking
    logger.error('Failed to check webhook processing status', {
      eventId,
      error: (error as Error).message
    });
    return false;
  }
}

/**
 * Mark a webhook event as successfully processed
 * Call this ONLY after successful processing
 * @param eventId - Unique identifier for the webhook event
 * @param metadata - Optional metadata about the processing
 */
export async function markWebhookProcessed(
  eventId: string,
  metadata?: { type?: string; timestamp?: string }
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${WEBHOOK_KEY_PREFIX}${eventId}`;
    const value = JSON.stringify({
      processedAt: new Date().toISOString(),
      ...metadata
    });
    
    await redis.setex(key, WEBHOOK_TTL_SECONDS, value);
    
    logger.debug('Marked webhook as processed', { eventId });
  } catch (error) {
    // Log but don't throw - webhook was processed successfully
    // Worst case, it gets processed again on retry
    logger.error('Failed to mark webhook as processed', {
      eventId,
      error: (error as Error).message
    });
  }
}

/**
 * Get webhook processing info if available
 * @param eventId - Unique identifier for the webhook event
 * @returns Processing info or null if not found
 */
export async function getWebhookProcessingInfo(eventId: string): Promise<{
  processedAt: string;
  type?: string;
} | null> {
  try {
    const redis = getRedisClient();
    const key = `${WEBHOOK_KEY_PREFIX}${eventId}`;
    const value = await redis.get(key);
    
    if (!value) return null;
    
    return JSON.parse(value);
  } catch (error) {
    logger.error('Failed to get webhook processing info', {
      eventId,
      error: (error as Error).message
    });
    return null;
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Extract event ID from webhook request
 * Checks multiple sources for the event ID
 */
function extractEventId(request: FastifyRequest): string | null {
  // Try body.id (Stripe, etc.)
  const body = request.body as any;
  if (body?.id) return body.id;
  
  // Try x-webhook-id header
  const headerEventId = request.headers['x-webhook-id'];
  if (headerEventId && typeof headerEventId === 'string') return headerEventId;
  
  // Try x-idempotency-key header
  const idempotencyKey = request.headers['x-idempotency-key'];
  if (idempotencyKey && typeof idempotencyKey === 'string') return idempotencyKey;
  
  // Try body.event_id (some webhook providers)
  if (body?.event_id) return body.event_id;
  
  return null;
}

/**
 * Fastify middleware for webhook idempotency
 * Add as preHandler to webhook routes:
 * 
 * ```typescript
 * fastify.post('/webhook', {
 *   preHandler: [webhookIdempotencyMiddleware]
 * }, handler);
 * ```
 */
export async function webhookIdempotencyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const eventId = extractEventId(request);
  
  if (!eventId) {
    // No event ID found - log warning but allow processing
    // Some webhooks don't have idempotency keys
    logger.warn('Webhook received without event ID - cannot deduplicate', {
      url: request.url,
      method: request.method,
      requestId: request.id
    });
    return;
  }
  
  // Store event ID for later use in handler
  (request as any).webhookEventId = eventId;
  
  // Check if already processed
  if (await isWebhookProcessed(eventId)) {
    const processingInfo = await getWebhookProcessingInfo(eventId);
    
    logger.info('Duplicate webhook ignored', {
      eventId,
      processedAt: processingInfo?.processedAt,
      url: request.url,
      requestId: request.id
    });
    
    // Return 200 OK - webhook provider should not retry
    reply.code(200).send({
      status: 'already_processed',
      eventId,
      processedAt: processingInfo?.processedAt,
      message: 'This webhook event has already been processed'
    });
    return;
  }
  
  logger.debug('Webhook event ID extracted for processing', {
    eventId,
    url: request.url
  });
}

/**
 * Decorator function to wrap webhook handlers with idempotency
 * Automatically marks webhook as processed on success
 * 
 * ```typescript
 * const handler = withWebhookIdempotency(async (request, reply) => {
 *   // Handle webhook...
 *   return { success: true };
 * });
 * ```
 */
export function withWebhookIdempotency<T>(
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<T>
): (request: FastifyRequest, reply: FastifyReply) => Promise<T | { status: string; eventId: string }> {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const eventId = (request as any).webhookEventId || extractEventId(request);
    
    try {
      const result = await handler(request, reply);
      
      // Mark as processed on success
      if (eventId) {
        await markWebhookProcessed(eventId, {
          type: (request.body as any)?.type,
          timestamp: new Date().toISOString()
        });
      }
      
      return result;
    } catch (error) {
      // Don't mark as processed on failure - allow retry
      logger.error('Webhook handler failed', {
        eventId,
        error: (error as Error).message
      });
      throw error;
    }
  };
}

// =============================================================================
// CLEANUP UTILITIES
// =============================================================================

/**
 * Delete webhook processing record (for testing/cleanup)
 */
export async function clearWebhookProcessingStatus(eventId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${WEBHOOK_KEY_PREFIX}${eventId}`;
    await redis.del(key);
    logger.debug('Cleared webhook processing status', { eventId });
  } catch (error) {
    logger.error('Failed to clear webhook status', {
      eventId,
      error: (error as Error).message
    });
  }
}
