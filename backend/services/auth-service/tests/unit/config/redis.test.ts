const mockRedisClient = { ping: jest.fn() };
const mockPubClient = { ping: jest.fn() };
const mockSubClient = { ping: jest.fn() };
const mockConnectionManager = { disconnect: jest.fn() };

jest.mock('@tickettoken/shared', () => ({
  getRedisClient: jest.fn().mockResolvedValue(mockRedisClient),
  getRedisPubClient: jest.fn().mockResolvedValue(mockPubClient),
  getRedisSubClient: jest.fn().mockResolvedValue(mockSubClient),
  getConnectionManager: jest.fn().mockReturnValue(mockConnectionManager),
}));

// Need to reset module state between tests
let redisModule: any;

describe('redis config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('getRedis', () => {
    it('throws if called before initRedis', async () => {
      redisModule = await import('../../../src/config/redis');
      
      expect(() => redisModule.getRedis()).toThrow('Redis not initialized');
    });

    it('returns client after initRedis', async () => {
      redisModule = await import('../../../src/config/redis');
      
      await redisModule.initRedis();
      const client = redisModule.getRedis();
      
      expect(client).toBe(mockRedisClient);
    });
  });

  describe('getPub', () => {
    it('throws if called before initRedis', async () => {
      redisModule = await import('../../../src/config/redis');
      
      expect(() => redisModule.getPub()).toThrow('Redis pub not initialized');
    });

    it('returns pub client after initRedis', async () => {
      redisModule = await import('../../../src/config/redis');
      
      await redisModule.initRedis();
      const client = redisModule.getPub();
      
      expect(client).toBe(mockPubClient);
    });
  });

  describe('getSub', () => {
    it('throws if called before initRedis', async () => {
      redisModule = await import('../../../src/config/redis');
      
      expect(() => redisModule.getSub()).toThrow('Redis sub not initialized');
    });

    it('returns sub client after initRedis', async () => {
      redisModule = await import('../../../src/config/redis');
      
      await redisModule.initRedis();
      const client = redisModule.getSub();
      
      expect(client).toBe(mockSubClient);
    });
  });

  describe('initRedis', () => {
    it('initializes all clients', async () => {
      const { getRedisClient, getRedisPubClient, getRedisSubClient } = require('@tickettoken/shared');
      redisModule = await import('../../../src/config/redis');
      
      await redisModule.initRedis();
      
      expect(getRedisClient).toHaveBeenCalled();
      expect(getRedisPubClient).toHaveBeenCalled();
      expect(getRedisSubClient).toHaveBeenCalled();
    });

    it('only initializes once', async () => {
      const { getRedisClient } = require('@tickettoken/shared');
      redisModule = await import('../../../src/config/redis');
      
      await redisModule.initRedis();
      await redisModule.initRedis();
      await redisModule.initRedis();
      
      expect(getRedisClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('closeRedisConnections', () => {
    it('disconnects via connection manager', async () => {
      redisModule = await import('../../../src/config/redis');
      
      await redisModule.initRedis();
      await redisModule.closeRedisConnections();
      
      expect(mockConnectionManager.disconnect).toHaveBeenCalled();
    });
  });
});
