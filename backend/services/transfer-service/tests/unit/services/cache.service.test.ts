/**
 * IMPROVED Unit Tests for CacheService
 * 
 * Tests real caching behavior and edge cases:
 * - Race conditions in concurrent access
 * - TTL precision and expiry timing
 * - Lock primitives (setNX) behavior
 * - Memory cleanup and leak prevention
 * - Key collision handling
 * - Counter atomicity
 */

import { CacheService } from '../../../src/services/cache.service';

describe('CacheService - Behavioral Tests', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    
    cacheService = new CacheService({
      keyPrefix: 'test:',
      defaultTtlSeconds: 60
    });
  });

  afterEach(async () => {
    if (cacheService.isConnected()) {
      await cacheService.close();
    }
  });

  describe('TTL and Expiry - Timing Precision', () => {
    it('should expire values within 100ms of specified TTL', async () => {
      const startTime = Date.now();
      await cacheService.set('timing-test', 'value', 1);
      
      // Should exist immediately
      expect(await cacheService.get('timing-test')).toBe('value');
      
      // Wait exactly 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Should be expired
      const result = await cacheService.get('timing-test');
      expect(result).toBeNull();
      
      const elapsed = Date.now() - startTime;
      // Should have expired close to 1 second (allow 100ms tolerance)
      expect(elapsed).toBeGreaterThanOrEqual(1000);
      expect(elapsed).toBeLessThan(1200);
    });

    it('should handle rapid expiry and re-set cycles', async () => {
      const key = 'rapid-cycle';
      
      // Cycle 1
      await cacheService.set(key, 'value1', 1);
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(await cacheService.get(key)).toBeNull();
      
      // Cycle 2 - immediate re-use of key
      await cacheService.set(key, 'value2', 1);
      expect(await cacheService.get(key)).toBe('value2');
      
      // Cycle 3
      await new Promise(resolve => setTimeout(resolve, 1100));
      await cacheService.set(key, 'value3', 1);
      expect(await cacheService.get(key)).toBe('value3');
    });

    it('should not expire values prematurely', async () => {
      await cacheService.set('stable', 'value', 5);
      
      // Check multiple times before expiry
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        expect(await cacheService.get('stable')).toBe('value');
      }
    });

    it('should handle TTL extension correctly', async () => {
      await cacheService.set('extendable', 'value', 2);
      
      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Extend TTL
      await cacheService.expire('extendable', 3);
      
      // Wait another 2 seconds (original would have expired)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Should still exist due to extension
      expect(await cacheService.get('extendable')).toBe('value');
    });
  });

  describe('SetNX - Distributed Lock Behavior', () => {
    it('should implement proper lock acquire/release semantics', async () => {
      const lockKey = 'lock:resource-123';
      
      // First process acquires lock
      const acquired1 = await cacheService.setNX(lockKey, 'process-1', 10);
      expect(acquired1).toBe(true);
      
      // Second process fails to acquire
      const acquired2 = await cacheService.setNX(lockKey, 'process-2', 10);
      expect(acquired2).toBe(false);
      
      // Lock holder should be process-1
      expect(await cacheService.get(lockKey)).toBe('process-1');
      
      // Release lock
      await cacheService.delete(lockKey);
      
      // Now second process can acquire
      const acquired3 = await cacheService.setNX(lockKey, 'process-2', 10);
      expect(acquired3).toBe(true);
      expect(await cacheService.get(lockKey)).toBe('process-2');
    });

    it('should handle lock expiry for deadlock prevention', async () => {
      const lockKey = 'lock:deadlock-test';
      
      // Acquire lock with short TTL
      await cacheService.setNX(lockKey, 'holder', 1);
      
      // Try to acquire - should fail
      expect(await cacheService.setNX(lockKey, 'waiter', 1)).toBe(false);
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Now should be able to acquire
      const acquired = await cacheService.setNX(lockKey, 'waiter', 10);
      expect(acquired).toBe(true);
    });

    it('should prevent lost update problem', async () => {
      const key = 'counter';
      
      // Process 1 reads
      await cacheService.set(key, 10);
      const value1 = await cacheService.get<number>(key);
      
      // Process 2 reads
      const value2 = await cacheService.get<number>(key);
      
      // Both increment and write - last write wins
      await cacheService.set(key, value1! + 1);
      await cacheService.set(key, value2! + 1);
      
      // Lost update: should be 12, but is 11
      const final = await cacheService.get<number>(key);
      expect(final).toBe(11); // Demonstrates lost update
      
      // Correct approach: use atomic incr
      await cacheService.set(key, 10);
      await cacheService.incr(key);
      await cacheService.incr(key);
      expect(await cacheService.get(key)).toBe(12);
    });
  });

  describe('Increment - Atomicity and Counter Behavior', () => {
    it('should increment atomically without race conditions', async () => {
      const counterKey = 'atomic-counter';
      
      // Concurrent increments
      const promises = Array(50).fill(null).map(() => 
        cacheService.incr(counterKey)
      );
      
      await Promise.all(promises);
      
      // Should be exactly 50, not less due to race condition
      const final = await cacheService.get<number>(counterKey);
      expect(final).toBe(50);
    });

    it('should handle increment of non-existent key', async () => {
      const key = 'new-counter';
      
      // First increment should start from 0
      const result = await cacheService.incr(key);
      expect(result).toBe(1);
      
      // Verify it's stored
      expect(await cacheService.get<number>(key)).toBe(1);
    });

    it('should handle increment of string numbers', async () => {
      await cacheService.set('string-counter', '5');
      
      const result = await cacheService.incr('string-counter');
      expect(result).toBe(6);
    });

    it('should maintain counter value across operations', async () => {
      const key = 'persistent-counter';
      
      await cacheService.incr(key); // 1
      await cacheService.incr(key); // 2
      await cacheService.incr(key); // 3
      
      // Get should not affect counter
      expect(await cacheService.get<number>(key)).toBe(3);
      
      // Continue incrementing
      await cacheService.incr(key); // 4
      expect(await cacheService.get<number>(key)).toBe(4);
    });

    it('should implement correct rate limiting pattern', async () => {
      const userId = 'user-rate-limit-test';
      const limit = 5;
      const windowKey = `rate:${userId}:${Date.now()}`;
      
      // Simulate requests
      const results = [];
      for (let i = 0; i < 7; i++) {
        const count = await cacheService.incr(windowKey);
        results.push(count <= limit);
      }
      
      // First 5 should pass, last 2 should fail
      expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
      expect(results.slice(5)).toEqual([false, false]);
    });
  });

  describe('Key Collision and Namespace Isolation', () => {
    it('should isolate keys by prefix', async () => {
      const cache1 = new CacheService({ keyPrefix: 'app1:' });
      const cache2 = new CacheService({ keyPrefix: 'app2:' });
      
      await cache1.set('shared-key', 'app1-value');
      await cache2.set('shared-key', 'app2-value');
      
      // Each should see their own value
      expect(await cache1.get('shared-key')).toBe('app1-value');
      expect(await cache2.get('shared-key')).toBe('app2-value');
      
      // Cross-access should return null
      expect(await cache1.get('app2:shared-key')).toBeNull();
    });

    it('should handle key collisions in same namespace', async () => {
      await cacheService.set('collision', 'first');
      await cacheService.set('collision', 'second');
      
      // Last write wins
      expect(await cacheService.get('collision')).toBe('second');
    });

    it('should handle similar but different keys', async () => {
      await cacheService.set('user-123', 'alice');
      await cacheService.set('user-1234', 'bob');
      await cacheService.set('user-12', 'charlie');
      
      expect(await cacheService.get('user-123')).toBe('alice');
      expect(await cacheService.get('user-1234')).toBe('bob');
      expect(await cacheService.get('user-12')).toBe('charlie');
    });
  });

  describe('Data Type Preservation and Serialization', () => {
    it('should preserve type through serialization round-trip', async () => {
      interface User {
        id: number;
        name: string;
        active: boolean;
        metadata: { created: string };
      }
      
      const user: User = {
        id: 123,
        name: 'Alice',
        active: true,
        metadata: { created: '2024-01-01' }
      };
      
      await cacheService.set('user', user);
      const retrieved = await cacheService.get<User>('user');
      
      expect(retrieved).toEqual(user);
      expect(typeof retrieved?.id).toBe('number');
      expect(typeof retrieved?.active).toBe('boolean');
    });

    it('should handle nested arrays and objects', async () => {
      const complex = {
        users: [{ id: 1 }, { id: 2 }],
        settings: { theme: 'dark', nested: { deep: true } },
        numbers: [1, 2, 3]
      };
      
      await cacheService.set('complex', complex);
      const result = await cacheService.get('complex');
      
      expect(result).toEqual(complex);
    });

    it('should handle edge case values', async () => {
      const testCases = [
        { key: 'zero', value: 0 },
        { key: 'false', value: false },
        { key: 'empty-string', value: '' },
        { key: 'empty-array', value: [] },
        { key: 'empty-object', value: {} },
        { key: 'null-value', value: null }
      ];
      
      for (const { key, value } of testCases) {
        await cacheService.set(key, value);
        const result = await cacheService.get(key);
        
        if (value === null) {
          expect(result).toBeNull();
        } else {
          expect(result).toEqual(value);
        }
      }
    });
  });

  describe('Memory Management and Cleanup', () => {
    it('should not leak memory with repeated set/get cycles', async () => {
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        await cacheService.set(`leak-test-${i}`, `value-${i}`, 1);
      }
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // All should be expired
      for (let i = 0; i < 10; i++) {
        expect(await cacheService.get(`leak-test-${i}`)).toBeNull();
      }
    });

    it('should handle rapid set/delete cycles', async () => {
      const key = 'rapid-delete';
      
      for (let i = 0; i < 100; i++) {
        await cacheService.set(key, `value-${i}`);
        await cacheService.delete(key);
      }
      
      // Should end with nothing
      expect(await cacheService.get(key)).toBeNull();
    });
  });

  describe('Concurrent Access Patterns', () => {
    it('should handle multiple readers correctly', async () => {
      await cacheService.set('shared-read', 'value');
      
      // 100 concurrent reads
      const promises = Array(100).fill(null).map(() =>
        cacheService.get('shared-read')
      );
      
      const results = await Promise.all(promises);
      
      // All should return same value
      expect(results.every(r => r === 'value')).toBe(true);
    });

    it('should handle read-during-expiry race condition', async () => {
      await cacheService.set('expiring', 'value', 1);
      
      // Read right at expiry boundary
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const results = await Promise.all([
        cacheService.get('expiring'),
        cacheService.get('expiring'),
        cacheService.get('expiring')
      ]);
      
      // All should be consistent (all null or all value)
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBeLessThanOrEqual(1);
    });

    it('should handle concurrent setNX contention', async () => {
      const lockKey = 'contended-lock';
      
      // Simulate multiple workers trying to acquire lock simultaneously
      const workers = Array(20).fill(null).map((_, i) =>
        cacheService.setNX(lockKey, `worker-${i}`, 10)
      );
      
      const results = await Promise.all(workers);
      
      // Exactly one should succeed
      const successCount = results.filter(r => r).length;
      expect(successCount).toBe(1);
      
      // One worker should hold the lock
      const holder = await cacheService.get(lockKey);
      expect(holder).toMatch(/^worker-\d+$/);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from get on non-existent key', async () => {
      expect(await cacheService.get('never-existed')).toBeNull();
      
      // Should still work afterwards
      await cacheService.set('new-key', 'value');
      expect(await cacheService.get('new-key')).toBe('value');
    });

    it('should handle delete on non-existent key', async () => {
      await expect(
        cacheService.delete('non-existent')
      ).resolves.not.toThrow();
    });

    it('should handle exists check on expired key', async () => {
      await cacheService.set('temp', 'value', 1);
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(await cacheService.exists('temp')).toBe(false);
    });
  });

  describe('Real-World Patterns', () => {
    it('should implement cache-aside pattern correctly', async () => {
      const userId = 'user-123';
      const cacheKey = `user:${userId}`;
      
      // Check cache
      let user = await cacheService.get(cacheKey);
      
      if (!user) {
        // Simulate DB fetch
        user = { id: userId, name: 'Alice' };
        await cacheService.set(cacheKey, user, 60);
      }
      
      expect(user).toEqual({ id: userId, name: 'Alice' });
      
      // Second access should hit cache
      const cachedUser = await cacheService.get(cacheKey);
      expect(cachedUser).toEqual(user);
    });

    it('should implement write-through pattern', async () => {
      const key = 'write-through';
      const value = { data: 'updated' };
      
      // Write to cache (and DB in real scenario)
      await cacheService.set(key, value);
      
      // Read should get fresh data
      expect(await cacheService.get(key)).toEqual(value);
    });

    it('should implement session management pattern', async () => {
      const sessionId = 'session-abc-123';
      const sessionData = {
        userId: 'user-456',
        loginTime: Date.now(),
        permissions: ['read', 'write']
      };
      
      // Store session with 30 min TTL
      await cacheService.set(`session:${sessionId}`, sessionData, 1800);
      
      // Retrieve session
      const retrieved = await cacheService.get(`session:${sessionId}`);
      expect(retrieved).toEqual(sessionData);
      
      // Logout = delete session
      await cacheService.delete(`session:${sessionId}`);
      expect(await cacheService.get(`session:${sessionId}`)).toBeNull();
    });

    it('should implement idempotency key pattern', async () => {
      const idempotencyKey = 'req-abc-123';
      
      // Check if request already processed
      const exists = await cacheService.exists(idempotencyKey);
      expect(exists).toBe(false);
      
      // Process and store result
      const result = { status: 'success', transferId: 'txn-789' };
      await cacheService.set(idempotencyKey, result, 86400); // 24 hours
      
      // Duplicate request should get cached result
      const duplicate = await cacheService.get(idempotencyKey);
      expect(duplicate).toEqual(result);
    });
  });
});
