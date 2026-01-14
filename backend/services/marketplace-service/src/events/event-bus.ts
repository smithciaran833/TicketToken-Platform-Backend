/**
 * Event Bus with Dead Letter Queue for Marketplace Service
 * 
 * Issues Fixed:
 * - WH-1: Local EventEmitter only → Redis Pub/Sub event bus
 * - WH-2: No dead letter queue → DLQ for failed events
 * - WH-H2: No retry on publish → Automatic retry with backoff
 * 
 * Features:
 * - Redis Pub/Sub for distributed events
 * - Dead letter queue for failed deliveries
 * - Automatic retry with exponential backoff
 * - Event persistence and replay
 */

import { getRedis, getPub, getSub } from '../config/redis';
import { logger } from '../utils/logger';
import { registry } from '../utils/metrics';
import { randomUUID } from 'crypto';

const log = logger.child({ component: 'EventBus' });

// Configuration
const MAX_RETRY_ATTEMPTS = parseInt(process.env.EVENT_MAX_RETRIES || '5', 10);
const RETRY_BASE_DELAY_MS = parseInt(process.env.EVENT_RETRY_DELAY_MS || '1000', 10);
const DLQ_RETENTION_HOURS = parseInt(process.env.DLQ_RETENTION_HOURS || '168', 10); // 7 days
const EVENT_CHANNEL_PREFIX = 'marketplace:events:';
const DLQ_KEY_PREFIX = 'marketplace:dlq:';
const EVENT_LOG_KEY = 'marketplace:event-log:';

// Event types
export type MarketplaceEventType = 
  | 'listing.created'
  | 'listing.updated'
  | 'listing.cancelled'
  | 'listing.expired'
  | 'listing.sold'
  | 'purchase.initiated'
  | 'purchase.completed'
  | 'purchase.failed'
  | 'transfer.started'
  | 'transfer.completed'
  | 'transfer.failed'
  | 'refund.initiated'
  | 'refund.completed'
  | 'refund.failed'
  | 'dispute.opened'
  | 'dispute.resolved'
  | 'dispute.escalated';

export interface MarketplaceEvent<T = any> {
  id: string;
  type: MarketplaceEventType;
  payload: T;
  metadata: {
    timestamp: string;
    source: string;
    correlationId?: string;
    tenantId?: string;
    userId?: string;
    version: number;
  };
  retryCount?: number;
}

interface EventHandler<T = any> {
  (event: MarketplaceEvent<T>): Promise<void>;
}

interface DLQEntry {
  event: MarketplaceEvent;
  error: string;
  failedAt: string;
  retryCount: number;
  originalChannel: string;
}

// Event handlers registry
const handlers: Map<MarketplaceEventType, Set<EventHandler>> = new Map();

// Subscription status
let isSubscribed = false;

/**
 * AUDIT FIX WH-1: Initialize event bus
 */
export async function initEventBus(): Promise<void> {
  if (isSubscribed) {
    log.warn('Event bus already initialized');
    return;
  }

  try {
    const sub = getSub();
    
    // Subscribe to all marketplace events
    await sub.psubscribe(`${EVENT_CHANNEL_PREFIX}*`);
    
    sub.on('pmessage', async (pattern, channel, message) => {
      try {
        const event = JSON.parse(message) as MarketplaceEvent;
        await handleEvent(event, channel);
      } catch (error: any) {
        log.error('Failed to process event message', {
          channel,
          error: error.message
        });
      }
    });

    isSubscribed = true;
    log.info('Event bus initialized');
  } catch (error: any) {
    log.error('Failed to initialize event bus', { error: error.message });
    throw error;
  }
}

/**
 * AUDIT FIX WH-1/WH-H2: Publish an event with retry
 */
export async function publishEvent<T>(
  type: MarketplaceEventType,
  payload: T,
  options: {
    correlationId?: string;
    tenantId?: string;
    userId?: string;
  } = {}
): Promise<string> {
  const event: MarketplaceEvent<T> = {
    id: randomUUID(),
    type,
    payload,
    metadata: {
      timestamp: new Date().toISOString(),
      source: 'marketplace-service',
      correlationId: options.correlationId,
      tenantId: options.tenantId,
      userId: options.userId,
      version: 1
    },
    retryCount: 0
  };

  const channel = `${EVENT_CHANNEL_PREFIX}${type}`;
  
  // Try to publish with retry
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const pub = getPub();
      await pub.publish(channel, JSON.stringify(event));
      
      // Store event in log for replay
      await storeEventLog(event);
      
      // Update metrics
      registry.incrementCounter('marketplace_events_published_total', {
        type,
        success: 'true'
      });
      
      log.debug('Event published', { eventId: event.id, type, channel });
      return event.id;
    } catch (error: any) {
      lastError = error;
      
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        log.warn('Event publish failed, retrying', {
          eventId: event.id,
          attempt,
          delay,
          error: error.message
        });
        await sleep(delay);
      }
    }
  }

  // All retries failed - send to DLQ
  log.error('Event publish failed after retries', {
    eventId: event.id,
    type,
    error: lastError?.message
  });
  
  await addToDLQ(event, lastError?.message || 'Unknown error', channel);
  
  registry.incrementCounter('marketplace_events_published_total', {
    type,
    success: 'false'
  });
  
  throw lastError;
}

