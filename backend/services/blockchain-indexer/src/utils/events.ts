/**
 * Event Utilities for Blockchain Indexer
 * 
 * AUDIT FIX: EVT-7 - Event deduplication at consumer level
 * AUDIT FIX: EVT-8 - Event metadata (timestamp, version, source)
 */

import { createHash } from 'crypto';
import Redis from 'ioredis';
import logger from './logger';

// =============================================================================
// EVENT METADATA
// AUDIT FIX: EVT-8 - Standardized event metadata
// =============================================================================

/**
 * Event metadata interface
 * AUDIT FIX: EVT-8 - All events must include this metadata
 */
export interface EventMetadata {
  /** Unique event ID (UUID or content-derived hash) */
  eventId: string;
  /** Event type (e.g., 'transaction.processed', 'nft.minted') */
  eventType: string;
  /** Schema version for this event type */
  version: string;
  /** ISO timestamp when event was created */
  timestamp: string;
  /** Service that produced the event */
  source: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Tenant ID for multi-tenancy */
  tenantId?: string;
  /** Causation ID (ID of event that caused this one) */
  causationId?: string;
}

/**
 * Base event interface with metadata
 */
export interface BaseEvent<T = any> {
  metadata: EventMetadata;
  payload: T;
}

/**
 * Event types for blockchain indexer
 */
export enum BlockchainEventType {
  TRANSACTION_PROCESSED = 'blockchain.transaction.processed',
  SLOT_PROCESSED = 'blockchain.slot.processed',
  NFT_MINTED = 'blockchain.nft.minted',
  NFT_TRANSFERRED = 'blockchain.nft.transferred',
  NFT_BURNED = 'blockchain.nft.burned',
  MARKETPLACE_ACTIVITY = 'blockchain.marketplace.activity',
  SYNC_STATUS_CHANGED = 'blockchain.sync.status_changed',
  DISCREPANCY_DETECTED = 'blockchain.discrepancy.detected',
  INDEXER_ERROR = 'blockchain.indexer.error'
}

/**
 * Event version constants
 */
export const EVENT_VERSIONS = {
  [BlockchainEventType.TRANSACTION_PROCESSED]: '1.0.0',
  [BlockchainEventType.SLOT_PROCESSED]: '1.0.0',
  [BlockchainEventType.NFT_MINTED]: '1.0.0',
  [BlockchainEventType.NFT_TRANSFERRED]: '1.0.0',
  [BlockchainEventType.NFT_BURNED]: '1.0.0',
  [BlockchainEventType.MARKETPLACE_ACTIVITY]: '1.0.0',
  [BlockchainEventType.SYNC_STATUS_CHANGED]: '1.0.0',
  [BlockchainEventType.DISCREPANCY_DETECTED]: '1.0.0',
  [BlockchainEventType.INDEXER_ERROR]: '1.0.0'
};

const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-indexer';

// =============================================================================
// EVENT FACTORY
// =============================================================================

/**
 * Generate a deterministic event ID from content
 */
