jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    ping: jest.fn(),
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  }));
});

import { RedisService } from '../../../src/services/redisService';
import Redis from 'ioredis';

describe('RedisService', () => {
  let mockRedisClient: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();

    // Save original env
    originalEnv = { ...process.env };

    mockRedisClient = {
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
    };

    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedisClient);

    // Reset the singleton instance
    (RedisService as any).client = null;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('initialize', () => {
    it('should initialize with default config', async () => {
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;

      await RedisService.initialize();

      expect(Redis).toHaveBeenCalledWith({
        host: 'tickettoken-redis',
        port: 6379,
        retryStrategy: expect.any(Function),
      });
      expect(mockRedisClient.ping).toHaveBeenCalled();
    });

    it('should initialize with env vars', async () => {
      process.env.REDIS_HOST = 'test-redis';
      process.env.REDIS_PORT = '6380';

      await RedisService.initialize();

      expect(Redis).toHaveBeenCalledWith({
        host: 'test-redis',
        port: 6380,
        retryStrategy: expect.any(Function),
      });
    });

    it('should have retry strategy that caps at 2000ms', async () => {
      await RedisService.initialize();

      const callArgs = (Redis as jest.MockedClass<typeof Redis>).mock.calls[0][0];
      const retryStrategy = callArgs.retryStrategy;

      expect(retryStrategy(1)).toBe(50);
      expect(retryStrategy(10)).toBe(500);
      expect(retryStrategy(100)).toBe(2000);
    });

    it('should handle connection errors', async () => {
      mockRedisClient.ping.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(RedisService.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('get', () => {
    it('should get value from redis', async () => {
      await RedisService.initialize();
      mockRedisClient.get.mockResolvedValue('test-value');

      const result = await RedisService.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
      expect(result).toBe('test-value');
    });

    it('should return null if key not found', async () => {
      await RedisService.initialize();
      mockRedisClient.get.mockResolvedValue(null);

      const result = await RedisService.get('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw if not initialized', async () => {
      (RedisService as any).client = null;

      await expect(RedisService.get('key')).rejects.toThrow('Redis not initialized');
    });
  });

  describe('setex', () => {
    it('should set value with expiry', async () => {
      await RedisService.initialize();
      mockRedisClient.setex.mockResolvedValue('OK');

      await RedisService.setex('test-key', 3600, 'test-value');

      expect(mockRedisClient.setex).toHaveBeenCalledWith('test-key', 3600, 'test-value');
    });

    it('should throw if not initialized', async () => {
      (RedisService as any).client = null;

      await expect(RedisService.setex('key', 100, 'value')).rejects.toThrow('Redis not initialized');
    });
  });

  describe('del', () => {
    it('should delete single key', async () => {
      await RedisService.initialize();
      mockRedisClient.del.mockResolvedValue(1);

      await RedisService.del('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should delete keys matching pattern with wildcard', async () => {
      await RedisService.initialize();
      mockRedisClient.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      mockRedisClient.del.mockResolvedValue(3);

      await RedisService.del('test-*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('test-*');
      expect(mockRedisClient.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should not call del if no keys match pattern', async () => {
      await RedisService.initialize();
      mockRedisClient.keys.mockResolvedValue([]);

      await RedisService.del('test-*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('test-*');
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should throw if not initialized', async () => {
      (RedisService as any).client = null;

      await expect(RedisService.del('key')).rejects.toThrow('Redis not initialized');
    });
  });

  describe('getClient', () => {
    it('should return client after initialization', async () => {
      await RedisService.initialize();

      const client = RedisService.getClient();

      expect(client).toBe(mockRedisClient);
    });

    it('should throw error if not initialized', () => {
      (RedisService as any).client = null;

      expect(() => RedisService.getClient()).toThrow('Redis not initialized');
    });
  });
});