/**
 * AUDIT FIX WH-1: Subscribe to events
 */
export function subscribe<T>(
  type: MarketplaceEventType,
  handler: EventHandler<T>
): () => void {
  if (!handlers.has(type)) {
    handlers.set(type, new Set());
  }
  
  handlers.get(type)!.add(handler as EventHandler);
  log.debug('Event handler registered', { type });
  
  // Return unsubscribe function
  return () => {
    handlers.get(type)?.delete(handler as EventHandler);
    log.debug('Event handler unregistered', { type });
  };
}

/**
 * Handle incoming event
 */
async function handleEvent(event: MarketplaceEvent, channel: string): Promise<void> {
  const eventHandlers = handlers.get(event.type);
  
  if (!eventHandlers || eventHandlers.size === 0) {
    log.debug('No handlers for event type', { type: event.type });
    return;
  }

  for (const handler of eventHandlers) {
    try {
      await handler(event);
      
      registry.incrementCounter('marketplace_events_handled_total', {
        type: event.type,
        success: 'true'
      });
    } catch (error: any) {
      log.error('Event handler failed', {
        eventId: event.id,
        type: event.type,
        error: error.message
      });
      
      registry.incrementCounter('marketplace_events_handled_total', {
        type: event.type,
        success: 'false'
      });
      
      // Add failed event to DLQ
      await addToDLQ(event, error.message, channel);
    }
  }
}

/**
 * AUDIT FIX WH-2: Add event to dead letter queue
 */
async function addToDLQ(
  event: MarketplaceEvent,
  error: string,
  originalChannel: string
): Promise<void> {
  try {
    const redis = getRedis();
    const dlqEntry: DLQEntry = {
      event,
      error,
      failedAt: new Date().toISOString(),
      retryCount: event.retryCount || 0,
      originalChannel
    };

    const key = `${DLQ_KEY_PREFIX}${event.id}`;
    await redis.set(key, JSON.stringify(dlqEntry), 'EX', DLQ_RETENTION_HOURS * 3600);
    
    // Also add to a sorted set for ordered retrieval
    const listKey = `${DLQ_KEY_PREFIX}list`;
    await redis.zadd(listKey, Date.now().toString(), event.id);
    
    registry.incrementCounter('marketplace_dlq_entries_total', {
      type: event.type
    });
    
    log.warn('Event added to DLQ', {
      eventId: event.id,
      type: event.type,
      error
    });
  } catch (dlqError: any) {
    log.error('Failed to add event to DLQ', {
      eventId: event.id,
      error: dlqError.message
    });
  }
}

/**
 * Store event in log for replay
 */
async function storeEventLog(event: MarketplaceEvent): Promise<void> {
  try {
    const redis = getRedis();
    const key = `${EVENT_LOG_KEY}${event.id}`;
    
    // Store for 24 hours for replay capability
    await redis.set(key, JSON.stringify(event), 'EX', 86400);
  } catch (error: any) {
    log.warn('Failed to store event log', {
      eventId: event.id,
      error: error.message
    });
  }
}

/**
 * AUDIT FIX GD-H3: Get DLQ entries (admin interface)
 */
export async function getDLQEntries(
  limit: number = 100,
  offset: number = 0
): Promise<DLQEntry[]> {
  try {
    const redis = getRedis();
    const listKey = `${DLQ_KEY_PREFIX}list`;
    
    // Get event IDs from sorted set
    const eventIds = await redis.zrevrange(listKey, offset, offset + limit - 1);
    
    // Get full entries
    const entries: DLQEntry[] = [];
    for (const eventId of eventIds) {
      const key = `${DLQ_KEY_PREFIX}${eventId}`;
      const data = await redis.get(key);
      if (data) {
        entries.push(JSON.parse(data));
      }
    }
    
    return entries;
  } catch (error: any) {
    log.error('Failed to get DLQ entries', { error: error.message });
    return [];
  }
}

/**
 * AUDIT FIX GD-H2: Retry DLQ entry
 */
export async function retryDLQEntry(eventId: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `${DLQ_KEY_PREFIX}${eventId}`;
    const data = await redis.get(key);
    
    if (!data) {
      log.warn('DLQ entry not found', { eventId });
      return false;
    }
    
    const entry: DLQEntry = JSON.parse(data);
    const event = entry.event;
    
    // Increment retry count
    event.retryCount = (event.retryCount || 0) + 1;
    
    // Try to republish
    const pub = getPub();
    await pub.publish(entry.originalChannel, JSON.stringify(event));
    
    // Remove from DLQ
    await redis.del(key);
    await redis.zrem(`${DLQ_KEY_PREFIX}list`, eventId);
    
    log.info('DLQ entry retried', { eventId, type: event.type });
    return true;
  } catch (error: any) {
    log.error('Failed to retry DLQ entry', {
      eventId,
      error: error.message
    });
    return false;
  }
}

