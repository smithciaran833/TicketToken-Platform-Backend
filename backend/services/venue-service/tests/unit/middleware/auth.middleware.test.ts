import { authenticate, requireVenueAccess, AuthUser } from '../../../src/middleware/auth.middleware';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('Auth Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockServer: any;
  let mockDb: any;
  let mockRedis: any;
  let mockVenueService: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Suppress console.error in tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock database
    mockDb = jest.fn();
    mockDb.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      first: jest.fn()
    });

    // Mock Redis
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn()
    };

    // Mock venue service
    mockVenueService = {
      checkVenueAccess: jest.fn()
    };

    // Mock Fastify server with JWT and container
    mockServer = {
      jwt: {
        verify: jest.fn()
      },
      container: {
        cradle: {
          db: mockDb,
          redis: mockRedis,
          venueService: mockVenueService
        }
      }
    };

    // Mock request
    mockRequest = {
      headers: {},
      server: mockServer,
      params: {}
    };

    // Mock reply with chainable methods - FIXED: using status instead of code
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      request: {
        id: 'test-request-id-123'
      } as any
    } as any;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // =============================================================================
  // JWT Authentication Tests
  // =============================================================================

  describe('JWT Authentication', () => {
    it('should authenticate with valid JWT token', async () => {
      const validToken = 'valid.jwt.token';
      mockRequest.headers = {
        authorization: `Bearer ${validToken}`
      };

      const decodedToken = {
        sub: 'user-123',
        email: 'user@example.com',
        permissions: ['read', 'write']
      };

      mockServer.jwt.verify.mockResolvedValue(decodedToken);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockServer.jwt.verify).toHaveBeenCalledWith(validToken);
      expect((mockRequest as any).user).toEqual({
        id: 'user-123',
        email: 'user@example.com',
        permissions: ['read', 'write']
      });
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should handle JWT token without email', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid.token'
      };

      const decodedToken = {
        sub: 'user-123',
        permissions: ['read']
      };

      mockServer.jwt.verify.mockResolvedValue(decodedToken);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).user).toEqual({
        id: 'user-123',
        email: '',
        permissions: ['read']
      });
    });

    it('should handle JWT token without permissions', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid.token'
      };

      const decodedToken = {
        sub: 'user-123',
        email: 'user@example.com'
      };

      mockServer.jwt.verify.mockResolvedValue(decodedToken);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).user).toEqual({
        id: 'user-123',
        email: 'user@example.com',
        permissions: []
      });
    });

    it('should reject invalid JWT token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid.token'
      };

      mockServer.jwt.verify.mockRejectedValue(new Error('Invalid signature'));

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token'
        })
      );
      expect((mockRequest as any).user).toBeUndefined();
    });

    it('should reject expired JWT token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer expired.token'
      };

      mockServer.jwt.verify.mockRejectedValue(new Error('Token expired'));

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token'
        })
      );
    });

    it('should reject malformed JWT token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer malformed'
      };

      mockServer.jwt.verify.mockRejectedValue(new Error('Malformed token'));

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token'
        })
      );
    });

    it('should reject missing Authorization header', async () => {
      mockRequest.headers = {};

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Missing authentication'
        })
      );
      expect(mockServer.jwt.verify).not.toHaveBeenCalled();
    });

    it('should reject empty token after Bearer prefix', async () => {
      mockRequest.headers = {
        authorization: 'Bearer '
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Missing authentication'
        })
      );
    });
  });

  // =============================================================================
  // API Key Authentication Tests
  // =============================================================================

  describe('API Key Authentication', () => {
    it('should authenticate with valid API key from cache', async () => {
      const apiKey = 'valid-api-key-123';
      mockRequest.headers = {
        'x-api-key': apiKey
      };

      const cachedUser = {
        id: 'user-456',
        email: 'api-user@example.com',
        permissions: ['api:read', 'api:write']
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedUser));

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedis.get).toHaveBeenCalledWith(`api_key:${apiKey}`);
      expect((mockRequest as any).user).toEqual(cachedUser);
      expect(mockDb).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should authenticate with valid API key from database', async () => {
      const apiKey = 'valid-api-key-789';
      mockRequest.headers = {
        'x-api-key': apiKey
      };

      // Cache miss
      mockRedis.get.mockResolvedValue(null);

      // Mock database queries
      const keyData = {
        key: apiKey,
        user_id: 'user-789',
        is_active: true,
        expires_at: new Date(Date.now() + 86400000), // expires tomorrow
        permissions: ['api:read']
      };

      const userData = {
        id: 'user-789',
        email: 'db-user@example.com'
      };

      const mockKeyQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(keyData)
      };

      const mockUserQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(userData)
      };

      mockDb
        .mockReturnValueOnce(mockKeyQuery) // First call for api_keys table
        .mockReturnValueOnce(mockUserQuery); // Second call for users table

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedis.get).toHaveBeenCalledWith(`api_key:${apiKey}`);
      expect(mockDb).toHaveBeenCalledWith('api_keys');
      expect(mockDb).toHaveBeenCalledWith('users');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `api_key:${apiKey}`,
        300,
        JSON.stringify({
          id: 'user-789',
          email: 'db-user@example.com',
          permissions: ['api:read']
        })
      );
      expect((mockRequest as any).user).toEqual({
        id: 'user-789',
        email: 'db-user@example.com',
        permissions: ['api:read']
      });
    });

    it('should reject invalid API key', async () => {
      mockRequest.headers = {
        'x-api-key': 'invalid-key'
      };

      mockRedis.get.mockResolvedValue(null);

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null) // Key not found
      };

      mockDb.mockReturnValue(mockQuery);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid API key'
        })
      );
    });

    it('should reject expired API key', async () => {
      mockRequest.headers = {
        'x-api-key': 'expired-key'
      };

      mockRedis.get.mockResolvedValue(null);

      const expiredKeyData = {
        key: 'expired-key',
        user_id: 'user-123',
        is_active: true,
        expires_at: new Date(Date.now() - 86400000) // expired yesterday
      };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null) // Where clause filters out expired keys
      };

      mockDb.mockReturnValue(mockQuery);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid API key'
        })
      );
    });

    it('should reject inactive API key', async () => {
      mockRequest.headers = {
        'x-api-key': 'inactive-key'
      };

      mockRedis.get.mockResolvedValue(null);

      // is_active: false will be filtered by where clause
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };

      mockDb.mockReturnValue(mockQuery);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should reject API key when user not found', async () => {
      mockRequest.headers = {
        'x-api-key': 'orphaned-key'
      };

      mockRedis.get.mockResolvedValue(null);

      const keyData = {
        key: 'orphaned-key',
        user_id: 'non-existent-user',
        is_active: true,
        expires_at: new Date(Date.now() + 86400000)
      };

      const mockKeyQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(keyData)
      };

      const mockUserQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null) // User not found
      };

      mockDb
        .mockReturnValueOnce(mockKeyQuery)
        .mockReturnValueOnce(mockUserQuery);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid API key'
        })
      );
    });

    it('should handle API key without permissions', async () => {
      const apiKey = 'key-no-perms';
      mockRequest.headers = {
        'x-api-key': apiKey
      };

      mockRedis.get.mockResolvedValue(null);

      const keyData = {
        key: apiKey,
        user_id: 'user-123',
        is_active: true,
        expires_at: new Date(Date.now() + 86400000),
        permissions: null
      };

      const userData = {
        id: 'user-123',
        email: 'user@example.com'
      };

      const mockKeyQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(keyData)
      };

      const mockUserQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(userData)
      };

      mockDb
        .mockReturnValueOnce(mockKeyQuery)
        .mockReturnValueOnce(mockUserQuery);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).user.permissions).toEqual([]);
    });

    it('should cache API key for 5 minutes after database lookup', async () => {
      const apiKey = 'cache-test-key';
      mockRequest.headers = {
        'x-api-key': apiKey
      };

      mockRedis.get.mockResolvedValue(null);

      const keyData = {
        key: apiKey,
        user_id: 'user-123',
        is_active: true,
        expires_at: new Date(Date.now() + 86400000),
        permissions: ['read']
      };

      const userData = {
        id: 'user-123',
        email: 'user@example.com'
      };

      const mockKeyQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(keyData)
      };

      const mockUserQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(userData)
      };

      mockDb
        .mockReturnValueOnce(mockKeyQuery)
        .mockReturnValueOnce(mockUserQuery);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `api_key:${apiKey}`,
        300, // 5 minutes
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // Priority: API Key over JWT
  // =============================================================================

  describe('Authentication Priority', () => {
    it('should prioritize API key over JWT when both are present', async () => {
      mockRequest.headers = {
        'x-api-key': 'api-key-123',
        authorization: 'Bearer jwt.token'
      };

      const cachedUser = {
        id: 'api-user',
        email: 'api@example.com',
        permissions: ['api']
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedUser));

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockServer.jwt.verify).not.toHaveBeenCalled();
      expect((mockRequest as any).user).toEqual(cachedUser);
    });
  });

  // =============================================================================
  // Error Handling Tests
  // =============================================================================

  describe('Error Handling', () => {
    it('should handle Redis connection failure gracefully', async () => {
      mockRequest.headers = {
        'x-api-key': 'test-key'
      };

      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication failed'
        })
      );
    });

    it('should handle database connection failure', async () => {
      mockRequest.headers = {
        'x-api-key': 'test-key'
      };

      mockRedis.get.mockResolvedValue(null);
      mockDb.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication failed'
        })
      );
    });

    it('should handle JWT verification throwing unexpected error', async () => {
      mockRequest.headers = {
        authorization: 'Bearer token'
      };

      mockServer.jwt.verify.mockRejectedValue(new Error('Unexpected JWT error'));

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // requireVenueAccess Tests
  // =============================================================================

  describe('requireVenueAccess', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: 'venue-123' };
    });

    it('should allow access when user has venue access', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        email: 'user@example.com',
        permissions: []
      };

      mockVenueService.checkVenueAccess.mockResolvedValue(true);

      await requireVenueAccess(
        mockRequest as FastifyRequest<{ Params: { venueId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockVenueService.checkVenueAccess).toHaveBeenCalledWith('venue-123', 'user-123');
      expect((mockRequest as any).user.venueId).toBe('venue-123');
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should deny access when user does not have venue access', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        email: 'user@example.com',
        permissions: []
      };

      mockVenueService.checkVenueAccess.mockResolvedValue(false);

      await requireVenueAccess(
        mockRequest as FastifyRequest<{ Params: { venueId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Access denied'
        })
      );
      expect((mockRequest as any).user.venueId).toBeUndefined();
    });

    it('should require authentication before checking venue access', async () => {
      // No user set on request
      (mockRequest as any).user = null;

      await requireVenueAccess(
        mockRequest as FastifyRequest<{ Params: { venueId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Not authenticated'
        })
      );
      expect(mockVenueService.checkVenueAccess).not.toHaveBeenCalled();
    });

    it('should handle undefined user gracefully', async () => {
      // User is undefined
      (mockRequest as any).user = undefined;

      await requireVenueAccess(
        mockRequest as FastifyRequest<{ Params: { venueId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Not authenticated'
        })
      );
    });

    it('should store venueId on user object after successful access check', async () => {
      (mockRequest as any).user = {
        id: 'user-456',
        email: 'owner@example.com',
        permissions: ['venue:admin']
      };

      mockVenueService.checkVenueAccess.mockResolvedValue(true);

      await requireVenueAccess(
        mockRequest as FastifyRequest<{ Params: { venueId: string } }>,
        mockReply as FastifyReply
      );

      expect((mockRequest as any).user).toEqual({
        id: 'user-456',
        email: 'owner@example.com',
        permissions: ['venue:admin'],
        venueId: 'venue-123'
      });
    });

    it('should handle venue service errors gracefully', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        email: 'user@example.com',
        permissions: []
      };

      mockVenueService.checkVenueAccess.mockRejectedValue(new Error('Database error'));

      await expect(
        requireVenueAccess(
          mockRequest as FastifyRequest<{ Params: { venueId: string } }>,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Database error');
    });
  });

  // =============================================================================
  // Token Extraction Tests
  // =============================================================================

  describe('Token Extraction', () => {
    it('should extract token from Bearer format correctly', async () => {
      mockRequest.headers = {
        authorization: 'Bearer my.jwt.token'
      };

      const decodedToken = {
        sub: 'user-123',
        email: 'user@example.com',
        permissions: []
      };

      mockServer.jwt.verify.mockResolvedValue(decodedToken);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockServer.jwt.verify).toHaveBeenCalledWith('my.jwt.token');
    });

    it('should handle token without Bearer prefix', async () => {
      mockRequest.headers = {
        authorization: 'just.a.token'
      };

      const decodedToken = {
        sub: 'user-123',
        email: 'user@example.com',
        permissions: []
      };

      mockServer.jwt.verify.mockResolvedValue(decodedToken);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should attempt to verify "just.a.token" after Bearer replacement
      expect(mockServer.jwt.verify).toHaveBeenCalled();
    });

    it('should handle case-sensitive Bearer prefix', async () => {
      mockRequest.headers = {
        authorization: 'bearer lowercase.token'
      };

      const decodedToken = {
        sub: 'user-123',
        email: 'user@example.com',
        permissions: []
      };

      mockServer.jwt.verify.mockResolvedValue(decodedToken);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should attempt verification (Bearer is case-sensitive, so this becomes "bearer lowercase.token")
      expect(mockServer.jwt.verify).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // User Context Setting Tests
  // =============================================================================

  describe('User Context Setting', () => {
    it('should set complete user context from JWT', async () => {
      mockRequest.headers = {
        authorization: 'Bearer token'
      };

      const decodedToken = {
        sub: 'user-abc',
        email: 'complete@example.com',
        permissions: ['read', 'write', 'admin'],
        tenant_id: 'tenant-xyz',
        role: 'admin'
      };

      mockServer.jwt.verify.mockResolvedValue(decodedToken);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).user).toBeDefined();
      expect((mockRequest as any).user.id).toBe('user-abc');
      expect((mockRequest as any).user.email).toBe('complete@example.com');
      expect((mockRequest as any).user.permissions).toEqual(['read', 'write', 'admin']);
    });

    it('should set user context from API key', async () => {
      const apiKey = 'api-key-complete';
      mockRequest.headers = {
        'x-api-key': apiKey
      };

      const cachedUser = {
        id: 'api-user-123',
        email: 'api@example.com',
        permissions: ['api:access']
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedUser));

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).user).toEqual(cachedUser);
    });

    it('should not set user context on authentication failure', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid'
      };

      mockServer.jwt.verify.mockRejectedValue(new Error('Invalid'));

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).user).toBeUndefined();
    });
  });
});