function generateEventId(eventType: string, payload: any): string {
  const content = JSON.stringify({ eventType, payload });
  return createHash('sha256').update(content).digest('hex').substring(0, 32);
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Create event metadata
 * AUDIT FIX: EVT-8 - Ensure all events have proper metadata
 */
export function createEventMetadata(
  eventType: BlockchainEventType | string,
  options: {
    correlationId?: string;
    tenantId?: string;
    causationId?: string;
    eventId?: string;
    version?: string;
  } = {}
): EventMetadata {
  return {
    eventId: options.eventId || generateUUID(),
    eventType,
    version: options.version || EVENT_VERSIONS[eventType as BlockchainEventType] || '1.0.0',
    timestamp: new Date().toISOString(),
    source: SERVICE_NAME,
    correlationId: options.correlationId,
    tenantId: options.tenantId,
    causationId: options.causationId
  };
}

/**
 * Create a complete event with metadata
 */
export function createEvent<T>(
  eventType: BlockchainEventType | string,
  payload: T,
  options: {
    correlationId?: string;
    tenantId?: string;
    causationId?: string;
    deterministicId?: boolean;
  } = {}
): BaseEvent<T> {
  const eventId = options.deterministicId 
    ? generateEventId(eventType, payload)
    : undefined;

  return {
    metadata: createEventMetadata(eventType, { ...options, eventId }),
    payload
  };
}

// =============================================================================
// SPECIFIC EVENT FACTORIES
// =============================================================================

export interface TransactionProcessedPayload {
  signature: string;
  slot: number;
  blockTime: number | null;
  success: boolean;
  instructionTypes: string[];
  affectedAccounts: string[];
}

export function createTransactionProcessedEvent(
  payload: TransactionProcessedPayload,
  options: { correlationId?: string; tenantId?: string } = {}
): BaseEvent<TransactionProcessedPayload> {
  return createEvent(BlockchainEventType.TRANSACTION_PROCESSED, payload, {
    ...options,
    deterministicId: true // Deduplication by content
  });
}

export interface NFTMintedPayload {
  tokenId: string;
  owner: string;
  transactionSignature: string;
  slot: number;
  ticketId?: string;
}

export function createNFTMintedEvent(
  payload: NFTMintedPayload,
  options: { correlationId?: string; tenantId?: string } = {}
): BaseEvent<NFTMintedPayload> {
  return createEvent(BlockchainEventType.NFT_MINTED, payload, {
    ...options,
    deterministicId: true
  });
}

export interface NFTTransferredPayload {
  tokenId: string;
  previousOwner: string;
  newOwner: string;
  transactionSignature: string;
  slot: number;
}

export function createNFTTransferredEvent(
  payload: NFTTransferredPayload,
  options: { correlationId?: string; tenantId?: string } = {}
): BaseEvent<NFTTransferredPayload> {
  return createEvent(BlockchainEventType.NFT_TRANSFERRED, payload, {
    ...options,
    deterministicId: true
  });
}

export interface NFTBurnedPayload {
  tokenId: string;
  transactionSignature: string;
  slot: number;
}

export function createNFTBurnedEvent(
  payload: NFTBurnedPayload,
  options: { correlationId?: string; tenantId?: string } = {}
): BaseEvent<NFTBurnedPayload> {
  return createEvent(BlockchainEventType.NFT_BURNED, payload, {
    ...options,
    deterministicId: true
  });
}

// =============================================================================
// EVENT DEDUPLICATION
// AUDIT FIX: EVT-7 - Event deduplication at consumer level
// =============================================================================

export interface DeduplicationConfig {
  /** Redis client */
  redis: Redis;
  /** Key prefix for deduplication entries */
  keyPrefix?: string;
  /** TTL for deduplication entries (seconds) - default 24 hours */
  ttlSeconds?: number;
}

/**
 * Event deduplication utility
 * AUDIT FIX: EVT-7 - Prevents processing duplicate events
 */
export class EventDeduplicator {
  private redis: Redis;
  private keyPrefix: string;
  private ttlSeconds: number;

  constructor(config: DeduplicationConfig) {
    this.redis = config.redis;
    this.keyPrefix = config.keyPrefix || 'event:dedup:';
    this.ttlSeconds = config.ttlSeconds || 86400; // 24 hours default
  }

  /**
   * Build deduplication key
   */
  private buildKey(eventId: string, eventType: string): string {
    return `${this.keyPrefix}${eventType}:${eventId}`;
  }

  /**
   * Check if event is duplicate
   * Returns true if event has already been processed
   */
  async isDuplicate(event: BaseEvent): Promise<boolean> {
    const key = this.buildKey(event.metadata.eventId, event.metadata.eventType);
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error({ error, eventId: event.metadata.eventId }, 'Failed to check event deduplication');
      // Return false to allow processing on Redis failure
      return false;
    }
  }

  /**
   * Mark event as processed
   * Should be called after successful event processing
   */
  async markProcessed(event: BaseEvent): Promise<void> {
    const key = this.buildKey(event.metadata.eventId, event.metadata.eventType);
    try {
      await this.redis.setex(key, this.ttlSeconds, JSON.stringify({
        processedAt: new Date().toISOString(),
        eventType: event.metadata.eventType,
        source: event.metadata.source
      }));
    } catch (error) {
      logger.error({ error, eventId: event.metadata.eventId }, 'Failed to mark event as processed');
    }
  }

  /**
   * Check and mark in single operation (atomic)
   * Returns true if event is new and was marked, false if duplicate
   */
  async checkAndMark(event: BaseEvent): Promise<boolean> {
    const key = this.buildKey(event.metadata.eventId, event.metadata.eventType);
    try {
      // Use SET NX (only set if not exists) with EXPIRE
      const result = await this.redis.set(
        key,
        JSON.stringify({
          processedAt: new Date().toISOString(),
          eventType: event.metadata.eventType,
          source: event.metadata.source
        }),
        'EX',
        this.ttlSeconds,
        'NX'
      );
      
      // Returns 'OK' if key was set (event is new), null if key exists (duplicate)
      return result === 'OK';
    } catch (error) {
      logger.error({ error, eventId: event.metadata.eventId }, 'Failed atomic deduplication check');
      // Allow processing on Redis failure
      return true;
    }
  }

  /**
   * Process event with deduplication
   * Returns true if event was processed, false if skipped as duplicate
   */
  async processWithDeduplication<T>(
    event: BaseEvent<T>,
    processor: (event: BaseEvent<T>) => Promise<void>
  ): Promise<{ processed: boolean; reason?: string }> {
    // Atomic check and mark
    const isNew = await this.checkAndMark(event);
    
    if (!isNew) {
      logger.debug({
        eventId: event.metadata.eventId,
        eventType: event.metadata.eventType
      }, 'Skipping duplicate event');
      
      return { processed: false, reason: 'duplicate' };
    }

    try {
      await processor(event);
      return { processed: true };
    } catch (error) {
      // On processing failure, consider removing the deduplication entry
      // to allow retry, or leave it to prevent retry storms
      logger.error({
        error,
        eventId: event.metadata.eventId,
        eventType: event.metadata.eventType
      }, 'Event processing failed');
      
      throw error;
    }
  }

  /**
   * Clear deduplication entry (useful for retries)
   */
  async clearEntry(eventId: string, eventType: string): Promise<void> {
    const key = this.buildKey(eventId, eventType);
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error({ error, eventId }, 'Failed to clear deduplication entry');
    }
  }

  /**
   * Get deduplication stats
   */
  async getStats(): Promise<{ keyCount: number }> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      return { keyCount: keys.length };
    } catch (error) {
      logger.error({ error }, 'Failed to get deduplication stats');
      return { keyCount: 0 };
    }
  }
}

