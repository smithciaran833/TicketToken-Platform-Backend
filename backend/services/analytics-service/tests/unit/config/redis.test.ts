/**
 * Redis Configuration Tests
 */

// Create mock functions that persist
const mockRedisClient = {
  on: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue('OK'),
};

const mockConnectionManager = {
  disconnect: jest.fn().mockResolvedValue(undefined),
};

// Mock shared module BEFORE imports
jest.mock('@tickettoken/shared', () => ({
  getRedisClient: jest.fn().mockResolvedValue(mockRedisClient),
  getRedisPubClient: jest.fn().mockResolvedValue(mockRedisClient),
  getRedisSubClient: jest.fn().mockResolvedValue(mockRedisClient),
  getConnectionManager: jest.fn().mockReturnValue(mockConnectionManager),
}));

describe('Redis Config', () => {
  let redisModule: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.on.mockClear();
    mockRedisClient.ping.mockResolvedValue('PONG');
    mockConnectionManager.disconnect.mockResolvedValue(undefined);
    
    // Reset and re-import module
    jest.resetModules();
    
    // Re-apply mocks after resetModules
    jest.doMock('@tickettoken/shared', () => ({
      getRedisClient: jest.fn().mockResolvedValue(mockRedisClient),
      getRedisPubClient: jest.fn().mockResolvedValue(mockRedisClient),
      getRedisSubClient: jest.fn().mockResolvedValue(mockRedisClient),
      getConnectionManager: jest.fn().mockReturnValue(mockConnectionManager),
    }));
    
    redisModule = require('../../../src/config/redis');
  });

  describe('initRedis', () => {
    it('should initialize Redis clients', async () => {
      await redisModule.initRedis();
      
      const redis = redisModule.getRedis();
      expect(redis).toBeDefined();
    });

    it('should only initialize once', async () => {
      const shared = require('@tickettoken/shared');
      
      await redisModule.initRedis();
      await redisModule.initRedis();
      
      expect(shared.getRedisClient).toHaveBeenCalledTimes(1);
    });

    it('should set up event listeners', async () => {
      await redisModule.initRedis();
      
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('getRedis', () => {
    it('should throw if not initialized', () => {
      jest.resetModules();
      jest.doMock('@tickettoken/shared', () => ({
        getRedisClient: jest.fn(),
        getRedisPubClient: jest.fn(),
        getRedisSubClient: jest.fn(),
        getConnectionManager: jest.fn().mockReturnValue(mockConnectionManager),
      }));
      
      const freshModule = require('../../../src/config/redis');
      
      expect(() => freshModule.getRedis()).toThrow('Redis not initialized');
    });

    it('should return Redis client after initialization', async () => {
      await redisModule.initRedis();
      const client = redisModule.getRedis();
      
      expect(client).toBeDefined();
    });
  });

  describe('getRedisClient alias', () => {
    it('should be same as getRedis', async () => {
      await redisModule.initRedis();
      
      expect(redisModule.getRedisClient).toBe(redisModule.getRedis);
    });
  });

  describe('getPub', () => {
    it('should throw if not initialized', () => {
      jest.resetModules();
      jest.doMock('@tickettoken/shared', () => ({
        getRedisClient: jest.fn(),
        getRedisPubClient: jest.fn(),
        getRedisSubClient: jest.fn(),
        getConnectionManager: jest.fn().mockReturnValue(mockConnectionManager),
      }));
      
      const freshModule = require('../../../src/config/redis');
      
      expect(() => freshModule.getPub()).toThrow('Redis pub not initialized');
    });

    it('should return pub client after initialization', async () => {
      await redisModule.initRedis();
      const client = redisModule.getPub();
      
      expect(client).toBeDefined();
    });
  });

  describe('getSub', () => {
    it('should throw if not initialized', () => {
      jest.resetModules();
      jest.doMock('@tickettoken/shared', () => ({
        getRedisClient: jest.fn(),
        getRedisPubClient: jest.fn(),
        getRedisSubClient: jest.fn(),
        getConnectionManager: jest.fn().mockReturnValue(mockConnectionManager),
      }));
      
      const freshModule = require('../../../src/config/redis');
      
      expect(() => freshModule.getSub()).toThrow('Redis sub not initialized');
    });

    it('should return sub client after initialization', async () => {
      await redisModule.initRedis();
      const client = redisModule.getSub();
      
      expect(client).toBeDefined();
    });
  });

  describe('checkRedisHealth', () => {
    it('should return healthy status when Redis is connected', async () => {
      await redisModule.initRedis();
      const health = await redisModule.checkRedisHealth();
      
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.error).toBeUndefined();
    });

    it('should return unhealthy when not initialized', async () => {
      jest.resetModules();
      jest.doMock('@tickettoken/shared', () => ({
        getRedisClient: jest.fn(),
        getRedisPubClient: jest.fn(),
        getRedisSubClient: jest.fn(),
        getConnectionManager: jest.fn().mockReturnValue(mockConnectionManager),
      }));
      
      const freshModule = require('../../../src/config/redis');
      
      const health = await freshModule.checkRedisHealth();
      
      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Redis not initialized');
    });
  });

  describe('closeRedisConnections', () => {
    it('should close all connections', async () => {
      await redisModule.initRedis();
      await redisModule.closeRedisConnections();
      
      expect(mockConnectionManager.disconnect).toHaveBeenCalled();
    });
  });
});
