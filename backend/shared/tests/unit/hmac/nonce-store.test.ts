/**
 * Nonce Store Unit Tests
 */

import { NonceStore, getNonceStore, createNonceStore } from '../../../src/hmac/nonce-store';
import { mockRedisClient } from '../../setup';

describe('NonceStore', () => {
  let nonceStore: NonceStore;

  beforeEach(() => {
    nonceStore = new NonceStore({
      keyPrefix: 'test:nonce',
      ttlSeconds: 60,
    });

    // Reset mock to default behavior
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.exists.mockResolvedValue(0);
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.ttl.mockResolvedValue(60);
  });

  describe('isNonceUsed', () => {
    it('should return false for new nonce (SETNX succeeds)', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      const isUsed = await nonceStore.isNonceUsed('new-nonce-123', 'test-service');

      expect(isUsed).toBe(false);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test:nonce:test-service:new-nonce-123',
        '1',
        'EX',
        60,
        'NX'
      );
    });

    it('should return true for used nonce (SETNX fails)', async () => {
      mockRedisClient.set.mockResolvedValue(null);

      const isUsed = await nonceStore.isNonceUsed('used-nonce-456', 'test-service');

      expect(isUsed).toBe(true);
    });

    it('should throw error when Redis is unavailable', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Connection refused'));

      await expect(nonceStore.isNonceUsed('nonce', 'service')).rejects.toThrow(
        'Nonce validation unavailable'
      );
    });

    it('should use correct key format', async () => {
      await nonceStore.isNonceUsed('abc-123', 'payment-service');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test:nonce:payment-service:abc-123',
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  describe('markNonceAsUsed', () => {
    it('should set nonce in Redis with TTL', async () => {
      await nonceStore.markNonceAsUsed('manual-nonce', 'test-service');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test:nonce:test-service:manual-nonce',
        '1',
        'EX',
        60
      );
    });
  });

  describe('nonceExists', () => {
    it('should return true when nonce exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const exists = await nonceStore.nonceExists('existing-nonce', 'service');

      expect(exists).toBe(true);
    });

    it('should return false when nonce does not exist', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const exists = await nonceStore.nonceExists('missing-nonce', 'service');

      expect(exists).toBe(false);
    });
  });

  describe('deleteNonce', () => {
    it('should delete nonce from Redis', async () => {
      await nonceStore.deleteNonce('nonce-to-delete', 'service');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test:nonce:service:nonce-to-delete');
    });
  });

  describe('getNonceTTL', () => {
    it('should return TTL from Redis', async () => {
      mockRedisClient.ttl.mockResolvedValue(45);

      const ttl = await nonceStore.getNonceTTL('nonce', 'service');

      expect(ttl).toBe(45);
    });

    it('should return -2 for non-existent key', async () => {
      mockRedisClient.ttl.mockResolvedValue(-2);

      const ttl = await nonceStore.getNonceTTL('missing', 'service');

      expect(ttl).toBe(-2);
    });
  });
});

describe('Factory functions', () => {
  it('createNonceStore should create new instance with custom options', () => {
    const store = createNonceStore({
      keyPrefix: 'custom:prefix',
      ttlSeconds: 120,
    });

    expect(store).toBeInstanceOf(NonceStore);
  });

  it('getNonceStore should return singleton', () => {
    const store1 = getNonceStore();
    const store2 = getNonceStore();

    expect(store1).toBe(store2);
  });
});

describe('NonceStore with default config', () => {
  it('should use default prefix and TTL', async () => {
    const store = new NonceStore();

    await store.isNonceUsed('test-nonce', 'my-service');

    // Should use default prefix 'nonce:hmac' and default TTL
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      expect.stringContaining('nonce:hmac:my-service:test-nonce'),
      '1',
      'EX',
      expect.any(Number),
      'NX'
    );
  });
});
