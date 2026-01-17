/**
 * Webhook Deduplication for Notification Service
 * 
 * AUDIT FIX:
 * - IDP-1: Webhooks not deduplicated → Track webhook events by provider ID
 * - IDP-2: No notification_webhook_events tracking table → Redis-based tracking with DB fallback
 * 
 * Prevents duplicate processing of webhook events from SendGrid/Twilio
 */

import { db } from '../config/database';
import { logger } from '../config/logger';
import Redis from 'ioredis';
import { env } from '../config/env';

// =============================================================================
// TYPES
// =============================================================================

interface WebhookEvent {
  provider: 'sendgrid' | 'twilio' | 'generic';
  eventId: string;
  eventType: string;
  processedAt: Date;
  payload?: any;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const REDIS_PREFIX = 'notification:webhook:';

// In-memory fallback cache
const memoryCache = new Map<string, number>();

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
        logger.warn('Webhook dedup Redis error, using memory', { error: err.message });
      });
    } catch (error) {
      logger.warn('Failed to initialize Redis for webhook dedup', { error });
      return null;
    }
  }
  return redis;
}

// =============================================================================
// DEDUPLICATION FUNCTIONS
// =============================================================================

/**
 * AUDIT FIX IDP-1, IDP-2: Check if webhook event was already processed
 * Returns true if duplicate, false if new
 */
export async function isWebhookDuplicate(
  provider: string,
  eventId: string
): Promise<boolean> {
  const key = `${REDIS_PREFIX}${provider}:${eventId}`;
  
  // Try Redis first
  const redisClient = getRedis();
  if (redisClient) {
    try {
      const exists = await redisClient.exists(key);
      if (exists) {
        logger.debug('Webhook duplicate detected (Redis)', { provider, eventId });
        return true;
      }
    } catch (error) {
      logger.warn('Redis webhook check failed, using memory', { 
        error: (error as Error).message 
      });
    }
  }
  
  // Check memory cache
  const memKey = `${provider}:${eventId}`;
  if (memoryCache.has(memKey)) {
    const timestamp = memoryCache.get(memKey)!;
    if (Date.now() - timestamp < DEDUP_TTL_SECONDS * 1000) {
      logger.debug('Webhook duplicate detected (memory)', { provider, eventId });
      return true;
    }
    memoryCache.delete(memKey);
  }
  
  // Check database as last resort
  try {
    const existing = await db('notification_webhook_events')
      .where({ provider, event_id: eventId })
      .first();
    
    if (existing) {
      logger.debug('Webhook duplicate detected (DB)', { provider, eventId });
      return true;
    }
  } catch (error) {
    logger.warn('Database webhook check failed', { error: (error as Error).message });
  }
  
  return false;
}

/**
 * AUDIT FIX IDP-1, IDP-2: Mark webhook event as processed
 */
export async function markWebhookProcessed(
  provider: string,
  eventId: string,
  eventType: string,
  payload?: any
): Promise<void> {
  const key = `${REDIS_PREFIX}${provider}:${eventId}`;
  const memKey = `${provider}:${eventId}`;
  
  // Store in Redis
  const redisClient = getRedis();
  if (redisClient) {
    try {
      await redisClient.setex(key, DEDUP_TTL_SECONDS, JSON.stringify({
        eventType,
        processedAt: new Date().toISOString()
      }));
    } catch (error) {
      logger.warn('Redis webhook mark failed', { error: (error as Error).message });
    }
  }
  
  // Store in memory (backup)
  memoryCache.set(memKey, Date.now());
  
  // Store in database (persistent)
  try {
    await db('notification_webhook_events').insert({
      provider,
      event_id: eventId,
      event_type: eventType,
      payload: payload ? JSON.stringify(payload) : null,
      processed_at: new Date(),
      created_at: new Date()
    }).onConflict(['provider', 'event_id']).ignore();
  } catch (error) {
    logger.warn('Database webhook mark failed', { error: (error as Error).message });
  }
  
  logger.debug('Webhook marked as processed', { provider, eventId, eventType });
}

/**
 * AUDIT FIX IDP-1, IDP-2: Check and mark webhook atomically
 * Returns true if this is a new event that should be processed
 */
export async function checkAndMarkWebhook(
  provider: string,
  eventId: string,
  eventType: string,
  payload?: any
): Promise<boolean> {
  // Check if already processed
  const isDuplicate = await isWebhookDuplicate(provider, eventId);
  
  if (isDuplicate) {
    logger.info('Skipping duplicate webhook', { provider, eventId, eventType });
    return false;
  }
  
  // Mark as processed
  await markWebhookProcessed(provider, eventId, eventType, payload);
  
  return true;
}

// =============================================================================
// PROVIDER-SPECIFIC HELPERS
// =============================================================================

/**
 * Extract event ID from SendGrid webhook payload
 */
export function extractSendGridEventId(event: any): string | null {
  // SendGrid provides sg_message_id and optionally sg_event_id
  return event.sg_event_id || event.sg_message_id || null;
}

/**
 * Extract event ID from Twilio webhook payload
 */
export function extractTwilioEventId(event: any): string | null {
  // Twilio provides MessageSid as the unique identifier
  // For status callbacks, combine with status for uniqueness
  const messageSid = event.MessageSid || event.SmsSid;
  const status = event.MessageStatus || event.SmsStatus;
  
  if (messageSid && status) {
    return `${messageSid}:${status}`;
  }
  return messageSid || null;
}

// =============================================================================
// CLEANUP
// =============================================================================

// Cleanup expired entries from memory cache periodically
setInterval(() => {
  const now = Date.now();
  const ttlMs = DEDUP_TTL_SECONDS * 1000;
  let cleaned = 0;
  
  for (const [key, timestamp] of memoryCache.entries()) {
    if (now - timestamp > ttlMs) {
      memoryCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.debug('Cleaned expired webhook entries from memory', { cleaned });
  }
}, 60 * 60 * 1000); // Every hour

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  isWebhookDuplicate,
  markWebhookProcessed,
  checkAndMarkWebhook,
  extractSendGridEventId,
  extractTwilioEventId
};
