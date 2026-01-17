// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock config
jest.mock('../../../src/config/index', () => ({
  getRedisConfig: jest.fn().mockReturnValue({
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
    tls: undefined,
  }),
}));

// Mock ioredis
const mockSet = jest.fn();
const mockEval = jest.fn();
const mockExists = jest.fn();
const mockPttl = jest.fn();
const mockOn = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    set: mockSet,
    eval: mockEval,
    exists: mockExists,
    pttl: mockPttl,
    on: mockOn,
  }));
});

import {
  acquireLock,
  withLock,
  lockKeys,
  isLocked,
  getLockTtl,
} from '../../../src/utils/distributed-lock';
import { logger } from '../../../src/utils/logger';

describe('Distributed Lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSet.mockReset();
    mockEval.mockReset();
    mockExists.mockReset();
    mockPttl.mockReset();
  });

  describe('acquireLock', () => {
    it('should acquire lock successfully', async () => {
      mockSet.mockResolvedValue('OK');

      const handle = await acquireLock('test-key');

      expect(handle.acquired).toBe(true);
      expect(handle.key).toBe('integration:lock:test-key');
      expect(handle.token).toBeDefined();
      expect(handle.acquiredAt).toBeInstanceOf(Date);
      expect(handle.expiresAt).toBeInstanceOf(Date);
      expect(typeof handle.release).toBe('function');
    });

    it('should use correct Redis SET parameters', async () => {
      mockSet.mockResolvedValue('OK');

      await acquireLock('my-key', { ttlMs: 5000 });

      expect(mockSet).toHaveBeenCalledWith(
        'integration:lock:my-key',
        expect.any(String),
        'PX',
        5000,
        'NX'
      );
    });

    it('should return non-acquired handle when lock is taken', async () => {
      mockSet.mockResolvedValue(null);

      const handle = await acquireLock('taken-key', {
        retryCount: 0,
      });

      expect(handle.acquired).toBe(false);
      expect(handle.acquiredAt).toBeUndefined();
    });

    it('should retry on failure', async () => {
      mockSet
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');

      const handle = await acquireLock('retry-key', {
        retryCount: 3,
        retryDelayMs: 1,
      });

      expect(handle.acquired).toBe(true);
      expect(mockSet).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      mockSet.mockResolvedValue(null);

      const handle = await acquireLock('fail-key', {
        retryCount: 2,
        retryDelayMs: 1,
      });

      expect(handle.acquired).toBe(false);
      expect(mockSet).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to acquire lock after retries',
        expect.any(Object)
      );
    });

    it('should handle Redis errors during acquire', async () => {
      mockSet.mockRejectedValue(new Error('Redis connection error'));

      const handle = await acquireLock('error-key', {
        retryCount: 1,
        retryDelayMs: 1,
      });

      expect(handle.acquired).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Error acquiring lock',
        expect.any(Object)
      );
    });

    it('should use default TTL when not specified', async () => {
      mockSet.mockResolvedValue('OK');

      await acquireLock('default-ttl');

      expect(mockSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'PX',
        30000, // Default TTL
        'NX'
      );
    });
  });

  describe('release', () => {
    it('should release lock successfully', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockResolvedValue(1);

      const handle = await acquireLock('release-key');
      const released = await handle.release();

      expect(released).toBe(true);
      expect(mockEval).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Lock released',
        expect.any(Object)
      );
    });

    it('should return false when release fails (token mismatch)', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockResolvedValue(0);

      const handle = await acquireLock('mismatch-key');
      const released = await handle.release();

      expect(released).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Lock release failed (token mismatch or expired)',
        expect.any(Object)
      );
    });

    it('should handle Redis errors during release', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockRejectedValue(new Error('Redis error'));

      const handle = await acquireLock('error-release');
      const released = await handle.release();

      expect(released).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Error releasing lock',
        expect.any(Object)
      );
    });
  });

  describe('withLock', () => {
    it('should execute function when lock is acquired', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockResolvedValue(1);

      const fn = jest.fn().mockResolvedValue('result');

      const { success, result } = await withLock('with-lock-key', fn);

      expect(success).toBe(true);
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    it('should release lock after function completes', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockResolvedValue(1);

      const fn = jest.fn().mockResolvedValue('done');

      await withLock('release-after', fn);

      expect(mockEval).toHaveBeenCalled(); // Release was called
    });

    it('should release lock even when function throws', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockResolvedValue(1);

      const fn = jest.fn().mockRejectedValue(new Error('Function error'));

      const { success, error } = await withLock('error-fn', fn);

      expect(success).toBe(false);
      expect(error?.message).toBe('Function error');
      expect(mockEval).toHaveBeenCalled(); // Release was still called
    });

    it('should return failure when lock cannot be acquired', async () => {
      mockSet.mockResolvedValue(null);

      const fn = jest.fn().mockResolvedValue('never');

      const { success, error } = await withLock('no-lock', fn, {
        retryCount: 0,
      });

      expect(success).toBe(false);
      expect(error?.message).toContain('Failed to acquire lock');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should pass options to acquireLock', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockResolvedValue(1);

      const fn = jest.fn().mockResolvedValue('ok');

      await withLock('options-key', fn, { ttlMs: 10000 });

      expect(mockSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'PX',
        10000,
        'NX'
      );
    });
  });

  describe('lockKeys', () => {
    it('should generate sync lock key', () => {
      const key = lockKeys.sync('integration-123', 'full');
      expect(key).toBe('sync:integration-123:full');
    });

    it('should generate OAuth refresh lock key', () => {
      const key = lockKeys.oauthRefresh('integration-456');
      expect(key).toBe('oauth-refresh:integration-456');
    });

    it('should generate webhook process lock key', () => {
      const key = lockKeys.webhookProcess('stripe', 'evt_123');
      expect(key).toBe('webhook:stripe:evt_123');
    });

    it('should generate integration update lock key', () => {
      const key = lockKeys.integrationUpdate('integration-789');
      expect(key).toBe('integration-update:integration-789');
    });

    it('should generate field mapping lock key', () => {
      const key = lockKeys.fieldMapping('integration-abc');
      expect(key).toBe('field-mapping:integration-abc');
    });
  });

  describe('isLocked', () => {
    it('should return true when lock exists', async () => {
      mockExists.mockResolvedValue(1);

      const locked = await isLocked('existing-lock');

      expect(locked).toBe(true);
      expect(mockExists).toHaveBeenCalledWith('integration:lock:existing-lock');
    });

    it('should return false when lock does not exist', async () => {
      mockExists.mockResolvedValue(0);

      const locked = await isLocked('no-lock');

      expect(locked).toBe(false);
    });
  });

  describe('getLockTtl', () => {
    it('should return TTL when lock exists', async () => {
      mockPttl.mockResolvedValue(15000);

      const ttl = await getLockTtl('ttl-key');

      expect(ttl).toBe(15000);
      expect(mockPttl).toHaveBeenCalledWith('integration:lock:ttl-key');
    });

    it('should return null when lock does not exist', async () => {
      mockPttl.mockResolvedValue(-2);

      const ttl = await getLockTtl('no-ttl');

      expect(ttl).toBeNull();
    });

    it('should return null when lock has no TTL', async () => {
      mockPttl.mockResolvedValue(-1);

      const ttl = await getLockTtl('no-expire');

      expect(ttl).toBeNull();
    });
  });
});
