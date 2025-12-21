/**
 * Redis Configuration Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  TestContext,
  redis,
} from './setup';

describe('Redis Configuration', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  // ==========================================================================
  // createRedisConnection
  // ==========================================================================
  describe('createRedisConnection', () => {
    it('should establish redis connection', async () => {
      const pong = await redis.ping();
      expect(pong).toBe('PONG');
    });

    it('should set and get string values', async () => {
      await redis.set('test:string', 'hello-world');
      const value = await redis.get('test:string');
      expect(value).toBe('hello-world');
    });

    it('should set values with expiration', async () => {
      await redis.setex('test:expiring', 10, 'temp-value');
      const value = await redis.get('test:expiring');
      expect(value).toBe('temp-value');
      
      const ttl = await redis.ttl('test:expiring');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(10);
    });

    it('should delete keys', async () => {
      await redis.set('test:delete', 'to-delete');
      await redis.del('test:delete');
      const value = await redis.get('test:delete');
      expect(value).toBeNull();
    });

    it('should check key existence', async () => {
      await redis.set('test:exists', 'value');
      const exists = await redis.exists('test:exists');
      const notExists = await redis.exists('test:not-exists');
      
      expect(exists).toBe(1);
      expect(notExists).toBe(0);
    });

    it('should increment values', async () => {
      await redis.set('test:counter', '0');
      await redis.incr('test:counter');
      await redis.incr('test:counter');
      const value = await redis.get('test:counter');
      expect(value).toBe('2');
    });

    it('should handle hash operations', async () => {
      await redis.hset('test:hash', 'field1', 'value1');
      await redis.hset('test:hash', 'field2', 'value2');
      
      const field1 = await redis.hget('test:hash', 'field1');
      const all = await redis.hgetall('test:hash');
      
      expect(field1).toBe('value1');
      expect(all).toEqual({ field1: 'value1', field2: 'value2' });
    });

    it('should handle list operations', async () => {
      await redis.rpush('test:list', 'item1', 'item2', 'item3');
      const length = await redis.llen('test:list');
      const items = await redis.lrange('test:list', 0, -1);
      
      expect(length).toBe(3);
      expect(items).toEqual(['item1', 'item2', 'item3']);
    });

    it('should handle set operations', async () => {
      await redis.sadd('test:set', 'member1', 'member2', 'member3');
      const isMember = await redis.sismember('test:set', 'member1');
      const members = await redis.smembers('test:set');
      
      expect(isMember).toBe(1);
      expect(members.sort()).toEqual(['member1', 'member2', 'member3']);
    });

    it('should handle JSON serialization', async () => {
      const data = { name: 'Test', count: 42, nested: { value: true } };
      await redis.set('test:json', JSON.stringify(data));
      const retrieved = JSON.parse((await redis.get('test:json'))!);
      
      expect(retrieved).toEqual(data);
    });

    it('should support pipelining', async () => {
      const pipeline = redis.pipeline();
      pipeline.set('test:pipe1', 'value1');
      pipeline.set('test:pipe2', 'value2');
      pipeline.get('test:pipe1');
      pipeline.get('test:pipe2');
      
      const results = await pipeline.exec();
      
      expect(results).toBeDefined();
      expect(results!.length).toBe(4);
    });

    it('should handle key patterns with scan', async () => {
      await redis.set('pattern:key1', 'v1');
      await redis.set('pattern:key2', 'v2');
      await redis.set('other:key', 'v3');
      
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [newCursor, foundKeys] = await redis.scan(cursor, 'MATCH', 'pattern:*');
        cursor = newCursor;
        keys.push(...foundKeys);
      } while (cursor !== '0');
      
      expect(keys.sort()).toEqual(['pattern:key1', 'pattern:key2']);
    });
  });
});
