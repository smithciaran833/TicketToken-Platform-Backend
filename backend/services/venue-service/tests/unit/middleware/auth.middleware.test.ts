/**
 * Unit tests for src/middleware/auth.middleware.ts
 * Tests JWT authentication, API key authentication, and venue access checks
 * Security: SEC-DB6 (API key hashing), AE6 (issuer/audience validation)
 */

import { authenticate, requireVenueAccess, AuthUser } from '../../../src/middleware/auth.middleware';
import { createMockRequest, createMockReply, createMockUser } from '../../__mocks__/fastify.mock';
import { createRedisMock } from '../../__mocks__/redis.mock';
import { createKnexMock } from '../../__mocks__/knex.mock';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// Mock crypto for hashing
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('hashed_api_key_value'),
  })),
}));

describe('middleware/auth.middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let mockRedis: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = createRedisMock();
    mockDb = createKnexMock();
    mockReply = createMockReply();
    // Ensure JWT env vars are reset to defaults
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  describe('authenticate()', () => {
    describe('JWT authentication', () => {
      it('should authenticate with valid JWT token', async () => {
        const decodedToken = {
          sub: 'user-123',
          email: 'test@example.com',
          permissions: ['venue:read'],
          tenant_id: 'tenant-456',
          iss: 'tickettoken-auth-service',
          aud: 'venue-service',
        };

        mockRequest = createMockRequest({
          headers: {
            authorization: 'Bearer valid-token-here',
          },
        });
        mockRequest.server.jwt.verify.mockResolvedValue(decodedToken);

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.user).toEqual({
          id: 'user-123',
          email: 'test@example.com',
          permissions: ['venue:read'],
          tenant_id: 'tenant-456',
        });
      });

      it('should throw UnauthorizedError when no token provided', async () => {
        mockRequest = createMockRequest({
          headers: {},
        });

        await expect(authenticate(mockRequest, mockReply)).rejects.toThrow('Missing authentication token');
      });

      it('should throw UnauthorizedError when JWT verification fails', async () => {
        mockRequest = createMockRequest({
          headers: {
            authorization: 'Bearer invalid-token',
          },
        });
        mockRequest.server.jwt.verify.mockRejectedValue(new Error('Invalid token'));

        await expect(authenticate(mockRequest, mockReply)).rejects.toThrow('Invalid or expired token');
      });

      it('should throw UnauthorizedError for invalid issuer (AE6)', async () => {
        const decodedToken = {
          sub: 'user-123',
          iss: 'malicious-issuer',
          aud: 'venue-service',
        };

        mockRequest = createMockRequest({
          headers: {
            authorization: 'Bearer token-with-bad-issuer',
          },
        });
        mockRequest.server.jwt.verify.mockResolvedValue(decodedToken);

        await expect(authenticate(mockRequest, mockReply)).rejects.toThrow('Invalid token issuer');
      });

      it('should throw UnauthorizedError for invalid audience (AE6)', async () => {
        const decodedToken = {
          sub: 'user-123',
          iss: 'tickettoken-auth-service',
          aud: 'wrong-service',
        };

        mockRequest = createMockRequest({
          headers: {
            authorization: 'Bearer token-with-bad-audience',
          },
        });
        mockRequest.server.jwt.verify.mockResolvedValue(decodedToken);

        await expect(authenticate(mockRequest, mockReply)).rejects.toThrow('Invalid token audience');
      });

      it('should accept token with audience array containing venue-service', async () => {
        const decodedToken = {
          sub: 'user-123',
          iss: 'tickettoken-auth-service',
          aud: ['venue-service', 'event-service'],
          email: 'test@example.com',
        };

        mockRequest = createMockRequest({
          headers: {
            authorization: 'Bearer token-with-array-audience',
          },
        });
        mockRequest.server.jwt.verify.mockResolvedValue(decodedToken);

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.user.id).toBe('user-123');
      });

      it('should set default permissions when not provided', async () => {
        const decodedToken = {
          sub: 'user-123',
          iss: 'tickettoken-auth-service',
        };

        mockRequest = createMockRequest({
          headers: {
            authorization: 'Bearer minimal-token',
          },
        });
        mockRequest.server.jwt.verify.mockResolvedValue(decodedToken);

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.user.permissions).toEqual([]);
        expect(mockRequest.user.email).toBe('');
      });

      it('should use custom JWT_ISSUER from environment', async () => {
        const originalEnv = process.env.JWT_ISSUER;
        process.env.JWT_ISSUER = 'custom-issuer';

        const decodedToken = {
          sub: 'user-123',
          iss: 'custom-issuer',
        };

        mockRequest = createMockRequest({
          headers: {
            authorization: 'Bearer token',
          },
        });
        mockRequest.server.jwt.verify.mockResolvedValue(decodedToken);

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.user.id).toBe('user-123');

        process.env.JWT_ISSUER = originalEnv;
      });
    });

    describe('API key authentication', () => {
      it('should authenticate with valid API key from cache', async () => {
        const cachedUser = {
          id: 'user-api',
          email: 'api@example.com',
          permissions: ['venue:read'],
          tenant_id: 'tenant-api',
        };

        mockRedis.get.mockResolvedValue(JSON.stringify(cachedUser));

        mockRequest = createMockRequest({
          headers: {
            'x-api-key': 'valid-api-key',
          },
        });
        mockRequest.server.container.cradle.redis = mockRedis;
        mockRequest.server.container.cradle.db = mockDb;

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.user).toEqual(cachedUser);
        expect(mockRedis.get).toHaveBeenCalledWith('api_key_hash:hashed_api_key_value');
      });

      it('should look up API key by hash in database (SEC-DB6)', async () => {
        mockRedis.get.mockResolvedValue(null);
        
        const apiKeyData = {
          user_id: 'user-db',
          permissions: ['venue:read', 'venue:write'],
        };
        
        const userData = {
          id: 'user-db',
          email: 'db-user@example.com',
          tenant_id: 'tenant-db',
        };

        mockDb._mockChain.first
          .mockResolvedValueOnce(apiKeyData)
          .mockResolvedValueOnce(userData);

        mockRedis.setex.mockResolvedValue('OK');

        mockRequest = createMockRequest({
          headers: {
            'x-api-key': 'new-api-key',
          },
        });
        mockRequest.server.container.cradle.redis = mockRedis;
        mockRequest.server.container.cradle.db = mockDb;

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.user).toEqual({
          id: 'user-db',
          email: 'db-user@example.com',
          permissions: ['venue:read', 'venue:write'],
          tenant_id: 'tenant-db',
        });
        // Should cache using hashed key
        expect(mockRedis.setex).toHaveBeenCalledWith(
          'api_key_hash:hashed_api_key_value',
          300,
          expect.any(String)
        );
      });

      it('should return 401 for invalid API key', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockDb._mockChain.first.mockResolvedValue(null);

        mockRequest = createMockRequest({
          headers: {
            'x-api-key': 'invalid-key',
          },
        });
        mockRequest.server.container.cradle.redis = mockRedis;
        mockRequest.server.container.cradle.db = mockDb;

        await authenticate(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({ error: 'Invalid API key' })
        );
      });

      it('should return 401 when user not found for API key', async () => {
        mockRedis.get.mockResolvedValue(null);
        
        const apiKeyData = { user_id: 'nonexistent-user', permissions: [] };
        
        mockDb._mockChain.first
          .mockResolvedValueOnce(apiKeyData)
          .mockResolvedValueOnce(null); // User not found

        mockRequest = createMockRequest({
          headers: {
            'x-api-key': 'api-key-no-user',
          },
        });
        mockRequest.server.container.cradle.redis = mockRedis;
        mockRequest.server.container.cradle.db = mockDb;

        await authenticate(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });

      it('should prefer API key over JWT when both provided', async () => {
        const cachedUser = {
          id: 'api-user',
          email: 'api@example.com',
          permissions: [],
          tenant_id: 'tenant-api',
        };
        
        mockRedis.get.mockResolvedValue(JSON.stringify(cachedUser));

        mockRequest = createMockRequest({
          headers: {
            'x-api-key': 'valid-api-key',
            authorization: 'Bearer jwt-token',
          },
        });
        mockRequest.server.container.cradle.redis = mockRedis;
        mockRequest.server.container.cradle.db = mockDb;

        await authenticate(mockRequest, mockReply);

        // API key should be used, not JWT
        expect(mockRequest.user.id).toBe('api-user');
        expect(mockRequest.server.jwt.verify).not.toHaveBeenCalled();
      });
    });
  });

  describe('requireVenueAccess()', () => {
    it('should allow access when user has venue access', async () => {
      mockRequest = createMockRequest({
        params: { venueId: 'venue-123' },
        user: createMockUser(),
      });
      mockRequest.server.container.cradle.venueService.checkVenueAccess.mockResolvedValue(true);

      await requireVenueAccess(mockRequest, mockReply);

      expect(mockRequest.user.venueId).toBe('venue-123');
    });

    it('should return 401 when user not authenticated', async () => {
      mockRequest = createMockRequest({
        params: { venueId: 'venue-123' },
        user: null,
      });

      await requireVenueAccess(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Not authenticated' })
      );
    });

    it('should return 403 when user does not have venue access', async () => {
      mockRequest = createMockRequest({
        params: { venueId: 'venue-123' },
        user: createMockUser(),
      });
      mockRequest.server.container.cradle.venueService.checkVenueAccess.mockResolvedValue(false);

      await requireVenueAccess(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Access denied' })
      );
    });

    it('should call venueService.checkVenueAccess with correct params', async () => {
      mockRequest = createMockRequest({
        params: { venueId: 'venue-xyz' },
        user: createMockUser({ id: 'user-abc' }),
      });
      mockRequest.server.container.cradle.venueService.checkVenueAccess.mockResolvedValue(true);

      await requireVenueAccess(mockRequest, mockReply);

      expect(mockRequest.server.container.cradle.venueService.checkVenueAccess)
        .toHaveBeenCalledWith('venue-xyz', 'user-abc');
    });
  });

  describe('Security tests', () => {
    it('should hash API keys before lookup (SEC-DB6)', async () => {
      const crypto = require('crypto');
      mockRedis.get.mockResolvedValue(null);
      mockDb._mockChain.first.mockResolvedValue(null);

      mockRequest = createMockRequest({
        headers: {
          'x-api-key': 'secret-api-key',
        },
      });
      mockRequest.server.container.cradle.redis = mockRedis;
      mockRequest.server.container.cradle.db = mockDb;

      await authenticate(mockRequest, mockReply);

      // Verify crypto.createHash was called
      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
    });

    it('should never store plaintext API key in cache', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const apiKeyData = { user_id: 'user-1', permissions: [] };
      const userData = { id: 'user-1', email: 'test@test.com', tenant_id: 't1' };
      
      mockDb._mockChain.first
        .mockResolvedValueOnce(apiKeyData)
        .mockResolvedValueOnce(userData);
      mockRedis.setex.mockResolvedValue('OK');

      mockRequest = createMockRequest({
        headers: {
          'x-api-key': 'plaintext-api-key',
        },
      });
      mockRequest.server.container.cradle.redis = mockRedis;
      mockRequest.server.container.cradle.db = mockDb;

      await authenticate(mockRequest, mockReply);

      // Cache key should use hash, not plaintext
      const cacheCall = mockRedis.setex.mock.calls[0];
      expect(cacheCall[0]).not.toContain('plaintext-api-key');
      expect(cacheCall[0]).toContain('api_key_hash:');
    });

    it('should validate token claims even without iss/aud', async () => {
      const decodedToken = {
        sub: 'user-123',
        // No iss or aud - should still work with defaults
      };

      mockRequest = createMockRequest({
        headers: {
          authorization: 'Bearer token-no-claims',
        },
      });
      mockRequest.server.jwt.verify.mockResolvedValue(decodedToken);

      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.id).toBe('user-123');
    });
  });

  describe('Edge cases', () => {
    it('should handle Bearer prefix with extra spaces', async () => {
      const decodedToken = {
        sub: 'user-123',
        iss: 'tickettoken-auth-service',
      };

      mockRequest = createMockRequest({
        headers: {
          authorization: 'Bearer  extra-spaces-token',
        },
      });
      mockRequest.server.jwt.verify.mockResolvedValue(decodedToken);

      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.id).toBe('user-123');
    });

    it('should handle expired API key', async () => {
      mockRedis.get.mockResolvedValue(null);
      // Query with expires_at filter returns null
      mockDb._mockChain.first.mockResolvedValue(null);

      mockRequest = createMockRequest({
        headers: {
          'x-api-key': 'expired-key',
        },
      });
      mockRequest.server.container.cradle.redis = mockRedis;
      mockRequest.server.container.cradle.db = mockDb;

      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should handle inactive API key', async () => {
      mockRedis.get.mockResolvedValue(null);
      // Query with is_active filter returns null
      mockDb._mockChain.first.mockResolvedValue(null);

      mockRequest = createMockRequest({
        headers: {
          'x-api-key': 'inactive-key',
        },
      });
      mockRequest.server.container.cradle.redis = mockRedis;
      mockRequest.server.container.cradle.db = mockDb;

      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });
});
