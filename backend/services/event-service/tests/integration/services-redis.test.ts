/**
 * RedisService Integration Tests
 */

import { RedisService } from '../../src/services/redisService';

describe('RedisService', () => {
  beforeAll(async () => {
    await RedisService.initialize();
  });

  afterAll(async () => {
    await RedisService.close();
  });

  describe('initialize', () => {
    it('should initialize and verify connection', async () => {
      const client = RedisService.getClient();
      const pong = await client.ping();
      expect(pong).toBe('PONG');
    });
  });

  describe('get/set/del', () => {
    it('should set and get value', async () => {
      await RedisService.set('test:rs:key', 'value123');
      const result = await RedisService.get('test:rs:key');
      expect(result).toBe('value123');
    });

    it('should set with TTL', async () => {
      await RedisService.set('test:rs:ttl', 'expire', 1);
      const before = await RedisService.get('test:rs:ttl');
      expect(before).toBe('expire');
      await new Promise(r => setTimeout(r, 1100));
      const after = await RedisService.get('test:rs:ttl');
      expect(after).toBeNull();
    });

    it('should delete key', async () => {
      await RedisService.set('test:rs:del', 'todelete');
      await RedisService.del('test:rs:del');
      const result = await RedisService.get('test:rs:del');
      expect(result).toBeNull();
    });
  });

  describe('getClient', () => {
    it('should return redis client', () => {
      const client = RedisService.getClient();
      expect(client).toBeDefined();
      expect(typeof client.ping).toBe('function');
    });
  });
});
