/**
 * RedisService Integration Tests
 * 
 * Tests Redis connection and operations including:
 * - Initialization and connection
 * - Get/Set operations
 * - TTL handling
 * - Key existence checks
 * - Graceful shutdown
 */

import { RedisService } from '../../../src/services/redisService';

describe('RedisService', () => {
  afterAll(async () => {
    try {
      await RedisService.close();
    } catch (e) {
      // Ignore if already closed
    }
  });

  // ==========================================================================
  // initialize
  // ==========================================================================
  describe('initialize', () => {
    beforeEach(async () => {
      await RedisService.close();
    });

    it('should initialize Redis connection successfully', async () => {
      await RedisService.initialize();
      
      const client = RedisService.getClient();
      expect(client).toBeDefined();
    });

    it('should respond to ping after initialization', async () => {
      await RedisService.initialize();
      
      const client = RedisService.getClient();
      const pong = await client.ping();
      
      expect(pong).toBe('PONG');
    });
  });

  // ==========================================================================
  // get / set
  // ==========================================================================
  describe('get and set', () => {
    beforeAll(async () => {
      await RedisService.initialize();
    });

    afterEach(async () => {
      // Clean up test keys
      const client = RedisService.getClient();
      const keys = await client.keys('test:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    });

    it('should set and get a value', async () => {
      await RedisService.set('test:key1', 'hello');
      
      const value = await RedisService.get('test:key1');
      
      expect(value).toBe('hello');
    });

    it('should return null for non-existent key', async () => {
      const value = await RedisService.get('test:nonexistent');
      
      expect(value).toBeNull();
    });

    it('should overwrite existing value', async () => {
      await RedisService.set('test:key2', 'first');
      await RedisService.set('test:key2', 'second');
      
      const value = await RedisService.get('test:key2');
      
      expect(value).toBe('second');
    });

    it('should handle JSON stringified values', async () => {
      const data = { userId: '123', amount: 5000 };
      await RedisService.set('test:json', JSON.stringify(data));
      
      const value = await RedisService.get('test:json');
      const parsed = JSON.parse(value!);
      
      expect(parsed).toEqual(data);
    });
  });

  // ==========================================================================
  // set with TTL
  // ==========================================================================
  describe('set with TTL', () => {
    beforeAll(async () => {
      await RedisService.initialize();
    });

    afterEach(async () => {
      const client = RedisService.getClient();
      const keys = await client.keys('test:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    });

    it('should set value with TTL', async () => {
      await RedisService.set('test:ttl1', 'expiring', 60);
      
      const client = RedisService.getClient();
      const ttl = await client.ttl('test:ttl1');
      
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should expire key after TTL', async () => {
      await RedisService.set('test:ttl2', 'shortlived', 1);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const value = await RedisService.get('test:ttl2');
      expect(value).toBeNull();
    });
  });

  // ==========================================================================
  // setex
  // ==========================================================================
  describe('setex', () => {
    beforeAll(async () => {
      await RedisService.initialize();
    });

    afterEach(async () => {
      const client = RedisService.getClient();
      const keys = await client.keys('test:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    });

    it('should set value with expiration using setex', async () => {
      await RedisService.setex('test:setex1', 30, 'value');
      
      const value = await RedisService.get('test:setex1');
      expect(value).toBe('value');
      
      const client = RedisService.getClient();
      const ttl = await client.ttl('test:setex1');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);
    });
  });

  // ==========================================================================
  // del
  // ==========================================================================
  describe('del', () => {
    beforeAll(async () => {
      await RedisService.initialize();
    });

    it('should delete existing key', async () => {
      await RedisService.set('test:del1', 'todelete');
      expect(await RedisService.get('test:del1')).toBe('todelete');
      
      await RedisService.del('test:del1');
      
      expect(await RedisService.get('test:del1')).toBeNull();
    });

    it('should not throw when deleting non-existent key', async () => {
      await expect(RedisService.del('test:nonexistent')).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // exists
  // ==========================================================================
  describe('exists', () => {
    beforeAll(async () => {
      await RedisService.initialize();
    });

    afterEach(async () => {
      const client = RedisService.getClient();
      const keys = await client.keys('test:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    });

    it('should return 1 for existing key', async () => {
      await RedisService.set('test:exists1', 'value');
      
      const result = await RedisService.exists('test:exists1');
      
      expect(result).toBe(1);
    });

    it('should return 0 for non-existent key', async () => {
      const result = await RedisService.exists('test:nonexistent');
      
      expect(result).toBe(0);
    });
  });

  // ==========================================================================
  // getClient
  // ==========================================================================
  describe('getClient', () => {
    it('should throw error when not initialized', async () => {
      await RedisService.close();
      
      expect(() => RedisService.getClient()).toThrow('Redis not initialized');
    });

    it('should return client after initialization', async () => {
      await RedisService.initialize();
      
      const client = RedisService.getClient();
      expect(client).toBeDefined();
      expect(typeof client.get).toBe('function');
    });
  });

  // ==========================================================================
  // close
  // ==========================================================================
  describe('close', () => {
    it('should close Redis connection', async () => {
      await RedisService.initialize();
      expect(RedisService.getClient()).toBeDefined();
      
      await RedisService.close();
      
      expect(() => RedisService.getClient()).toThrow('Redis not initialized');
    });

    it('should handle close when not initialized', async () => {
      await RedisService.close();
      
      await expect(RedisService.close()).resolves.toBeUndefined();
    });

    it('should allow re-initialization after close', async () => {
      await RedisService.initialize();
      await RedisService.close();
      
      await RedisService.initialize();
      const client = RedisService.getClient();
      
      const pong = await client.ping();
      expect(pong).toBe('PONG');
    });
  });
});
