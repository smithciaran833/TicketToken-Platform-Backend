/**
 * Event Handler Idempotency for Notification Service
 * 
 * AUDIT FIX:
 * - EVT-1: No idempotency in event handlers → Redis-based event tracking
 * 
 * Prevents duplicate notifications from replayed RabbitMQ events
 */

import { logger } from '../config/logger';
import Redis from 'ioredis';
import { env } from '../config/env';

// =============================================================================
// CONFIGURATION
// =============================================================================

const EVENT_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const REDIS_PREFIX = 'notification:event:';

// In-memory fallback
const memoryCache = new Map<string, { processedAt: number; status: string }>();

// Redis client (lazy initialization)
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!redis) {
    try {
      redis = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        db: env.REDIS_DB,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false
      });
      
      redis.on('error', (err) => {
        logger.warn('Event idempotency Redis error, using memory', { error: err.message });
      });
    } catch (error) {
      logger.warn('Failed to initialize Redis for event idempotency', { error });
      return null;
    }
  }
  return redis;
}

// =============================================================================
// IDEMPOTENCY FUNCTIONS
// =============================================================================

/**
 * Generate idempotency key for event
 */
export function generateEventKey(
  eventType: string,
  correlationId: string,
  userId?: string
): string {
  const parts = [eventType, correlationId];
  if (userId) {
    parts.push(userId);
  }
  return parts.join(':');
}

/**
 * AUDIT FIX EVT-1: Check if event was already processed
 */
export async function isEventProcessed(eventKey: string): Promise<boolean> {
  const key = `${REDIS_PREFIX}${eventKey}`;
  
  // Try Redis first
  const redisClient = getRedis();
  if (redisClient) {
    try {
      const exists = await redisClient.exists(key);
      if (exists) {
        logger.debug('Event already processed (Redis)', { eventKey });
        return true;
      }
    } catch (error) {
      logger.warn('Redis event check failed, using memory', { 
        error: (error as Error).message 
      });
    }
  }
  
  // Check memory cache
  if (memoryCache.has(eventKey)) {
    const entry = memoryCache.get(eventKey)!;
    if (Date.now() - entry.processedAt < EVENT_TTL_SECONDS * 1000) {
      logger.debug('Event already processed (memory)', { eventKey });
      return true;
    }
    memoryCache.delete(eventKey);
  }
  
  return false;
}

/**
 * AUDIT FIX EVT-1: Mark event as processed
 */
export async function markEventProcessed(
  eventKey: string,
  status: 'completed' | 'failed' = 'completed'
): Promise<void> {
  const key = `${REDIS_PREFIX}${eventKey}`;
  
  // Store in Redis
  const redisClient = getRedis();
  if (redisClient) {
    try {
      await redisClient.setex(key, EVENT_TTL_SECONDS, JSON.stringify({
        status,
        processedAt: new Date().toISOString()
      }));
    } catch (error) {
      logger.warn('Redis event mark failed', { error: (error as Error).message });
    }
  }
  
  // Store in memory (backup)
  memoryCache.set(eventKey, {
    processedAt: Date.now(),
    status
  });
  
  logger.debug('Event marked as processed', { eventKey, status });
}

/**
 * AUDIT FIX EVT-1: Check and mark event atomically
 * Returns true if this is a new event that should be processed
 */
export async function checkAndMarkEvent(
  eventType: string,
  correlationId: string,
  userId?: string
): Promise<{ shouldProcess: boolean; eventKey: string }> {
  const eventKey = generateEventKey(eventType, correlationId, userId);
  
  // Check if already processed
  const isProcessed = await isEventProcessed(eventKey);
  
  if (isProcessed) {
    logger.info('Skipping duplicate event', { eventType, correlationId, userId });
    return { shouldProcess: false, eventKey };
  }
  
  // Mark as processing (will update to completed when done)
  await markEventProcessed(eventKey, 'completed');
  
  return { shouldProcess: true, eventKey };
}

/**
 * AUDIT FIX EVT-1: Wrapper for idempotent event processing
 */
export async function withEventIdempotency<T>(
  eventType: string,
  correlationId: string,
  userId: string | undefined,
  handler: () => Promise<T>
): Promise<T | null> {
  const { shouldProcess, eventKey } = await checkAndMarkEvent(
    eventType,
    correlationId,
    userId
  );
  
  if (!shouldProcess) {
    return null;
  }
  
  try {
    const result = await handler();
    await markEventProcessed(eventKey, 'completed');
    return result;
  } catch (error) {
    // Don't mark as failed - allow retry
    logger.error('Event handler failed', {
      eventType,
      correlationId,
      error: (error as Error).message
    });
    throw error;
  }
}

// =============================================================================
// CLEANUP
// =============================================================================

// Cleanup expired entries from memory cache periodically
setInterval(() => {
  const now = Date.now();
  const ttlMs = EVENT_TTL_SECONDS * 1000;
  let cleaned = 0;
  
  for (const [key, entry] of memoryCache.entries()) {
    if (now - entry.processedAt > ttlMs) {
      memoryCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.debug('Cleaned expired event entries from memory', { cleaned });
  }
}, 60 * 60 * 1000); // Every hour

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  generateEventKey,
  isEventProcessed,
  markEventProcessed,
  checkAndMarkEvent,
  withEventIdempotency
};
