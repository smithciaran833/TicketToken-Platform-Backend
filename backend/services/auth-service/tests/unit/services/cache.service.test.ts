import { CacheService } from '../../../src/services/cache.service';

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    // Get a fresh instance by resetting the singleton
    // We access the private static to reset it for testing
    (CacheService as any).instance = undefined;
    cacheService = CacheService.getInstance();
  });

  describe('getInstance', () => {
    it('returns singleton instance', () => {
      const instance1 = CacheService.getInstance();
      const instance2 = CacheService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('get', () => {
    it('returns null for missing key', async () => {
      const result = await cacheService.get('nonexistent');
      expect(result).toBeNull();
    });

    it('returns value for valid key', async () => {
      await cacheService.set('testKey', 'testValue', 60);
      const result = await cacheService.get('testKey');
      expect(result).toBe('testValue');
    });

    it('returns null and deletes expired key', async () => {
      // Set with very short TTL
      await cacheService.set('expiring', 'value', 0);
      
      // Wait a tiny bit for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = await cacheService.get('expiring');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('stores value with correct expiry', async () => {
      await cacheService.set('key1', 'value1', 60);
      const result = await cacheService.get('key1');
      expect(result).toBe('value1');
    });

    it('overwrites existing value', async () => {
      await cacheService.set('key', 'original', 60);
      await cacheService.set('key', 'updated', 60);
      const result = await cacheService.get('key');
      expect(result).toBe('updated');
    });

    it('stores with TTL in seconds', async () => {
      const beforeSet = Date.now();
      await cacheService.set('ttlTest', 'value', 10);
      
      // Access internal cache to verify expiry calculation
      const cache = (cacheService as any).cache;
      const item = cache.get('ttlTest');
      
      // Expiry should be approximately now + 10 seconds
      expect(item.expires).toBeGreaterThanOrEqual(beforeSet + 10000);
      expect(item.expires).toBeLessThanOrEqual(beforeSet + 11000);
    });
  });

  describe('checkLimit', () => {
    it('allows under limit', async () => {
      const result = await cacheService.checkLimit('rateKey', 5, 60);
      expect(result).toBe(true);
    });

    it('increments counter on each call', async () => {
      await cacheService.checkLimit('counter', 10, 60);
      await cacheService.checkLimit('counter', 10, 60);
      await cacheService.checkLimit('counter', 10, 60);
      
      const count = await cacheService.get('counter');
      expect(count).toBe('3');
    });

    it('rejects at limit', async () => {
      // Fill up to limit
      for (let i = 0; i < 3; i++) {
        await cacheService.checkLimit('limited', 3, 60);
      }
      
      // Next call should fail
      const result = await cacheService.checkLimit('limited', 3, 60);
      expect(result).toBe(false);
    });

    it('rejects over limit', async () => {
      // Set counter to limit
      await cacheService.set('overlimit', '5', 60);
      
      const result = await cacheService.checkLimit('overlimit', 5, 60);
      expect(result).toBe(false);
    });

    it('window resets after TTL', async () => {
      // Set with very short window
      await cacheService.set('resetKey', '5', 0);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should allow again since counter expired
      const result = await cacheService.checkLimit('resetKey', 5, 60);
      expect(result).toBe(true);
    });
  });
});
