/**
 * Unit Tests for src/config/redis.ts
 */

// Mock @tickettoken/shared
const mockRedisClient = {
  on: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  quit: jest.fn(),
};

const mockConnectionManager = {
  disconnect: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@tickettoken/shared', () => ({
  getRedisClient: jest.fn().mockResolvedValue(mockRedisClient),
  getRedisPubClient: jest.fn().mockResolvedValue(mockRedisClient),
  getRedisSubClient: jest.fn().mockResolvedValue(mockRedisClient),
  getConnectionManager: jest.fn().mockReturnValue(mockConnectionManager),
}));

describe('config/redis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('initRedis()', () => {
    it('initializes redis clients', async () => {
      const { initRedis } = require('../../../src/config/redis');
      const { getRedisClient, getRedisPubClient, getRedisSubClient } = require('@tickettoken/shared');

      await initRedis();

      expect(getRedisClient).toHaveBeenCalled();
      expect(getRedisPubClient).toHaveBeenCalled();
      expect(getRedisSubClient).toHaveBeenCalled();
    });

    it('only initializes once', async () => {
      const { initRedis } = require('../../../src/config/redis');
      const { getRedisClient } = require('@tickettoken/shared');

      await initRedis();
      await initRedis();

      expect(getRedisClient).toHaveBeenCalledTimes(1);
    });

    it('registers event handlers', async () => {
      const { initRedis } = require('../../../src/config/redis');

      await initRedis();

      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
    });
  });

  describe('getRedis()', () => {
    it('throws if not initialized', () => {
      jest.resetModules();
      const { getRedis } = require('../../../src/config/redis');

      expect(() => getRedis()).toThrow('Redis not initialized');
    });

    it('returns redis client after init', async () => {
      const { initRedis, getRedis } = require('../../../src/config/redis');

      await initRedis();
      const client = getRedis();

      expect(client).toBeDefined();
    });
  });

  describe('getPub()', () => {
    it('throws if not initialized', () => {
      jest.resetModules();
      const { getPub } = require('../../../src/config/redis');

      expect(() => getPub()).toThrow('Redis pub not initialized');
    });

    it('returns pub client after init', async () => {
      const { initRedis, getPub } = require('../../../src/config/redis');

      await initRedis();
      const client = getPub();

      expect(client).toBeDefined();
    });
  });

  describe('getSub()', () => {
    it('throws if not initialized', () => {
      jest.resetModules();
      const { getSub } = require('../../../src/config/redis');

      expect(() => getSub()).toThrow('Redis sub not initialized');
    });

    it('returns sub client after init', async () => {
      const { initRedis, getSub } = require('../../../src/config/redis');

      await initRedis();
      const client = getSub();

      expect(client).toBeDefined();
    });
  });

  describe('closeRedisConnection()', () => {
    it('disconnects via connection manager', async () => {
      const { initRedis, closeRedisConnection } = require('../../../src/config/redis');

      await initRedis();
      await closeRedisConnection();

      expect(mockConnectionManager.disconnect).toHaveBeenCalled();
    });
  });
});
