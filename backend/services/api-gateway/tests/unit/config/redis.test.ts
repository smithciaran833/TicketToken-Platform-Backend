// Mock @tickettoken/shared BEFORE importing
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockManager = {
  disconnect: mockDisconnect,
};

jest.mock('@tickettoken/shared', () => {
  const mockRedisClient = { status: 'ready', get: jest.fn(), set: jest.fn() };
  const mockPubClient = { status: 'ready', publish: jest.fn() };
  const mockSubClient = { status: 'ready', subscribe: jest.fn() };

  return {
    getRedisClient: jest.fn().mockResolvedValue(mockRedisClient),
    getRedisPubClient: jest.fn().mockResolvedValue(mockPubClient),
    getRedisSubClient: jest.fn().mockResolvedValue(mockSubClient),
    getConnectionManager: jest.fn(() => mockManager),
  };
});

import { initRedis, getRedis, getPub, getSub, closeRedisConnections, REDIS_KEYS, REDIS_TTL } from '../../../src/config/redis';

describe('redis.ts', () => {
  let moduleInstance: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDisconnect.mockClear();
    
    // Reset the module to clear initialization state
    jest.resetModules();
    
    // Re-import with the same mocks
    moduleInstance = await import('../../../src/config/redis');
  });

  describe('initRedis', () => {
    it('initializes all three Redis clients', async () => {
      const { getRedisClient, getRedisPubClient, getRedisSubClient } = require('@tickettoken/shared');

      await moduleInstance.initRedis();

      expect(getRedisClient).toHaveBeenCalledTimes(1);
      expect(getRedisPubClient).toHaveBeenCalledTimes(1);
      expect(getRedisSubClient).toHaveBeenCalledTimes(1);
    });

    it('does not reinitialize if already initialized', async () => {
      const { getRedisClient } = require('@tickettoken/shared');

      await moduleInstance.initRedis();
      await moduleInstance.initRedis();
      await moduleInstance.initRedis();

      // Should only call once even with multiple calls
      expect(getRedisClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRedis', () => {
    it('returns main Redis client after initialization', async () => {
      await moduleInstance.initRedis();

      const client = moduleInstance.getRedis();

      expect(client).toBeDefined();
      expect(client.status).toBe('ready');
    });

    it('throws error if not initialized', () => {
      expect(() => moduleInstance.getRedis()).toThrow('Redis not initialized. Call initRedis() first.');
    });
  });

  describe('getPub', () => {
    it('returns pub Redis client after initialization', async () => {
      await moduleInstance.initRedis();

      const client = moduleInstance.getPub();

      expect(client).toBeDefined();
      expect(client.status).toBe('ready');
    });

    it('throws error if not initialized', () => {
      expect(() => moduleInstance.getPub()).toThrow('Redis pub not initialized. Call initRedis() first.');
    });
  });

  describe('getSub', () => {
    it('returns sub Redis client after initialization', async () => {
      await moduleInstance.initRedis();

      const client = moduleInstance.getSub();

      expect(client).toBeDefined();
      expect(client.status).toBe('ready');
    });

    it('throws error if not initialized', () => {
      expect(() => moduleInstance.getSub()).toThrow('Redis sub not initialized. Call initRedis() first.');
    });
  });

  describe('closeRedisConnections', () => {
    it('calls disconnect on connection manager', async () => {
      await moduleInstance.initRedis();
      await moduleInstance.closeRedisConnections();

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it('resets initialization state', async () => {
      await moduleInstance.initRedis();
      await moduleInstance.closeRedisConnections();

      // After closing, getRedis should throw
      expect(() => moduleInstance.getRedis()).toThrow('Redis not initialized');
    });
  });

  describe('REDIS_KEYS constants', () => {
    it('defines SESSION key prefix', () => {
      expect(REDIS_KEYS.SESSION).toBe('session:');
    });

    it('defines REFRESH_TOKEN key prefix', () => {
      expect(REDIS_KEYS.REFRESH_TOKEN).toBe('refresh_token:');
    });

    it('defines RATE_LIMIT key prefix', () => {
      expect(REDIS_KEYS.RATE_LIMIT).toBe('rl:');
    });

    it('defines API_KEY key prefix', () => {
      expect(REDIS_KEYS.API_KEY).toBe('api:key:');
    });

    it('defines CACHE_VENUE key prefix', () => {
      expect(REDIS_KEYS.CACHE_VENUE).toBe('cache:venue:');
    });

    it('defines CIRCUIT_BREAKER key prefix', () => {
      expect(REDIS_KEYS.CIRCUIT_BREAKER).toBe('cb:');
    });

    it('defines SERVICE_DISCOVERY key prefix', () => {
      expect(REDIS_KEYS.SERVICE_DISCOVERY).toBe('sd:');
    });

    it('defines SERVICE_HEALTH key prefix', () => {
      expect(REDIS_KEYS.SERVICE_HEALTH).toBe('health:');
    });
  });

  describe('REDIS_TTL constants', () => {
    it('defines CACHE_SHORT as 60 seconds', () => {
      expect(REDIS_TTL.CACHE_SHORT).toBe(60);
    });

    it('defines CACHE_MEDIUM as 300 seconds', () => {
      expect(REDIS_TTL.CACHE_MEDIUM).toBe(300);
    });

    it('defines CACHE_LONG as 3600 seconds', () => {
      expect(REDIS_TTL.CACHE_LONG).toBe(3600);
    });

    it('defines REFRESH_TOKEN as 604800 seconds', () => {
      expect(REDIS_TTL.REFRESH_TOKEN).toBe(604800);
    });
  });
});
