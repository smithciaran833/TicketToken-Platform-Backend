// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/middleware/auth.middleware.ts
 */

jest.mock('../../../src/utils/logger');

describe('src/middleware/auth.middleware.ts - Comprehensive Unit Tests', () => {
  let authMiddleware: any;
  let jwt: any;
  let crypto: any;
  let logger: any;
  let mockRequest: any;
  let mockReply: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };

    // Set default env vars
    process.env.JWT_SECRET = 'test-secret-key-minimum-32-chars-long!';
    process.env.JWT_ISSUER = 'tickettoken-auth-service';
    process.env.JWT_AUDIENCE = 'scanning-service';

    // Mock jsonwebtoken before importing
    jest.mock('jsonwebtoken', () => ({
      verify: jest.fn(),
      TokenExpiredError: class TokenExpiredError extends Error {
        constructor(message: string, expiredAt: Date) {
          super(message);
          this.name = 'TokenExpiredError';
          this.expiredAt = expiredAt;
        }
      },
      NotBeforeError: class NotBeforeError extends Error {
        constructor(message: string, date: Date) {
          super(message);
          this.name = 'NotBeforeError';
          this.date = date;
        }
      },
      JsonWebTokenError: class JsonWebTokenError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'JsonWebTokenError';
        }
      },
    }));

    // Get mocked jwt
    jwt = require('jsonwebtoken');
    crypto = require('crypto');
    logger = require('../../../src/utils/logger').default;

    // Mock crypto.timingSafeEqual
    crypto.timingSafeEqual = jest.fn().mockReturnValue(true);

    // Mock request and reply
    mockRequest = {
      headers: {},
      url: '/api/test',
      correlationId: 'corr-123',
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    // Import middleware after mocks are set up
    authMiddleware = require('../../../src/middleware/auth.middleware');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // authenticateRequest()
  // =============================================================================

  describe('authenticateRequest()', () => {
    const validPayload = {
      userId: 'user-123',
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      role: 'VENUE_STAFF',
      venueId: 'venue-1',
      permissions: ['scan:read', 'scan:write'],
    };

    it('should authenticate valid JWT token', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';
      jwt.verify.mockReturnValue(validPayload);

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(mockRequest.user).toEqual(validPayload);
      expect(mockRequest.tenantId).toBe(validPayload.tenantId);
      expect(mockReply.status).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Request authenticated', expect.any(Object));
    });

    it('should reject request without authorization header', async () => {
      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        status: 401,
        detail: 'No authorization token provided',
      }));
    });

    it('should reject invalid authorization header format', async () => {
      mockRequest.headers.authorization = 'InvalidFormat token';

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Invalid authorization header format. Expected: Bearer <token>',
      }));
    });

    it('should reject token missing required claims', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      jwt.verify.mockReturnValue({ userId: 'user-123' }); // Missing tenantId and role

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Token payload missing required claims',
      }));
      expect(logger.warn).toHaveBeenCalledWith('JWT missing required claims', expect.any(Object));
    });

    it('should reject invalid tenant ID format', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      jwt.verify.mockReturnValue({
        userId: 'user-123',
        tenantId: 'invalid-uuid',
        role: 'VENUE_STAFF',
      });

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Invalid tenant ID format',
      }));
    });

    it('should accept valid UUID tenant ID', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      jwt.verify.mockReturnValue(validPayload);

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(validPayload.tenantId);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should handle expired token', async () => {
      mockRequest.headers.authorization = 'Bearer expired-token';
      const expiredError = new jwt.TokenExpiredError('Token expired', new Date());
      jwt.verify.mockImplementation(() => { throw expiredError; });

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'https://api.tickettoken.com/errors/token-expired',
        detail: 'Token has expired',
      }));
      expect(logger.info).toHaveBeenCalledWith('Token expired', expect.any(Object));
    });

    it('should handle not-before token', async () => {
      mockRequest.headers.authorization = 'Bearer future-token';
      const notBeforeError = new jwt.NotBeforeError('Token not yet valid', new Date());
      jwt.verify.mockImplementation(() => { throw notBeforeError; });

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'https://api.tickettoken.com/errors/token-not-valid-yet',
        detail: 'Token is not yet valid',
      }));
    });

    it('should handle invalid JWT signature', async () => {
      mockRequest.headers.authorization = 'Bearer invalid-token';
      jwt.verify.mockImplementation(() => { throw new jwt.JsonWebTokenError('invalid signature'); });

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'https://api.tickettoken.com/errors/invalid-token',
        detail: 'Token validation failed',
      }));
    });

    it('should handle JWT configuration error', async () => {
      delete process.env.JWT_SECRET;
      delete process.env.JWT_PUBLIC_KEY;
      mockRequest.headers.authorization = 'Bearer token';

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Authentication system not properly configured',
      }));
      expect(logger.error).toHaveBeenCalledWith('JWT configuration error', expect.any(Object));
    });

    it('should use JWT_PUBLIC_KEY when available', async () => {
      process.env.JWT_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----';
      mockRequest.headers.authorization = 'Bearer token';
      jwt.verify.mockReturnValue(validPayload);

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(jwt.verify).toHaveBeenCalledWith(
        'token',
        process.env.JWT_PUBLIC_KEY,
        expect.any(Object)
      );
    });

    it('should decode base64 encoded public key', async () => {
      process.env.JWT_PUBLIC_KEY = Buffer.from('public-key-data').toString('base64');
      mockRequest.headers.authorization = 'Bearer token';
      jwt.verify.mockReturnValue(validPayload);

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(jwt.verify).toHaveBeenCalled();
    });

    it('should validate JWT secret length', async () => {
      process.env.JWT_SECRET = 'short'; // Too short
      mockRequest.headers.authorization = 'Bearer token';
      jwt.verify.mockReturnValue(validPayload);

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('JWT_SECRET is too short'),
        expect.any(Object)
      );
    });

    it('should verify with correct issuer and audience', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      jwt.verify.mockReturnValue(validPayload);

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(jwt.verify).toHaveBeenCalledWith('token', expect.any(String), expect.objectContaining({
        issuer: 'tickettoken-auth-service',
        audience: 'scanning-service',
      }));
    });

    it('should handle generic errors', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      jwt.verify.mockImplementation(() => { throw new Error('Unknown error'); });

      await authMiddleware.authenticateRequest(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(logger.error).toHaveBeenCalledWith('Authentication error', expect.any(Object));
    });
  });

  // =============================================================================
  // requireRole()
  // =============================================================================

  describe('requireRole()', () => {
    it('should allow user with correct role', async () => {
      mockRequest.user = { userId: 'user-1', role: 'VENUE_STAFF', tenantId: 'tenant-1' };

      const middleware = authMiddleware.requireRole('VENUE_STAFF');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Role check passed', expect.any(Object));
    });

    it('should allow user with one of multiple allowed roles', async () => {
      mockRequest.user = { userId: 'user-1', role: 'ADMIN', tenantId: 'tenant-1' };

      const middleware = authMiddleware.requireRole('VENUE_STAFF', 'ADMIN', 'SUPER_ADMIN');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject user without role', async () => {
      mockRequest.user = { userId: 'user-1', role: 'USER', tenantId: 'tenant-1' };

      const middleware = authMiddleware.requireRole('VENUE_STAFF', 'ADMIN');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Insufficient permissions for this operation',
        required: ['VENUE_STAFF', 'ADMIN'],
        current: 'USER',
      }));
    });

    it('should reject unauthenticated user', async () => {
      const middleware = authMiddleware.requireRole('VENUE_STAFF');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Not authenticated',
      }));
    });

    it('should log insufficient permissions', async () => {
      mockRequest.user = { userId: 'user-1', role: 'USER', tenantId: 'tenant-1' };

      const middleware = authMiddleware.requireRole('ADMIN');
      await middleware(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith('Insufficient permissions', expect.objectContaining({
        userRole: 'USER',
        requiredRoles: ['ADMIN'],
      }));
    });
  });

  // =============================================================================
  // requirePermission()
  // =============================================================================

  describe('requirePermission()', () => {
    it('should allow user with all required permissions', async () => {
      mockRequest.user = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'STAFF',
        permissions: ['scan:read', 'scan:write', 'device:manage'],
      };

      const middleware = authMiddleware.requirePermission('scan:read', 'scan:write');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject user missing some permissions', async () => {
      mockRequest.user = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'STAFF',
        permissions: ['scan:read'],
      };

      const middleware = authMiddleware.requirePermission('scan:read', 'scan:write', 'device:manage');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Missing required permissions',
        missing: ['scan:write', 'device:manage'],
      }));
    });

    it('should reject user with no permissions', async () => {
      mockRequest.user = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'STAFF',
        permissions: [],
      };

      const middleware = authMiddleware.requirePermission('scan:read');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should reject unauthenticated user', async () => {
      const middleware = authMiddleware.requirePermission('scan:read');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should handle user without permissions array', async () => {
      mockRequest.user = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'STAFF',
      };

      const middleware = authMiddleware.requirePermission('scan:read');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should log missing permissions', async () => {
      mockRequest.user = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'STAFF',
        permissions: ['scan:read'],
      };

      const middleware = authMiddleware.requirePermission('scan:write');
      await middleware(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith('Missing required permissions', expect.objectContaining({
        missingPermissions: ['scan:write'],
      }));
    });
  });

  // =============================================================================
  // optionalAuthentication()
  // =============================================================================

  describe('optionalAuthentication()', () => {
    const validPayload = {
      userId: 'user-123',
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      role: 'USER',
      permissions: [],
    };

    it('should set user context when valid token provided', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';
      jwt.verify.mockReturnValue(validPayload);

      await authMiddleware.optionalAuthentication(mockRequest, mockReply);

      expect(mockRequest.user).toEqual(validPayload);
      expect(mockRequest.tenantId).toBe(validPayload.tenantId);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should continue without user when no token provided', async () => {
      await authMiddleware.optionalAuthentication(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined();
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should continue without user when invalid token format', async () => {
      mockRequest.headers.authorization = 'InvalidFormat token';

      await authMiddleware.optionalAuthentication(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined();
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should continue without user when token invalid', async () => {
      mockRequest.headers.authorization = 'Bearer invalid-token';
      jwt.verify.mockImplementation(() => { throw new jwt.JsonWebTokenError('invalid'); });

      await authMiddleware.optionalAuthentication(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith('Optional auth failed', expect.any(Object));
    });

    it('should not set user when JWT config missing', async () => {
      delete process.env.JWT_SECRET;
      delete process.env.JWT_PUBLIC_KEY;
      mockRequest.headers.authorization = 'Bearer token';

      await authMiddleware.optionalAuthentication(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith('JWT not configured for optional auth', expect.any(Object));
    });

    it('should validate tenant ID format', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      jwt.verify.mockReturnValue({
        userId: 'user-123',
        tenantId: 'invalid-uuid',
        role: 'USER',
      });

      await authMiddleware.optionalAuthentication(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined(); // Invalid tenant ID not set
    });
  });

  // =============================================================================
  // authenticateInternalService()
  // =============================================================================

  describe('authenticateInternalService()', () => {
    beforeEach(() => {
      process.env.INTERNAL_SERVICE_KEY = 'internal-service-secret-key';
      process.env.ALLOWED_INTERNAL_SERVICES = 'ticket-service,payment-service,analytics-service';
    });

    it('should authenticate valid internal service', async () => {
      mockRequest.headers['x-service-key'] = 'internal-service-secret-key';
      mockRequest.headers['x-service-name'] = 'ticket-service';

      crypto.timingSafeEqual.mockReturnValue(true);

      await authMiddleware.authenticateInternalService(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Internal service authenticated', expect.any(Object));
    });

    it('should reject request without service key', async () => {
      mockRequest.headers['x-service-name'] = 'ticket-service';

      await authMiddleware.authenticateInternalService(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Missing service credentials',
      }));
    });

    it('should reject request without service name', async () => {
      mockRequest.headers['x-service-key'] = 'key';

      await authMiddleware.authenticateInternalService(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should reject invalid service key', async () => {
      mockRequest.headers['x-service-key'] = 'wrong-key';
      mockRequest.headers['x-service-name'] = 'ticket-service';

      crypto.timingSafeEqual.mockReturnValue(false);

      await authMiddleware.authenticateInternalService(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Invalid service credentials',
      }));
      expect(logger.warn).toHaveBeenCalledWith('Invalid service key', expect.any(Object));
    });

    it('should reject service not in allowed list', async () => {
      mockRequest.headers['x-service-key'] = 'internal-service-secret-key';
      mockRequest.headers['x-service-name'] = 'unauthorized-service';

      crypto.timingSafeEqual.mockReturnValue(true);

      await authMiddleware.authenticateInternalService(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Service not authorized',
      }));
      expect(logger.warn).toHaveBeenCalledWith('Service not in allowed list', expect.any(Object));
    });

    it('should handle missing INTERNAL_SERVICE_KEY configuration', async () => {
      delete process.env.INTERNAL_SERVICE_KEY;
      mockRequest.headers['x-service-key'] = 'key';
      mockRequest.headers['x-service-name'] = 'ticket-service';

      await authMiddleware.authenticateInternalService(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Internal authentication not configured',
      }));
      expect(logger.error).toHaveBeenCalledWith('INTERNAL_SERVICE_KEY not configured');
    });

    it('should use timing-safe comparison for key validation', async () => {
      mockRequest.headers['x-service-key'] = 'test-key';
      mockRequest.headers['x-service-name'] = 'ticket-service';

      crypto.timingSafeEqual.mockReturnValue(true);

      await authMiddleware.authenticateInternalService(mockRequest, mockReply);

      expect(crypto.timingSafeEqual).toHaveBeenCalled();
    });

    it('should handle key length mismatch', async () => {
      mockRequest.headers['x-service-key'] = 'short';
      mockRequest.headers['x-service-name'] = 'ticket-service';

      // timingSafeEqual fails on length mismatch
      crypto.timingSafeEqual.mockImplementation(() => {
        throw new Error('Input buffers must have the same length');
      });

      await authMiddleware.authenticateInternalService(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });
});
