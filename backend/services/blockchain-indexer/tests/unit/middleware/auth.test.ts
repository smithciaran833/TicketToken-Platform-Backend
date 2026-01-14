/**
 * Comprehensive Unit Tests for src/middleware/auth.ts
 *
 * Tests JWT authentication middleware with security best practices
 */

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

// Mock jwt
const mockJwtVerify = jest.fn();
const mockTokenExpiredError = class TokenExpiredError extends Error {
  name = 'TokenExpiredError';
};
const mockJsonWebTokenError = class JsonWebTokenError extends Error {
  name = 'JsonWebTokenError';
};
const mockNotBeforeError = class NotBeforeError extends Error {
  name = 'NotBeforeError';
};

jest.mock('jsonwebtoken', () => ({
  verify: mockJwtVerify,
  TokenExpiredError: mockTokenExpiredError,
  JsonWebTokenError: mockJsonWebTokenError,
  NotBeforeError: mockNotBeforeError,
}));

// Mock errors
const mockAuthenticationError = {
  missingToken: jest.fn(() => ({
    statusCode: 401,
    message: 'Missing authentication token',
  })),
  invalidToken: jest.fn((msg: string) => ({
    statusCode: 401,
    message: msg || 'Invalid token',
  })),
  tokenExpired: jest.fn(() => ({
    statusCode: 401,
    message: 'Token has expired',
  })),
  insufficientPermissions: jest.fn((msg: string) => ({
    statusCode: 403,
    message: msg || 'Insufficient permissions',
  })),
};

const mockToProblemDetails = jest.fn((error, requestId, url) => ({
  type: 'https://api.tickettoken.com/errors/AUTH_ERROR',
  title: error.message,
  status: error.statusCode,
  instance: url,
  requestId,
}));

jest.mock('../../../src/errors', () => ({
  AuthenticationError: mockAuthenticationError,
  toProblemDetails: mockToProblemDetails,
}));

import { verifyJWT, optionalJWT, verifyServiceJWT } from '../../../src/middleware/auth';

