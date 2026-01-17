// @ts-nocheck
import Redis from 'ioredis';
import { initializeRedis, getRedis } from '../../../src/config/redis';

// Mock ioredis
jest.mock('ioredis');

describe('Redis Config', () => {
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the redis singleton
    jest.resetModules();
    
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      on: jest.fn(),
      status: 'ready'
    };

    (Redis as any).mockImplementation(() => mockRedis);
  });

  describe('initializeRedis', () => {
    it('should create Redis client with correct config', () => {
      process.env.REDIS_HOST = 'testredis';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'testpass';

      const redis = initializeRedis();

      expect(redis).toBeDefined();
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'testredis',
          port: 6380,
          password: 'testpass'
        })
      );
    });

    it('should use default values when env vars not set', () => {
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_PASSWORD;

      initializeRedis();

      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'redis',
          port: 6379,
          password: undefined
        })
      );
    });

    it('should return Redis client instance', () => {
      const redis = initializeRedis();

      expect(redis).toBeDefined();
      expect(redis.get).toBeDefined();
      expect(redis.set).toBeDefined();
      expect(redis.del).toBeDefined();
    });

    it('should register connect event handler', () => {
      const redis = initializeRedis();

      expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should register error event handler', () => {
      const redis = initializeRedis();

      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should have retry strategy', () => {
      initializeRedis();

      const call = (Redis as any).mock.calls[0][0];
      expect(call.retryStrategy).toBeDefined();
      
      // Test retry strategy
      const delay = call.retryStrategy(1);
      expect(delay).toBe(50);
      
      const delay2 = call.retryStrategy(10);
      expect(delay2).toBe(500);
      
      const delay3 = call.retryStrategy(100);
      expect(delay3).toBe(2000); // Capped at 2000
    });
  });

  describe('getRedis', () => {
    it('should throw error when Redis not initialized', () => {
      // Import fresh module to reset singleton
      jest.isolateModules(() => {
        const { getRedis } = require('../../../src/config/redis');
        expect(() => getRedis()).toThrow('Redis not initialized');
      });
    });

    it('should return Redis client after initialization', () => {
      initializeRedis();
      const redis = getRedis();

      expect(redis).toBeDefined();
    });
  });
});
