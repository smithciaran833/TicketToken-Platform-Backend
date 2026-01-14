/**
 * Comprehensive Unit Tests for src/utils/events.ts
 *
 * Tests event creation, metadata, and deduplication
 */

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

import {
  createEventMetadata,
  createEvent,
  createTransactionProcessedEvent,
  createNFTMintedEvent,
  createNFTTransferredEvent,
  createNFTBurnedEvent,
  EventDeduplicator,
  initializeEventDeduplicator,
  getEventDeduplicator,
  serializeEvent,
  deserializeEvent,
  isValidEvent,
  BlockchainEventType,
  EVENT_VERSIONS,
} from '../../../src/utils/events';

describe('src/utils/events.ts - Comprehensive Unit Tests', () => {
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Redis client
    mockRedisClient = {
      exists: jest.fn(),
      setex: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
    };

    // Reset singleton
    (global as any).deduplicatorInstance = null;
  });

  // =============================================================================
  // EVENT METADATA CREATION
  // =============================================================================

  describe('createEventMetadata()', () => {
    it('should create metadata with required fields', () => {
      const metadata = createEventMetadata(BlockchainEventType.TRANSACTION_PROCESSED);

      expect(metadata.eventId).toBeDefined();
      expect(metadata.eventType).toBe(BlockchainEventType.TRANSACTION_PROCESSED);
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
      expect(metadata.source).toBeDefined();
    });

    it('should use provided event ID', () => {
      const customId = 'custom-event-id-123';
      const metadata = createEventMetadata(BlockchainEventType.TRANSACTION_PROCESSED, {
        eventId: customId,
      });

      expect(metadata.eventId).toBe(customId);
    });

    it('should include optional fields when provided', () => {
      const metadata = createEventMetadata(BlockchainEventType.TRANSACTION_PROCESSED, {
        correlationId: 'corr-123',
        tenantId: 'tenant-456',
        causationId: 'cause-789',
      });

      expect(metadata.correlationId).toBe('corr-123');
      expect(metadata.tenantId).toBe('tenant-456');
      expect(metadata.causationId).toBe('cause-789');
    });

    it('should use custom version when provided', () => {
      const metadata = createEventMetadata(BlockchainEventType.TRANSACTION_PROCESSED, {
        version: '2.0.0',
      });

      expect(metadata.version).toBe('2.0.0');
    });

    it('should use default version from EVENT_VERSIONS', () => {
      const metadata = createEventMetadata(BlockchainEventType.NFT_MINTED);

      expect(metadata.version).toBe(EVENT_VERSIONS[BlockchainEventType.NFT_MINTED]);
    });

    it('should use 1.0.0 for unknown event types', () => {
      const metadata = createEventMetadata('custom.event.type');

      expect(metadata.version).toBe('1.0.0');
    });

    it('should generate valid UUID format for event ID', () => {
      const metadata = createEventMetadata(BlockchainEventType.TRANSACTION_PROCESSED);

      // UUID v4 format
      expect(metadata.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  // =============================================================================
  // EVENT CREATION
  // =============================================================================

  describe('createEvent()', () => {
    it('should create event with metadata and payload', () => {
      const payload = { signature: 'sig123', slot: 12345 };
      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, payload);

      expect(event.metadata).toBeDefined();
      expect(event.payload).toEqual(payload);
      expect(event.metadata.eventType).toBe(BlockchainEventType.TRANSACTION_PROCESSED);
    });

    it('should create deterministic ID when requested', () => {
      const payload = { signature: 'sig123', slot: 12345 };
      const event1 = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, payload, {
        deterministicId: true,
      });
      const event2 = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, payload, {
        deterministicId: true,
      });

      expect(event1.metadata.eventId).toBe(event2.metadata.eventId);
      expect(event1.metadata.eventId).toHaveLength(32); // SHA256 substring
    });

    it('should create different IDs for different payloads', () => {
      const payload1 = { signature: 'sig123', slot: 12345 };
      const payload2 = { signature: 'sig456', slot: 67890 };
      
      const event1 = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, payload1, {
        deterministicId: true,
      });
      const event2 = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, payload2, {
        deterministicId: true,
      });

      expect(event1.metadata.eventId).not.toBe(event2.metadata.eventId);
    });

    it('should pass options to metadata creation', () => {
      const payload = { data: 'test' };
      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, payload, {
        correlationId: 'corr-123',
        tenantId: 'tenant-456',
      });

      expect(event.metadata.correlationId).toBe('corr-123');
      expect(event.metadata.tenantId).toBe('tenant-456');
    });
  });

  // =============================================================================
  // SPECIFIC EVENT FACTORIES
  // =============================================================================

  describe('Specific Event Factories', () => {
    describe('createTransactionProcessedEvent()', () => {
      it('should create transaction processed event', () => {
        const payload = {
          signature: 'sig123',
          slot: 12345,
          blockTime: 1234567890,
          success: true,
          instructionTypes: ['transfer', 'mint'],
          affectedAccounts: ['addr1', 'addr2'],
        };

        const event = createTransactionProcessedEvent(payload);

        expect(event.metadata.eventType).toBe(BlockchainEventType.TRANSACTION_PROCESSED);
        expect(event.payload).toEqual(payload);
      });

      it('should use deterministic ID', () => {
        const payload = {
          signature: 'sig123',
          slot: 12345,
          blockTime: null,
          success: true,
          instructionTypes: [],
          affectedAccounts: [],
        };

        const event1 = createTransactionProcessedEvent(payload);
        const event2 = createTransactionProcessedEvent(payload);

        expect(event1.metadata.eventId).toBe(event2.metadata.eventId);
      });

      it('should include options in metadata', () => {
        const payload = {
          signature: 'sig123',
          slot: 12345,
          blockTime: null,
          success: true,
          instructionTypes: [],
          affectedAccounts: [],
        };

        const event = createTransactionProcessedEvent(payload, {
          correlationId: 'corr-123',
          tenantId: 'tenant-456',
        });

        expect(event.metadata.correlationId).toBe('corr-123');
        expect(event.metadata.tenantId).toBe('tenant-456');
      });
    });

    describe('createNFTMintedEvent()', () => {
      it('should create NFT minted event', () => {
        const payload = {
          tokenId: 'token-123',
          owner: 'owner-addr',
          transactionSignature: 'sig-abc',
          slot: 12345,
          ticketId: 'ticket-789',
        };

        const event = createNFTMintedEvent(payload);

        expect(event.metadata.eventType).toBe(BlockchainEventType.NFT_MINTED);
        expect(event.payload).toEqual(payload);
      });

      it('should use deterministic ID', () => {
        const payload = {
          tokenId: 'token-123',
          owner: 'owner-addr',
          transactionSignature: 'sig-abc',
          slot: 12345,
        };

        const event1 = createNFTMintedEvent(payload);
        const event2 = createNFTMintedEvent(payload);

        expect(event1.metadata.eventId).toBe(event2.metadata.eventId);
      });
    });

    describe('createNFTTransferredEvent()', () => {
      it('should create NFT transferred event', () => {
        const payload = {
          tokenId: 'token-123',
          previousOwner: 'owner1',
          newOwner: 'owner2',
          transactionSignature: 'sig-abc',
          slot: 12345,
        };

        const event = createNFTTransferredEvent(payload);

        expect(event.metadata.eventType).toBe(BlockchainEventType.NFT_TRANSFERRED);
        expect(event.payload).toEqual(payload);
      });
    });

    describe('createNFTBurnedEvent()', () => {
      it('should create NFT burned event', () => {
        const payload = {
          tokenId: 'token-123',
          transactionSignature: 'sig-abc',
          slot: 12345,
        };

        const event = createNFTBurnedEvent(payload);

        expect(event.metadata.eventType).toBe(BlockchainEventType.NFT_BURNED);
        expect(event.payload).toEqual(payload);
      });
    });
  });

  // =============================================================================
  // EVENT DEDUPLICATOR - CONSTRUCTOR
  // =============================================================================

  describe('EventDeduplicator - Constructor', () => {
    it('should create deduplicator with Redis client', () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      expect(deduplicator).toBeInstanceOf(EventDeduplicator);
    });

    it('should use default key prefix', () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      expect(deduplicator).toBeDefined();
    });

    it('should use custom key prefix when provided', () => {
      const deduplicator = new EventDeduplicator({
        redis: mockRedisClient,
        keyPrefix: 'custom:prefix:',
      });
      expect(deduplicator).toBeDefined();
    });

    it('should use custom TTL when provided', () => {
      const deduplicator = new EventDeduplicator({
        redis: mockRedisClient,
        ttlSeconds: 3600,
      });
      expect(deduplicator).toBeDefined();
    });
  });

  // =============================================================================
  // EVENT DEDUPLICATOR - IS DUPLICATE
  // =============================================================================

  describe('EventDeduplicator - isDuplicate()', () => {
    it('should return true when event exists', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.exists.mockResolvedValue(1);

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      const result = await deduplicator.isDuplicate(event);

      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(
        expect.stringContaining(event.metadata.eventId)
      );
    });

    it('should return false when event does not exist', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.exists.mockResolvedValue(0);

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      const result = await deduplicator.isDuplicate(event);

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.exists.mockRejectedValue(new Error('Redis error'));

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      const result = await deduplicator.isDuplicate(event);

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use correct key format', async () => {
      const deduplicator = new EventDeduplicator({
        redis: mockRedisClient,
        keyPrefix: 'test:',
      });
      mockRedisClient.exists.mockResolvedValue(0);

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      await deduplicator.isDuplicate(event);

      expect(mockRedisClient.exists).toHaveBeenCalledWith(
        `test:${BlockchainEventType.TRANSACTION_PROCESSED}:${event.metadata.eventId}`
      );
    });
  });

  // =============================================================================
  // EVENT DEDUPLICATOR - MARK PROCESSED
  // =============================================================================

  describe('EventDeduplicator - markProcessed()', () => {
    it('should mark event as processed', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.setex.mockResolvedValue('OK');

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      await deduplicator.markProcessed(event);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        expect.stringContaining(event.metadata.eventId),
        86400, // default TTL
        expect.stringContaining('processedAt')
      );
    });

    it('should use custom TTL', async () => {
      const deduplicator = new EventDeduplicator({
        redis: mockRedisClient,
        ttlSeconds: 3600,
      });
      mockRedisClient.setex.mockResolvedValue('OK');

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      await deduplicator.markProcessed(event);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        expect.any(String),
        3600,
        expect.any(String)
      );
    });

    it('should handle Redis errors gracefully', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      await deduplicator.markProcessed(event);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should store event metadata in Redis', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.setex.mockResolvedValue('OK');

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      await deduplicator.markProcessed(event);

      const storedValue = mockRedisClient.setex.mock.calls[0][2];
      const parsed = JSON.parse(storedValue);

      expect(parsed.processedAt).toBeDefined();
      expect(parsed.eventType).toBe(event.metadata.eventType);
      expect(parsed.source).toBe(event.metadata.source);
    });
  });

  // =============================================================================
  // EVENT DEDUPLICATOR - CHECK AND MARK
  // =============================================================================

  describe('EventDeduplicator - checkAndMark()', () => {
    it('should return true for new event', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.set.mockResolvedValue('OK');

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      const result = await deduplicator.checkAndMark(event);

      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining(event.metadata.eventId),
        expect.any(String),
        'EX',
        86400,
        'NX'
      );
    });

    it('should return false for duplicate event', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.set.mockResolvedValue(null); // Key already exists

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      const result = await deduplicator.checkAndMark(event);

      expect(result).toBe(false);
    });

    it('should return true on Redis error', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      const result = await deduplicator.checkAndMark(event);

      expect(result).toBe(true); // Allow processing on error
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // EVENT DEDUPLICATOR - PROCESS WITH DEDUPLICATION
  // =============================================================================

  describe('EventDeduplicator - processWithDeduplication()', () => {
    it('should process new event', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.set.mockResolvedValue('OK');

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      const processor = jest.fn().mockResolvedValue(undefined);

      const result = await deduplicator.processWithDeduplication(event, processor);

      expect(result.processed).toBe(true);
      expect(processor).toHaveBeenCalledWith(event);
    });

    it('should skip duplicate event', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.set.mockResolvedValue(null); // Duplicate

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      const processor = jest.fn();

      const result = await deduplicator.processWithDeduplication(event, processor);

      expect(result.processed).toBe(false);
      expect(result.reason).toBe('duplicate');
      expect(processor).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: event.metadata.eventId }),
        'Skipping duplicate event'
      );
    });

    it('should throw error when processor fails', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.set.mockResolvedValue('OK');

      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });
      const processor = jest.fn().mockRejectedValue(new Error('Processing failed'));

      await expect(
        deduplicator.processWithDeduplication(event, processor)
      ).rejects.toThrow('Processing failed');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // EVENT DEDUPLICATOR - CLEAR ENTRY
  // =============================================================================

  describe('EventDeduplicator - clearEntry()', () => {
    it('should clear deduplication entry', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.del.mockResolvedValue(1);

      await deduplicator.clearEntry('event-123', 'event.type');

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        expect.stringContaining('event-123')
      );
    });

    it('should handle Redis errors gracefully', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      await deduplicator.clearEntry('event-123', 'event.type');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // EVENT DEDUPLICATOR - GET STATS
  // =============================================================================

  describe('EventDeduplicator - getStats()', () => {
    it('should return stats with key count', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.keys.mockResolvedValue(['key1', 'key2', 'key3']);

      const stats = await deduplicator.getStats();

      expect(stats.keyCount).toBe(3);
      expect(mockRedisClient.keys).toHaveBeenCalledWith('event:dedup:*');
    });

    it('should return zero count on error', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      mockRedisClient.keys.mockRejectedValue(new Error('Redis error'));

      const stats = await deduplicator.getStats();

      expect(stats.keyCount).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use custom key prefix in query', async () => {
      const deduplicator = new EventDeduplicator({
        redis: mockRedisClient,
        keyPrefix: 'custom:',
      });
      mockRedisClient.keys.mockResolvedValue([]);

      await deduplicator.getStats();

      expect(mockRedisClient.keys).toHaveBeenCalledWith('custom:*');
    });
  });

  // =============================================================================
  // SINGLETON FUNCTIONS
  // =============================================================================

  describe('Singleton Functions', () => {
    it('should initialize event deduplicator', () => {
      const deduplicator = initializeEventDeduplicator({ redis: mockRedisClient });

      expect(deduplicator).toBeInstanceOf(EventDeduplicator);
      expect(mockLogger.info).toHaveBeenCalledWith('Event deduplicator initialized');
    });

    it('should return existing instance if already initialized', () => {
      const deduplicator1 = initializeEventDeduplicator({ redis: mockRedisClient });
      const deduplicator2 = initializeEventDeduplicator({ redis: mockRedisClient });

      expect(deduplicator1).toBe(deduplicator2);
    });

    it('should get event deduplicator instance', () => {
      initializeEventDeduplicator({ redis: mockRedisClient });
      const deduplicator = getEventDeduplicator();

      expect(deduplicator).toBeInstanceOf(EventDeduplicator);
    });

    it('should return null if not initialized', () => {
      const deduplicator = getEventDeduplicator();
      expect(deduplicator).toBeNull();
    });
  });

  // =============================================================================
  // EVENT SERIALIZATION
  // =============================================================================

  describe('Event Serialization', () => {
    describe('serializeEvent()', () => {
      it('should serialize event to JSON string', () => {
        const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, {
          signature: 'sig123',
          slot: 12345,
        });

        const serialized = serializeEvent(event);

        expect(typeof serialized).toBe('string');
        const parsed = JSON.parse(serialized);
        expect(parsed.metadata).toBeDefined();
        expect(parsed.payload).toBeDefined();
      });

      it('should handle complex payloads', () => {
        const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
          nullValue: null,
        });

        const serialized = serializeEvent(event);
        const parsed = JSON.parse(serialized);

        expect(parsed.payload.nested.deep.value).toBe(123);
        expect(parsed.payload.array).toEqual([1, 2, 3]);
        expect(parsed.payload.nullValue).toBeNull();
      });
    });

    describe('deserializeEvent()', () => {
      it('should deserialize event from JSON string', () => {
        const original = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, {
          signature: 'sig123',
        });
        const serialized = serializeEvent(original);

        const deserialized = deserializeEvent(serialized);

        expect(deserialized.metadata.eventId).toBe(original.metadata.eventId);
        expect(deserialized.payload).toEqual(original.payload);
      });

      it('should throw error for invalid event structure', () => {
        const invalidJson = JSON.stringify({ invalid: 'structure' });

        expect(() => deserializeEvent(invalidJson)).toThrow(
          'Invalid event structure: missing metadata or payload'
        );
      });

      it('should throw error for missing metadata fields', () => {
        const invalidEvent = JSON.stringify({
          metadata: { timestamp: '2024-01-01' }, // Missing eventId and eventType
          payload: {},
        });

        expect(() => deserializeEvent(invalidEvent)).toThrow(
          'Invalid event metadata: missing eventId or eventType'
        );
      });

      it('should handle events with all metadata fields', () => {
        const event = createEvent(
          BlockchainEventType.TRANSACTION_PROCESSED,
          { test: 'data' },
          {
            correlationId: 'corr-123',
            tenantId: 'tenant-456',
            causationId: 'cause-789',
          }
        );

        const serialized = serializeEvent(event);
        const deserialized = deserializeEvent(serialized);

        expect(deserialized.metadata.correlationId).toBe('corr-123');
        expect(deserialized.metadata.tenantId).toBe('tenant-456');
        expect(deserialized.metadata.causationId).toBe('cause-789');
      });
    });
  });

  // =============================================================================
  // TYPE GUARDS
  // =============================================================================

  describe('isValidEvent()', () => {
    it('should return true for valid event', () => {
      const event = createEvent(BlockchainEventType.TRANSACTION_PROCESSED, { test: 'data' });

      expect(isValidEvent(event)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidEvent(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidEvent(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidEvent('string')).toBe(false);
      expect(isValidEvent(123)).toBe(false);
      expect(isValidEvent(true)).toBe(false);
    });

    it('should return false for missing metadata', () => {
      expect(isValidEvent({ payload: {} })).toBe(false);
    });

    it('should return false for missing payload', () => {
      expect(isValidEvent({
        metadata: {
          eventId: 'id',
          eventType: 'type',
          timestamp: '2024-01-01',
          source: 'source',
        },
      })).toBe(false);
    });

    it('should return false for incomplete metadata', () => {
      expect(isValidEvent({
        metadata: { eventId: 'id' }, // Missing other required fields
        payload: {},
      })).toBe(false);
    });

    it('should return true for event with all required fields', () => {
      const event = {
        metadata: {
          eventId: 'id-123',
          eventType: 'test.event',
          version: '1.0.0',
          timestamp: '2024-01-01T00:00:00Z',
          source: 'test-service',
        },
        payload: { data: 'test' },
      };

      expect(isValidEvent(event)).toBe(true);
    });
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('Integration Tests', () => {
    it('should create, serialize, and deserialize event', () => {
      const payload = {
        signature: 'sig123',
        slot: 12345,
        blockTime: null,
        success: true,
        instructionTypes: [],
        affectedAccounts: [],
      };
      const original = createTransactionProcessedEvent(payload, {
        correlationId: 'corr-123',
      });

      const serialized = serializeEvent(original);
      const deserialized = deserializeEvent(serialized);

      expect(deserialized.metadata.eventId).toBe(original.metadata.eventId);
      expect(deserialized.metadata.correlationId).toBe('corr-123');
      expect(deserialized.payload).toEqual(payload);
      expect(isValidEvent(deserialized)).toBe(true);
    });

    it('should handle full deduplication flow', async () => {
      const deduplicator = new EventDeduplicator({ redis: mockRedisClient });
      const event = createTransactionProcessedEvent({
        signature: 'sig123',
        slot: 12345,
        blockTime: null,
        success: true,
        instructionTypes: [],
        affectedAccounts: [],
      });

      // First processing - should succeed
      mockRedisClient.set.mockResolvedValueOnce('OK');
      const processor1 = jest.fn().mockResolvedValue(undefined);
      const result1 = await deduplicator.processWithDeduplication(event, processor1);

      expect(result1.processed).toBe(true);
      expect(processor1).toHaveBeenCalled();

      // Second processing - should skip
      mockRedisClient.set.mockResolvedValueOnce(null);
      const processor2 = jest.fn();
      const result2 = await deduplicator.processWithDeduplication(event, processor2);

      expect(result2.processed).toBe(false);
      expect(result2.reason).toBe('duplicate');
      expect(processor2).not.toHaveBeenCalled();
    });

    it('should create events with same deterministic ID', () => {
      const payload1 = {
        tokenId: 'token-123',
        owner: 'owner-addr',
        transactionSignature: 'sig-abc',
        slot: 12345,
      };

      const event1 = createNFTMintedEvent(payload1);
      const event2 = createNFTMintedEvent(payload1);
      const event3 = createNFTMintedEvent({ ...payload1, slot: 67890 });

      expect(event1.metadata.eventId).toBe(event2.metadata.eventId);
      expect(event1.metadata.eventId).not.toBe(event3.metadata.eventId);
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export BlockchainEventType enum', () => {
      expect(BlockchainEventType.TRANSACTION_PROCESSED).toBe('blockchain.transaction.processed');
      expect(BlockchainEventType.NFT_MINTED).toBe('blockchain.nft.minted');
    });

    it('should export EVENT_VERSIONS', () => {
      expect(EVENT_VERSIONS[BlockchainEventType.TRANSACTION_PROCESSED]).toBe('1.0.0');
    });

    it('should export all factory functions', () => {
      expect(typeof createEventMetadata).toBe('function');
      expect(typeof createEvent).toBe('function');
      expect(typeof createTransactionProcessedEvent).toBe('function');
      expect(typeof createNFTMintedEvent).toBe('function');
      expect(typeof createNFTTransferredEvent).toBe('function');
      expect(typeof createNFTBurnedEvent).toBe('function');
    });

    it('should export EventDeduplicator class', () => {
      expect(typeof EventDeduplicator).toBe('function');
    });

    it('should export singleton functions', () => {
      expect(typeof initializeEventDeduplicator).toBe('function');
      expect(typeof getEventDeduplicator).toBe('function');
    });

    it('should export serialization functions', () => {
      expect(typeof serializeEvent).toBe('function');
      expect(typeof deserializeEvent).toBe('function');
      expect(typeof isValidEvent).toBe('function');
    });
  });
});