describe('src/middleware/auth.ts - Comprehensive Unit Tests', () => {
  let mockRequest: any;
  let mockReply: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test-secret-key-with-sufficient-length-for-security',
      JWT_ISSUER: 'tickettoken-auth-service',
      JWT_AUDIENCE: 'blockchain-indexer',
      NODE_ENV: 'test',
    };

    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
      method: 'GET',
      url: '/api/v1/test',
      id: 'req-123',
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // VERIFY JWT - SUCCESS CASES
  // =============================================================================

  describe('verifyJWT() - Success Cases', () => {
    it('should verify valid JWT with userId', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';

      const decodedPayload = {
        userId: 'user-123',
        tenant_id: 'tenant-456',
        iss: 'tickettoken-auth-service',
        aud: 'blockchain-indexer',
      };

      mockJwtVerify.mockReturnValue(decodedPayload);

      await verifyJWT(mockRequest, mockReply);

      expect(mockJwtVerify).toHaveBeenCalledWith(
        'valid-token',
        'test-secret-key-with-sufficient-length-for-security',
        expect.objectContaining({
          algorithms: expect.arrayContaining(['HS256', 'RS256']),
          issuer: 'tickettoken-auth-service',
          audience: 'blockchain-indexer',
        })
      );

      expect(mockRequest.user).toEqual(decodedPayload);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tenant_id: 'tenant-456',
        }),
        'JWT verified successfully'
      );
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should verify valid JWT with serviceId', async () => {
      mockRequest.headers.authorization = 'Bearer service-token';

      const decodedPayload = {
        serviceId: 'service-abc',
        iss: 'tickettoken-auth-service',
        aud: 'blockchain-indexer',
      };

      mockJwtVerify.mockReturnValue(decodedPayload);

      await verifyJWT(mockRequest, mockReply);

      expect(mockRequest.user).toEqual(decodedPayload);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'service-abc',
        }),
        'JWT verified successfully'
      );
    });
  });

  // =============================================================================
  // VERIFY JWT - ERROR CASES
  // =============================================================================

  describe('verifyJWT() - Error Cases', () => {
    it('should reject missing authorization header', async () => {
      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'AUTH_MISSING_HEADER',
          security: true,
        }),
        'Security event: AUTH_MISSING_HEADER'
      );

      expect(mockAuthenticationError.missingToken).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should reject invalid authorization format (no Bearer)', async () => {
      mockRequest.headers.authorization = 'invalid-format';

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'AUTH_INVALID_FORMAT',
        }),
        'Security event: AUTH_INVALID_FORMAT'
      );

      expect(mockAuthenticationError.invalidToken).toHaveBeenCalledWith(
        'Invalid authorization format'
      );
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should reject Bearer without token', async () => {
      mockRequest.headers.authorization = 'Bearer';

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'AUTH_INVALID_FORMAT',
        }),
        expect.any(String)
      );
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should reject when JWT_SECRET not configured', async () => {
      delete process.env.JWT_SECRET;
      mockRequest.headers.authorization = 'Bearer token';

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith('JWT_SECRET not configured');
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('should reject token missing identity claims', async () => {
      mockRequest.headers.authorization = 'Bearer token';

      const decodedPayload = {
        iss: 'tickettoken-auth-service',
        aud: 'blockchain-indexer',
        // No userId or serviceId
      };

      mockJwtVerify.mockReturnValue(decodedPayload);

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'AUTH_MISSING_IDENTITY',
          hasUserId: false,
          hasServiceId: false,
        }),
        expect.any(String)
      );

      expect(mockAuthenticationError.invalidToken).toHaveBeenCalledWith(
        'Token missing required identity claims'
      );
    });

    it('should handle TokenExpiredError', async () => {
      mockRequest.headers.authorization = 'Bearer expired-token';

      mockJwtVerify.mockImplementation(() => {
        throw new mockTokenExpiredError('Token expired');
      });

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'AUTH_TOKEN_EXPIRED',
        }),
        expect.any(String)
      );

      expect(mockAuthenticationError.tokenExpired).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should handle JsonWebTokenError', async () => {
      mockRequest.headers.authorization = 'Bearer invalid-token';

      mockJwtVerify.mockImplementation(() => {
        throw new mockJsonWebTokenError('Invalid signature');
      });

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'AUTH_INVALID_TOKEN',
          errorMessage: 'Invalid signature',
        }),
        expect.any(String)
      );

      expect(mockAuthenticationError.invalidToken).toHaveBeenCalledWith('Invalid signature');
    });

    it('should handle NotBeforeError', async () => {
      mockRequest.headers.authorization = 'Bearer not-active-token';

      mockJwtVerify.mockImplementation(() => {
        throw new mockNotBeforeError('Token not active yet');
      });

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'AUTH_TOKEN_NOT_ACTIVE',
        }),
        expect.any(String)
      );

      expect(mockAuthenticationError.invalidToken).toHaveBeenCalledWith('Token not yet active');
    });

    it('should handle unknown errors', async () => {
      mockRequest.headers.authorization = 'Bearer token';

      mockJwtVerify.mockImplementation(() => {
        throw new Error('Unknown error');
      });

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'AUTH_UNKNOWN_ERROR',
          errorMessage: 'Unknown error',
        }),
        expect.any(String)
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
        }),
        'JWT verification error'
      );
    });
  });

  // =============================================================================
  // WEAK SECRET DETECTION
  // =============================================================================

  describe('Weak Secret Detection', () => {
    it('should warn about short secrets', async () => {
      process.env.JWT_SECRET = 'short';
      process.env.NODE_ENV = 'development';
      mockRequest.headers.authorization = 'Bearer token';

      mockJwtVerify.mockReturnValue({
        userId: 'user-123',
      });

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'WEAK_JWT_SECRET',
        }),
        expect.stringContaining('weak')
      );
    });

    it('should warn about obvious secrets', async () => {
      process.env.JWT_SECRET = 'secret123';
      process.env.NODE_ENV = 'development';
      mockRequest.headers.authorization = 'Bearer token';

      mockJwtVerify.mockReturnValue({
        userId: 'user-123',
      });

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'WEAK_JWT_SECRET',
        }),
        expect.any(String)
      );
    });

    it('should not warn in test environment', async () => {
      process.env.JWT_SECRET = 'short';
      process.env.NODE_ENV = 'test';
      mockRequest.headers.authorization = 'Bearer token';

      mockJwtVerify.mockReturnValue({
        userId: 'user-123',
      });

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'WEAK_JWT_SECRET',
        }),
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // OPTIONAL JWT
  // =============================================================================

  describe('optionalJWT()', () => {
    it('should skip verification when no auth header', async () => {
      await optionalJWT(mockRequest, mockReply);

      expect(mockJwtVerify).not.toHaveBeenCalled();
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should verify when auth header present', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';

      mockJwtVerify.mockReturnValue({
        userId: 'user-123',
        iss: 'tickettoken-auth-service',
        aud: 'blockchain-indexer',
      });

      await optionalJWT(mockRequest, mockReply);

      expect(mockJwtVerify).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
    });

    it('should reject invalid token even in optional mode', async () => {
      mockRequest.headers.authorization = 'Bearer invalid-token';

      mockJwtVerify.mockImplementation(() => {
        throw new mockJsonWebTokenError('Invalid token');
      });

      await optionalJWT(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });
  });

  // =============================================================================
  // VERIFY SERVICE JWT
  // =============================================================================

  describe('verifyServiceJWT()', () => {
    it('should verify valid service token', async () => {
      mockRequest.headers.authorization = 'Bearer service-token';

      const decodedPayload = {
        serviceId: 'service-abc',
      };

      mockJwtVerify.mockReturnValue(decodedPayload);

      await verifyServiceJWT(mockRequest, mockReply);

      expect(mockRequest.user).toEqual(decodedPayload);
      expect((mockRequest as any).internalService).toBe('service-abc');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'service-abc',
        }),
        'Service JWT verified'
      );
    });

    it('should reject missing authorization header', async () => {
      await verifyServiceJWT(mockRequest, mockReply);

      expect(mockAuthenticationError.missingToken).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should reject invalid format', async () => {
      mockRequest.headers.authorization = 'invalid';

      await verifyServiceJWT(mockRequest, mockReply);

      expect(mockAuthenticationError.invalidToken).toHaveBeenCalledWith(
        'Invalid authorization format'
      );
    });

    it('should reject token without serviceId', async () => {
      mockRequest.headers.authorization = 'Bearer user-token';

      mockJwtVerify.mockReturnValue({
        userId: 'user-123', // User token, not service
      });

      await verifyServiceJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'AUTH_NOT_SERVICE_TOKEN',
        }),
        expect.any(String)
      );

      expect(mockAuthenticationError.insufficientPermissions).toHaveBeenCalledWith(
        'Not a service token'
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('should reject when JWT_SECRET not configured', async () => {
      delete process.env.JWT_SECRET;
      mockRequest.headers.authorization = 'Bearer token';

      await verifyServiceJWT(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith('JWT_SECRET not configured');
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('should handle TokenExpiredError', async () => {
      mockRequest.headers.authorization = 'Bearer expired-token';

      mockJwtVerify.mockImplementation(() => {
        throw new mockTokenExpiredError('Token expired');
      });

      await verifyServiceJWT(mockRequest, mockReply);

      expect(mockAuthenticationError.tokenExpired).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should handle JsonWebTokenError', async () => {
      mockRequest.headers.authorization = 'Bearer invalid-token';

      mockJwtVerify.mockImplementation(() => {
        throw new mockJsonWebTokenError('Invalid signature');
      });

      await verifyServiceJWT(mockRequest, mockReply);

      expect(mockAuthenticationError.invalidToken).toHaveBeenCalledWith('Invalid signature');
    });

    it('should handle unknown errors', async () => {
      mockRequest.headers.authorization = 'Bearer token';

      mockJwtVerify.mockImplementation(() => {
        throw new Error('Unknown error');
      });

      await verifyServiceJWT(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
        }),
        'Service JWT verification error'
      );
    });
  });

  // =============================================================================
  // SECURITY EVENT LOGGING
  // =============================================================================

  describe('Security Event Logging', () => {
    it('should log all required security fields', async () => {
      mockRequest.headers['user-agent'] = 'Mozilla/5.0';

      await verifyJWT(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'AUTH_MISSING_HEADER',
          security: true,
          ip: '127.0.0.1',
          method: 'GET',
          path: '/api/v1/test',
          userAgent: 'Mozilla/5.0',
          requestId: 'req-123',
        }),
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // ALGORITHM WHITELIST
  // =============================================================================

  describe('Algorithm Whitelist', () => {
    it('should use algorithm whitelist in verification', async () => {
      mockRequest.headers.authorization = 'Bearer token';

      mockJwtVerify.mockReturnValue({
        userId: 'user-123',
      });

      await verifyJWT(mockRequest, mockReply);

      expect(mockJwtVerify).toHaveBeenCalledWith(
        'token',
        expect.any(String),
        expect.objectContaining({
          algorithms: expect.arrayContaining(['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512']),
        })
      );
    });
  });

  // =============================================================================
  // ISSUER AND AUDIENCE VALIDATION
  // =============================================================================

  describe('Issuer and Audience Validation', () => {
    it('should validate issuer claim', async () => {
      mockRequest.headers.authorization = 'Bearer token';

      mockJwtVerify.mockReturnValue({
        userId: 'user-123',
      });

      await verifyJWT(mockRequest, mockReply);

      expect(mockJwtVerify).toHaveBeenCalledWith(
        'token',
        expect.any(String),
        expect.objectContaining({
          issuer: 'tickettoken-auth-service',
        })
      );
    });

    it('should validate audience claim', async () => {
      mockRequest.headers.authorization = 'Bearer token';

      mockJwtVerify.mockReturnValue({
        userId: 'user-123',
      });

      await verifyJWT(mockRequest, mockReply);

      expect(mockJwtVerify).toHaveBeenCalledWith(
        'token',
        expect.any(String),
        expect.objectContaining({
          audience: 'blockchain-indexer',
        })
      );
    });

    it('should use environment variables for issuer and audience', async () => {
      process.env.JWT_ISSUER = 'custom-issuer';
      process.env.JWT_AUDIENCE = 'custom-audience';

      // Need to re-import to pick up new env vars
      jest.resetModules();
      const { verifyJWT: newVerifyJWT } = require('../../../src/middleware/auth');

      mockRequest.headers.authorization = 'Bearer token';

      mockJwtVerify.mockReturnValue({
        userId: 'user-123',
      });

      await newVerifyJWT(mockRequest, mockReply);

      expect(mockJwtVerify).toHaveBeenCalledWith(
        'token',
        expect.any(String),
        expect.objectContaining({
          issuer: 'custom-issuer',
          audience: 'custom-audience',
        })
      );
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export verifyJWT function', () => {
      expect(typeof verifyJWT).toBe('function');
    });

    it('should export optionalJWT function', () => {
      expect(typeof optionalJWT).toBe('function');
    });

    it('should export verifyServiceJWT function', () => {
      expect(typeof verifyServiceJWT).toBe('function');
    });
  });
});
