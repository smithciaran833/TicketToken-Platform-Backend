/**
 * Unit Tests for Distributed Lock Utility
 * Tests Redis-based distributed locking for race condition prevention
 */

// Mock Redis
const mockRedis = {
  set: jest.fn(),
  eval: jest.fn(),
  exists: jest.fn(),
  del: jest.fn()
};

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(() => mockRedis)
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

import {
  acquireLock,
  releaseLock,
  extendLock,
  withLock,
  acquireListingLock,
  acquirePurchaseLock,
  acquireWalletLock,
  isLocked,
  forceReleaseLock,
  lockConfig
} from '../../../src/utils/distributed-lock';

describe('Distributed Lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.set.mockReset();
    mockRedis.eval.mockReset();
    mockRedis.exists.mockReset();
    mockRedis.del.mockReset();
  });

  describe('lockConfig', () => {
    it('should export default configuration', () => {
      expect(lockConfig.DEFAULT_LOCK_TTL_MS).toBeDefined();
      expect(lockConfig.LOCK_RETRY_COUNT).toBeDefined();
      expect(lockConfig.LOCK_RETRY_DELAY_MS).toBeDefined();
      expect(lockConfig.LOCK_KEY_PREFIX).toBe('lock:');
    });
  });

  describe('acquireLock', () => {
    it('should acquire lock on first attempt', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      const lock = await acquireLock('test-resource');
      
      expect(lock).not.toBeNull();
      expect(lock!.key).toBe('lock:test-resource');
      expect(lock!.token).toBeDefined();
      expect(mockRedis.set).toHaveBeenCalledWith(
        'lock:test-resource',
        expect.any(String),
        'PX',
        expect.any(Number),
        'NX'
      );
    });

    it('should return lock with release and extend methods', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      const lock = await acquireLock('test-resource');
      
      expect(typeof lock!.release).toBe('function');
      expect(typeof lock!.extend).toBe('function');
    });

    it('should use custom TTL when provided', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      await acquireLock('test-resource', { ttlMs: 5000 });
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        'lock:test-resource',
        expect.any(String),
        'PX',
        5000,
        'NX'
      );
    });

    it('should retry on failure', async () => {
      mockRedis.set
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');
      
      const lock = await acquireLock('test-resource', { retryDelayMs: 10 });
      
      expect(lock).not.toBeNull();
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });

    it('should return null after max retries', async () => {
      mockRedis.set.mockResolvedValue(null);
      
      const lock = await acquireLock('test-resource', { 
        retryCount: 2, 
        retryDelayMs: 10 
      });
      
      expect(lock).toBeNull();
      expect(mockRedis.set).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should throw on Redis error after all retries', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));
      
      await expect(acquireLock('test-resource', { 
        retryCount: 1, 
        retryDelayMs: 10 
      })).rejects.toThrow('Redis connection failed');
    });
  });

  describe('releaseLock', () => {
    it('should release lock with matching token', async () => {
      mockRedis.eval.mockResolvedValue(1);
      
      const result = await releaseLock('lock:test-resource', 'test-token');
      
      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'lock:test-resource',
        'test-token'
      );
    });

    it('should return false for token mismatch', async () => {
      mockRedis.eval.mockResolvedValue(0);
      
      const result = await releaseLock('lock:test-resource', 'wrong-token');
      
      expect(result).toBe(false);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));
      
      const result = await releaseLock('lock:test-resource', 'test-token');
      
      expect(result).toBe(false);
    });
  });

  describe('extendLock', () => {
    it('should extend lock with matching token', async () => {
      mockRedis.eval.mockResolvedValue(1);
      
      const result = await extendLock('lock:test-resource', 'test-token', 5000);
      
      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'lock:test-resource',
        'test-token',
        '5000'
      );
    });

    it('should return false for token mismatch', async () => {
      mockRedis.eval.mockResolvedValue(0);
      
      const result = await extendLock('lock:test-resource', 'wrong-token');
      
      expect(result).toBe(false);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));
      
      const result = await extendLock('lock:test-resource', 'test-token');
      
      expect(result).toBe(false);
    });
  });

  describe('withLock', () => {
    it('should execute function with lock', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);
      
      const mockFn = jest.fn().mockResolvedValue('result');
      
      const result = await withLock('test-resource', mockFn);
      
      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalled();
    });

    it('should release lock after success', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);
      
      await withLock('test-resource', async () => 'done');
      
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should release lock after error', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);
      
      const error = new Error('Function failed');
      
      await expect(withLock('test-resource', async () => {
        throw error;
      })).rejects.toThrow('Function failed');
      
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should throw if lock cannot be acquired', async () => {
      mockRedis.set.mockResolvedValue(null);
      
      await expect(withLock('test-resource', async () => 'result', { 
        retryCount: 0 
      })).rejects.toThrow('Failed to acquire lock');
    });
  });

  describe('acquireListingLock', () => {
    it('should acquire listing-specific lock', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      const lock = await acquireListingLock('listing-123');
      
      expect(lock).not.toBeNull();
      expect(lock!.key).toBe('lock:listing:listing-123');
    });

    it('should use default TTL for listing locks', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      await acquireListingLock('listing-123');
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'PX',
        10000, // 10 second default
        'NX'
      );
    });
  });

  describe('acquirePurchaseLock', () => {
    it('should acquire purchase-specific lock', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      const lock = await acquirePurchaseLock('listing-123', 'buyer-456');
      
      expect(lock).not.toBeNull();
      expect(lock!.key).toBe('lock:purchase:listing-123:buyer-456');
    });

    it('should use longer TTL for purchase locks', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      await acquirePurchaseLock('listing-123', 'buyer-456');
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'PX',
        30000, // 30 second default
        'NX'
      );
    });
  });

  describe('acquireWalletLock', () => {
    it('should acquire wallet-specific lock', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      const lock = await acquireWalletLock('user-123');
      
      expect(lock).not.toBeNull();
      expect(lock!.key).toBe('lock:wallet:user-123');
    });

    it('should use medium TTL for wallet locks', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      await acquireWalletLock('user-123');
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'PX',
        15000, // 15 second default
        'NX'
      );
    });
  });

  describe('isLocked', () => {
    it('should return true when resource is locked', async () => {
      mockRedis.exists.mockResolvedValue(1);
      
      const result = await isLocked('test-resource');
      
      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('lock:test-resource');
    });

    it('should return false when resource is not locked', async () => {
      mockRedis.exists.mockResolvedValue(0);
      
      const result = await isLocked('test-resource');
      
      expect(result).toBe(false);
    });
  });

  describe('forceReleaseLock', () => {
    it('should force release a lock', async () => {
      mockRedis.del.mockResolvedValue(1);
      
      const result = await forceReleaseLock('test-resource');
      
      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('lock:test-resource');
    });

    it('should return false if lock does not exist', async () => {
      mockRedis.del.mockResolvedValue(0);
      
      const result = await forceReleaseLock('nonexistent-resource');
      
      expect(result).toBe(false);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));
      
      const result = await forceReleaseLock('test-resource');
      
      expect(result).toBe(false);
    });
  });

  describe('Lock object methods', () => {
    it('should call releaseLock when lock.release() is called', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);
      
      const lock = await acquireLock('test-resource');
      await lock!.release();
      
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should call extendLock when lock.extend() is called', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);
      
      const lock = await acquireLock('test-resource', { ttlMs: 5000 });
      await lock!.extend();
      
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should use custom duration for lock extension', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);
      
      const lock = await acquireLock('test-resource');
      await lock!.extend(10000);
      
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.any(String),
        expect.any(String),
        '10000'
      );
    });
  });
});