/**
 * AUDIT FIX GD-H2: Retry all DLQ entries
 */
export async function retryAllDLQEntries(): Promise<{ success: number; failed: number }> {
  const entries = await getDLQEntries(1000);
  let success = 0;
  let failed = 0;
  
  for (const entry of entries) {
    const result = await retryDLQEntry(entry.event.id);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }
  
  log.info('DLQ retry completed', { success, failed });
  return { success, failed };
}

/**
 * Remove entry from DLQ (admin)
 */
export async function removeDLQEntry(eventId: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `${DLQ_KEY_PREFIX}${eventId}`;
    
    await redis.del(key);
    await redis.zrem(`${DLQ_KEY_PREFIX}list`, eventId);
    
    log.info('DLQ entry removed', { eventId });
    return true;
  } catch (error: any) {
    log.error('Failed to remove DLQ entry', {
      eventId,
      error: error.message
    });
    return false;
  }
}

/**
 * AUDIT FIX #13: Clean up expired DLQ entries
 * Removes stale entries from the sorted set where the actual data has expired
 */
export async function cleanupExpiredDLQEntries(): Promise<number> {
  try {
    const redis = getRedis();
    const listKey = `${DLQ_KEY_PREFIX}list`;
    
    // Get all event IDs from sorted set
    const eventIds = await redis.zrange(listKey, 0, -1);
    let removedCount = 0;
    
    for (const eventId of eventIds) {
      const key = `${DLQ_KEY_PREFIX}${eventId}`;
      const exists = await redis.exists(key);
      
      if (!exists) {
        // Entry has expired, remove from sorted set
        await redis.zrem(listKey, eventId);
        removedCount++;
      }
    }
    
    // Also remove entries older than retention period from sorted set
    const cutoffTime = Date.now() - (DLQ_RETENTION_HOURS * 3600 * 1000);
    const removedByScore = await redis.zremrangebyscore(listKey, '-inf', cutoffTime.toString());
    removedCount += removedByScore;
    
    if (removedCount > 0) {
      log.info('DLQ cleanup completed', { removedCount });
    }
    
    return removedCount;
  } catch (error: any) {
    log.error('Failed to cleanup DLQ entries', { error: error.message });
    return 0;
  }
}

/**
 * AUDIT FIX #13: Start DLQ cleanup scheduler
 * Runs cleanup every hour
 */
let dlqCleanupInterval: NodeJS.Timeout | null = null;

export function startDLQCleanupScheduler(intervalMs: number = 3600000): void {
  if (dlqCleanupInterval) {
    log.warn('DLQ cleanup scheduler already running');
    return;
  }
  
  // Run immediately on startup
  cleanupExpiredDLQEntries();
  
  // Schedule periodic cleanup
  dlqCleanupInterval = setInterval(async () => {
    try {
      await cleanupExpiredDLQEntries();
    } catch (error: any) {
      log.error('DLQ scheduled cleanup failed', { error: error.message });
    }
  }, intervalMs);
  
  log.info('DLQ cleanup scheduler started', { intervalMs });
}

export function stopDLQCleanupScheduler(): void {
  if (dlqCleanupInterval) {
    clearInterval(dlqCleanupInterval);
    dlqCleanupInterval = null;
    log.info('DLQ cleanup scheduler stopped');
  }
}

/**
 * Get DLQ statistics
 */
export async function getDLQStats(): Promise<{
  totalEntries: number;
  byType: Record<string, number>;
}> {
  try {
    const redis = getRedis();
    const listKey = `${DLQ_KEY_PREFIX}list`;
    
    const totalEntries = await redis.zcard(listKey);
    const entries = await getDLQEntries(1000);
    
    const byType: Record<string, number> = {};
    for (const entry of entries) {
      byType[entry.event.type] = (byType[entry.event.type] || 0) + 1;
    }
    
    return { totalEntries, byType };
  } catch (error: any) {
    log.error('Failed to get DLQ stats', { error: error.message });
    return { totalEntries: 0, byType: {} };
  }
}

/**
 * Close event bus
 */
export async function closeEventBus(): Promise<void> {
  if (!isSubscribed) return;
  
  try {
    const sub = getSub();
    await sub.punsubscribe(`${EVENT_CHANNEL_PREFIX}*`);
    isSubscribed = false;
    handlers.clear();
    log.info('Event bus closed');
  } catch (error: any) {
    log.error('Failed to close event bus', { error: error.message });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export event bus singleton
export const eventBus = {
  init: initEventBus,
  publish: publishEvent,
  subscribe,
  close: closeEventBus,
  dlq: {
    getEntries: getDLQEntries,
    retry: retryDLQEntry,
    retryAll: retryAllDLQEntries,
    remove: removeDLQEntry,
    getStats: getDLQStats,
    cleanup: cleanupExpiredDLQEntries,
    startCleanupScheduler: startDLQCleanupScheduler,
    stopCleanupScheduler: stopDLQCleanupScheduler
  }
};
