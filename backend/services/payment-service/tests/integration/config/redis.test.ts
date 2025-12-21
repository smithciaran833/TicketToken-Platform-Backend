/**
 * Redis Config Integration Tests
 *
 * Tests the Redis configuration including:
 * - Connection and ping
 * - Basic operations (get, set, del)
 * - Expiration (TTL)
 * - Hash operations
 * - List operations
 * - Set operations
 * - checkRedisHealth()
 * - closeRedis()
 */

import { redis } from '../setup';
import { checkRedisHealth } from '../../../src/config/redis';

describe('config/redis', () => {
  const TEST_PREFIX = 'test:config:redis:';

  afterEach(async () => {
    // Cleanup test keys
    const keys = await redis.keys(`${TEST_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // ==========================================================================
  // connection
  // ==========================================================================
  describe('connection', () => {
    it('should respond to ping', async () => {
      const result = await redis.ping();
      expect(result).toBe('PONG');
    });

    it('should be in ready state', async () => {
      expect(redis.status).toBe('ready');
    });
  });

  // ==========================================================================
  // basic operations
  // ==========================================================================
  describe('basic operations', () => {
    it('should set and get string value', async () => {
      const key = `${TEST_PREFIX}string`;
      await redis.set(key, 'hello');
      const result = await redis.get(key);
      expect(result).toBe('hello');
    });

    it('should set and get numeric value as string', async () => {
      const key = `${TEST_PREFIX}number`;
      await redis.set(key, '12345');
      const result = await redis.get(key);
      expect(result).toBe('12345');
    });

    it('should return null for non-existent key', async () => {
      const result = await redis.get(`${TEST_PREFIX}nonexistent`);
      expect(result).toBeNull();
    });

    it('should delete key', async () => {
      const key = `${TEST_PREFIX}delete`;
      await redis.set(key, 'value');
      await redis.del(key);
      const result = await redis.get(key);
      expect(result).toBeNull();
    });

    it('should check key exists', async () => {
      const key = `${TEST_PREFIX}exists`;
      await redis.set(key, 'value');
      const exists = await redis.exists(key);
      expect(exists).toBe(1);
    });

    it('should return 0 for non-existent key exists check', async () => {
      const exists = await redis.exists(`${TEST_PREFIX}nonexistent`);
      expect(exists).toBe(0);
    });

    it('should set multiple keys', async () => {
      const key1 = `${TEST_PREFIX}multi1`;
      const key2 = `${TEST_PREFIX}multi2`;
      await redis.mset(key1, 'value1', key2, 'value2');
      const results = await redis.mget(key1, key2);
      expect(results).toEqual(['value1', 'value2']);
    });
  });

  // ==========================================================================
  // expiration
  // ==========================================================================
  describe('expiration', () => {
    it('should set value with expiration (EX)', async () => {
      const key = `${TEST_PREFIX}expiring`;
      await redis.set(key, 'value', 'EX', 60);
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should set value with expiration (PX)', async () => {
      const key = `${TEST_PREFIX}expiring-ms`;
      await redis.set(key, 'value', 'PX', 60000);
      const pttl = await redis.pttl(key);
      expect(pttl).toBeGreaterThan(0);
      expect(pttl).toBeLessThanOrEqual(60000);
    });

    it('should return -1 for key without expiration', async () => {
      const key = `${TEST_PREFIX}no-expiry`;
      await redis.set(key, 'value');
      const ttl = await redis.ttl(key);
      expect(ttl).toBe(-1);
    });

    it('should return -2 for non-existent key ttl', async () => {
      const ttl = await redis.ttl(`${TEST_PREFIX}nonexistent`);
      expect(ttl).toBe(-2);
    });

    it('should set expiration with EXPIRE', async () => {
      const key = `${TEST_PREFIX}expire-later`;
      await redis.set(key, 'value');
      await redis.expire(key, 30);
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);
    });
  });

  // ==========================================================================
  // JSON data
  // ==========================================================================
  describe('JSON data', () => {
    it('should store and retrieve JSON', async () => {
      const key = `${TEST_PREFIX}json`;
      const data = { foo: 'bar', num: 123, nested: { a: 1 } };
      await redis.set(key, JSON.stringify(data));
      const result = await redis.get(key);
      expect(JSON.parse(result!)).toEqual(data);
    });

    it('should store and retrieve array as JSON', async () => {
      const key = `${TEST_PREFIX}json-array`;
      const data = [1, 2, 3, 'four', { five: 5 }];
      await redis.set(key, JSON.stringify(data));
      const result = await redis.get(key);
      expect(JSON.parse(result!)).toEqual(data);
    });
  });

  // ==========================================================================
  // hash operations
  // ==========================================================================
  describe('hash operations', () => {
    it('should set and get hash field', async () => {
      const key = `${TEST_PREFIX}hash`;
      await redis.hset(key, 'field1', 'value1');
      const result = await redis.hget(key, 'field1');
      expect(result).toBe('value1');
    });

    it('should set multiple hash fields', async () => {
      const key = `${TEST_PREFIX}hash-multi`;
      await redis.hset(key, 'field1', 'value1', 'field2', 'value2');
      const result = await redis.hgetall(key);
      expect(result).toEqual({ field1: 'value1', field2: 'value2' });
    });

    it('should get all hash fields', async () => {
      const key = `${TEST_PREFIX}hash-all`;
      await redis.hset(key, 'a', '1', 'b', '2', 'c', '3');
      const result = await redis.hgetall(key);
      expect(result).toEqual({ a: '1', b: '2', c: '3' });
    });

    it('should check hash field exists', async () => {
      const key = `${TEST_PREFIX}hash-exists`;
      await redis.hset(key, 'field', 'value');
      const exists = await redis.hexists(key, 'field');
      const notExists = await redis.hexists(key, 'nonexistent');
      expect(exists).toBe(1);
      expect(notExists).toBe(0);
    });

    it('should delete hash field', async () => {
      const key = `${TEST_PREFIX}hash-del`;
      await redis.hset(key, 'field', 'value');
      await redis.hdel(key, 'field');
      const result = await redis.hget(key, 'field');
      expect(result).toBeNull();
    });

    it('should increment hash field', async () => {
      const key = `${TEST_PREFIX}hash-incr`;
      await redis.hset(key, 'count', '0');
      await redis.hincrby(key, 'count', 5);
      const result = await redis.hget(key, 'count');
      expect(result).toBe('5');
    });
  });

  // ==========================================================================
  // list operations
  // ==========================================================================
  describe('list operations', () => {
    it('should push and get list items', async () => {
      const key = `${TEST_PREFIX}list`;
      await redis.rpush(key, 'a', 'b', 'c');
      const result = await redis.lrange(key, 0, -1);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should get list length', async () => {
      const key = `${TEST_PREFIX}list-len`;
      await redis.rpush(key, '1', '2', '3', '4', '5');
      const length = await redis.llen(key);
      expect(length).toBe(5);
    });

    it('should lpush to front of list', async () => {
      const key = `${TEST_PREFIX}list-lpush`;
      await redis.rpush(key, 'b');
      await redis.lpush(key, 'a');
      const result = await redis.lrange(key, 0, -1);
      expect(result).toEqual(['a', 'b']);
    });

    it('should pop from list', async () => {
      const key = `${TEST_PREFIX}list-pop`;
      await redis.rpush(key, 'a', 'b', 'c');
      const popped = await redis.rpop(key);
      expect(popped).toBe('c');
      const remaining = await redis.lrange(key, 0, -1);
      expect(remaining).toEqual(['a', 'b']);
    });

    it('should get list item by index', async () => {
      const key = `${TEST_PREFIX}list-index`;
      await redis.rpush(key, 'a', 'b', 'c');
      const result = await redis.lindex(key, 1);
      expect(result).toBe('b');
    });
  });

  // ==========================================================================
  // set operations
  // ==========================================================================
  describe('set operations', () => {
    it('should add and get set members', async () => {
      const key = `${TEST_PREFIX}set`;
      await redis.sadd(key, 'a', 'b', 'c');
      const members = await redis.smembers(key);
      expect(members.sort()).toEqual(['a', 'b', 'c']);
    });

    it('should check set membership', async () => {
      const key = `${TEST_PREFIX}set-member`;
      await redis.sadd(key, 'member1', 'member2');
      const isMember = await redis.sismember(key, 'member1');
      const notMember = await redis.sismember(key, 'nonexistent');
      expect(isMember).toBe(1);
      expect(notMember).toBe(0);
    });

    it('should get set cardinality', async () => {
      const key = `${TEST_PREFIX}set-card`;
      await redis.sadd(key, 'a', 'b', 'c', 'd');
      const card = await redis.scard(key);
      expect(card).toBe(4);
    });

    it('should remove set member', async () => {
      const key = `${TEST_PREFIX}set-rem`;
      await redis.sadd(key, 'a', 'b', 'c');
      await redis.srem(key, 'b');
      const members = await redis.smembers(key);
      expect(members.sort()).toEqual(['a', 'c']);
    });

    it('should not add duplicate members', async () => {
      const key = `${TEST_PREFIX}set-dup`;
      await redis.sadd(key, 'a', 'a', 'a');
      const card = await redis.scard(key);
      expect(card).toBe(1);
    });
  });

  // ==========================================================================
  // checkRedisHealth
  // ==========================================================================
  describe('checkRedisHealth', () => {
    it('should return true when Redis is healthy', async () => {
      const isHealthy = await checkRedisHealth();
      expect(isHealthy).toBe(true);
    });
  });

  // ==========================================================================
  // increment operations
  // ==========================================================================
  describe('increment operations', () => {
    it('should increment value', async () => {
      const key = `${TEST_PREFIX}incr`;
      await redis.set(key, '0');
      await redis.incr(key);
      const result = await redis.get(key);
      expect(result).toBe('1');
    });

    it('should increment by specific amount', async () => {
      const key = `${TEST_PREFIX}incrby`;
      await redis.set(key, '10');
      await redis.incrby(key, 5);
      const result = await redis.get(key);
      expect(result).toBe('15');
    });

    it('should decrement value', async () => {
      const key = `${TEST_PREFIX}decr`;
      await redis.set(key, '10');
      await redis.decr(key);
      const result = await redis.get(key);
      expect(result).toBe('9');
    });
  });

  // ==========================================================================
  // key pattern operations
  // ==========================================================================
  describe('key pattern operations', () => {
    it('should find keys by pattern', async () => {
      await redis.set(`${TEST_PREFIX}pattern:a`, '1');
      await redis.set(`${TEST_PREFIX}pattern:b`, '2');
      await redis.set(`${TEST_PREFIX}pattern:c`, '3');
      const keys = await redis.keys(`${TEST_PREFIX}pattern:*`);
      expect(keys.sort()).toEqual([
        `${TEST_PREFIX}pattern:a`,
        `${TEST_PREFIX}pattern:b`,
        `${TEST_PREFIX}pattern:c`,
      ]);
    });
  });
});
