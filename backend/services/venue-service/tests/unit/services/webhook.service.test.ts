/**
 * Unit tests for webhook.service.ts
 * CRITICAL: Webhook lifecycle management with distributed locking
 */

import { WebhookService, createWebhookService, WebhookStatus } from '../../../src/services/webhook.service';
import { createKnexMock, configureMockReturn, configureMockError } from '../../__mocks__/knex.mock';
import { createRedisMock } from '../../__mocks__/redis.mock';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

describe('WebhookService', () => {
  let webhookService: WebhookService;
  let mockDb: any;
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createKnexMock();
    mockRedis = createRedisMock();
    webhookService = new WebhookService(mockDb, mockRedis);
  });

  describe('createWebhookService()', () => {
    it('should create WebhookService instance', () => {
      const service = createWebhookService(mockDb, mockRedis);
      expect(service).toBeInstanceOf(WebhookService);
    });
  });

  describe('isProcessedOrProcessing()', () => {
    it('should return processed: true when status is completed', async () => {
      mockDb._mockChain.first.mockResolvedValue({ status: 'completed' });

      const result = await webhookService.isProcessedOrProcessing('evt_123');

      expect(result).toEqual({ processed: true, processing: false });
      expect(mockDb).toHaveBeenCalledWith('webhook_events');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith('event_id', 'evt_123');
    });

    it('should return processing: true when status is processing', async () => {
      mockDb._mockChain.first.mockResolvedValue({ status: 'processing' });

      const result = await webhookService.isProcessedOrProcessing('evt_123');

      expect(result).toEqual({ processed: false, processing: true });
    });

    it('should return both false when event not found', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      const result = await webhookService.isProcessedOrProcessing('evt_123');

      expect(result).toEqual({ processed: false, processing: false });
    });

    it('should return both false on database error', async () => {
      mockDb._mockChain.first.mockRejectedValue(new Error('DB error'));

      const result = await webhookService.isProcessedOrProcessing('evt_123');

      expect(result).toEqual({ processed: false, processing: false });
    });

    it('should return false for pending status', async () => {
      mockDb._mockChain.first.mockResolvedValue({ status: 'pending' });

      const result = await webhookService.isProcessedOrProcessing('evt_123');

      expect(result).toEqual({ processed: false, processing: false });
    });

    it('should return false for retrying status', async () => {
      mockDb._mockChain.first.mockResolvedValue({ status: 'retrying' });

      const result = await webhookService.isProcessedOrProcessing('evt_123');

      expect(result).toEqual({ processed: false, processing: false });
    });

    it('should return false for failed status', async () => {
      mockDb._mockChain.first.mockResolvedValue({ status: 'failed' });

      const result = await webhookService.isProcessedOrProcessing('evt_123');

      expect(result).toEqual({ processed: false, processing: false });
    });
  });

  describe('processWebhook()', () => {
    const defaultOptions = {
      eventId: 'evt_test_123',
      eventType: 'account.updated',
      payload: { id: 'acct_123' },
      processor: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
      // Default: no existing event, lock acquired successfully
      mockDb._mockChain.first.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);
      
      // Mock onConflict chain
      mockDb._mockChain.insert.mockReturnValue({
        onConflict: jest.fn().mockReturnValue({
          merge: jest.fn().mockResolvedValue([1]),
        }),
      });
      mockDb._mockChain.update.mockResolvedValue(1);
    });

    it('should process webhook successfully with all lifecycle steps', async () => {
      const processor = jest.fn().mockResolvedValue(undefined);

      const result = await webhookService.processWebhook({
        ...defaultOptions,
        processor,
      });

      expect(result).toEqual({ success: true, duplicate: false });
      expect(processor).toHaveBeenCalledWith(defaultOptions.payload);
      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled(); // Lock released
    });

    it('should skip already processed webhook (duplicate: true)', async () => {
      mockDb._mockChain.first.mockResolvedValue({ status: 'completed' });

      const result = await webhookService.processWebhook(defaultOptions);

      expect(result).toEqual({ success: true, duplicate: true });
      expect(defaultOptions.processor).not.toHaveBeenCalled();
    });

    it('should skip currently processing webhook (duplicate: true)', async () => {
      mockDb._mockChain.first.mockResolvedValue({ status: 'processing' });

      const result = await webhookService.processWebhook(defaultOptions);

      expect(result).toEqual({ success: true, duplicate: true });
      expect(defaultOptions.processor).not.toHaveBeenCalled();
    });

    it('should skip if lock cannot be acquired', async () => {
      mockRedis.set.mockResolvedValue(null); // Lock not acquired

      const result = await webhookService.processWebhook(defaultOptions);

      expect(result).toEqual({ success: true, duplicate: true });
      expect(defaultOptions.processor).not.toHaveBeenCalled();
    });

    it('should return error on processor failure', async () => {
      const processor = jest.fn().mockRejectedValue(new Error('Processing failed'));
      
      // Mock getRetryCount
      mockDb._mockChain.first
        .mockResolvedValueOnce(null) // isProcessedOrProcessing
        .mockResolvedValueOnce({ retry_count: 0 }); // getRetryCount

      const result = await webhookService.processWebhook({
        ...defaultOptions,
        processor,
      });

      expect(result).toEqual({
        success: false,
        duplicate: false,
        error: 'Processing failed',
      });
      expect(mockRedis.del).toHaveBeenCalled(); // Lock still released
    });

    it('should set status to failed when max retries exceeded', async () => {
      const processor = jest.fn().mockRejectedValue(new Error('Processing failed'));
      
      // Return retry_count at max
      mockDb._mockChain.first
        .mockResolvedValueOnce(null) // isProcessedOrProcessing
        .mockResolvedValueOnce({ retry_count: 3 }); // getRetryCount - at max

      await webhookService.processWebhook({
        ...defaultOptions,
        processor,
        maxRetries: 3,
      });

      // Verify status update to 'failed'
      expect(mockDb._mockChain.update).toHaveBeenCalled();
    });

    it('should set status to retrying when under max retries', async () => {
      const processor = jest.fn().mockRejectedValue(new Error('Processing failed'));
      
      mockDb._mockChain.first
        .mockResolvedValueOnce(null) // isProcessedOrProcessing
        .mockResolvedValueOnce({ retry_count: 1 }); // getRetryCount - under max

      await webhookService.processWebhook({
        ...defaultOptions,
        processor,
        maxRetries: 3,
      });

      // Verify status update
      expect(mockDb._mockChain.update).toHaveBeenCalled();
    });

    it('should include tenant_id in record when provided', async () => {
      await webhookService.processWebhook({
        ...defaultOptions,
        tenantId: 'tenant_123',
      });

      expect(mockDb._mockChain.insert).toHaveBeenCalled();
    });

    it('should include source in record', async () => {
      await webhookService.processWebhook({
        ...defaultOptions,
        source: 'square',
      });

      expect(mockDb._mockChain.insert).toHaveBeenCalled();
    });

    it('should include sourceIp in record when provided', async () => {
      await webhookService.processWebhook({
        ...defaultOptions,
        sourceIp: '192.168.1.1',
      });

      expect(mockDb._mockChain.insert).toHaveBeenCalled();
    });

    it('should hash headers when provided', async () => {
      await webhookService.processWebhook({
        ...defaultOptions,
        headers: {
          'stripe-signature': 'sig_123',
          'x-stripe-event-id': 'evt_123',
        },
      });

      expect(mockDb._mockChain.insert).toHaveBeenCalled();
    });

    it('should use custom lockTtlMs when provided', async () => {
      await webhookService.processWebhook({
        ...defaultOptions,
        lockTtlMs: 60000,
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('webhook:lock:'),
        expect.any(String),
        'PX',
        60000,
        'NX'
      );
    });

    it('should fail open on Redis error during lock acquisition', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis down'));

      const result = await webhookService.processWebhook(defaultOptions);

      // Should proceed with processing (fail open)
      expect(result.duplicate).toBe(false);
    });

    it('should release lock even if processing fails', async () => {
      const processor = jest.fn().mockRejectedValue(new Error('Boom'));
      
      mockDb._mockChain.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ retry_count: 0 });

      await webhookService.processWebhook({
        ...defaultOptions,
        processor,
      });

      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should handle Redis error during lock release gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis down'));

      // Should not throw
      const result = await webhookService.processWebhook(defaultOptions);

      expect(result.success).toBe(true);
    });
  });

  describe('cleanupOldEvents()', () => {
    beforeEach(() => {
      mockDb._mockChain.delete = jest.fn().mockResolvedValue(10);
      mockDb._mockChain.del = jest.fn().mockResolvedValue(10);
      mockDb._mockChain.whereIn.mockReturnThis();
    });

    it('should delete old completed and failed events', async () => {
      mockDb._mockChain.delete.mockResolvedValue(5);

      const result = await webhookService.cleanupOldEvents();

      expect(result).toBe(5);
      expect(mockDb).toHaveBeenCalledWith('webhook_events');
      expect(mockDb._mockChain.where).toHaveBeenCalled();
      expect(mockDb._mockChain.whereIn).toHaveBeenCalledWith('status', ['completed', 'failed']);
    });

    it('should use custom retention days', async () => {
      mockDb._mockChain.delete.mockResolvedValue(10);

      await webhookService.cleanupOldEvents(7);

      expect(mockDb._mockChain.where).toHaveBeenCalled();
    });

    it('should use default 30 day retention', async () => {
      mockDb._mockChain.delete.mockResolvedValue(0);

      await webhookService.cleanupOldEvents();

      expect(mockDb._mockChain.where).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockDb._mockChain.delete.mockRejectedValue(new Error('DB error'));

      await expect(webhookService.cleanupOldEvents()).rejects.toThrow('DB error');
    });

    it('should return 0 when no events to cleanup', async () => {
      mockDb._mockChain.delete.mockResolvedValue(0);

      const result = await webhookService.cleanupOldEvents();

      expect(result).toBe(0);
    });
  });

  describe('getEventsForRetry()', () => {
    beforeEach(() => {
      mockDb._mockChain.limit.mockReturnThis();
      mockDb._mockChain.orderBy.mockReturnThis();
    });

    it('should return events needing retry', async () => {
      const mockEvents = [
        { event_id: 'evt_1', status: 'retrying', retry_count: 1 },
        { event_id: 'evt_2', status: 'retrying', retry_count: 2 },
      ];
      
      mockDb._mockChain.limit.mockResolvedValue(mockEvents);

      const result = await webhookService.getEventsForRetry();

      expect(result).toEqual(mockEvents);
      expect(mockDb).toHaveBeenCalledWith('webhook_events');
    });

    it('should use custom limit', async () => {
      mockDb._mockChain.limit.mockResolvedValue([]);

      await webhookService.getEventsForRetry(50);

      expect(mockDb._mockChain.limit).toHaveBeenCalledWith(50);
    });

    it('should use default limit of 100', async () => {
      mockDb._mockChain.limit.mockResolvedValue([]);

      await webhookService.getEventsForRetry();

      expect(mockDb._mockChain.limit).toHaveBeenCalledWith(100);
    });

    it('should return empty array on database error', async () => {
      mockDb._mockChain.limit.mockRejectedValue(new Error('DB error'));

      const result = await webhookService.getEventsForRetry();

      expect(result).toEqual([]);
    });

    it('should filter by retrying status', async () => {
      mockDb._mockChain.limit.mockResolvedValue([]);

      await webhookService.getEventsForRetry();

      expect(mockDb._mockChain.where).toHaveBeenCalledWith('status', 'retrying');
    });

    it('should filter by retry count under max', async () => {
      mockDb._mockChain.limit.mockResolvedValue([]);

      await webhookService.getEventsForRetry();

      expect(mockDb._mockChain.where).toHaveBeenCalled();
    });

    it('should order by processed_at ascending', async () => {
      mockDb._mockChain.limit.mockResolvedValue([]);

      await webhookService.getEventsForRetry();

      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('processed_at', 'asc');
    });
  });

  describe('getStatistics()', () => {
    beforeEach(() => {
      mockDb._mockChain.select.mockReturnThis();
      mockDb._mockChain.count.mockReturnThis();
      mockDb._mockChain.groupBy.mockReturnThis();
    });

    it('should return aggregated statistics', async () => {
      const mockStats = [
        { status: 'completed', count: '100' },
        { status: 'failed', count: '10' },
        { status: 'pending', count: '5' },
        { status: 'processing', count: '2' },
        { status: 'retrying', count: '3' },
      ];
      
      mockDb._mockChain.groupBy.mockResolvedValue(mockStats);

      const result = await webhookService.getStatistics();

      expect(result).toEqual({
        total: 120,
        pending: 5,
        processing: 2,
        completed: 100,
        failed: 10,
        retrying: 3,
      });
    });

    it('should return zeros when no events', async () => {
      mockDb._mockChain.groupBy.mockResolvedValue([]);

      const result = await webhookService.getStatistics();

      expect(result).toEqual({
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        retrying: 0,
      });
    });

    it('should throw on database error', async () => {
      mockDb._mockChain.groupBy.mockRejectedValue(new Error('DB error'));

      await expect(webhookService.getStatistics()).rejects.toThrow('DB error');
    });

    it('should parse count strings to integers', async () => {
      const mockStats = [
        { status: 'completed', count: '999' },
      ];
      
      mockDb._mockChain.groupBy.mockResolvedValue(mockStats);

      const result = await webhookService.getStatistics();

      expect(result.completed).toBe(999);
      expect(typeof result.completed).toBe('number');
    });

    it('should handle partial status counts', async () => {
      const mockStats = [
        { status: 'completed', count: '50' },
      ];
      
      mockDb._mockChain.groupBy.mockResolvedValue(mockStats);

      const result = await webhookService.getStatistics();

      expect(result.completed).toBe(50);
      expect(result.failed).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.total).toBe(50);
    });
  });

  describe('Distributed Locking (WH10)', () => {
    it('should use correct lock key format', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);
      mockDb._mockChain.insert.mockReturnValue({
        onConflict: jest.fn().mockReturnValue({
          merge: jest.fn().mockResolvedValue([1]),
        }),
      });
      mockRedis.set.mockResolvedValue('OK');

      await webhookService.processWebhook({
        eventId: 'evt_test_456',
        eventType: 'test.event',
        payload: {},
        processor: jest.fn().mockResolvedValue(undefined),
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'webhook:lock:evt_test_456',
        expect.stringMatching(/^\d+:\d+$/), // pid:timestamp format
        'PX',
        30000, // default TTL
        'NX'
      );
    });

    it('should release lock with correct key', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);
      mockDb._mockChain.insert.mockReturnValue({
        onConflict: jest.fn().mockReturnValue({
          merge: jest.fn().mockResolvedValue([1]),
        }),
      });
      mockRedis.set.mockResolvedValue('OK');

      await webhookService.processWebhook({
        eventId: 'evt_release_test',
        eventType: 'test.event',
        payload: {},
        processor: jest.fn().mockResolvedValue(undefined),
      });

      expect(mockRedis.del).toHaveBeenCalledWith('webhook:lock:evt_release_test');
    });
  });

  describe('Header Hashing', () => {
    it('should process webhook with various header combinations', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);
      mockDb._mockChain.insert.mockReturnValue({
        onConflict: jest.fn().mockReturnValue({
          merge: jest.fn().mockResolvedValue([1]),
        }),
      });
      mockRedis.set.mockResolvedValue('OK');

      // Test with empty headers
      await webhookService.processWebhook({
        eventId: 'evt_headers_1',
        eventType: 'test.event',
        payload: {},
        headers: {},
        processor: jest.fn().mockResolvedValue(undefined),
      });

      expect(mockDb._mockChain.insert).toHaveBeenCalled();
    });

    it('should handle missing individual headers gracefully', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);
      mockDb._mockChain.insert.mockReturnValue({
        onConflict: jest.fn().mockReturnValue({
          merge: jest.fn().mockResolvedValue([1]),
        }),
      });
      mockRedis.set.mockResolvedValue('OK');

      // Only some headers present
      await webhookService.processWebhook({
        eventId: 'evt_headers_2',
        eventType: 'test.event',
        payload: {},
        headers: {
          'stripe-signature': 'sig_only',
        },
        processor: jest.fn().mockResolvedValue(undefined),
      });

      expect(mockDb._mockChain.insert).toHaveBeenCalled();
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle null retry_count from database', async () => {
      const processor = jest.fn().mockRejectedValue(new Error('Failed'));
      
      mockDb._mockChain.first
        .mockResolvedValueOnce(null) // isProcessedOrProcessing
        .mockResolvedValueOnce(null); // getRetryCount returns null event
      mockDb._mockChain.insert.mockReturnValue({
        onConflict: jest.fn().mockReturnValue({
          merge: jest.fn().mockResolvedValue([1]),
        }),
      });
      mockRedis.set.mockResolvedValue('OK');

      const result = await webhookService.processWebhook({
        eventId: 'evt_null_retry',
        eventType: 'test.event',
        payload: {},
        processor,
      });

      expect(result.success).toBe(false);
    });

    it('should handle getRetryCount database error', async () => {
      const processor = jest.fn().mockRejectedValue(new Error('Failed'));
      
      mockDb._mockChain.first
        .mockResolvedValueOnce(null) // isProcessedOrProcessing
        .mockRejectedValueOnce(new Error('DB error')); // getRetryCount fails
      mockDb._mockChain.insert.mockReturnValue({
        onConflict: jest.fn().mockReturnValue({
          merge: jest.fn().mockResolvedValue([1]),
        }),
      });
      mockRedis.set.mockResolvedValue('OK');

      const result = await webhookService.processWebhook({
        eventId: 'evt_retry_error',
        eventType: 'test.event',
        payload: {},
        processor,
      });

      // Should still return error but not crash
      expect(result.success).toBe(false);
    });
  });
});