// =============================================================================
// SINGLETON DEDUPLICATOR
// =============================================================================

let deduplicatorInstance: EventDeduplicator | null = null;

/**
 * Initialize the event deduplicator
 */
export function initializeEventDeduplicator(config: DeduplicationConfig): EventDeduplicator {
  if (!deduplicatorInstance) {
    deduplicatorInstance = new EventDeduplicator(config);
    logger.info('Event deduplicator initialized');
  }
  return deduplicatorInstance;
}

/**
 * Get the event deduplicator instance
 */
export function getEventDeduplicator(): EventDeduplicator | null {
  return deduplicatorInstance;
}

// =============================================================================
// EVENT SERIALIZATION
// =============================================================================

/**
 * Serialize event for transport (e.g., to message queue)
 */
export function serializeEvent<T>(event: BaseEvent<T>): string {
  return JSON.stringify(event);
}

/**
 * Deserialize event from transport
 */
export function deserializeEvent<T>(data: string): BaseEvent<T> {
  const parsed = JSON.parse(data);
  
  // Validate basic event structure
  if (!parsed.metadata || !parsed.payload) {
    throw new Error('Invalid event structure: missing metadata or payload');
  }
  
  if (!parsed.metadata.eventId || !parsed.metadata.eventType) {
    throw new Error('Invalid event metadata: missing eventId or eventType');
  }
  
  return parsed as BaseEvent<T>;
}

/**
 * Type guard to check if object is a valid BaseEvent
 */
export function isValidEvent(obj: any): obj is BaseEvent {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.metadata &&
    typeof obj.metadata.eventId === 'string' &&
    typeof obj.metadata.eventType === 'string' &&
    typeof obj.metadata.timestamp === 'string' &&
    typeof obj.metadata.source === 'string' &&
    obj.payload !== undefined
  );
}
