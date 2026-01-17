import {
  generateEventKey,
  isEventProcessed,
  markEventProcessed,
  checkAndMarkEvent,
  withEventIdempotency,
} from '../../../src/utils/event-idempotency';
import { logger } from '../../../src/config/logger';

jest.mock('../../../src/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: '',
    REDIS_DB: 0,
  },
}));

// Mock ioredis
const mockRedis = {
  exists: jest.fn(),
  setex: jest.fn(),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('Event Idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateEventKey()', () => {
    it('should generate key with event type and correlation ID', () => {
      const key = generateEventKey('ORDER_CREATED', 'corr-123');
      
      expect(key).toBe('ORDER_CREATED:corr-123');
    });

    it('should include user ID when provided', () => {
      const key = generateEventKey('ORDER_CREATED', 'corr-123', 'user-456');
      
      expect(key).toBe('ORDER_CREATED:corr-123:user-456');
    });

    it('should not include user ID when undefined', () => {
      const key = generateEventKey('ORDER_CREATED', 'corr-123', undefined);
      
      expect(key).toBe('ORDER_CREATED:corr-123');
    });
  });

  describe('isEventProcessed()', () => {
    it('should return false for new event', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await isEventProcessed('test-event-key');

      expect(result).toBe(false);
      expect(mockRedis.exists).toHaveBeenCalledWith('notification:event:test-event-key');
    });

    it('should return true for processed event (Redis)', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await isEventProcessed('test-event-key');

      expect(result).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith(
        'Event already processed (Redis)',
        { eventKey: 'test-event-key' }
      );
    });

    it('should fallback to memory on Redis error', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));

      const result = await isEventProcessed('test-event-key');

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis event check failed, using memory',
        expect.any(Object)
      );
    });
  });

  describe('markEventProcessed()', () => {
    it('should mark event as completed in Redis', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await markEventProcessed('test-event-key', 'completed');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'notification:event:test-event-key',
        86400,
        expect.stringContaining('completed')
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'Event marked as processed',
        { eventKey: 'test-event-key', status: 'completed' }
      );
    });

    it('should mark event as failed', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await markEventProcessed('test-event-key', 'failed');

      const callArgs = mockRedis.setex.mock.calls[0][2];
      expect(callArgs).toContain('failed');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      await markEventProcessed('test-event-key');

      expect(logger.warn).toHaveBeenCalledWith(
        'Redis event mark failed',
        expect.any(Object)
      );
    });

    it('should default to completed status', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await markEventProcessed('test-event-key');

      expect(logger.debug).toHaveBeenCalledWith(
        'Event marked as processed',
        { eventKey: 'test-event-key', status: 'completed' }
      );
    });
  });

  describe('checkAndMarkEvent()', () => {
    it('should process new event', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');

      const result = await checkAndMarkEvent('ORDER_CREATED', 'corr-123', 'user-456');

      expect(result.shouldProcess).toBe(true);
      expect(result.eventKey).toBe('ORDER_CREATED:corr-123:user-456');
    });

    it('should skip duplicate event', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await checkAndMarkEvent('ORDER_CREATED', 'corr-123');

      expect(result.shouldProcess).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(
        'Skipping duplicate event',
        expect.objectContaining({
          eventType: 'ORDER_CREATED',
          correlationId: 'corr-123',
        })
      );
    });

    it('should generate key without user ID', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');

      const result = await checkAndMarkEvent('ORDER_CREATED', 'corr-123');

      expect(result.eventKey).toBe('ORDER_CREATED:corr-123');
    });
  });

  describe('withEventIdempotency()', () => {
    it('should execute handler for new event', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');

      const handler = jest.fn().mockResolvedValue('result');

      const result = await withEventIdempotency(
        'ORDER_CREATED',
        'corr-123',
        'user-456',
        handler
      );

      expect(result).toBe('result');
      expect(handler).toHaveBeenCalled();
    });

    it('should not execute handler for duplicate event', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const handler = jest.fn();

      const result = await withEventIdempotency(
        'ORDER_CREATED',
        'corr-123',
        'user-456',
        handler
      );

      expect(result).toBeNull();
      expect(handler).not.toHaveBeenCalled();
    });

    it('should mark event as completed after success', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');

      const handler = jest.fn().mockResolvedValue('success');

      await withEventIdempotency('ORDER_CREATED', 'corr-123', undefined, handler);

      expect(mockRedis.setex).toHaveBeenCalledTimes(2); // Once in check, once after success
    });

    it('should re-throw handler errors', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');

      const error = new Error('Handler error');
      const handler = jest.fn().mockRejectedValue(error);

      await expect(
        withEventIdempotency('ORDER_CREATED', 'corr-123', undefined, handler)
      ).rejects.toThrow('Handler error');

      expect(logger.error).toHaveBeenCalledWith(
        'Event handler failed',
        expect.objectContaining({
          eventType: 'ORDER_CREATED',
          correlationId: 'corr-123',
        })
      );
    });

    it('should work without user ID', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');

      const handler = jest.fn().mockResolvedValue('result');

      const result = await withEventIdempotency(
        'ORDER_CREATED',
        'corr-123',
        undefined,
        handler
      );

      expect(result).toBe('result');
    });
  });
});
