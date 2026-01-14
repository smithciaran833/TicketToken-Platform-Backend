import { sessionCache, userCache, tokenBlacklist, rateLimitCache } from '../../../src/services/cache-integration';

// Mock the shared cache
jest.mock('@tickettoken/shared/cache', () => ({
  createCache: jest.fn(() => ({
    service: {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      deleteByTags: jest.fn(),
      getStats: jest.fn(),
    },
    middleware: {},
    strategies: {},
    invalidator: {},
  })),
}));

describe('Cache Integration', () => {
  let mockCache: any;

  beforeEach(async () => {
    // Re-import to get the mocked cache instance
    const cacheModule = await import('../../../src/services/cache-integration');
    mockCache = (cacheModule as any).cache;
    jest.clearAllMocks();
  });

  describe('sessionCache', () => {
    const sessionId = 'session-123';
    const sessionData = { userId: 'user-123', email: 'test@example.com' };

    describe('getSession', () => {
      it('should get session from cache', async () => {
        mockCache.get.mockResolvedValue(sessionData);

        const result = await sessionCache.getSession(sessionId);

        expect(result).toEqual(sessionData);
        expect(mockCache.get).toHaveBeenCalledWith(
          `session:${sessionId}`,
          undefined,
          { ttl: 300, level: 'BOTH' }
        );
      });

      it('should return undefined when session not found', async () => {
        mockCache.get.mockResolvedValue(undefined);

        const result = await sessionCache.getSession(sessionId);

        expect(result).toBeUndefined();
      });
    });

    describe('setSession', () => {
      it('should set session in cache with tags', async () => {
        await sessionCache.setSession(sessionId, sessionData);

        expect(mockCache.set).toHaveBeenCalledWith(
          `session:${sessionId}`,
          sessionData,
          {
            ttl: 300,
            level: 'BOTH',
            tags: [`user:${sessionData.userId}`],
          }
        );
      });
    });

    describe('deleteSession', () => {
      it('should delete session from cache', async () => {
        await sessionCache.deleteSession(sessionId);

        expect(mockCache.delete).toHaveBeenCalledWith(`session:${sessionId}`);
      });
    });

    describe('deleteUserSessions', () => {
      it('should delete all sessions for a user by tags', async () => {
        const userId = 'user-123';

        await sessionCache.deleteUserSessions(userId);

        expect(mockCache.deleteByTags).toHaveBeenCalledWith([`user:${userId}`]);
      });
    });
  });

  describe('userCache', () => {
    const userId = 'user-123';
    const userData = { id: userId, email: 'test@example.com', name: 'Test User' };

    describe('getUser', () => {
      it('should get user from cache', async () => {
        mockCache.get.mockResolvedValue(userData);

        const result = await userCache.getUser(userId);

        expect(result).toEqual(userData);
        expect(mockCache.get).toHaveBeenCalledWith(
          `user:${userId}`,
          undefined,
          { ttl: 300, level: 'BOTH' }
        );
      });
    });

    describe('setUser', () => {
      it('should set user in cache', async () => {
        await userCache.setUser(userId, userData);

        expect(mockCache.set).toHaveBeenCalledWith(
          `user:${userId}`,
          userData,
          { ttl: 300, level: 'BOTH' }
        );
      });
    });

    describe('deleteUser', () => {
      it('should delete user and associated data', async () => {
        await userCache.deleteUser(userId);

        expect(mockCache.delete).toHaveBeenCalledWith(`user:${userId}`);
        expect(mockCache.deleteByTags).toHaveBeenCalledWith([`user:${userId}`]);
      });
    });

    describe('getUserWithFetch', () => {
      it('should get user with fetcher function', async () => {
        const fetcher = jest.fn().mockResolvedValue(userData);
        mockCache.get.mockResolvedValue(userData);

        const result = await userCache.getUserWithFetch(userId, fetcher);

        expect(result).toEqual(userData);
        expect(mockCache.get).toHaveBeenCalledWith(
          `user:${userId}`,
          fetcher,
          { ttl: 300, level: 'BOTH' }
        );
      });
    });
  });

  describe('tokenBlacklist', () => {
    const token = 'jwt-token-123';
    const expiresIn = 3600;

    describe('add', () => {
      it('should add token to blacklist', async () => {
        await tokenBlacklist.add(token, expiresIn);

        expect(mockCache.set).toHaveBeenCalledWith(
          `blacklist:${token}`,
          true,
          { ttl: expiresIn, level: 'L2' }
        );
      });
    });

    describe('check', () => {
      it('should return true if token is blacklisted', async () => {
        mockCache.get.mockResolvedValue(true);

        const result = await tokenBlacklist.check(token);

        expect(result).toBe(true);
        expect(mockCache.get).toHaveBeenCalledWith(
          `blacklist:${token}`,
          undefined,
          { level: 'L2' }
        );
      });

      it('should return false if token is not blacklisted', async () => {
        mockCache.get.mockResolvedValue(undefined);

        const result = await tokenBlacklist.check(token);

        expect(result).toBe(false);
      });
    });
  });

  describe('rateLimitCache', () => {
    const key = 'user:123:login';
    const limit = 5;
    const window = 60;

    describe('checkLimit', () => {
      it('should allow request when under limit', async () => {
        mockCache.get.mockResolvedValue(2);

        const result = await rateLimitCache.checkLimit(key, limit, window);

        expect(result).toBe(true);
        expect(mockCache.set).toHaveBeenCalledWith(
          `ratelimit:${key}`,
          3,
          { ttl: window, level: 'L2' }
        );
      });

      it('should allow first request when count is null', async () => {
        mockCache.get.mockResolvedValue(null);

        const result = await rateLimitCache.checkLimit(key, limit, window);

        expect(result).toBe(true);
        expect(mockCache.set).toHaveBeenCalledWith(
          `ratelimit:${key}`,
          1,
          { ttl: window, level: 'L2' }
        );
      });

      it('should deny request when at limit', async () => {
        mockCache.get.mockResolvedValue(5);

        const result = await rateLimitCache.checkLimit(key, limit, window);

        expect(result).toBe(false);
        expect(mockCache.set).not.toHaveBeenCalled();
      });

      it('should deny request when over limit', async () => {
        mockCache.get.mockResolvedValue(6);

        const result = await rateLimitCache.checkLimit(key, limit, window);

        expect(result).toBe(false);
        expect(mockCache.set).not.toHaveBeenCalled();
      });
    });

    describe('reset', () => {
      it('should reset rate limit counter', async () => {
        await rateLimitCache.reset(key);

        expect(mockCache.delete).toHaveBeenCalledWith(`ratelimit:${key}`, 'L2');
      });
    });
  });
});
