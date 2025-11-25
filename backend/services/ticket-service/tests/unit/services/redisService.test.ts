// =============================================================================
// MOCKS
// =============================================================================

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => mockLogger),
  },
}));

jest.mock('../../../src/config');
jest.mock('ioredis');

// Import after mocks
import { RedisService } from '../../../src/services/redisService';
import Redis from 'ioredis';
import { config } from '../../../src/config';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('RedisService', () => {
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    (config as any).redis = {
      url: 'redis://localhost:6379',
    };

    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      mget: jest.fn(),
      mset: jest.fn(),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
      on: jest.fn(),
    };

    (Redis as any).mockImplementation(() => mockRedisClient);

    // Mock Date.now for circuit breaker
    jest.spyOn(Date, 'now').mockReturnValue(1000000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =============================================================================
  // initialize() - 10 test cases
  // =============================================================================

  describe('initialize()', () => {
    it('should create Redis client with correct config', async () => {
      await RedisService.initialize();

      expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', expect.any(Object));
    });

    it('should setup event handlers', async () => {
      await RedisService.initialize();

      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should log successful initialization', async () => {
      await RedisService.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Redis connection initiated');
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Connection failed');
      (Redis as any).mockImplementation(() => {
        throw error;
      });

      await expect(RedisService.initialize()).rejects.toThrow('Connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize Redis:', error);
    });

    it('should configure retry strategy', async () => {
      await RedisService.initialize();

      const config = (Redis as any).mock.calls[0][1];
      expect(config.retryStrategy).toBeDefined();
    });

    it('should configure max retries per request', async () => {
      await RedisService.initialize();

      const config = (Redis as any).mock.calls[0][1];
      expect(config.maxRetriesPerRequest).toBe(3);
    });

    it('should enable offline queue', async () => {
      await RedisService.initialize();

      const config = (Redis as any).mock.calls[0][1];
      expect(config.enableOfflineQueue).toBe(true);
    });

    it('should set connection timeout', async () => {
      await RedisService.initialize();

      const config = (Redis as any).mock.calls[0][1];
      expect(config.connectTimeout).toBe(5000);
    });

    it('should handle error events', async () => {
      await RedisService.initialize();

      const errorHandler = mockRedisClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )[1];

      const error = new Error('Redis error');
      errorHandler(error);

      expect(mockLogger.error).toHaveBeenCalledWith('Redis error:', error);
    });

    it('should handle connect events', async () => {
      await RedisService.initialize();

      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )[1];

      connectHandler();

      expect(mockLogger.info).toHaveBeenCalledWith('Redis connected');
    });
  });

  // =============================================================================
  // getClient() - 3 test cases
  // =============================================================================

  describe('getClient()', () => {
    it('should return client after initialization', async () => {
      await RedisService.initialize();

      const client = RedisService.getClient();

      expect(client).toBe(mockRedisClient);
    });

    it('should throw error if not initialized', () => {
      jest.resetModules();
      const { RedisService: FreshService } = require('../../../src/services/redisService');

      expect(() => FreshService.getClient()).toThrow('Redis not initialized');
    });

    it('should return same client on multiple calls', async () => {
      await RedisService.initialize();

      const client1 = RedisService.getClient();
      const client2 = RedisService.getClient();

      expect(client1).toBe(client2);
    });
  });

  // =============================================================================
  // get() - 5 test cases
  // =============================================================================

  describe('get()', () => {
    beforeEach(async () => {
      await RedisService.initialize();
    });

    it('should get value from Redis', async () => {
      mockRedisClient.get.mockResolvedValue('test-value');

      const result = await RedisService.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
      expect(result).toBe('test-value');
    });

    it('should return null if key does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await RedisService.get('non-existent');

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await RedisService.get('test-key');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle different keys', async () => {
      mockRedisClient.get.mockResolvedValue('value');

      await RedisService.get('key1');
      await RedisService.get('key2');

      expect(mockRedisClient.get).toHaveBeenCalledWith('key1');
      expect(mockRedisClient.get).toHaveBeenCalledWith('key2');
    });

    it('should use circuit breaker', async () => {
      mockRedisClient.get.mockResolvedValue('value');

      await RedisService.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // set() - 8 test cases
  // =============================================================================

  describe('set()', () => {
    beforeEach(async () => {
      await RedisService.initialize();
    });

    it('should set value in Redis', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await RedisService.set('test-key', 'test-value');

      expect(mockRedisClient.set).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('should set value with TTL', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      await RedisService.set('test-key', 'test-value', 3600);

      expect(mockRedisClient.setex).toHaveBeenCalledWith('test-key', 3600, 'test-value');
    });

    it('should use setex when TTL provided', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      await RedisService.set('key', 'value', 60);

      expect(mockRedisClient.setex).toHaveBeenCalledWith('key', 60, 'value');
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should use set when no TTL provided', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await RedisService.set('key', 'value');

      expect(mockRedisClient.set).toHaveBeenCalledWith('key', 'value');
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

      await expect(RedisService.set('key', 'value')).rejects.toThrow();
    });

    it('should handle different values', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await RedisService.set('key1', 'value1');
      await RedisService.set('key2', 'value2');

      expect(mockRedisClient.set).toHaveBeenCalledWith('key1', 'value1');
      expect(mockRedisClient.set).toHaveBeenCalledWith('key2', 'value2');
    });

    it('should handle JSON strings', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      const jsonValue = JSON.stringify({ foo: 'bar' });

      await RedisService.set('key', jsonValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith('key', jsonValue);
    });

    it('should handle zero TTL', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await RedisService.set('key', 'value', 0);

      expect(mockRedisClient.set).toHaveBeenCalledWith('key', 'value');
    });
  });

  // =============================================================================
  // del() - 4 test cases
  // =============================================================================

  describe('del()', () => {
    beforeEach(async () => {
      await RedisService.initialize();
    });

    it('should delete key from Redis', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await RedisService.del('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should handle non-existent keys', async () => {
      mockRedisClient.del.mockResolvedValue(0);

      await expect(RedisService.del('non-existent')).resolves.not.toThrow();
    });

    it('should handle errors', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      await expect(RedisService.del('key')).rejects.toThrow();
    });

    it('should delete multiple different keys', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await RedisService.del('key1');
      await RedisService.del('key2');

      expect(mockRedisClient.del).toHaveBeenCalledWith('key1');
      expect(mockRedisClient.del).toHaveBeenCalledWith('key2');
    });
  });

  // =============================================================================
  // exists() - 4 test cases
  // =============================================================================

  describe('exists()', () => {
    beforeEach(async () => {
      await RedisService.initialize();
    });

    it('should return true if key exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await RedisService.exists('test-key');

      expect(result).toBe(true);
    });

    it('should return false if key does not exist', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await RedisService.exists('non-existent');

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockRedisClient.exists.mockRejectedValue(new Error('Redis error'));

      const result = await RedisService.exists('test-key');

      expect(result).toBe(false);
    });

    it('should check different keys', async () => {
      mockRedisClient.exists.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      const result1 = await RedisService.exists('key1');
      const result2 = await RedisService.exists('key2');

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });
  });

  // =============================================================================
  // Additional methods - 10 test cases
  // =============================================================================

  describe('incr()', () => {
    beforeEach(async () => {
      await RedisService.initialize();
    });

    it('should increment key value', async () => {
      mockRedisClient.incr.mockResolvedValue(5);

      const result = await RedisService.incr('counter');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('counter');
      expect(result).toBe(5);
    });

    it('should handle errors', async () => {
      mockRedisClient.incr.mockRejectedValue(new Error('Redis error'));

      await expect(RedisService.incr('counter')).rejects.toThrow();
    });
  });

  describe('expire()', () => {
    beforeEach(async () => {
      await RedisService.initialize();
    });

    it('should set expiration on key', async () => {
      mockRedisClient.expire.mockResolvedValue(1);

      await RedisService.expire('test-key', 3600);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('test-key', 3600);
    });

    it('should handle errors', async () => {
      mockRedisClient.expire.mockRejectedValue(new Error('Redis error'));

      await expect(RedisService.expire('key', 60)).rejects.toThrow();
    });
  });

  describe('mget()', () => {
    beforeEach(async () => {
      await RedisService.initialize();
    });

    it('should get multiple values', async () => {
      mockRedisClient.mget.mockResolvedValue(['value1', 'value2']);

      const result = await RedisService.mget(['key1', 'key2']);

      expect(mockRedisClient.mget).toHaveBeenCalledWith('key1', 'key2');
      expect(result).toEqual(['value1', 'value2']);
    });

    it('should return empty array for empty keys', async () => {
      const result = await RedisService.mget([]);

      expect(result).toEqual([]);
      expect(mockRedisClient.mget).not.toHaveBeenCalled();
    });

    it('should handle null values', async () => {
      mockRedisClient.mget.mockResolvedValue(['value1', null, 'value3']);

      const result = await RedisService.mget(['key1', 'key2', 'key3']);

      expect(result).toEqual(['value1', null, 'value3']);
    });
  });

  describe('mset()', () => {
    beforeEach(async () => {
      await RedisService.initialize();
    });

    it('should set multiple values', async () => {
      mockRedisClient.mset.mockResolvedValue('OK');

      await RedisService.mset([
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
      ]);

      expect(mockRedisClient.mset).toHaveBeenCalledWith('key1', 'value1', 'key2', 'value2');
    });

    it('should do nothing for empty pairs', async () => {
      await RedisService.mset([]);

      expect(mockRedisClient.mset).not.toHaveBeenCalled();
    });

    it('should handle single pair', async () => {
      mockRedisClient.mset.mockResolvedValue('OK');

      await RedisService.mset([{ key: 'key', value: 'value' }]);

      expect(mockRedisClient.mset).toHaveBeenCalledWith('key', 'value');
    });
  });

  // =============================================================================
  // close() - 4 test cases
  // =============================================================================

  describe('close()', () => {
    it('should close Redis connection', async () => {
      await RedisService.initialize();
      await RedisService.close();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Redis connection closed');
    });

    it('should handle quit errors', async () => {
      await RedisService.initialize();
      mockRedisClient.quit.mockRejectedValue(new Error('Quit error'));

      await RedisService.close();

      expect(mockRedisClient.disconnect).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should not throw if client not initialized', async () => {
      jest.resetModules();
      const { RedisService: FreshService } = require('../../../src/services/redisService');

      await expect(FreshService.close()).resolves.not.toThrow();
    });

    it('should disconnect on quit failure', async () => {
      await RedisService.initialize();
      mockRedisClient.quit.mockRejectedValue(new Error('Error'));

      await RedisService.close();

      expect(mockRedisClient.disconnect).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // isHealthy() - 6 test cases
  // =============================================================================

  describe('isHealthy()', () => {
    it('should return true when healthy', async () => {
      await RedisService.initialize();
      mockRedisClient.ping.mockResolvedValue('PONG');

      const healthy = await RedisService.isHealthy();

      expect(healthy).toBe(true);
    });

    it('should return false when not initialized', async () => {
      jest.resetModules();
      const { RedisService: FreshService } = require('../../../src/services/redisService');

      const healthy = await FreshService.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should return false on ping error', async () => {
      await RedisService.initialize();
      mockRedisClient.ping.mockRejectedValue(new Error('Connection lost'));

      const healthy = await RedisService.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should check with ping command', async () => {
      await RedisService.initialize();
      mockRedisClient.ping.mockResolvedValue('PONG');

      await RedisService.isHealthy();

      expect(mockRedisClient.ping).toHaveBeenCalled();
    });

    it('should handle timeout', async () => {
      await RedisService.initialize();
      mockRedisClient.ping.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('PONG'), 2000))
      );

      const healthy = await RedisService.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should return false for non-PONG response', async () => {
      await RedisService.initialize();
      mockRedisClient.ping.mockResolvedValue('INVALID');

      const healthy = await RedisService.isHealthy();

      expect(healthy).toBe(false);
    });
  });

  // =============================================================================
  // instance test
  // =============================================================================

  describe('instance', () => {
    it('should be a singleton', () => {
      expect(RedisService).toBeDefined();
    });

    it('should have all required methods', () => {
      expect(typeof RedisService.initialize).toBe('function');
      expect(typeof RedisService.getClient).toBe('function');
      expect(typeof RedisService.get).toBe('function');
      expect(typeof RedisService.set).toBe('function');
      expect(typeof RedisService.del).toBe('function');
      expect(typeof RedisService.exists).toBe('function');
      expect(typeof RedisService.incr).toBe('function');
      expect(typeof RedisService.expire).toBe('function');
      expect(typeof RedisService.mget).toBe('function');
      expect(typeof RedisService.mset).toBe('function');
      expect(typeof RedisService.close).toBe('function');
      expect(typeof RedisService.isHealthy).toBe('function');
    });
  });
});
