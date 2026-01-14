// Mock the shared cache module
const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  deleteByTags: jest.fn(),
  getStats: jest.fn().mockReturnValue({ hits: 10, misses: 5 }),
};

const mockCacheSystem = {
  service: mockCacheService,
  middleware: jest.fn(),
  strategies: {},
  invalidator: jest.fn(),
};

jest.mock('@tickettoken/shared', () => ({
  createCache: jest.fn(() => mockCacheSystem),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: 'test-password',
  },
}));

import {
  cache,
  cacheMiddleware,
  cacheStrategies,
  cacheInvalidator,
  sessionCache,
  userCache,
  tokenBlacklist,
  rateLimitCache,
  getCacheStats,
  serviceCache,
} from '../../../src/services/cache-integration';

describe('cache-integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exports', () => {
    it('should export cache service', () => {
      expect(cache).toBe(mockCacheService);
    });

    it('should export cacheMiddleware', () => {
      expect(cacheMiddleware).toBeDefined();
    });

    it('should export cacheStrategies', () => {
      expect(cacheStrategies).toBeDefined();
    });

    it('should export cacheInvalidator', () => {
      expect(cacheInvalidator).toBeDefined();
    });

    it('should export serviceCache as alias', () => {
      expect(serviceCache).toBe(mockCacheService);
    });
  });

  describe('sessionCache', () => {
    it('should get session', async () => {
      mockCacheService.get.mockResolvedValue({ userId: 'user-123' });

      const result = await sessionCache.getSession('session-123');

      expect(mockCacheService.get).toHaveBeenCalled();
      expect(result).toEqual({ userId: 'user-123' });
    });

    it('should set session', async () => {
      const sessionData = { userId: 'user-123', email: 'test@example.com' };

      await sessionCache.setSession('session-123', sessionData);

      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should delete session', async () => {
      await sessionCache.deleteSession('session-123');

      expect(mockCacheService.delete).toHaveBeenCalled();
    });

    it('should delete user sessions by tag', async () => {
      await sessionCache.deleteUserSessions('user-123');

      expect(mockCacheService.deleteByTags).toHaveBeenCalled();
    });
  });

  describe('userCache', () => {
    it('should get user', async () => {
      mockCacheService.get.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });

      const result = await userCache.getUser('user-123');

      expect(mockCacheService.get).toHaveBeenCalled();
      expect(result).toEqual({ id: 'user-123', email: 'test@example.com' });
    });

    it('should set user', async () => {
      const userData = { id: 'user-123', email: 'test@example.com' };

      await userCache.setUser('user-123', userData);

      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should delete user and related tags', async () => {
      await userCache.deleteUser('user-123');

      expect(mockCacheService.delete).toHaveBeenCalled();
      expect(mockCacheService.deleteByTags).toHaveBeenCalled();
    });

    it('should get user with fetcher', async () => {
      const fetcher = jest.fn().mockResolvedValue({ id: 'user-123' });
      mockCacheService.get.mockResolvedValue({ id: 'user-123' });

      const result = await userCache.getUserWithFetch('user-123', fetcher);

      expect(mockCacheService.get).toHaveBeenCalled();
      expect(result).toEqual({ id: 'user-123' });
    });
  });

  describe('tokenBlacklist', () => {
    it('should add token to blacklist', async () => {
      await tokenBlacklist.add('token-123', 3600);

      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should check if token is blacklisted - true', async () => {
      mockCacheService.get.mockResolvedValue(true);

      const result = await tokenBlacklist.check('token-123');

      expect(mockCacheService.get).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should check if token is blacklisted - false', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const result = await tokenBlacklist.check('token-123');

      expect(result).toBe(false);
    });
  });

  describe('rateLimitCache', () => {
    it('should allow request under limit', async () => {
      mockCacheService.get.mockResolvedValue(5);

      const result = await rateLimitCache.checkLimit('user:123', 10, 60);

      expect(result).toBe(true);
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should deny request at limit', async () => {
      mockCacheService.get.mockResolvedValue(10);

      const result = await rateLimitCache.checkLimit('user:123', 10, 60);

      expect(result).toBe(false);
    });

    it('should handle null count as 0', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const result = await rateLimitCache.checkLimit('user:123', 10, 60);

      expect(result).toBe(true);
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should reset rate limit', async () => {
      await rateLimitCache.reset('user:123');

      expect(mockCacheService.delete).toHaveBeenCalled();
    });
  });

  describe('getCacheStats', () => {
    it('should return cache stats', () => {
      const stats = getCacheStats();

      expect(mockCacheService.getStats).toHaveBeenCalled();
      expect(stats).toEqual({ hits: 10, misses: 5 });
    });
  });
});
