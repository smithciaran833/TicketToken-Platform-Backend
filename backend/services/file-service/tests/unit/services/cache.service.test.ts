import { CacheService } from '../../../src/services/cache.service';

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(() => {
    service = new CacheService();
    (service as any).connected = true;
    (service as any).redis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      exists: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      pipeline: jest.fn(),
      mget: jest.fn(),
      flushdb: jest.fn(),
      ping: jest.fn()
    };
  });

  describe('get', () => {
    it('should retrieve value from cache', async () => {
      const key = 'test-key';
      const value = JSON.stringify({ data: 'test-value' });
      (service as any).redis.get.mockResolvedValue(value);

      const result = await service.get(key);

      expect(result).toEqual({ data: 'test-value' });
    });

    it('should return null for non-existent key', async () => {
      (service as any).redis.get.mockResolvedValue(null);

      const result = await service.get('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle JSON parse errors', async () => {
      (service as any).redis.get.mockResolvedValue('invalid-json{');

      const result = await service.get('bad-json');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store value in cache with TTL', async () => {
      const key = 'test-key';
      const value = { data: 'test' };
      (service as any).redis.setex.mockResolvedValue('OK');

      const result = await service.set(key, value, { ttl: 3600 });

      expect(result).toBe(true);
      expect((service as any).redis.setex).toHaveBeenCalled();
    });

    it('should handle complex objects', async () => {
      const complexValue = {
        nested: { data: [1, 2, 3] },
        date: new Date().toISOString()
      };
      (service as any).redis.setex.mockResolvedValue('OK');

      const result = await service.set('complex', complexValue);

      expect(result).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete key', async () => {
      (service as any).redis.del.mockResolvedValue(1);

      const result = await service.delete('test-key');

      expect(result).toBe(true);
    });
  });

  describe('exists', () => {
    it('should check if key exists', async () => {
      (service as any).redis.exists.mockResolvedValue(1);

      const result = await service.exists('test-key');

      expect(result).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      (service as any).redis.exists.mockResolvedValue(0);

      const result = await service.exists('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('deletePattern', () => {
    it('should delete keys matching pattern', async () => {
      const pattern = 'user:*';
      (service as any).redis.keys.mockResolvedValue(['user:1', 'user:2']);
      (service as any).redis.del.mockResolvedValue(2);

      const result = await service.deletePattern(pattern);

      expect(result).toBe(2);
    });
  });

  describe('increment', () => {
    it('should increment counter', async () => {
      (service as any).redis.incr.mockResolvedValue(5);
      (service as any).redis.expire.mockResolvedValue(1);

      const result = await service.increment('counter', { ttl: 60 });

      expect(result).toBe(5);
    });
  });

  describe('getOrSet', () => {
    it('should get from cache if exists', async () => {
      const cached = { data: 'cached-value' };
      (service as any).redis.get.mockResolvedValue(JSON.stringify(cached));

      const factory = jest.fn().mockResolvedValue({ data: 'new-value' });
      const result = await service.getOrSet('test-key', factory);

      expect(result).toEqual(cached);
      expect(factory).not.toHaveBeenCalled();
    });

    it('should compute and cache if not exists', async () => {
      (service as any).redis.get.mockResolvedValue(null);
      (service as any).redis.setex.mockResolvedValue('OK');

      const newValue = { data: 'new-value' };
      const factory = jest.fn().mockResolvedValue(newValue);
      const result = await service.getOrSet('test-key', factory);

      expect(result).toEqual(newValue);
      expect(factory).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = service.getStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('connected');
    });
  });

  describe('clear', () => {
    it('should clear cache', async () => {
      (service as any).redis.flushdb.mockResolvedValue('OK');

      const result = await service.clear();

      expect(result).toBe(true);
    });
  });

  describe('isHealthy', () => {
    it('should check health', async () => {
      (service as any).redis.ping.mockResolvedValue('PONG');

      const healthy = await service.isHealthy();

      expect(healthy).toBe(true);
    });
  });
});
