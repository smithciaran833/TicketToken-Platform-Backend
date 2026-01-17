// Mock dependencies BEFORE imports
jest.mock('ioredis');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: {
    incrementCounter: jest.fn(),
    recordHistogram: jest.fn(),
    recordGauge: jest.fn(),
  },
  MetricsService: jest.fn().mockImplementation(() => ({
    incrementCounter: jest.fn(),
    recordHistogram: jest.fn(),
    recordGauge: jest.fn(),
  })),
}));

import Redis from 'ioredis';
import { CacheService, cacheService, CacheTTL, CachePrefix } from '../../../src/services/cache.service';

describe('services/cache.service', () => {
  let service: CacheService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock Redis instance
    mockRedis = {
      connect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn(),
      exists: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn().mockResolvedValue(1),
      mget: jest.fn(),
      pipeline: jest.fn(),
      flushdb: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn(),
      quit: jest.fn(),
      on: jest.fn(),
    } as any;

    // Mock Redis constructor
    (Redis as unknown as jest.Mock).mockImplementation(() => mockRedis);

    service = new CacheService();
    // Set connected to true for tests that need it
    (service as any).connected = true;
    (service as any).redis = mockRedis;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('get', () => {
    it('should retrieve cached value successfully', async () => {
      // Arrange
      const testData = { id: '123', name: 'test' };
      mockRedis.get.mockResolvedValue(JSON.stringify(testData));

      // Act
      const result = await service.get<typeof testData>('test-key');

      // Assert
      expect(result).toEqual(testData);
      expect(mockRedis.get).toHaveBeenCalledWith('file-service:test-key');
    });

    it('should return null for cache miss', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null);

      // Act
      const result = await service.get('missing-key');

      // Assert
      expect(result).toBeNull();
    });

    it('should use prefix when provided', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue('"value"');

      // Act
      await service.get('key', { prefix: 'custom' });

      // Assert
      expect(mockRedis.get).toHaveBeenCalledWith('file-service:custom:key');
    });

    it('should return null when not connected', async () => {
      // Arrange
      (service as any).connected = false;

      // Act
      const result = await service.get('test-key');

      // Assert
      expect(result).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should handle JSON parse errors', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue('invalid-json{');

      // Act
      const result = await service.get('test-key');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should cache value with default TTL', async () => {
      // Arrange
      const testData = { id: '123' };

      // Act
      const result = await service.set('test-key', testData);

      // Assert
      expect(result).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'file-service:test-key',
        3600,
        JSON.stringify(testData)
      );
    });

    it('should cache value with custom TTL', async () => {
      // Arrange
      const testData = 'test-value';
      const ttl = 1800;

      // Act
      await service.set('test-key', testData, { ttl });

      // Assert
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'file-service:test-key',
        ttl,
        JSON.stringify(testData)
      );
    });

    it('should use prefix when provided', async () => {
      // Arrange
      const testData = 'value';

      // Act
      await service.set('key', testData, { prefix: 'custom', ttl: 600 });

      // Assert
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'file-service:custom:key',
        600,
        JSON.stringify(testData)
      );
    });

    it('should return false when not connected', async () => {
      // Arrange
      (service as any).connected = false;

      // Act
      const result = await service.set('test-key', 'value');

      // Assert
      expect(result).toBe(false);
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      // Act
      const result = await service.set('test-key', 'value');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete cached value', async () => {
      // Act
      const result = await service.delete('test-key');

      // Assert
      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('file-service:test-key');
    });

    it('should return false when not connected', async () => {
      // Arrange
      (service as any).connected = false;

      // Act
      const result = await service.delete('test-key');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('deletePattern', () => {
    it('should delete all keys matching pattern', async () => {
      // Arrange
      const keys = ['file-service:user:1', 'file-service:user:2', 'file-service:user:3'];
      mockRedis.keys.mockResolvedValue(keys);

      // Act
      const result = await service.deletePattern('user:*');

      // Assert
      expect(result).toBe(3);
      expect(mockRedis.keys).toHaveBeenCalledWith('file-service:user:*');
      expect(mockRedis.del).toHaveBeenCalledWith(...keys);
    });

    it('should return 0 when no keys match', async () => {
      // Arrange
      mockRedis.keys.mockResolvedValue([]);

      // Act
      const result = await service.deletePattern('nonexistent:*');

      // Assert
      expect(result).toBe(0);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it('should return true when key exists', async () => {
      // Arrange
      mockRedis.exists.mockResolvedValue(1);

      // Act
      const result = await service.exists('test-key');

      // Assert
      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('file-service:test-key');
    });

    it('should return false when key does not exist', async () => {
      // Arrange
      mockRedis.exists.mockResolvedValue(0);

      // Act
      const result = await service.exists('test-key');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      // Arrange
      const cachedData = { id: '123' };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));
      const factory = jest.fn();

      // Act
      const result = await service.getOrSet('test-key', factory);

      // Assert
      expect(result).toEqual(cachedData);
      expect(factory).not.toHaveBeenCalled();
    });

    it('should compute and cache value if not exists', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null);
      const computedData = { id: '456' };
      const factory = jest.fn().mockResolvedValue(computedData);

      // Act
      const result = await service.getOrSet('test-key', factory, { ttl: 1800 });

      // Assert
      expect(result).toEqual(computedData);
      expect(factory).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'file-service:test-key',
        1800,
        JSON.stringify(computedData)
      );
    });
  });

  describe('increment', () => {
    it('should increment counter', async () => {
      // Arrange
      mockRedis.incr.mockResolvedValue(5);

      // Act
      const result = await service.increment('counter');

      // Assert
      expect(result).toBe(5);
      expect(mockRedis.incr).toHaveBeenCalledWith('file-service:counter');
    });

    it('should set expiry if TTL provided', async () => {
      // Arrange
      mockRedis.incr.mockResolvedValue(1);

      // Act
      await service.increment('counter', { ttl: 3600 });

      // Assert
      expect(mockRedis.expire).toHaveBeenCalledWith('file-service:counter', 3600);
    });

    it('should return 0 when not connected', async () => {
      // Arrange
      (service as any).connected = false;

      // Act
      const result = await service.increment('counter');

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('mset', () => {
    it('should set multiple values', async () => {
      // Arrange
      const entries = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' }
      ];
      const mockPipeline = {
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      // Act
      const result = await service.mset(entries, { ttl: 1800 });

      // Assert
      expect(result).toBe(true);
      expect(mockPipeline.setex).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });
  });

  describe('mget', () => {
    it('should get multiple values', async () => {
      // Arrange
      const keys = ['key1', 'key2', 'key3'];
      const values = ['"value1"', '"value2"', null];
      mockRedis.mget.mockResolvedValue(values);

      // Act
      const result = await service.mget<string>(keys);

      // Assert
      expect(result).toEqual(['value1', 'value2', null]);
      expect(mockRedis.mget).toHaveBeenCalledWith(
        'file-service:key1',
        'file-service:key2',
        'file-service:key3'
      );
    });
  });

  describe('clear', () => {
    it('should clear cache with prefix', async () => {
      // Arrange
      const keys = ['file-service:prefix:key1', 'file-service:prefix:key2'];
      mockRedis.keys.mockResolvedValue(keys);

      // Act
      const result = await service.clear('prefix');

      // Assert
      expect(result).toBe(true);
      expect(mockRedis.keys).toHaveBeenCalledWith('prefix:*');
      expect(mockRedis.del).toHaveBeenCalledWith(...keys);
    });

    it('should flush entire cache when no prefix provided', async () => {
      // Act
      const result = await service.clear();

      // Assert
      expect(result).toBe(true);
      expect(mockRedis.flushdb).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      // Arrange
      (service as any).cacheHits = 80;
      (service as any).cacheMisses = 20;
      (service as any).connected = true;

      // Act
      const stats = service.getStats();

      // Assert
      expect(stats).toEqual({
        hits: 80,
        misses: 20,
        total: 100,
        hitRate: 80,
        connected: true
      });
    });

    it('should handle zero operations', () => {
      // Arrange
      (service as any).cacheHits = 0;
      (service as any).cacheMisses = 0;

      // Act
      const stats = service.getStats();

      // Assert
      expect(stats.hitRate).toBe(0);
      expect(stats.total).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset statistics', () => {
      // Arrange
      (service as any).cacheHits = 100;
      (service as any).cacheMisses = 50;

      // Act
      service.resetStats();

      // Assert
      expect((service as any).cacheHits).toBe(0);
      expect((service as any).cacheMisses).toBe(0);
    });
  });

  describe('isHealthy', () => {
    it('should return true when Redis is healthy', async () => {
      // Arrange
      (service as any).connected = true;
      mockRedis.ping.mockResolvedValue('PONG');

      // Act
      const result = await service.isHealthy();

      // Assert
      expect(result).toBe(true);
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should return false when not connected', async () => {
      // Arrange
      (service as any).connected = false;

      // Act
      const result = await service.isHealthy();

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when ping fails', async () => {
      // Arrange
      (service as any).connected = true;
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'));

      // Act
      const result = await service.isHealthy();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('close', () => {
    it('should close Redis connection', async () => {
      // Arrange
      (service as any).redis = mockRedis;
      (service as any).connected = true;

      // Act
      await service.close();

      // Assert
      expect(mockRedis.quit).toHaveBeenCalled();
      expect((service as any).connected).toBe(false);
    });
  });

  describe('CacheTTL constants', () => {
    it('should export predefined TTL values', () => {
      expect(CacheTTL.SHORT).toBe(300);
      expect(CacheTTL.MEDIUM).toBe(1800);
      expect(CacheTTL.LONG).toBe(3600);
      expect(CacheTTL.VERY_LONG).toBe(86400);
      expect(CacheTTL.WEEK).toBe(604800);
    });
  });

  describe('CachePrefix constants', () => {
    it('should export predefined prefix values', () => {
      expect(CachePrefix.FILE).toBe('file');
      expect(CachePrefix.FILE_METADATA).toBe('file:metadata');
      expect(CachePrefix.USER).toBe('user');
      expect(CachePrefix.SCAN_RESULT).toBe('scan');
      expect(CachePrefix.THUMBNAIL).toBe('thumbnail');
      expect(CachePrefix.STATS).toBe('stats');
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(cacheService).toBeInstanceOf(CacheService);
    });
  });
});
