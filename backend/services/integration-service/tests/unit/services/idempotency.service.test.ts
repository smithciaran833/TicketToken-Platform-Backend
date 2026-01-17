// Mock logger BEFORE imports
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerDebug = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    debug: mockLoggerDebug,
    error: jest.fn(),
  },
}));

import { idempotencyService } from '../../../src/services/idempotency.service';

describe('IdempotencyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idempotencyService.clear();
  });

  afterAll(() => {
    idempotencyService.stopCleanup();
  });

  describe('checkIdempotency', () => {
    it('should return exists: false for unknown key', async () => {
      const result = await idempotencyService.checkIdempotency('unknown-key');

      expect(result.exists).toBe(false);
      expect(result.record).toBeUndefined();
    });

    it('should return exists: true for existing key', async () => {
      await idempotencyService.storeIdempotency('test-key', 'req-123');

      const result = await idempotencyService.checkIdempotency('test-key');

      expect(result.exists).toBe(true);
      expect(result.record).toBeDefined();
      expect(result.record!.key).toBe('test-key');
    });

    it('should return exists: false for expired key', async () => {
      // Store with 1ms TTL
      await idempotencyService.storeIdempotency('expired-key', 'req-123', 1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await idempotencyService.checkIdempotency('expired-key');

      expect(result.exists).toBe(false);
    });

    it('should log when key is found', async () => {
      await idempotencyService.storeIdempotency('log-test-key');

      await idempotencyService.checkIdempotency('log-test-key');

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Idempotency key found',
        expect.objectContaining({
          key: 'log-test-key',
          status: 'processing',
        })
      );
    });
  });

  describe('storeIdempotency', () => {
    it('should create a new record with processing status', async () => {
      const record = await idempotencyService.storeIdempotency('new-key', 'req-456');

      expect(record.key).toBe('new-key');
      expect(record.requestId).toBe('req-456');
      expect(record.status).toBe('processing');
      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.expiresAt).toBeInstanceOf(Date);
    });

    it('should use default TTL of 24 hours', async () => {
      const before = Date.now();
      const record = await idempotencyService.storeIdempotency('ttl-test');
      const after = Date.now();

      const expectedExpiry = 24 * 60 * 60 * 1000;
      const expiryTime = record.expiresAt.getTime() - record.createdAt.getTime();

      expect(expiryTime).toBeGreaterThanOrEqual(expectedExpiry - 100);
      expect(expiryTime).toBeLessThanOrEqual(expectedExpiry + 100);
    });

    it('should use custom TTL when provided', async () => {
      const customTtl = 60 * 1000; // 1 minute
      const record = await idempotencyService.storeIdempotency('custom-ttl', undefined, customTtl);

      const expiryTime = record.expiresAt.getTime() - record.createdAt.getTime();

      expect(expiryTime).toBeGreaterThanOrEqual(customTtl - 100);
      expect(expiryTime).toBeLessThanOrEqual(customTtl + 100);
    });

    it('should store metadata', async () => {
      const metadata = { webhookId: 'wh-123', source: 'stripe' };
      const record = await idempotencyService.storeIdempotency('meta-key', undefined, undefined, metadata);

      expect(record.metadata).toEqual(metadata);
    });

    it('should log record creation', async () => {
      await idempotencyService.storeIdempotency('log-store-key', 'req-789');

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        'Idempotency record created',
        expect.objectContaining({
          key: 'log-store-key',
          requestId: 'req-789',
        })
      );
    });
  });

  describe('completeIdempotency', () => {
    it('should update record with completed status', async () => {
      await idempotencyService.storeIdempotency('complete-key');
      const response = { success: true, data: 'test' };

      const result = await idempotencyService.completeIdempotency('complete-key', response);

      expect(result).toBe(true);
      const record = idempotencyService.getRecord('complete-key');
      expect(record!.status).toBe('completed');
      expect(record!.response).toEqual(response);
      expect(record!.completedAt).toBeInstanceOf(Date);
    });

    it('should update record with failed status', async () => {
      await idempotencyService.storeIdempotency('fail-key');

      await idempotencyService.completeIdempotency('fail-key', { error: 'something broke' }, 'failed');

      const record = idempotencyService.getRecord('fail-key');
      expect(record!.status).toBe('failed');
    });

    it('should return false for non-existent key', async () => {
      const result = await idempotencyService.completeIdempotency('nonexistent', {});

      expect(result).toBe(false);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Idempotency record not found for completion',
        { key: 'nonexistent' }
      );
    });

    it('should log completion with duration', async () => {
      await idempotencyService.storeIdempotency('duration-key');
      jest.clearAllMocks();

      await idempotencyService.completeIdempotency('duration-key', {});

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        'Idempotency record completed',
        expect.objectContaining({
          key: 'duration-key',
          status: 'completed',
          duration: expect.any(Number),
        })
      );
    });
  });

  describe('getRecord', () => {
    it('should return record by key', async () => {
      await idempotencyService.storeIdempotency('get-key', 'req-111');

      const record = idempotencyService.getRecord('get-key');

      expect(record).toBeDefined();
      expect(record!.key).toBe('get-key');
    });

    it('should return undefined for non-existent key', () => {
      const record = idempotencyService.getRecord('does-not-exist');

      expect(record).toBeUndefined();
    });

    it('should return undefined for expired key and delete it', async () => {
      await idempotencyService.storeIdempotency('expire-get-key', undefined, 1);
      await new Promise(resolve => setTimeout(resolve, 10));

      const record = idempotencyService.getRecord('expire-get-key');

      expect(record).toBeUndefined();
    });
  });

  describe('deleteRecord', () => {
    it('should delete existing record', async () => {
      await idempotencyService.storeIdempotency('delete-key');

      const result = idempotencyService.deleteRecord('delete-key');

      expect(result).toBe(true);
      expect(idempotencyService.getRecord('delete-key')).toBeUndefined();
    });

    it('should return false for non-existent key', () => {
      const result = idempotencyService.deleteRecord('no-such-key');

      expect(result).toBe(false);
    });
  });

  describe('generateKey', () => {
    it('should generate consistent key for same input', () => {
      const data = {
        operation: 'sync',
        provider: 'stripe',
        venueId: 'venue-123',
        payload: { amount: 100 },
      };

      const key1 = idempotencyService.generateKey(data);
      const key2 = idempotencyService.generateKey(data);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^idem-[a-z0-9]+$/);
    });

    it('should generate different keys for different input', () => {
      const key1 = idempotencyService.generateKey({ operation: 'sync', venueId: 'v1' });
      const key2 = idempotencyService.generateKey({ operation: 'sync', venueId: 'v2' });

      expect(key1).not.toBe(key2);
    });

    it('should handle missing optional fields', () => {
      const key = idempotencyService.generateKey({ operation: 'test' });

      expect(key).toMatch(/^idem-[a-z0-9]+$/);
    });

    it('should include payload in key generation', () => {
      const key1 = idempotencyService.generateKey({ operation: 'sync', payload: { a: 1 } });
      const key2 = idempotencyService.generateKey({ operation: 'sync', payload: { a: 2 } });

      expect(key1).not.toBe(key2);
    });
  });

  describe('withIdempotency', () => {
    it('should execute function and cache result', async () => {
      const fn = jest.fn().mockResolvedValue({ result: 'success' });

      const result = await idempotencyService.withIdempotency('with-key', fn);

      expect(result).toEqual({ result: 'success' });
      expect(fn).toHaveBeenCalledTimes(1);

      const record = idempotencyService.getRecord('with-key');
      expect(record!.status).toBe('completed');
      expect(record!.response).toEqual({ result: 'success' });
    });

    it('should return cached result for completed request', async () => {
      const fn = jest.fn().mockResolvedValue({ result: 'first' });

      await idempotencyService.withIdempotency('cache-key', fn);
      fn.mockResolvedValue({ result: 'second' });

      const result = await idempotencyService.withIdempotency('cache-key', fn);

      expect(result).toEqual({ result: 'first' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw error if request is already processing', async () => {
      await idempotencyService.storeIdempotency('processing-key');

      await expect(
        idempotencyService.withIdempotency('processing-key', async () => 'test')
      ).rejects.toThrow('Request is already being processed');
    });

    it('should allow retry for failed requests', async () => {
      // First attempt fails
      const failingFn = jest.fn().mockRejectedValue(new Error('first fail'));

      await expect(
        idempotencyService.withIdempotency('retry-key', failingFn)
      ).rejects.toThrow('first fail');

      // Second attempt succeeds
      const succeedingFn = jest.fn().mockResolvedValue({ success: true });

      const result = await idempotencyService.withIdempotency('retry-key', succeedingFn);

      expect(result).toEqual({ success: true });
    });

    it('should store failure status on error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('something failed'));

      await expect(
        idempotencyService.withIdempotency('error-key', fn)
      ).rejects.toThrow('something failed');

      const record = idempotencyService.getRecord('error-key');
      expect(record!.status).toBe('failed');
      expect(record!.response).toEqual({ error: 'something failed' });
    });

    it('should accept options', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      await idempotencyService.withIdempotency('options-key', fn, {
        requestId: 'req-999',
        ttlMs: 5000,
        metadata: { custom: 'data' },
      });

      const record = idempotencyService.getRecord('options-key');
      expect(record!.requestId).toBe('req-999');
      expect(record!.metadata).toEqual({ custom: 'data' });
    });

    it('should log when returning cached response', async () => {
      const fn = jest.fn().mockResolvedValue('cached');
      await idempotencyService.withIdempotency('log-cache-key', fn);

      jest.clearAllMocks();
      await idempotencyService.withIdempotency('log-cache-key', fn);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Returning cached response for idempotent request',
        { key: 'log-cache-key' }
      );
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired records', async () => {
      await idempotencyService.storeIdempotency('expire-1', undefined, 1);
      await idempotencyService.storeIdempotency('expire-2', undefined, 1);
      await idempotencyService.storeIdempotency('keep', undefined, 60000);

      await new Promise(resolve => setTimeout(resolve, 10));

      const cleaned = idempotencyService.cleanupExpired();

      expect(cleaned).toBe(2);
      expect(idempotencyService.getRecord('expire-1')).toBeUndefined();
      expect(idempotencyService.getRecord('expire-2')).toBeUndefined();
      expect(idempotencyService.getRecord('keep')).toBeDefined();
    });

    it('should return 0 when no expired records', async () => {
      await idempotencyService.storeIdempotency('not-expired');

      const cleaned = idempotencyService.cleanupExpired();

      expect(cleaned).toBe(0);
    });

    it('should log when records are cleaned', async () => {
      await idempotencyService.storeIdempotency('clean-log', undefined, 1);
      await new Promise(resolve => setTimeout(resolve, 10));
      jest.clearAllMocks();

      idempotencyService.cleanupExpired();

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        'Cleaned up 1 expired idempotency records'
      );
    });
  });

  describe('getStats', () => {
    it('should return empty stats when no records', () => {
      const stats = idempotencyService.getStats();

      expect(stats).toEqual({
        total: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        expiringSoon: 0,
      });
    });

    it('should count records by status', async () => {
      await idempotencyService.storeIdempotency('proc-1');
      await idempotencyService.storeIdempotency('proc-2');

      await idempotencyService.storeIdempotency('comp-1');
      await idempotencyService.completeIdempotency('comp-1', {});

      await idempotencyService.storeIdempotency('fail-1');
      await idempotencyService.completeIdempotency('fail-1', {}, 'failed');

      const stats = idempotencyService.getStats();

      expect(stats.total).toBe(4);
      expect(stats.processing).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
    });

    it('should count records expiring soon (within 1 hour)', async () => {
      await idempotencyService.storeIdempotency('expiring-soon', undefined, 30 * 60 * 1000); // 30 min
      await idempotencyService.storeIdempotency('not-expiring', undefined, 2 * 60 * 60 * 1000); // 2 hours

      const stats = idempotencyService.getStats();

      expect(stats.expiringSoon).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all records', async () => {
      await idempotencyService.storeIdempotency('clear-1');
      await idempotencyService.storeIdempotency('clear-2');

      idempotencyService.clear();

      expect(idempotencyService.getStats().total).toBe(0);
    });

    it('should log when cleared', () => {
      idempotencyService.clear();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Cleared all idempotency records');
    });
  });

  describe('stopCleanup', () => {
    it('should stop cleanup interval without error', () => {
      expect(() => idempotencyService.stopCleanup()).not.toThrow();
    });
  });
});
