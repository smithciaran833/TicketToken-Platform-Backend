import { CacheService } from '../../src/services/cache.service';

/**
 * INTEGRATION TESTS FOR CACHE SERVICE
 * 
 * These tests verify in-memory caching functionality:
 * - Singleton pattern
 * - Get/Set operations with TTL
 * - Automatic expiration
 * - Rate limiting with checkLimit
 */

describe('CacheService Integration Tests', () => {
  let service: CacheService;

  beforeEach(() => {
    // Get singleton instance
    service = CacheService.getInstance();
  });

  describe('getInstance() - Singleton', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = CacheService.getInstance();
      const instance2 = CacheService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('get() and set()', () => {
    it('should store and retrieve value', async () => {
      await service.set('test-key', 'test-value', 60);

      const value = await service.get('test-key');

      expect(value).toBe('test-value');
    });

    it('should return null for non-existent key', async () => {
      const value = await service.get('non-existent');

      expect(value).toBeNull();
    });

    it('should return null for expired key', async () => {
      // Set with 1 second TTL
      await service.set('expire-key', 'value', 1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const value = await service.get('expire-key');

      expect(value).toBeNull();
    });

    it('should delete expired key on access', async () => {
      await service.set('delete-expire', 'value', 1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // First get should delete
      await service.get('delete-expire');

      // Second get should still return null
      const value = await service.get('delete-expire');

      expect(value).toBeNull();
    });

    it('should respect TTL in seconds', async () => {
      await service.set('ttl-key', 'value', 2);

      // Should exist immediately
      const immediate = await service.get('ttl-key');
      expect(immediate).toBe('value');

      // Should exist after 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
      const after1s = await service.get('ttl-key');
      expect(after1s).toBe('value');

      // Should expire after 2+ seconds
      await new Promise(resolve => setTimeout(resolve,1200));
      const after2s = await service.get('ttl-key');
      expect(after2s).toBeNull();
    });

    it('should handle multiple keys independently', async () => {
      await service.set('key1', 'value1', 60);
      await service.set('key2', 'value2', 60);

      const value1 = await service.get('key1');
      const value2 = await service.get('key2');

      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
    });

    it('should overwrite existing key', async () => {
      await service.set('overwrite', 'old-value', 60);
      await service.set('overwrite', 'new-value', 60);

      const value = await service.get('overwrite');

      expect(value).toBe('new-value');
    });
  });

  describe('checkLimit()', () => {
    it('should return true when under limit', async () => {
      const result = await service.checkLimit('limit-key', 5, 60);

      expect(result).toBe(true);
    });

    it('should increment counter on each call', async () => {
      await service.checkLimit('counter-key', 10, 60);
      await service.checkLimit('counter-key', 10, 60);
      await service.checkLimit('counter-key', 10, 60);

      const count = await service.get('counter-key');

      expect(count).toBe('3');
    });

    it('should return false when limit reached', async () => {
      // Use up limit
      for (let i = 0; i < 5; i++) {
        await service.checkLimit('max-key', 5, 60);
      }

      // Next should fail
      const result = await service.checkLimit('max-key', 5, 60);

      expect(result).toBe(false);
    });

    it('should return false when over limit', async () => {
      // Use up limit
      for (let i = 0; i < 6; i++) {
        await service.checkLimit('over-key', 5, 60);
      }

      const result = await service.checkLimit('over-key', 5, 60);

      expect(result).toBe(false);
    });

    it('should respect window TTL', async () => {
      await service.checkLimit('window-key', 5, 1);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should reset
      const result = await service.checkLimit('window-key', 5, 1);

      expect(result).toBe(true);
      const count = await service.get('window-key');
      expect(count).toBe('1');
    });

    it('should handle limit of 0 correctly', async () => {
      const result = await service.checkLimit('zero-limit', 0, 60);

      expect(result).toBe(false);
    });

    it('should handle limit of 1 correctly', async () => {
      const first = await service.checkLimit('one-limit', 1, 60);
      expect(first).toBe(true);

      const second = await service.checkLimit('one-limit', 1, 60);
      expect(second).toBe(false);
    });

    it('should track different keys independently', async () => {
      await service.checkLimit('key-a', 2, 60);
      await service.checkLimit('key-a', 2, 60);

      await service.checkLimit('key-b', 2, 60);

      const resultA = await service.checkLimit('key-a', 2, 60);
      const resultB = await service.checkLimit('key-b', 2, 60);

      expect(resultA).toBe(false); // key-a at limit
      expect(resultB).toBe(true);  // key-b still has room
    });
  });

  describe('Edge cases', () => {
    it('should handle very short TTL', async () => {
      await service.set('short-ttl', 'value', 1);

      await new Promise(resolve => setTimeout(resolve, 1100));

      const value = await service.get('short-ttl');
      expect(value).toBeNull();
    });

    it('should handle special characters in keys', async () => {
      await service.set('key:with:colons', 'value', 60);
      await service.set('key/with/slashes', 'value2', 60);

      const value1 = await service.get('key:with:colons');
      const value2 = await service.get('key/with/slashes');

      expect(value1).toBe('value');
      expect(value2).toBe('value2');
    });

    it('should handle empty string values', async () => {
      await service.set('empty', '', 60);

      const value = await service.get('empty');

      expect(value).toBe('');
    });

    it('should handle numeric string values', async () => {
      await service.set('numeric', '12345', 60);

      const value = await service.get('numeric');

      expect(value).toBe('12345');
    });
  });
});
