import { serviceCache } from '../../../src/services/cache-integration';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    flushdb: jest.fn(),
    status: 'ready',
  }));
});

describe('Cache Integration Service', () => {
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const Redis = require('ioredis');
    mockRedis = new Redis();
    (serviceCache as any).client = mockRedis;
  });

  describe('get', () => {
    it('should get value from cache', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ data: 'test' }));

      const result = await serviceCache.get('test-key');

      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
      expect(result).toEqual({ data: 'test' });
    });

    it('should return null if key not found', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await serviceCache.get('missing-key');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await serviceCache.get('error-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value in cache with TTL', async () => {
      await serviceCache.set('test-key', { data: 'value' }, 1800);

      expect(mockRedis.setex).toHaveBeenCalledWith('test-key', 1800, JSON.stringify({ data: 'value' }));
    });

    it('should use default TTL if not provided', async () => {
      await serviceCache.set('test-key', { data: 'value' });

      expect(mockRedis.setex).toHaveBeenCalledWith('test-key', 3600, JSON.stringify({ data: 'value' }));
    });

    it('should handle errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      await expect(serviceCache.set('test-key', { data: 'value' })).resolves.not.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete single key', async () => {
      await serviceCache.delete('test-key');

      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
    });

    it('should delete multiple keys', async () => {
      await serviceCache.delete(['key1', 'key2']);

      expect(mockRedis.del).toHaveBeenCalledWith('key1');
      expect(mockRedis.del).toHaveBeenCalledWith('key2');
    });

    it('should handle pattern with wildcard', async () => {
      mockRedis.keys.mockResolvedValue(['match1', 'match2']);

      await serviceCache.delete('test:*');

      expect(mockRedis.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedis.del).toHaveBeenCalledWith('match1', 'match2');
    });

    it('should handle array with wildcard pattern', async () => {
      mockRedis.keys.mockResolvedValue(['match1']);

      await serviceCache.delete(['test:*', 'exact-key']);

      expect(mockRedis.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedis.del).toHaveBeenCalledWith('exact-key');
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate cache pattern', async () => {
      mockRedis.keys.mockResolvedValue(['key1']);

      await serviceCache.invalidateCache('events:*');

      expect(mockRedis.keys).toHaveBeenCalledWith('events:*');
    });
  });

  describe('flush', () => {
    it('should flush database', async () => {
      await serviceCache.flush();

      expect(mockRedis.flushdb).toHaveBeenCalled();
    });

    it('should handle flush errors', async () => {
      mockRedis.flushdb.mockRejectedValue(new Error('Flush error'));

      await expect(serviceCache.flush()).resolves.not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return connection stats', () => {
      mockRedis.status = 'ready';

      const stats = serviceCache.getStats();

      expect(stats).toEqual({ connected: true });
    });

    it('should return disconnected status', () => {
      mockRedis.status = 'disconnected';

      const stats = serviceCache.getStats();

      expect(stats).toEqual({ connected: false });
    });
  });
});
