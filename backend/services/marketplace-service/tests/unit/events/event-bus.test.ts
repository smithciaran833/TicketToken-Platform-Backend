/**
 * Unit Tests for Event Bus
 * Tests Redis Pub/Sub event system with DLQ
 */

import {
  initEventBus,
  publishEvent,
  subscribe,
  closeEventBus,
  getDLQEntries,
  retryDLQEntry,
  retryAllDLQEntries,
  removeDLQEntry,
  cleanupExpiredDLQEntries,
  startDLQCleanupScheduler,
  stopDLQCleanupScheduler,
  getDLQStats,
  eventBus,
  MarketplaceEventType,
} from '../../../src/events/event-bus';

// Mock dependencies
const mockRedis = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(1),
  zadd: jest.fn().mockResolvedValue(1),
  zrange: jest.fn().mockResolvedValue([]),
  zrevrange: jest.fn().mockResolvedValue([]),
  zrem: jest.fn().mockResolvedValue(1),
  zremrangebyscore: jest.fn().mockResolvedValue(0),
  zcard: jest.fn().mockResolvedValue(0),
};

const mockPub = {
  publish: jest.fn().mockResolvedValue(1),
};

const mockSub = {
  psubscribe: jest.fn().mockResolvedValue(undefined),
  punsubscribe: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(() => mockRedis),
  getPub: jest.fn(() => mockPub),
  getSub: jest.fn(() => mockSub),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

jest.mock('../../../src/utils/metrics', () => ({
  registry: {
    incrementCounter: jest.fn(),
  },
}));

describe('Event Bus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    stopDLQCleanupScheduler();
  });

  describe('initEventBus', () => {
    it('should subscribe to marketplace events channel', async () => {
      await initEventBus();
      expect(mockSub.psubscribe).toHaveBeenCalledWith('marketplace:events:*');
    });

    it('should set up pmessage handler', async () => {
      await initEventBus();
      expect(mockSub.on).toHaveBeenCalledWith('pmessage', expect.any(Function));
    });

    it('should warn if already initialized', async () => {
      const { logger } = require('../../../src/utils/logger');
      // Call twice
      await initEventBus();
      await initEventBus();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('publishEvent', () => {
    it('should publish event to Redis', async () => {
      const eventId = await publishEvent('listing.created', { listingId: 'test-123' });

      expect(eventId).toBeDefined();
      expect(mockPub.publish).toHaveBeenCalledWith(
        'marketplace:events:listing.created',
        expect.any(String)
      );
    });

    it('should include metadata in event', async () => {
      await publishEvent('listing.created', { listingId: 'test-123' }, {
        correlationId: 'corr-123',
        tenantId: 'tenant-abc',
        userId: 'user-456',
      });

      const publishCall = mockPub.publish.mock.calls[0];
      const publishedEvent = JSON.parse(publishCall[1]);

      expect(publishedEvent.metadata.correlationId).toBe('corr-123');
      expect(publishedEvent.metadata.tenantId).toBe('tenant-abc');
      expect(publishedEvent.metadata.userId).toBe('user-456');
    });

    it('should store event in log', async () => {
      await publishEvent('listing.updated', { listingId: 'test-123' });

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('marketplace:event-log:'),
        expect.any(String),
        'EX',
        86400
      );
    });

    it('should retry on publish failure', async () => {
      mockPub.publish
        .mockRejectedValueOnce(new Error('Connection error'))
        .mockResolvedValueOnce(1);

      await publishEvent('listing.created', { listingId: 'test-123' });

      expect(mockPub.publish).toHaveBeenCalledTimes(2);
    });

    it('should add to DLQ after max retries', async () => {
      mockPub.publish.mockRejectedValue(new Error('Persistent failure'));

      await expect(
        publishEvent('listing.created', { listingId: 'test-123' })
      ).rejects.toThrow('Persistent failure');

      // Should have stored in DLQ
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('marketplace:dlq:'),
        expect.any(String),
        'EX',
        expect.any(Number)
      );
    });

    it('should increment metrics on success', async () => {
      const { registry } = require('../../../src/utils/metrics');

      await publishEvent('listing.created', { listingId: 'test-123' });

      expect(registry.incrementCounter).toHaveBeenCalledWith(
        'marketplace_events_published_total',
        { type: 'listing.created', success: 'true' }
      );
    });
  });

  describe('subscribe', () => {
    it('should register event handler', () => {
      const handler = jest.fn();
      const unsubscribe = subscribe('listing.created', handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should return unsubscribe function', () => {
      const handler = jest.fn();
      const unsubscribe = subscribe('listing.created', handler);

      unsubscribe();
      // Handler should be unregistered
    });
  });

  describe('DLQ Operations', () => {
    describe('getDLQEntries', () => {
      it('should retrieve DLQ entries with pagination', async () => {
        mockRedis.zrevrange.mockResolvedValue(['event-1', 'event-2']);
        mockRedis.get
          .mockResolvedValueOnce(JSON.stringify({ event: { id: 'event-1', type: 'listing.created' } }))
          .mockResolvedValueOnce(JSON.stringify({ event: { id: 'event-2', type: 'listing.updated' } }));

        const entries = await getDLQEntries(10, 0);

        expect(entries).toHaveLength(2);
        expect(mockRedis.zrevrange).toHaveBeenCalledWith('marketplace:dlq:list', 0, 9);
      });

      it('should handle missing entries', async () => {
        mockRedis.zrevrange.mockResolvedValue(['event-1']);
        mockRedis.get.mockResolvedValue(null);

        const entries = await getDLQEntries();

        expect(entries).toHaveLength(0);
      });
    });

    describe('retryDLQEntry', () => {
      it('should republish event and remove from DLQ', async () => {
        const dlqEntry = {
          event: { id: 'event-123', type: 'listing.created', payload: {} },
          error: 'Test error',
          originalChannel: 'marketplace:events:listing.created',
        };
        mockRedis.get.mockResolvedValue(JSON.stringify(dlqEntry));

        const result = await retryDLQEntry('event-123');

        expect(result).toBe(true);
        expect(mockPub.publish).toHaveBeenCalled();
        expect(mockRedis.del).toHaveBeenCalled();
        expect(mockRedis.zrem).toHaveBeenCalled();
      });

      it('should return false if entry not found', async () => {
        mockRedis.get.mockResolvedValue(null);

        const result = await retryDLQEntry('nonexistent');

        expect(result).toBe(false);
      });

      it('should increment retry count', async () => {
        const dlqEntry = {
          event: { id: 'event-123', type: 'listing.created', payload: {}, retryCount: 2 },
          error: 'Test error',
          originalChannel: 'marketplace:events:listing.created',
        };
        mockRedis.get.mockResolvedValue(JSON.stringify(dlqEntry));

        await retryDLQEntry('event-123');

        const publishCall = mockPub.publish.mock.calls[0];
        const republishedEvent = JSON.parse(publishCall[1]);
        expect(republishedEvent.retryCount).toBe(3);
      });
    });

    describe('retryAllDLQEntries', () => {
      it('should retry all entries and return counts', async () => {
        mockRedis.zrevrange.mockResolvedValue(['event-1', 'event-2']);
        const dlqEntry = {
          event: { id: 'event-1', type: 'listing.created', payload: {} },
          error: 'Test error',
          originalChannel: 'marketplace:events:listing.created',
        };
        mockRedis.get.mockResolvedValue(JSON.stringify(dlqEntry));

        const result = await retryAllDLQEntries();

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('failed');
      });
    });

    describe('removeDLQEntry', () => {
      it('should delete entry from Redis', async () => {
        const result = await removeDLQEntry('event-123');

        expect(result).toBe(true);
        expect(mockRedis.del).toHaveBeenCalledWith('marketplace:dlq:event-123');
        expect(mockRedis.zrem).toHaveBeenCalledWith('marketplace:dlq:list', 'event-123');
      });
    });

    describe('cleanupExpiredDLQEntries', () => {
      it('should remove entries where data has expired', async () => {
        mockRedis.zrange.mockResolvedValue(['event-1', 'event-2']);
        mockRedis.exists
          .mockResolvedValueOnce(0) // event-1 expired
          .mockResolvedValueOnce(1); // event-2 exists

        const removed = await cleanupExpiredDLQEntries();

        expect(mockRedis.zrem).toHaveBeenCalledWith('marketplace:dlq:list', 'event-1');
        expect(removed).toBeGreaterThanOrEqual(1);
      });

      it('should remove entries older than retention period', async () => {
        mockRedis.zrange.mockResolvedValue([]);

        await cleanupExpiredDLQEntries();

        expect(mockRedis.zremrangebyscore).toHaveBeenCalled();
      });
    });

    describe('getDLQStats', () => {
      it('should return total count and by-type breakdown', async () => {
        mockRedis.zcard.mockResolvedValue(5);
        mockRedis.zrevrange.mockResolvedValue(['event-1', 'event-2']);
        mockRedis.get
          .mockResolvedValueOnce(JSON.stringify({ event: { type: 'listing.created' } }))
          .mockResolvedValueOnce(JSON.stringify({ event: { type: 'listing.created' } }));

        const stats = await getDLQStats();

        expect(stats.totalEntries).toBe(5);
        expect(stats.byType).toBeDefined();
      });
    });
  });

  describe('DLQ Cleanup Scheduler', () => {
    it('should start cleanup scheduler', () => {
      startDLQCleanupScheduler(60000);
      // Should run cleanup immediately
      expect(mockRedis.zrange).toHaveBeenCalled();
    });

    it('should stop cleanup scheduler', () => {
      startDLQCleanupScheduler(60000);
      stopDLQCleanupScheduler();
      // No assertions needed, just ensure no errors
    });

    it('should warn if scheduler already running', () => {
      const { logger } = require('../../../src/utils/logger');
      startDLQCleanupScheduler(60000);
      startDLQCleanupScheduler(60000);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('closeEventBus', () => {
    it('should unsubscribe from Redis', async () => {
      await initEventBus();
      await closeEventBus();

      expect(mockSub.punsubscribe).toHaveBeenCalledWith('marketplace:events:*');
    });
  });

  describe('eventBus singleton', () => {
    it('should expose all functions', () => {
      expect(eventBus.init).toBeDefined();
      expect(eventBus.publish).toBeDefined();
      expect(eventBus.subscribe).toBeDefined();
      expect(eventBus.close).toBeDefined();
      expect(eventBus.dlq).toBeDefined();
      expect(eventBus.dlq.getEntries).toBeDefined();
      expect(eventBus.dlq.retry).toBeDefined();
      expect(eventBus.dlq.retryAll).toBeDefined();
      expect(eventBus.dlq.remove).toBeDefined();
      expect(eventBus.dlq.getStats).toBeDefined();
      expect(eventBus.dlq.cleanup).toBeDefined();
      expect(eventBus.dlq.startCleanupScheduler).toBeDefined();
      expect(eventBus.dlq.stopCleanupScheduler).toBeDefined();
    });
  });
});
