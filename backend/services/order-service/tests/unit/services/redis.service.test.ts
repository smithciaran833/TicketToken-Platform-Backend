/**
 * Unit Tests: Redis Service
 * Tests Redis service initialization and operations
 */

// Mock ioredis
const mockRedisInstance = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  ping: jest.fn(),
  quit: jest.fn(),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('RedisService', () => {
  let RedisService: any;
  let Redis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    // Reset mock implementations
    mockRedisInstance.get.mockReset();
    mockRedisInstance.set.mockReset();
    mockRedisInstance.del.mockReset();
    mockRedisInstance.ping.mockResolvedValue('PONG');
    mockRedisInstance.quit.mockResolvedValue('OK');
    mockRedisInstance.on.mockReset();
    
    // Re-import to get fresh instance
    Redis = require('ioredis');
    const module = require('../../../src/services/redis.service');
    RedisService = module.RedisService;
  });

  // ============================================
  // initialize
  // ============================================
  describe('initialize', () => {
    it('should create Redis client with default config', async () => {
      await RedisService.initialize();

      expect(Redis).toHaveBeenCalledWith(expect.objectContaining({
        host: expect.any(String),
        port: expect.any(Number),
      }));
    });

    it('should ping Redis to verify connection', async () => {
      await RedisService.initialize();

      expect(mockRedisInstance.ping).toHaveBeenCalled();
    });

    it('should register error handler', async () => {
      await RedisService.initialize();

      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should register connect handler', async () => {
      await RedisService.initialize();

      expect(mockRedisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should configure retry strategy', async () => {
      await RedisService.initialize();

      const config = Redis.mock.calls[0][0];
      expect(config.retryStrategy).toBeDefined();
      
      // Test retry strategy returns delay
      const delay = config.retryStrategy(1);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(2000);
    });

    it('should cap retry delay at 2000ms', async () => {
      await RedisService.initialize();

      const config = Redis.mock.calls[0][0];
      const delay = config.retryStrategy(100); // Large retry count
      expect(delay).toBe(2000);
    });
  });

  // ============================================
  // get
  // ============================================
  describe('get', () => {
    beforeEach(async () => {
      await RedisService.initialize();
    });

    it('should return value for existing key', async () => {
      mockRedisInstance.get.mockResolvedValue('test-value');

      const result = await RedisService.get('test-key');

      expect(result).toBe('test-value');
      expect(mockRedisInstance.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null for non-existing key', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await RedisService.get('non-existing');

      expect(result).toBeNull();
    });

    it('should throw if not initialized', async () => {
      jest.resetModules();
      const { RedisService: FreshService } = require('../../../src/services/redis.service');

      await expect(FreshService.get('key')).rejects.toThrow('Redis not initialized');
    });
  });

  // ============================================
  // set
  // ============================================
  describe('set', () => {
    beforeEach(async () => {
      await RedisService.initialize();
    });

    it('should set value without TTL', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await RedisService.set('key', 'value');

      expect(mockRedisInstance.set).toHaveBeenCalledWith('key', 'value');
    });

    it('should set value with TTL', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await RedisService.set('key', 'value', 300);

      expect(mockRedisInstance.set).toHaveBeenCalledWith('key', 'value', 'EX', 300);
    });

    it('should throw if not initialized', async () => {
      jest.resetModules();
      const { RedisService: FreshService } = require('../../../src/services/redis.service');

      await expect(FreshService.set('key', 'value')).rejects.toThrow('Redis not initialized');
    });
  });

  // ============================================
  // del
  // ============================================
  describe('del', () => {
    beforeEach(async () => {
      await RedisService.initialize();
    });

    it('should delete key and return count', async () => {
      mockRedisInstance.del.mockResolvedValue(1);

      const result = await RedisService.del('key');

      expect(result).toBe(1);
      expect(mockRedisInstance.del).toHaveBeenCalledWith('key');
    });

    it('should return 0 for non-existing key', async () => {
      mockRedisInstance.del.mockResolvedValue(0);

      const result = await RedisService.del('non-existing');

      expect(result).toBe(0);
    });

    it('should throw if not initialized', async () => {
      jest.resetModules();
      const { RedisService: FreshService } = require('../../../src/services/redis.service');

      await expect(FreshService.del('key')).rejects.toThrow('Redis not initialized');
    });
  });

  // ============================================
  // close
  // ============================================
  describe('close', () => {
    it('should quit Redis client', async () => {
      await RedisService.initialize();

      await RedisService.close();

      expect(mockRedisInstance.quit).toHaveBeenCalled();
    });

    it('should handle close when not initialized', async () => {
      jest.resetModules();
      const { RedisService: FreshService } = require('../../../src/services/redis.service');

      await expect(FreshService.close()).resolves.toBeUndefined();
    });

    it('should set client to null after close', async () => {
      await RedisService.initialize();
      await RedisService.close();

      await expect(RedisService.get('key')).rejects.toThrow('Redis not initialized');
    });
  });

  // ============================================
  // getClient
  // ============================================
  describe('getClient', () => {
    it('should return Redis client', async () => {
      await RedisService.initialize();

      const client = RedisService.getClient();

      expect(client).toBe(mockRedisInstance);
    });

    it('should throw if not initialized', () => {
      jest.resetModules();
      const { RedisService: FreshService } = require('../../../src/services/redis.service');

      expect(() => FreshService.getClient()).toThrow('Redis not initialized');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('should log errors from Redis', async () => {
      const { logger } = require('../../../src/utils/logger');
      await RedisService.initialize();

      // Get the error handler that was registered
      const errorHandler = mockRedisInstance.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];

      // Simulate error
      const error = new Error('Connection lost');
      errorHandler(error);

      expect(logger.error).toHaveBeenCalledWith(
        'Redis connection error',
        expect.objectContaining({ error })
      );
    });

    it('should log successful connection', async () => {
      const { logger } = require('../../../src/utils/logger');
      await RedisService.initialize();

      // Get the connect handler that was registered
      const connectHandler = mockRedisInstance.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];

      // Simulate connect
      connectHandler();

      expect(logger.info).toHaveBeenCalledWith('Redis connected');
    });
  });
});
