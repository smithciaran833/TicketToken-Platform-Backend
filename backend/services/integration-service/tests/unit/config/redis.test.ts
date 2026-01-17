/**
 * Tests for Redis Configuration
 */

// Mock ioredis
const mockRedisPing = jest.fn();
const mockRedisInfo = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisSetex = jest.fn();
const mockRedisDel = jest.fn();
const mockRedisKeys = jest.fn();
const mockRedisQuit = jest.fn();
const mockRedisOn = jest.fn();

const mockRedisInstance = {
  ping: mockRedisPing,
  info: mockRedisInfo,
  get: mockRedisGet,
  set: mockRedisSet,
  setex: mockRedisSetex,
  del: mockRedisDel,
  keys: mockRedisKeys,
  quit: mockRedisQuit,
  on: mockRedisOn,
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

// Mock logger
const mockLoggerDebug = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: mockLoggerDebug,
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

// Mock config
const mockGetRedisConfig = jest.fn();

jest.mock('../../../src/config/index', () => ({
  getRedisConfig: mockGetRedisConfig,
}));

describe('Redis Configuration', () => {
  let redis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockGetRedisConfig.mockReturnValue({
      host: 'localhost',
      port: 6379,
      password: 'test-password',
      db: 0,
      tls: undefined,
    });

    redis = require('../../../src/config/redis');
  });

  describe('getRedisClient', () => {
    it('should return null when Redis is not configured', () => {
      mockGetRedisConfig.mockReturnValue({ host: '', port: 6379 });
      jest.resetModules();
      redis = require('../../../src/config/redis');

      const client = redis.getRedisClient();

      expect(client).toBeNull();
      expect(mockLoggerDebug).toHaveBeenCalledWith('Redis not configured, returning null client');
    });

    it('should create Redis client with correct options', () => {
      const Redis = require('ioredis');

      redis.getRedisClient();

      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6379,
          password: 'test-password',
          db: 0,
        })
      );
    });

    it('should return same client instance on subsequent calls', () => {
      const client1 = redis.getRedisClient();
      const client2 = redis.getRedisClient();

      expect(client1).toBe(client2);
    });

    it('should set up event listeners', () => {
      redis.getRedisClient();

      expect(mockRedisOn).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisOn).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisOn).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisOn).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockRedisOn).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });

    it('should log on connect event', () => {
      redis.getRedisClient();

      const connectHandler = mockRedisOn.mock.calls.find(call => call[0] === 'connect')?.[1];
      connectHandler();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Redis client connected',
        expect.objectContaining({ host: 'localhost', port: 6379 })
      );
    });

    it('should log on error event', () => {
      redis.getRedisClient();

      const errorHandler = mockRedisOn.mock.calls.find(call => call[0] === 'error')?.[1];
      errorHandler(new Error('Connection failed'));

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Redis client error',
        expect.objectContaining({ error: 'Connection failed' })
      );
    });
  });

  describe('getPubSubClient', () => {
    it('should return null when Redis is not configured', () => {
      mockGetRedisConfig.mockReturnValue({ host: '', port: 6379 });
      jest.resetModules();
      redis = require('../../../src/config/redis');

      const client = redis.getPubSubClient();

      expect(client).toBeNull();
    });

    it('should create separate pub/sub client', () => {
      const Redis = require('ioredis');
      Redis.mockClear();

      redis.getPubSubClient();

      expect(Redis).toHaveBeenCalled();
    });

    it('should return same pub/sub client on subsequent calls', () => {
      const client1 = redis.getPubSubClient();
      const client2 = redis.getPubSubClient();

      expect(client1).toBe(client2);
    });
  });

  describe('checkRedisHealth', () => {
    it('should return false when Redis is not configured', async () => {
      mockGetRedisConfig.mockReturnValue({ host: '', port: 6379 });
      jest.resetModules();
      redis = require('../../../src/config/redis');

      const healthy = await redis.checkRedisHealth();

      expect(healthy).toBe(false);
    });

    it('should return true when ping succeeds', async () => {
      mockRedisPing.mockResolvedValue('PONG');

      const healthy = await redis.checkRedisHealth();

      expect(healthy).toBe(true);
      expect(mockRedisPing).toHaveBeenCalled();
    });

    it('should return false when ping fails', async () => {
      mockRedisPing.mockRejectedValue(new Error('Connection timeout'));

      const healthy = await redis.checkRedisHealth();

      expect(healthy).toBe(false);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Redis health check failed',
        expect.any(Object)
      );
    });
  });

  describe('getRedisInfo', () => {
    it('should return null when Redis is not configured', async () => {
      mockGetRedisConfig.mockReturnValue({ host: '', port: 6379 });
      jest.resetModules();
      redis = require('../../../src/config/redis');

      const info = await redis.getRedisInfo();

      expect(info).toBeNull();
    });

    it('should parse Redis info response', async () => {
      const infoResponse = '# Server\r\nredis_version:6.2.6\r\nuptime_in_seconds:12345\r\n';
      mockRedisInfo.mockResolvedValue(infoResponse);

      const info = await redis.getRedisInfo();

      expect(info).toEqual({
        redis_version: '6.2.6',
        uptime_in_seconds: '12345',
      });
    });

    it('should return null when info command fails', async () => {
      mockRedisInfo.mockRejectedValue(new Error('Command failed'));

      const info = await redis.getRedisInfo();

      expect(info).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalled();
    });
  });

  describe('initializeRedis', () => {
    it('should ping Redis and log success', async () => {
      mockRedisPing.mockResolvedValue('PONG');

      await redis.initializeRedis();

      expect(mockRedisPing).toHaveBeenCalled();
      expect(mockLoggerInfo).toHaveBeenCalledWith('Redis initialized and connected');
    });

    it('should throw error when ping fails', async () => {
      const error = new Error('Connection failed');
      mockRedisPing.mockRejectedValue(error);

      await expect(redis.initializeRedis()).rejects.toThrow('Connection failed');
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('should warn when Redis is not configured', async () => {
      mockGetRedisConfig.mockReturnValue({ host: '', port: 6379 });
      jest.resetModules();
      redis = require('../../../src/config/redis');

      await redis.initializeRedis();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Redis not configured, skipping initialization'
      );
    });
  });

  describe('closeRedisConnections', () => {
    it('should close both clients when they exist', async () => {
      mockRedisQuit.mockResolvedValue('OK');

      redis.getRedisClient();
      redis.getPubSubClient();

      await redis.closeRedisConnections();

      expect(mockRedisQuit).toHaveBeenCalledTimes(2);
      expect(mockLoggerInfo).toHaveBeenCalledWith('Redis client disconnected');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Redis pub/sub client disconnected');
    });
  });

  describe('cacheGet', () => {
    it('should return null when Redis is not configured', async () => {
      mockGetRedisConfig.mockReturnValue({ host: '', port: 6379 });
      jest.resetModules();
      redis = require('../../../src/config/redis');

      const value = await redis.cacheGet('test-key');

      expect(value).toBeNull();
    });

    it('should get and parse cached value', async () => {
      const data = { name: 'test', value: 123 };
      mockRedisGet.mockResolvedValue(JSON.stringify(data));

      const value = await redis.cacheGet('test-key');

      expect(value).toEqual(data);
      expect(mockRedisGet).toHaveBeenCalledWith('test-key');
    });

    it('should return null when key does not exist', async () => {
      mockRedisGet.mockResolvedValue(null);

      const value = await redis.cacheGet('missing-key');

      expect(value).toBeNull();
    });

    it('should return null and log warning on error', async () => {
      mockRedisGet.mockRejectedValue(new Error('Get failed'));

      const value = await redis.cacheGet('test-key');

      expect(value).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Cache get failed',
        expect.any(Object)
      );
    });
  });

  describe('cacheSet', () => {
    it('should return false when Redis is not configured', async () => {
      mockGetRedisConfig.mockReturnValue({ host: '', port: 6379 });
      jest.resetModules();
      redis = require('../../../src/config/redis');

      const result = await redis.cacheSet('key', 'value');

      expect(result).toBe(false);
    });

    it('should set value without TTL', async () => {
      mockRedisSet.mockResolvedValue('OK');

      const result = await redis.cacheSet('test-key', { data: 'test' });

      expect(result).toBe(true);
      expect(mockRedisSet).toHaveBeenCalledWith('test-key', '{"data":"test"}');
    });

    it('should set value with TTL', async () => {
      mockRedisSetex.mockResolvedValue('OK');

      const result = await redis.cacheSet('test-key', { data: 'test' }, 3600);

      expect(result).toBe(true);
      expect(mockRedisSetex).toHaveBeenCalledWith('test-key', 3600, '{"data":"test"}');
    });

    it('should return false and log warning on error', async () => {
      mockRedisSet.mockRejectedValue(new Error('Set failed'));

      const result = await redis.cacheSet('test-key', 'value');

      expect(result).toBe(false);
      expect(mockLoggerWarn).toHaveBeenCalled();
    });
  });

  describe('cacheDelete', () => {
    it('should return false when Redis is not configured', async () => {
      mockGetRedisConfig.mockReturnValue({ host: '', port: 6379 });
      jest.resetModules();
      redis = require('../../../src/config/redis');

      const result = await redis.cacheDelete('key');

      expect(result).toBe(false);
    });

    it('should delete key', async () => {
      mockRedisDel.mockResolvedValue(1);

      const result = await redis.cacheDelete('test-key');

      expect(result).toBe(true);
      expect(mockRedisDel).toHaveBeenCalledWith('test-key');
    });

    it('should return false and log warning on error', async () => {
      mockRedisDel.mockRejectedValue(new Error('Delete failed'));

      const result = await redis.cacheDelete('test-key');

      expect(result).toBe(false);
      expect(mockLoggerWarn).toHaveBeenCalled();
    });
  });

  describe('cacheDeletePattern', () => {
    it('should return 0 when Redis is not configured', async () => {
      mockGetRedisConfig.mockReturnValue({ host: '', port: 6379 });
      jest.resetModules();
      redis = require('../../../src/config/redis');

      const result = await redis.cacheDeletePattern('pattern:*');

      expect(result).toBe(0);
    });

    it('should delete keys matching pattern', async () => {
      mockRedisKeys.mockResolvedValue(['key1', 'key2', 'key3']);
      mockRedisDel.mockResolvedValue(3);

      const result = await redis.cacheDeletePattern('test:*');

      expect(result).toBe(3);
      expect(mockRedisKeys).toHaveBeenCalledWith('test:*');
      expect(mockRedisDel).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should return 0 when no keys match', async () => {
      mockRedisKeys.mockResolvedValue([]);

      const result = await redis.cacheDeletePattern('test:*');

      expect(result).toBe(0);
      expect(mockRedisDel).not.toHaveBeenCalled();
    });

    it('should return 0 and log warning on error', async () => {
      mockRedisKeys.mockRejectedValue(new Error('Keys failed'));

      const result = await redis.cacheDeletePattern('test:*');

      expect(result).toBe(0);
      expect(mockLoggerWarn).toHaveBeenCalled();
    });
  });
});
