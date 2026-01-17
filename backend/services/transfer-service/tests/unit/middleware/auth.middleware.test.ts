/**
 * Unit Tests for Authentication Middleware
 *
 * Tests JWT authentication including:
 * - Token verification with algorithm enforcement
 * - Issuer and audience validation
 * - RS256 and HS256 support
 * - Role and permission checking
 * - Owner and admin access control
 * - Optional authentication
 * - Configuration validation
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import logger from '../../../src/utils/logger';
import * as secrets from '../../../src/config/secrets';

// Set env vars BEFORE importing auth middleware
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.JWT_ALGORITHM = 'HS256';

import {
  authenticate,
  optionalAuth,
  requireRole,
  requirePermission,
  requireOwnerOrAdmin,
  validateAuthConfig,
  ALLOWED_ALGORITHMS,
  JWT_CONFIG
} from '../../../src/middleware/auth.middleware';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../../src/config/secrets', () => ({
  getSecret: jest.fn()
}));

jest.mock('jwks-rsa', () => {
  return jest.fn(() => ({
    getSigningKey: jest.fn()
  }));
});

describe('Authentication Middleware', () => {
  let mockLogger: jest.Mocked<typeof logger>;
  let mockGetSecret: jest.MockedFunction<typeof secrets.getSecret>;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;

  const TEST_SECRET = 'test-secret-key-for-jwt-signing';
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = logger as jest.Mocked<typeof logger>;
    mockGetSecret = secrets.getSecret as jest.MockedFunction<typeof secrets.getSecret>;
    mockGetSecret.mockResolvedValue(TEST_SECRET);

    sendMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ send: sendMock });

    mockRequest = {
      id: 'req-123',
      headers: {},
      log: {
        child: jest.fn().mockReturnThis()
      } as any
    };

    mockReply = {
      status: statusMock,
      send: sendMock
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // CONFIGURATION TESTS
  // ===========================================================================

  describe('ALLOWED_ALGORITHMS', () => {
    it('should include RS256, RS384, RS512', () => {
      expect(ALLOWED_ALGORITHMS).toContain('RS256');
      expect(ALLOWED_ALGORITHMS).toContain('RS384');
      expect(ALLOWED_ALGORITHMS).toContain('RS512');
    });

    it('should include ES256, ES384, ES512', () => {
      expect(ALLOWED_ALGORITHMS).toContain('ES256');
      expect(ALLOWED_ALGORITHMS).toContain('ES384');
      expect(ALLOWED_ALGORITHMS).toContain('ES512');
    });

    it('should include HS256, HS384, HS512', () => {
      expect(ALLOWED_ALGORITHMS).toContain('HS256');
      expect(ALLOWED_ALGORITHMS).toContain('HS384');
      expect(ALLOWED_ALGORITHMS).toContain('HS512');
    });

    it('should NOT include "none" algorithm', () => {
      expect(ALLOWED_ALGORITHMS).not.toContain('none');
    });
  });

  // ===========================================================================
  // AUTHENTICATE MIDDLEWARE TESTS
  // ===========================================================================

  describe('authenticate()', () => {
    it('should reject request without token', async () => {
      mockRequest.headers = {};

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication token required',
        code: 'MISSING_TOKEN',
        requestId: 'req-123'
      });
    });

    it('should extract token from Authorization Bearer header', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          tenant_id: 'tenant-1',
          role: 'user'
        },
        TEST_SECRET,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          algorithm: 'HS256'
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.id).toBe('user-123');
      expect(mockRequest.user?.tenantId).toBe('tenant-1');
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should extract token from x-access-token header', async () => {
      const token = jwt.sign(
        {
          sub: 'user-456',
          tenant_id: 'tenant-2',
          role: 'admin'
        },
        TEST_SECRET,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          algorithm: 'HS256'
        }
      );

      mockRequest.headers = {
        'x-access-token': token
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.id).toBe('user-456');
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject malformed Authorization header', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat'
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'MISSING_TOKEN'
        })
      );
    });

    it('should reject expired token', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          tenant_id: 'tenant-1',
          role: 'user'
        },
        TEST_SECRET,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          algorithm: 'HS256',
          expiresIn: '-1h' // Expired 1 hour ago
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token has expired'
        })
      );
    });

    it('should reject token with wrong issuer', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          tenant_id: 'tenant-1',
          role: 'user'
        },
        TEST_SECRET,
        {
          issuer: 'wrong-issuer',
          audience: 'test-audience',
          algorithm: 'HS256'
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should reject token with wrong audience', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          tenant_id: 'tenant-1',
          role: 'user'
        },
        TEST_SECRET,
        {
          issuer: 'test-issuer',
          audience: 'wrong-audience',
          algorithm: 'HS256'
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should reject token with disallowed algorithm', async () => {
      // Create a token with "none" algorithm (security vulnerability)
      const token = jwt.sign(
        {
          sub: 'user-123',
          tenant_id: 'tenant-1',
          role: 'user'
        },
        '',
        {
          algorithm: 'none' as any
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Rejected token with disallowed algorithm',
        expect.objectContaining({ algorithm: 'none' })
      );
    });

    it('should reject token missing sub claim', async () => {
      const token = jwt.sign(
        {
          tenant_id: 'tenant-1',
          role: 'user'
        },
        TEST_SECRET,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          algorithm: 'HS256'
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Missing subject (sub) claim'
        })
      );
    });

    it('should reject token missing tenant_id claim', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          role: 'user'
        },
        TEST_SECRET,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          algorithm: 'HS256'
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Missing tenant_id claim'
        })
      );
    });

    it('should accept token with tenantId instead of tenant_id', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          tenantId: 'tenant-1',
          role: 'user'
        },
        TEST_SECRET,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          algorithm: 'HS256'
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.tenantId).toBe('tenant-1');
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should include email and permissions if present', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          tenant_id: 'tenant-1',
          role: 'admin',
          email: 'admin@example.com',
          permissions: ['read:transfers', 'write:transfers']
        },
        TEST_SECRET,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          algorithm: 'HS256'
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user?.email).toBe('admin@example.com');
      expect(mockRequest.user?.permissions).toEqual(['read:transfers', 'write:transfers']);
    });

    it('should default role to "user" if not provided', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          tenant_id: 'tenant-1'
        },
        TEST_SECRET,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          algorithm: 'HS256'
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user?.role).toBe('user');
    });

    it('should log authentication success', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          tenant_id: 'tenant-1',
          role: 'admin'
        },
        TEST_SECRET,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          algorithm: 'HS256'
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'User authenticated',
        expect.objectContaining({
          userId: 'user-123',
          tenantId: 'tenant-1',
          role: 'admin'
        })
      );
    });
  });

  // ===========================================================================
  // OPTIONAL AUTH TESTS
  // ===========================================================================

  describe('optionalAuth()', () => {
    it('should not fail if no token provided', async () => {
      mockRequest.headers = {};

      await optionalAuth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should authenticate if valid token provided', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          tenant_id: 'tenant-1',
          role: 'user'
        },
        TEST_SECRET,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          algorithm: 'HS256'
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      await optionalAuth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.id).toBe('user-123');
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should not fail if invalid token provided', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };

      await optionalAuth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Optional auth failed',
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // REQUIRE ROLE TESTS
  // ===========================================================================

  describe('requireRole()', () => {
    it('should allow user with required role', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-1',
        role: 'admin',
        permissions: []
      };

      const middleware = requireRole('admin');
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow user with one of multiple required roles', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-1',
        role: 'moderator',
        permissions: []
      };

      const middleware = requireRole('admin', 'moderator', 'super_admin');
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject user without required role', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-1',
        role: 'user',
        permissions: []
      };

      const middleware = requireRole('admin');
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Role admin required',
        code: 'INSUFFICIENT_ROLE',
        requestId: 'req-123'
      });
    });

    it('should reject unauthenticated user', async () => {
      mockRequest.user = undefined;

      const middleware = requireRole('admin');
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
        requestId: 'req-123'
      });
    });
  });

  // ===========================================================================
  // REQUIRE PERMISSION TESTS
  // ===========================================================================

  describe('requirePermission()', () => {
    it('should allow user with required permission', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-1',
        role: 'user',
        permissions: ['read:transfers', 'write:transfers']
      };

      const middleware = requirePermission('read:transfers');
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow user with one of multiple required permissions', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-1',
        role: 'user',
        permissions: ['read:transfers']
      };

      const middleware = requirePermission('read:transfers', 'write:transfers');
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject user without required permission', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-1',
        role: 'user',
        permissions: ['read:transfers']
      };

      const middleware = requirePermission('delete:transfers');
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Permission delete:transfers required',
        code: 'INSUFFICIENT_PERMISSIONS',
        requestId: 'req-123'
      });
    });

    it('should reject user with no permissions', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-1',
        role: 'user',
        permissions: []
      };

      const middleware = requirePermission('read:transfers');
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should reject unauthenticated user', async () => {
      mockRequest.user = undefined;

      const middleware = requirePermission('read:transfers');
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  // ===========================================================================
  // REQUIRE OWNER OR ADMIN TESTS
  // ===========================================================================

  describe('requireOwnerOrAdmin()', () => {
    it('should allow owner to access their own resource', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-1',
        role: 'user',
        permissions: []
      };
      mockRequest.params = { userId: 'user-123' };

      const middleware = requireOwnerOrAdmin();
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow admin to access any resource', async () => {
      mockRequest.user = {
        id: 'admin-456',
        tenantId: 'tenant-1',
        role: 'admin',
        permissions: []
      };
      mockRequest.params = { userId: 'user-123' };

      const middleware = requireOwnerOrAdmin();
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow super_admin to access any resource', async () => {
      mockRequest.user = {
        id: 'super-789',
        tenantId: 'tenant-1',
        role: 'super_admin',
        permissions: []
      };
      mockRequest.params = { userId: 'user-123' };

      const middleware = requireOwnerOrAdmin();
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject non-owner non-admin user', async () => {
      mockRequest.user = {
        id: 'user-456',
        tenantId: 'tenant-1',
        role: 'user',
        permissions: []
      };
      mockRequest.params = { userId: 'user-123' };

      const middleware = requireOwnerOrAdmin();
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Access denied - must be owner or admin',
        code: 'NOT_OWNER_OR_ADMIN',
        requestId: 'req-123'
      });
    });

    it('should check custom parameter name', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-1',
        role: 'user',
        permissions: []
      };
      mockRequest.params = { ownerId: 'user-123' };

      const middleware = requireOwnerOrAdmin('ownerId');
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should check body if param not found', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-1',
        role: 'user',
        permissions: []
      };
      mockRequest.params = {};
      mockRequest.body = { userId: 'user-123' };

      const middleware = requireOwnerOrAdmin();
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated user', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { userId: 'user-123' };

      const middleware = requireOwnerOrAdmin();
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  // ===========================================================================
  // CONFIGURATION VALIDATION TESTS
  // ===========================================================================

  describe('validateAuthConfig()', () => {
    it('should validate configuration successfully', () => {
      validateAuthConfig();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Auth configuration validated',
        expect.objectContaining({
          issuer: expect.any(String),
          audience: expect.any(String),
          algorithm: expect.any(String)
        })
      );
    });

    it('should warn about HS256 in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_ALGORITHM = 'HS256';

      // Need to reload module to pick up new env var
      jest.resetModules();
      const { validateAuthConfig: newValidate } = require('../../../src/middleware/auth.middleware');
      
      newValidate();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'HS256 algorithm in production - consider migrating to RS256'
      );
    });

    it('should warn about missing JWKS_URI for RS256', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_ALGORITHM = 'RS256';
      delete process.env.JWKS_URI;

      validateAuthConfig();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'JWKS_URI not set - using default'
      );
    });
  });
});
