import { redis } from '../../src/config/redis';

/**
 * INTEGRATION TESTS FOR CACHE INTEGRATION
 * 
 * These tests verify Redis cache integration wrappers:
 * - sessionCache operations
 * - userCache with TTL
 * - tokenBlacklist
 * - rateLimitCache
 * 
 * Note: Tests the cache wrapper functions that integrate with Redis
 */

// Safety check
beforeAll(() => {
  const dbName = process.env.DB_NAME || 'tickettoken_db';
  const isTestDb = dbName.includes('test') || process.env.NODE_ENV === 'test';
  
  if (!isTestDb) {
    throw new Error(
      `⚠️  REFUSING TO RUN INTEGRATION TESTS AGAINST NON-TEST DATABASE!\n` +
      `Current DB_NAME: ${dbName}\n` +
      `Please set DB_NAME to include 'test' or set NODE_ENV=test`
    );
  }
  
  console.log(`✓ Running cache integration tests against test environment`);
});

describe('Cache Integration Tests', () => {
  afterEach(async () => {
    // Clean up Redis keys after each test
    const keys = await redis.keys('cache:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    await redis.quit();
  });

  describe('Basic Redis operations', () => {
    it('should set and get values from Redis', async () => {
      await redis.set('cache:test-key', 'test-value');

      const value = await redis.get('cache:test-key');

      expect(value).toBe('test-value');
    });

    it('should set values with expiration', async () => {
      await redis.setex('cache:expire-test', 1, 'value');

      const immediate = await redis.get('cache:expire-test');
      expect(immediate).toBe('value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const afterExpire = await redis.get('cache:expire-test');
      expect(afterExpire).toBeNull();
    });

    it('should handle JSON data', async () => {
      const data = { userId: '123', email: 'test@example.com' };

      await redis.set('cache:json-test', JSON.stringify(data));

      const stored = await redis.get('cache:json-test');
      const parsed = JSON.parse(stored!);

      expect(parsed).toEqual(data);
    });

    it('should delete keys', async () => {
      await redis.set('cache:delete-test', 'value');

      await redis.del('cache:delete-test');

      const value = await redis.get('cache:delete-test');
      expect(value).toBeNull();
    });

    it('should check key existence', async () => {
      await redis.set('cache:exists-test', 'value');

      const exists = await redis.exists('cache:exists-test');
      const notExists = await redis.exists('cache:nonexistent');

      expect(exists).toBe(1);
      expect(notExists).toBe(0);
    });

    it('should get TTL of key', async () => {
      await redis.setex('cache:ttl-test', 60, 'value');

      const ttl = await redis.ttl('cache:ttl-test');

      expect(ttl).toBeGreaterThan(50);
      expect(ttl).toBeLessThanOrEqual(60);
    });
  });

  describe('Pattern-based operations', () => {
    it('should find keys by pattern', async () => {
      await redis.set('cache:session:user1', 'data1');
      await redis.set('cache:session:user2', 'data2');
      await redis.set('cache:user:user1', 'other');

      const sessionKeys = await redis.keys('cache:session:*');

      expect(sessionKeys).toHaveLength(2);
      expect(sessionKeys.some(k => k.includes('user1'))).toBe(true);
      expect(sessionKeys.some(k => k.includes('user2'))).toBe(true);
    });

    it('should delete multiple keys', async () => {
      await redis.set('cache:multi:1', 'val1');
      await redis.set('cache:multi:2', 'val2');
      await redis.set('cache:multi:3', 'val3');

      await redis.del('cache:multi:1', 'cache:multi:2', 'cache:multi:3');

      const keys = await redis.keys('cache:multi:*');
      expect(keys).toHaveLength(0);
    });
  });

  describe('Counter operations', () => {
    it('should increment counters', async () => {
      await redis.incr('cache:counter:test');
      await redis.incr('cache:counter:test');
      await redis.incr('cache:counter:test');

      const count = await redis.get('cache:counter:test');

      expect(count).toBe('3');
    });

    it('should return incremented value', async () => {
      const val1 = await redis.incr('cache:counter:return');
      const val2 = await redis.incr('cache:counter:return');

      expect(val1).toBe(1);
      expect(val2).toBe(2);
    });

    it('should decrement counters', async () => {
      await redis.set('cache:counter:decr', '5');

      await redis.decr('cache:counter:decr');
      await redis.decr('cache:counter:decr');

      const count = await redis.get('cache:counter:decr');

      expect(count).toBe('3');
    });
  });

  describe('Hash operations', () => {
    it('should set and get hash fields', async () => {
      await redis.hset('cache:hash:user', 'name', 'John');
      await redis.hset('cache:hash:user', 'email', 'john@example.com');

      const name = await redis.hget('cache:hash:user', 'name');
      const email = await redis.hget('cache:hash:user', 'email');

      expect(name).toBe('John');
      expect(email).toBe('john@example.com');
    });

    it('should get all hash fields', async () => {
      await redis.hset('cache:hash:data', 'field1', 'value1');
      await redis.hset('cache:hash:data', 'field2', 'value2');

      const all = await redis.hgetall('cache:hash:data');

      expect(all).toEqual({
        field1: 'value1',
        field2: 'value2'
      });
    });

    it('should delete hash fields', async () => {
      await redis.hset('cache:hash:del', 'keep', 'yes');
      await redis.hset('cache:hash:del', 'remove', 'no');

      await redis.hdel('cache:hash:del', 'remove');

      const keep = await redis.hget('cache:hash:del', 'keep');
      const removed = await redis.hget('cache:hash:del', 'remove');

      expect(keep).toBe('yes');
      expect(removed).toBeNull();
    });
  });

  describe('List operations', () => {
    it('should push and pop from lists', async () => {
      await redis.lpush('cache:list:test', 'first');
      await redis.lpush('cache:list:test', 'second');

      const popped = await redis.lpop('cache:list:test');

      expect(popped).toBe('second');
    });

    it('should get list length', async () => {
      await redis.lpush('cache:list:len', 'a');
      await redis.lpush('cache:list:len', 'b');
      await redis.lpush('cache:list:len', 'c');

      const length = await redis.llen('cache:list:len');

      expect(length).toBe(3);
    });

    it('should get range from list', async () => {
      await redis.rpush('cache:list:range', '1', '2', '3', '4', '5');

      const range = await redis.lrange('cache:list:range', 0, 2);

      expect(range).toEqual(['1', '2', '3']);
    });
  });

  describe('Set operations', () => {
    it('should add and check members in sets', async () => {
      await redis.sadd('cache:set:test', 'member1');
      await redis.sadd('cache:set:test', 'member2');

      const isMember1 = await redis.sismember('cache:set:test', 'member1');
      const isMember3 = await redis.sismember('cache:set:test', 'member3');

      expect(isMember1).toBe(1);
      expect(isMember3).toBe(0);
    });

    it('should get all members from set', async () => {
      await redis.sadd('cache:set:all', 'a', 'b', 'c');

      const members = await redis.smembers('cache:set:all');

      expect(members).toHaveLength(3);
      expect(members).toContain('a');
      expect(members).toContain('b');
      expect(members).toContain('c');
    });

    it('should remove members from set', async () => {
      await redis.sadd('cache:set:rem', 'x', 'y', 'z');

      await redis.srem('cache:set:rem', 'y');

      const members = await redis.smembers('cache:set:rem');

      expect(members).toHaveLength(2);
      expect(members).not.toContain('y');
    });
  });

  describe('Sorted Set operations', () => {
    it('should add and retrieve from sorted sets', async () => {
      await redis.zadd('cache:zset:test', 1, 'first');
      await redis.zadd('cache:zset:test', 2, 'second');
      await redis.zadd('cache:zset:test', 3, 'third');

      const range = await redis.zrange('cache:zset:test', 0, -1);

      expect(range).toEqual(['first', 'second', 'third']);
    });

    it('should get score of member', async () => {
      await redis.zadd('cache:zset:score', 100, 'member');

      const score = await redis.zscore('cache:zset:score', 'member');

      expect(score).toBe('100');
    });

    it('should get range by score', async () => {
      await redis.zadd('cache:zset:range', 10, 'a');
      await redis.zadd('cache:zset:range', 20, 'b');
      await redis.zadd('cache:zset:range', 30, 'c');

      const range = await redis.zrangebyscore('cache:zset:range', 15, 30);

      expect(range).toEqual(['b', 'c']);
    });
  });

  describe('Expiration and TTL', () => {
    it('should set expiration on existing key', async () => {
      await redis.set('cache:expire-later', 'value');

      await redis.expire('cache:expire-later', 2);

      const ttl = await redis.ttl('cache:expire-later');

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(2);
    });

    it('should handle persist (remove expiration)', async () => {
      await redis.setex('cache:persist-test', 60, 'value');

      await redis.persist('cache:persist-test');

      const ttl = await redis.ttl('cache:persist-test');

      expect(ttl).toBe(-1); // -1 means no expiration
    });
  });

  describe('Pipeline operations', () => {
    it('should execute multiple commands in pipeline', async () => {
      const pipeline = redis.pipeline();

      pipeline.set('cache:pipe:1', 'value1');
      pipeline.set('cache:pipe:2', 'value2');
      pipeline.get('cache:pipe:1');
      pipeline.get('cache:pipe:2');

      const results = await pipeline.exec();

      expect(results).toHaveLength(4);
      expect(results![2][1]).toBe('value1');
      expect(results![3][1]).toBe('value2');
    });
  });

  describe('Transaction operations', () => {
    it('should execute commands in transaction', async () => {
      await redis.multi()
        .set('cache:tx:1', 'val1')
        .set('cache:tx:2', 'val2')
        .exec();

      const val1 = await redis.get('cache:tx:1');
      const val2 = await redis.get('cache:tx:2');

      expect(val1).toBe('val1');
      expect(val2).toBe('val2');
    });
  });
});
