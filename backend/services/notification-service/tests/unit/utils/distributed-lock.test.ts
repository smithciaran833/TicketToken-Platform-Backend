import { DistributedLock, withLock, distributedLock } from '../../../src/utils/distributed-lock';
import { redisClient } from '../../../src/config/redis';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/config/redis', () => ({
  redisClient: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    eval: jest.fn(),
    exists: jest.fn(),
    pttl: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('DistributedLock', () => {
  let lock: DistributedLock;

  beforeEach(() => {
    jest.clearAllMocks();
    lock = new DistributedLock();
  });

  describe('acquire()', () => {
    it('should acquire lock successfully on first attempt', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      const result = await lock.acquire('test-resource');

      expect(result.acquired).toBe(true);
      expect(result.lockId).toBe('lock:test-resource');
      expect(result.owner).toBeTruthy();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(redisClient.set).toHaveBeenCalledWith(
        'lock:test-resource',
        expect.any(String),
        'PX',
        30000,
        'NX'
      );
    });

    it('should use custom TTL', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      await lock.acquire('test-resource', { ttlMs: 60000 });

      expect(redisClient.set).toHaveBeenCalledWith(
        'lock:test-resource',
        expect.any(String),
        'PX',
        60000,
        'NX'
      );
    });

    it('should use custom owner', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      const result = await lock.acquire('test-resource', { owner: 'custom-owner' });

      expect(result.owner).toBe('custom-owner');
      const lockValue = JSON.parse((redisClient.set as jest.Mock).mock.calls[0][1]);
      expect(lockValue.owner).toBe('custom-owner');
    });

    it('should retry on failure', async () => {
      (redisClient.set as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');

      const result = await lock.acquire('test-resource', { retryDelayMs: 10 });

      expect(result.acquired).toBe(true);
      expect(redisClient.set).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue(null);

      const result = await lock.acquire('test-resource', {
        retryAttempts: 2,
        retryDelayMs: 10,
      });

      expect(result.acquired).toBe(false);
      expect(result.lockId).toBeNull();
      expect(result.owner).toBeNull();
      expect(result.expiresAt).toBeNull();
      expect(redisClient.set).toHaveBeenCalledTimes(2);
    });

    it('should handle Redis errors and retry', async () => {
      (redisClient.set as jest.Mock)
        .mockRejectedValueOnce(new Error('Redis error'))
        .mockResolvedValueOnce('OK');

      const result = await lock.acquire('test-resource', { retryDelayMs: 10 });

      expect(result.acquired).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        'Error acquiring lock',
        expect.objectContaining({
          resource: 'test-resource',
          attempt: 0,
        })
      );
    });
  });

  describe('release()', () => {
    it('should release lock successfully', async () => {
      (redisClient.eval as jest.Mock).mockResolvedValue(1);

      const released = await lock.release('test-resource', 'owner-123');

      expect(released).toBe(true);
      expect(redisClient.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'lock:test-resource',
        'owner-123'
      );
      expect(logger.debug).toHaveBeenCalledWith('Lock released', {
        resource: 'test-resource',
        owner: 'owner-123',
      });
    });

    it('should fail to release if not owner', async () => {
      (redisClient.eval as jest.Mock).mockResolvedValue(0);

      const released = await lock.release('test-resource', 'wrong-owner');

      expect(released).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Lock release failed - not owner or lock expired',
        expect.any(Object)
      );
    });

    it('should fallback to simple delete on Lua error', async () => {
      (redisClient.eval as jest.Mock).mockRejectedValue(new Error('Lua error'));
      (redisClient.del as jest.Mock).mockResolvedValue(1);

      const released = await lock.release('test-resource', 'owner-123');

      expect(released).toBe(true);
      expect(redisClient.del).toHaveBeenCalledWith('lock:test-resource');
    });

    it('should return false if fallback delete fails', async () => {
      (redisClient.eval as jest.Mock).mockRejectedValue(new Error('Lua error'));
      (redisClient.del as jest.Mock).mockRejectedValue(new Error('Del error'));

      const released = await lock.release('test-resource', 'owner-123');

      expect(released).toBe(false);
    });
  });

  describe('extend()', () => {
    it('should extend lock TTL', async () => {
      (redisClient.eval as jest.Mock).mockResolvedValue(1);

      const extended = await lock.extend('test-resource', 'owner-123', 30000);

      expect(extended).toBe(true);
      expect(redisClient.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'lock:test-resource',
        'owner-123',
        '30000'
      );
      expect(logger.debug).toHaveBeenCalledWith('Lock extended', {
        resource: 'test-resource',
        owner: 'owner-123',
        additionalTtlMs: 30000,
      });
    });

    it('should fail to extend if not owner', async () => {
      (redisClient.eval as jest.Mock).mockResolvedValue(0);

      const extended = await lock.extend('test-resource', 'wrong-owner', 30000);

      expect(extended).toBe(false);
    });

    it('should handle errors', async () => {
      (redisClient.eval as jest.Mock).mockRejectedValue(new Error('Extend error'));

      const extended = await lock.extend('test-resource', 'owner-123', 30000);

      expect(extended).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('isLocked()', () => {
    it('should return true if lock exists', async () => {
      (redisClient.exists as jest.Mock).mockResolvedValue(1);

      const locked = await lock.isLocked('test-resource');

      expect(locked).toBe(true);
      expect(redisClient.exists).toHaveBeenCalledWith('lock:test-resource');
    });

    it('should return false if lock does not exist', async () => {
      (redisClient.exists as jest.Mock).mockResolvedValue(0);

      const locked = await lock.isLocked('test-resource');

      expect(locked).toBe(false);
    });

    it('should handle errors', async () => {
      (redisClient.exists as jest.Mock).mockRejectedValue(new Error('Exists error'));

      const locked = await lock.isLocked('test-resource');

      expect(locked).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getLockInfo()', () => {
    it('should return lock information', async () => {
      const lockData = {
        owner: 'owner-123',
        acquiredAt: '2024-01-01T00:00:00.000Z',
        pid: 12345,
      };
      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(lockData));
      (redisClient.pttl as jest.Mock).mockResolvedValue(25000);

      const info = await lock.getLockInfo('test-resource');

      expect(info).toEqual({
        locked: true,
        owner: 'owner-123',
        acquiredAt: '2024-01-01T00:00:00.000Z',
        ttlMs: 25000,
      });
    });

    it('should return not locked if lock does not exist', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (redisClient.pttl as jest.Mock).mockResolvedValue(-2);

      const info = await lock.getLockInfo('test-resource');

      expect(info).toEqual({ locked: false });
    });

    it('should handle negative TTL', async () => {
      const lockData = {
        owner: 'owner-123',
        acquiredAt: '2024-01-01T00:00:00.000Z',
      };
      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(lockData));
      (redisClient.pttl as jest.Mock).mockResolvedValue(-1);

      const info = await lock.getLockInfo('test-resource');

      expect(info.locked).toBe(true);
      expect(info.ttlMs).toBeUndefined();
    });

    it('should handle errors', async () => {
      (redisClient.get as jest.Mock).mockRejectedValue(new Error('Get error'));

      const info = await lock.getLockInfo('test-resource');

      expect(info).toEqual({ locked: false });
      expect(logger.error).toHaveBeenCalled();
    });
  });
});

describe('withLock()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute function with lock', async () => {
    (redisClient.set as jest.Mock).mockResolvedValue('OK');
    (redisClient.eval as jest.Mock).mockResolvedValue(1);

    const fn = jest.fn().mockResolvedValue('result');

    const result = await withLock('test-resource', fn);

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalled();
    expect(redisClient.set).toHaveBeenCalled();
    expect(redisClient.eval).toHaveBeenCalled();
  });

  it('should release lock even if function throws', async () => {
    (redisClient.set as jest.Mock).mockResolvedValue('OK');
    (redisClient.eval as jest.Mock).mockResolvedValue(1);

    const error = new Error('Function error');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(withLock('test-resource', fn)).rejects.toThrow('Function error');
    expect(redisClient.eval).toHaveBeenCalled();
  });

  it('should throw if lock cannot be acquired', async () => {
    (redisClient.set as jest.Mock).mockResolvedValue(null);

    const fn = jest.fn();

    await expect(withLock('test-resource', fn, { retryAttempts: 1, retryDelayMs: 10 })).rejects.toThrow(
      'Failed to acquire lock for resource: test-resource'
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('should pass options to lock', async () => {
    (redisClient.set as jest.Mock).mockResolvedValue('OK');
    (redisClient.eval as jest.Mock).mockResolvedValue(1);

    const fn = jest.fn().mockResolvedValue('ok');

    await withLock('test-resource', fn, { ttlMs: 60000 });

    expect(redisClient.set).toHaveBeenCalledWith(
      'lock:test-resource',
      expect.any(String),
      'PX',
      60000,
      'NX'
    );
  });
});

describe('distributedLock singleton', () => {
  it('should export a singleton instance', () => {
    expect(distributedLock).toBeInstanceOf(DistributedLock);
  });

  it('should be the same instance across imports', () => {
    expect(distributedLock).toBe(distributedLock);
  });
});
