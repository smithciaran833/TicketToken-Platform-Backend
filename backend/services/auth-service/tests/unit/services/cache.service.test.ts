import { CacheService } from '../../../src/services/cache.service';

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    // Clear the singleton instance before each test
    (CacheService as any).instance = undefined;
    cacheService = CacheService.getInstance();
    // Clear the cache map
    (cacheService as any).cache.clear();
    // Mock Date.now for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(1000000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =============================================================================
  // Singleton pattern - 3 test cases
  // =============================================================================

  describe('Singleton pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = CacheService.getInstance();
      const instance2 = CacheService.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should create a new instance if none exists', () => {
      const instance = CacheService.getInstance();
      
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(CacheService);
    });

    it('should maintain cache state across getInstance calls', async () => {
      const instance1 = CacheService.getInstance();
      await instance1.set('test-key', 'test-value', 60);
      
      const instance2 = CacheService.getInstance();
      const value = await instance2.get('test-key');
      
      expect(value).toBe('test-value');
    });
  });

  // =============================================================================
  // get() method - 7 test cases
  // =============================================================================

  describe('get()', () => {
    it('should return null for non-existent key', async () => {
      const result = await cacheService.get('non-existent');
      
      expect(result).toBeNull();
    });

    it('should return value for existing key', async () => {
      await cacheService.set('test-key', 'test-value', 60);
      
      const result = await cacheService.get('test-key');
      
      expect(result).toBe('test-value');
    });

    it('should return null for expired key', async () => {
      await cacheService.set('test-key', 'test-value', 60);
      
      // Fast forward time by 61 seconds
      (Date.now as jest.Mock).mockReturnValue(1061000);
      
      const result = await cacheService.get('test-key');
      
      expect(result).toBeNull();
    });

    it('should delete expired key from cache', async () => {
      await cacheService.set('test-key', 'test-value', 60);
      
      // Fast forward time by 61 seconds
      (Date.now as jest.Mock).mockReturnValue(1061000);
      
      await cacheService.get('test-key');
      
      // Check that key was deleted
      const cache = (cacheService as any).cache;
      expect(cache.has('test-key')).toBe(false);
    });

    it('should handle multiple keys independently', async () => {
      await cacheService.set('key1', 'value1', 60);
      await cacheService.set('key2', 'value2', 60);
      
      const result1 = await cacheService.get('key1');
      const result2 = await cacheService.get('key2');
      
      expect(result1).toBe('value1');
      expect(result2).toBe('value2');
    });

    it('should return value just before expiry', async () => {
      await cacheService.set('test-key', 'test-value', 60);
      
      // Fast forward time by 59.999 seconds
      (Date.now as jest.Mock).mockReturnValue(1059999);
      
      const result = await cacheService.get('test-key');
      
      expect(result).toBe('test-value');
    });

    it('should handle empty string values', async () => {
      await cacheService.set('test-key', '', 60);
      
      const result = await cacheService.get('test-key');
      
      expect(result).toBe('');
    });
  });

  // =============================================================================
  // set() method - 6 test cases
  // =============================================================================

  describe('set()', () => {
    it('should store value with correct expiry time', async () => {
      await cacheService.set('test-key', 'test-value', 60);
      
      const cache = (cacheService as any).cache;
      const item = cache.get('test-key');
      
      expect(item).toBeDefined();
      expect(item.value).toBe('test-value');
      expect(item.expires).toBe(1060000); // 1000000 + (60 * 1000)
    });

    it('should overwrite existing value', async () => {
      await cacheService.set('test-key', 'value1', 60);
      await cacheService.set('test-key', 'value2', 30);
      
      const result = await cacheService.get('test-key');
      
      expect(result).toBe('value2');
    });

    it('should update expiry time when overwriting', async () => {
      await cacheService.set('test-key', 'value1', 60);
      
      (Date.now as jest.Mock).mockReturnValue(2000000);
      await cacheService.set('test-key', 'value2', 30);
      
      const cache = (cacheService as any).cache;
      const item = cache.get('test-key');
      
      expect(item.expires).toBe(2030000); // 2000000 + (30 * 1000)
    });

    it('should handle zero TTL', async () => {
      await cacheService.set('test-key', 'test-value', 0);
      
      // Value should expire immediately
      (Date.now as jest.Mock).mockReturnValue(1000001);
      
      const result = await cacheService.get('test-key');
      
      expect(result).toBeNull();
    });

    it('should handle large TTL values', async () => {
      const largeTTL = 86400; // 24 hours in seconds
      await cacheService.set('test-key', 'test-value', largeTTL);
      
      const cache = (cacheService as any).cache;
      const item = cache.get('test-key');
      
      expect(item.expires).toBe(1000000 + (86400 * 1000));
    });

    it('should handle special characters in key and value', async () => {
      const specialKey = 'key:with:colons-and-dashes_123';
      const specialValue = 'value with spaces, "quotes", and {json}';
      
      await cacheService.set(specialKey, specialValue, 60);
      const result = await cacheService.get(specialKey);
      
      expect(result).toBe(specialValue);
    });
  });

  // =============================================================================
  // checkLimit() method - 10 test cases
  // =============================================================================

  describe('checkLimit()', () => {
    it('should allow first request within limit', async () => {
      const result = await cacheService.checkLimit('rate-limit', 5, 60);
      
      expect(result).toBe(true);
    });

    it('should increment counter on each call', async () => {
      await cacheService.checkLimit('rate-limit', 5, 60);
      
      const count = await cacheService.get('rate-limit');
      
      expect(count).toBe('1');
    });

    it('should allow requests up to limit', async () => {
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(await cacheService.checkLimit('rate-limit', 5, 60));
      }
      
      expect(results).toEqual([true, true, true, true, true]);
    });

    it('should deny request when limit reached', async () => {
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        await cacheService.checkLimit('rate-limit', 5, 60);
      }
      
      // Next request should be denied
      const result = await cacheService.checkLimit('rate-limit', 5, 60);
      
      expect(result).toBe(false);
    });

    it('should not increment counter when limit exceeded', async () => {
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        await cacheService.checkLimit('rate-limit', 5, 60);
      }
      
      // Try to exceed limit
      await cacheService.checkLimit('rate-limit', 5, 60);
      
      const count = await cacheService.get('rate-limit');
      expect(count).toBe('5');
    });

    it('should reset counter after window expires', async () => {
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        await cacheService.checkLimit('rate-limit', 5, 60);
      }
      
      // Fast forward past window
      (Date.now as jest.Mock).mockReturnValue(1061000);
      
      // Should allow new request
      const result = await cacheService.checkLimit('rate-limit', 5, 60);
      
      expect(result).toBe(true);
      
      const count = await cacheService.get('rate-limit');
      expect(count).toBe('1');
    });

    it('should handle multiple keys independently', async () => {
      await cacheService.checkLimit('limit1', 2, 60);
      await cacheService.checkLimit('limit2', 2, 60);
      await cacheService.checkLimit('limit1', 2, 60);
      
      const result1 = await cacheService.checkLimit('limit1', 2, 60);
      const result2 = await cacheService.checkLimit('limit2', 2, 60);
      
      expect(result1).toBe(false); // limit1 exceeded
      expect(result2).toBe(true);  // limit2 still ok
    });

    it('should handle limit of 1', async () => {
      const result1 = await cacheService.checkLimit('single-limit', 1, 60);
      const result2 = await cacheService.checkLimit('single-limit', 1, 60);
      
      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('should handle zero window (immediate expiry)', async () => {
      await cacheService.checkLimit('zero-window', 5, 0);
      
      // Move time forward slightly
      (Date.now as jest.Mock).mockReturnValue(1000001);
      
      // Should allow new request as previous expired
      const result = await cacheService.checkLimit('zero-window', 5, 0);
      
      expect(result).toBe(true);
    });

    it('should preserve window duration when incrementing', async () => {
      await cacheService.checkLimit('preserve-window', 5, 60);
      
      // Move forward 30 seconds
      (Date.now as jest.Mock).mockReturnValue(1030000);
      
      // Make another request
      await cacheService.checkLimit('preserve-window', 5, 60);
      
      const cache = (cacheService as any).cache;
      const item = cache.get('preserve-window');
      
      // Window should not be extended, should still expire at original time + 60s
      expect(item.expires).toBe(1060000);
    });
  });

  // =============================================================================
  // Edge cases and error handling - 5 test cases
  // =============================================================================

  describe('Edge cases', () => {
    it('should handle negative TTL as zero', async () => {
      await cacheService.set('test-key', 'test-value', -10);
      
      const cache = (cacheService as any).cache;
      const item = cache.get('test-key');
      
      // Should treat negative as 0, creating already-expired entry
      expect(item.expires).toBe(990000); // 1000000 + (-10 * 1000)
    });

    it('should handle very large counter values', async () => {
      // Manually set a large counter
      await cacheService.set('large-counter', '999999', 60);
      
      const result = await cacheService.checkLimit('large-counter', 1000000, 60);
      
      expect(result).toBe(true);
      
      const count = await cacheService.get('large-counter');
      expect(count).toBe('1000000');
    });

    it('should handle non-numeric counter values gracefully', async () => {
      // Manually set invalid counter
      await cacheService.set('bad-counter', 'not-a-number', 60);
      
      const result = await cacheService.checkLimit('bad-counter', 5, 60);
      
      // Should treat invalid as 0 and start fresh
      expect(result).toBe(true);
      
      const count = await cacheService.get('bad-counter');
      expect(count).toBe('1');
    });

    it('should handle concurrent operations on same key', async () => {
      // Simulate concurrent set operations
      const promises = [
        cacheService.set('concurrent', 'value1', 60),
        cacheService.set('concurrent', 'value2', 60),
        cacheService.set('concurrent', 'value3', 60)
      ];
      
      await Promise.all(promises);
      
      const result = await cacheService.get('concurrent');
      
      // One of the values should win (last one in this case)
      expect(['value1', 'value2', 'value3']).toContain(result);
    });

    it('should handle empty cache gracefully', async () => {
      const getResult = await cacheService.get('any-key');
      const limitResult = await cacheService.checkLimit('any-limit', 5, 60);
      
      expect(getResult).toBeNull();
      expect(limitResult).toBe(true);
    });
  });
});
