/**
 * Unit Tests for Redis Configuration
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/metrics');
jest.mock('ioredis');

describe('Redis Configuration', () => {
  let logger: any;
  let incrementMetric: jest.Mock;
  let RedisMock: jest.Mock;
  let mockRedisInstance: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    
    // Mock logger
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    // Mock metrics
    incrementMetric = jest.fn();
    
    // Mock Redis instance
    mockRedisInstance = {
      on: jest.fn().mockReturnThis(),
      ping: jest.fn<any>().mockResolvedValue('PONG'),
      info: jest.fn<any>().mockResolvedValue('redis_version:6.2.0\nused_memory_human:1M\nconnected_clients:10'),
      quit: jest.fn<any>().mockResolvedValue('OK'),
      set: jest.fn<any>().mockResolvedValue('OK'),
      setex: jest.fn<any>().mockResolvedValue('OK'),
      get: jest.fn<any>().mockResolvedValue('value'),
      del: jest.fn<any>().mockResolvedValue(1)
    };
    
    // Mock Redis constructor
    RedisMock = jest.fn().mockImplementation(() => mockRedisInstance);
    
    // Setup mocks
    jest.doMock('../../../src/utils/logger', () => ({ logger }));
    jest.doMock('../../../src/utils/metrics', () => ({ incrementMetric }));
    jest.doMock('ioredis', () => RedisMock);
    
    // Set test env
    process.env.NODE_ENV = 'test';
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createRedisClient', () => {
    it('should create Redis client with default config', async () => {
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      expect(RedisMock).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6379,
          keyPrefix: 'compliance:',
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          enableOfflineQueue: true
        })
      );
    });

    it('should parse REDIS_URL correctly', async () => {
      process.env.REDIS_URL = 'redis://user:pass@redis-host:6380/1';
      jest.resetModules();
      
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      expect(RedisMock).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'redis-host',
          port: 6380,
          password: 'pass',
          db: 1
        })
      );
    });

    it('should configure TLS when enabled', async () => {
      process.env.REDIS_TLS_ENABLED = 'true';
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      expect(RedisMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tls: {
            rejectUnauthorized: true
          }
        })
      );
    });

    it('should not configure TLS when disabled', async () => {
      process.env.REDIS_TLS_ENABLED = 'false';
      jest.resetModules();
      
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      const callArgs = RedisMock.mock.calls[0][0] as any;
      expect(callArgs.tls).toBeUndefined();
    });

    it('should register event handlers', async () => {
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      expect(mockRedisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('end', expect.any(Function));
    });

    it('should log on connect event', async () => {
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      const connectHandler = mockRedisInstance.on.mock.calls.find((call: any) => call[0] === 'connect')[1];
      connectHandler();
      
      expect(logger.info).toHaveBeenCalledWith('Redis connected');
      expect(incrementMetric).toHaveBeenCalledWith('redis_connections_total');
    });

    it('should log on error event', async () => {
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      const errorHandler = mockRedisInstance.on.mock.calls.find((call: any) => call[0] === 'error')[1];
      errorHandler(new Error('Connection failed'));
      
      expect(logger.error).toHaveBeenCalledWith(
        { error: 'Connection failed' },
        'Redis error'
      );
      expect(incrementMetric).toHaveBeenCalledWith('redis_errors_total');
    });

    it('should configure retry strategy with jitter', async () => {
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      const options = RedisMock.mock.calls[0][0] as any;
      expect(options.retryStrategy).toBeInstanceOf(Function);
    });

    it('should retry with exponential backoff', async () => {
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      const retryStrategy = (RedisMock.mock.calls[0][0] as any).retryStrategy;
      
      const delay1 = retryStrategy(1);
      const delay2 = retryStrategy(2);
      
      expect(delay1).toBeGreaterThanOrEqual(0);
      expect(delay2).toBeGreaterThanOrEqual(0);
      expect(delay1).toBeLessThanOrEqual(200); // baseDelay * 2^1
      expect(delay2).toBeLessThanOrEqual(400); // baseDelay * 2^2
    });

    it('should stop retrying after max attempts', async () => {
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      const retryStrategy = (RedisMock.mock.calls[0][0] as any).retryStrategy;
      
      const result = retryStrategy(11); // maxRetries is 10
      
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 11 }),
        'Redis max retries exceeded, giving up'
      );
      expect(incrementMetric).toHaveBeenCalledWith('redis_connection_failures_total');
    });
  });

  describe('getRedisClient', () => {
    it('should create client on first call', async () => {
      const { getRedisClient } = await import('../../../src/config/redis');
      
      const client = getRedisClient();
      
      expect(RedisMock).toHaveBeenCalledTimes(1);
      expect(client).toBe(mockRedisInstance);
    });

    it('should return same client on subsequent calls', async () => {
      const { getRedisClient } = await import('../../../src/config/redis');
      
      const client1 = getRedisClient();
      const client2 = getRedisClient();
      
      expect(RedisMock).toHaveBeenCalledTimes(1);
      expect(client1).toBe(client2);
    });
  });

  describe('closeRedisConnection', () => {
    it('should close existing connection', async () => {
      const { getRedisClient, closeRedisConnection } = await import('../../../src/config/redis');
      
      getRedisClient();
      await closeRedisConnection();
      
      expect(mockRedisInstance.quit).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Closing Redis connection');
    });

    it('should handle null client gracefully', async () => {
      const { closeRedisConnection } = await import('../../../src/config/redis');
      
      await expect(closeRedisConnection()).resolves.not.toThrow();
    });

    it('should allow creating new client after close', async () => {
      const { getRedisClient, closeRedisConnection } = await import('../../../src/config/redis');
      
      getRedisClient();
      await closeRedisConnection();
      getRedisClient();
      
      expect(RedisMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkRedisHealth', () => {
    it('should return connected status on successful ping', async () => {
      const { checkRedisHealth } = await import('../../../src/config/redis');
      
      const health = await checkRedisHealth();
      
      expect(health.connected).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(mockRedisInstance.ping).toHaveBeenCalled();
    });

    it('should parse Redis info correctly', async () => {
      const { checkRedisHealth } = await import('../../../src/config/redis');
      
      const health = await checkRedisHealth();
      
      expect(health.info.version).toBe('6.2.0');
      expect(health.info.usedMemory).toBe('1M');
      expect(health.info.connectedClients).toBe(10);
    });

    it('should return disconnected on ping failure', async () => {
      mockRedisInstance.ping.mockRejectedValue(new Error('Connection lost'));
      
      const { checkRedisHealth } = await import('../../../src/config/redis');
      
      const health = await checkRedisHealth();
      
      expect(health.connected).toBe(false);
      expect(health.info).toEqual({});
    });

    it('should return disconnected on wrong ping response', async () => {
      mockRedisInstance.ping.mockResolvedValue('WRONG');
      
      const { checkRedisHealth } = await import('../../../src/config/redis');
      
      const health = await checkRedisHealth();
      
      expect(health.connected).toBe(false);
    });

    it('should measure latency correctly', async () => {
      mockRedisInstance.ping.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('PONG'), 50))
      );
      
      const { checkRedisHealth } = await import('../../../src/config/redis');
      
      const health = await checkRedisHealth();
      
      expect(health.latencyMs).toBeGreaterThanOrEqual(50);
      expect(health.latencyMs).toBeLessThan(100);
    });
  });

  describe('getTenantKey', () => {
    it('should return key with tenant prefix', async () => {
      const { getTenantKey } = await import('../../../src/config/redis');
      
      const key = getTenantKey('tenant-123', 'session');
      
      expect(key).toBe('tenant:tenant-123:session');
    });

    it('should handle special characters', async () => {
      const { getTenantKey } = await import('../../../src/config/redis');
      
      const key = getTenantKey('tenant-123', 'key:with:colons');
      
      expect(key).toBe('tenant:tenant-123:key:with:colons');
    });
  });

  describe('setWithTenant', () => {
    it('should set value with tenant prefix and TTL', async () => {
      const { setWithTenant } = await import('../../../src/config/redis');
      
      await setWithTenant('tenant-123', 'key', 'value', 3600);
      
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'tenant:tenant-123:key',
        3600,
        'value'
      );
    });

    it('should set value without TTL', async () => {
      const { setWithTenant } = await import('../../../src/config/redis');
      
      await setWithTenant('tenant-123', 'key', 'value');
      
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'tenant:tenant-123:key',
        'value'
      );
    });
  });

  describe('getWithTenant', () => {
    it('should get value with tenant prefix', async () => {
      const { getWithTenant } = await import('../../../src/config/redis');
      
      const value = await getWithTenant('tenant-123', 'key');
      
      expect(mockRedisInstance.get).toHaveBeenCalledWith('tenant:tenant-123:key');
      expect(value).toBe('value');
    });

    it('should return null when key not found', async () => {
      mockRedisInstance.get.mockResolvedValue(null);
      
      const { getWithTenant } = await import('../../../src/config/redis');
      
      const value = await getWithTenant('tenant-123', 'missing');
      
      expect(value).toBeNull();
    });
  });

  describe('deleteWithTenant', () => {
    it('should delete value with tenant prefix', async () => {
      const { deleteWithTenant } = await import('../../../src/config/redis');
      
      const result = await deleteWithTenant('tenant-123', 'key');
      
      expect(mockRedisInstance.del).toHaveBeenCalledWith('tenant:tenant-123:key');
      expect(result).toBe(1);
    });

    it('should return 0 when key not found', async () => {
      mockRedisInstance.del.mockResolvedValue(0);
      
      const { deleteWithTenant } = await import('../../../src/config/redis');
      
      const result = await deleteWithTenant('tenant-123', 'missing');
      
      expect(result).toBe(0);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff without jitter', async () => {
      // We need to test the internal function indirectly through retry strategy
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      const retryStrategy = (RedisMock.mock.calls[0][0] as any).retryStrategy;
      
      // With jitter, we can't predict exact values, but we can test the range
      const delay = retryStrategy(1);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(200); // baseDelay * 2^1
    });

    it('should respect max delay cap', async () => {
      const { createRedisClient } = await import('../../../src/config/redis');
      
      createRedisClient();
      
      const retryStrategy = (RedisMock.mock.calls[0][0] as any).retryStrategy;
      
      const delay = retryStrategy(5); // High attempt number (but below max retries of 10)
      expect(delay).toBeLessThanOrEqual(30000); // maxDelay
      expect(delay).toBeGreaterThanOrEqual(0);
    });
  });
});
