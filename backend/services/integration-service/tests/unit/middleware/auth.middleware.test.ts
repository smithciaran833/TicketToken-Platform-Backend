// Mock dependencies BEFORE imports
const mockVerify = jest.fn();
const mockTimingSafeEqual = jest.fn();
const mockCreateHmac = jest.fn();

jest.mock('jsonwebtoken', () => ({
  verify: mockVerify,
  TokenExpiredError: class TokenExpiredError extends Error {
    constructor(message: string, public expiredAt: Date) {
      super(message);
      this.name = 'TokenExpiredError';
    }
  },
  JsonWebTokenError: class JsonWebTokenError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'JsonWebTokenError';
    }
  },
  NotBeforeError: class NotBeforeError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NotBeforeError';
    }
  },
}));

jest.mock('crypto', () => ({
  timingSafeEqual: mockTimingSafeEqual,
  createHmac: mockCreateHmac,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockConfig = {
  INTERNAL_SERVICE_SECRET: 'internal-service-secret',
  providers: {
    stripe: { webhookSecret: 'stripe-webhook-secret' },
    square: { webhookSignatureKey: 'square-signature-key' },
    mailchimp: { webhookSecret: 'mailchimp-webhook-secret' },
    quickbooks: { webhookToken: 'quickbooks-webhook-token' },
  },
  server: { apiUrl: 'https://api.example.com' },
};

jest.mock('../../../src/config/index', () => ({
  getJwtConfig: jest.fn(() => ({
    secret: 'test-secret-key-for-testing',
    algorithm: 'HS256',
    issuer: 'test-issuer',
    audience: 'test-audience',
  })),
  getConfig: jest.fn(() => mockConfig),
  config: mockConfig,
  isProduction: jest.fn(() => false),
  isDevelopment: jest.fn(() => true),
}));

jest.mock('../../../src/errors/index', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message: string, public requestId: string, public tenantId?: string) {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor(message: string, public requestId: string, public tenantId?: string) {
      super(message);
      this.name = 'ForbiddenError';
    }
  },
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  authenticate,
  authorize,
  authorizePermissions,
  optionalAuthenticate,
  authenticateInternal,
  verifyWebhookSignature,
} from '../../../src/middleware/auth.middleware';
import { UnauthorizedError, ForbiddenError } from '../../../src/errors/index';
import { logger } from '../../../src/utils/logger';

describe('auth.middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: {},
      id: 'test-request-id',
      user: undefined,
      body: {},
    };

    mockReply = {};
  });

  describe('authenticate', () => {
    it('should throw UnauthorizedError when no authorization header', async () => {
      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(UnauthorizedError);

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Authentication required');
    });

    it('should throw UnauthorizedError for invalid header format', async () => {
      mockRequest.headers = { authorization: 'InvalidFormat' };

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid authorization header format');
    });

    it('should throw UnauthorizedError for non-Bearer scheme', async () => {
      mockRequest.headers = { authorization: 'Basic abc123' };

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid authorization header format');
    });

    it('should throw UnauthorizedError for missing token', async () => {
      mockRequest.headers = { authorization: 'Bearer ' };

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid token');
    });

    it('should throw UnauthorizedError for token too short', async () => {
      mockRequest.headers = { authorization: 'Bearer abc' };

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid token');
    });

    it('should authenticate valid token and set user', async () => {
      const decoded = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        venueId: 'venue-789',
        role: 'admin',
        permissions: ['read', 'write'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'test-issuer',
        aud: 'test-audience',
      };

      mockRequest.headers = { authorization: 'Bearer valid-token-123' };
      mockVerify.mockReturnValue(decoded);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toEqual({
        id: 'user-123',
        tenantId: 'tenant-456',
        venueId: 'venue-789',
        role: 'admin',
        permissions: ['read', 'write'],
        iat: decoded.iat,
        exp: decoded.exp,
        iss: 'test-issuer',
        aud: 'test-audience',
      });
    });

    it('should handle token with sub instead of userId', async () => {
      const decoded = {
        sub: 'user-sub-123',
        role: 'user',
      };

      mockRequest.headers = { authorization: 'Bearer token-with-sub' };
      mockVerify.mockReturnValue(decoded);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user?.id).toBe('user-sub-123');
    });

    it('should handle token with id field', async () => {
      const decoded = {
        id: 'user-id-123',
        role: 'user',
      };

      mockRequest.headers = { authorization: 'Bearer token-with-id' };
      mockVerify.mockReturnValue(decoded);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user?.id).toBe('user-id-123');
    });

    it('should handle tenant_id with underscore', async () => {
      const decoded = {
        userId: 'user-123',
        tenant_id: 'tenant-underscore',
        role: 'user',
      };

      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockVerify.mockReturnValue(decoded);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user?.tenantId).toBe('tenant-underscore');
    });

    it('should handle venue_id with underscore', async () => {
      const decoded = {
        userId: 'user-123',
        venue_id: 'venue-underscore',
        role: 'user',
      };

      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockVerify.mockReturnValue(decoded);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user?.venueId).toBe('venue-underscore');
    });

    it('should default to user role if not provided', async () => {
      const decoded = {
        userId: 'user-123',
      };

      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockVerify.mockReturnValue(decoded);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user?.role).toBe('user');
    });

    it('should default to empty permissions if not provided', async () => {
      const decoded = {
        userId: 'user-123',
        role: 'admin',
      };

      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockVerify.mockReturnValue(decoded);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user?.permissions).toEqual([]);
    });

    it('should throw UnauthorizedError when token missing user identifier', async () => {
      const decoded = {
        role: 'admin',
      };

      mockRequest.headers = { authorization: 'Bearer token-no-id' };
      mockVerify.mockReturnValue(decoded);

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid token payload');
    });

    it('should handle TokenExpiredError', async () => {
      mockRequest.headers = { authorization: 'Bearer expired-token' };
      const expiredError = new jwt.TokenExpiredError('Token expired', new Date());
      mockVerify.mockImplementation(() => {
        throw expiredError;
      });

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Token expired');

      expect(logger.info).toHaveBeenCalledWith(
        'Token expired',
        expect.objectContaining({ requestId: 'test-request-id' })
      );
    });

    it('should handle JsonWebTokenError', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      const jwtError = new jwt.JsonWebTokenError('Invalid token');
      mockVerify.mockImplementation(() => {
        throw jwtError;
      });

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid token');

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle NotBeforeError', async () => {
      mockRequest.headers = { authorization: 'Bearer not-yet-valid-token' };
      const notBeforeError = new jwt.NotBeforeError('Token not yet valid', new Date());
      mockVerify.mockImplementation(() => {
        throw notBeforeError;
      });

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Token not yet valid');
    });

    it('should wrap unexpected errors', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-length-token' };
      mockVerify.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Authentication failed');

      expect(logger.error).toHaveBeenCalled();
    });

    it('should call verify with correct options', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockVerify.mockReturnValue({ userId: 'user-123', role: 'user' });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockVerify).toHaveBeenCalledWith(
        'valid-token',
        'test-secret-key-for-testing',
        expect.objectContaining({
          algorithms: ['HS256'],
          issuer: 'test-issuer',
          audience: 'test-audience',
          clockTolerance: 30,
        })
      );
    });
  });

  describe('authorize', () => {
    it('should throw UnauthorizedError when no user', async () => {
      const middleware = authorize('admin');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Authentication required');
    });

    it('should pass when no roles required', async () => {
      mockRequest.user = { id: 'user-123', role: 'user', permissions: [] };
      const middleware = authorize();

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should pass when user has required role', async () => {
      mockRequest.user = { id: 'user-123', role: 'admin', permissions: [] };
      const middleware = authorize('admin');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should pass when user has one of multiple required roles', async () => {
      mockRequest.user = { id: 'user-123', role: 'editor', permissions: [] };
      const middleware = authorize('admin', 'editor', 'viewer');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should throw ForbiddenError when user lacks required role', async () => {
      mockRequest.user = { id: 'user-123', role: 'user', permissions: [] };
      const middleware = authorize('admin');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Insufficient permissions');
    });

    it('should log authorization denial', async () => {
      mockRequest.user = { id: 'user-123', role: 'user', permissions: [] };
      const middleware = authorize('admin', 'superadmin');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);

      expect(logger.warn).toHaveBeenCalledWith(
        'Authorization denied',
        expect.objectContaining({
          requestId: 'test-request-id',
          userId: 'user-123',
          userRole: 'user',
          requiredRoles: ['admin', 'superadmin'],
        })
      );
    });
  });

  describe('authorizePermissions', () => {
    it('should throw UnauthorizedError when no user', async () => {
      const middleware = authorizePermissions('read:users');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Authentication required');
    });

    it('should pass when no permissions required', async () => {
      mockRequest.user = { id: 'user-123', role: 'user', permissions: [] };
      const middleware = authorizePermissions();

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should pass when user has required permission', async () => {
      mockRequest.user = {
        id: 'user-123',
        role: 'user',
        permissions: ['read:users', 'write:users'],
      };
      const middleware = authorizePermissions('read:users');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should pass when user has all required permissions', async () => {
      mockRequest.user = {
        id: 'user-123',
        role: 'admin',
        permissions: ['read:users', 'write:users', 'delete:users'],
      };
      const middleware = authorizePermissions('read:users', 'write:users');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should throw ForbiddenError when user lacks permission', async () => {
      mockRequest.user = {
        id: 'user-123',
        role: 'user',
        permissions: ['read:users'],
      };
      const middleware = authorizePermissions('write:users');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Missing required permissions');
    });

    it('should throw ForbiddenError when user lacks one of multiple permissions', async () => {
      mockRequest.user = {
        id: 'user-123',
        role: 'user',
        permissions: ['read:users'],
      };
      const middleware = authorizePermissions('read:users', 'write:users', 'delete:users');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should handle user with no permissions array', async () => {
      mockRequest.user = {
        id: 'user-123',
        role: 'user',
        permissions: undefined,
      };
      const middleware = authorizePermissions('read:users');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should log permission denial', async () => {
      mockRequest.user = {
        id: 'user-123',
        role: 'user',
        permissions: ['read:users'],
      };
      const middleware = authorizePermissions('write:users', 'delete:users');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);

      expect(logger.warn).toHaveBeenCalledWith(
        'Permission denied',
        expect.objectContaining({
          requestId: 'test-request-id',
          userId: 'user-123',
          userPermissions: ['read:users'],
          requiredPermissions: ['write:users', 'delete:users'],
        })
      );
    });
  });

  describe('optionalAuthenticate', () => {
    it('should not throw when no authorization header', async () => {
      await optionalAuthenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user).toBeUndefined();
    });

    it('should authenticate when valid token provided', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockVerify.mockReturnValue({ userId: 'user-123', role: 'user' });

      await optionalAuthenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user?.id).toBe('user-123');
    });

    it('should not throw when invalid token provided', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      mockVerify.mockImplementation(() => {
        throw new jwt.JsonWebTokenError('Invalid token');
      });

      await optionalAuthenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        'Optional auth failed, continuing anonymously',
        expect.any(Object)
      );
    });

    it('should not throw when token expired', async () => {
      mockRequest.headers = { authorization: 'Bearer expired-token' };
      mockVerify.mockImplementation(() => {
        throw new jwt.TokenExpiredError('Token expired', new Date());
      });

      await optionalAuthenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user).toBeUndefined();
    });
  });

  describe('authenticateInternal', () => {
    it('should throw UnauthorizedError when no secret header', async () => {
      mockRequest.headers = { 'x-service-id': 'test-service' };

      await expect(
        authenticateInternal(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Internal service authentication required');
    });

    it('should throw UnauthorizedError when no service id header', async () => {
      mockRequest.headers = { 'x-internal-secret': 'some-secret' };

      await expect(
        authenticateInternal(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Internal service authentication required');
    });

    it('should authenticate with valid credentials', async () => {
      mockRequest.headers = {
        'x-internal-secret': 'internal-service-secret',
        'x-service-id': 'test-service',
      };
      mockTimingSafeEqual.mockReturnValue(true);

      await authenticateInternal(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user).toEqual({
        id: 'service:test-service',
        role: 'internal_service',
        permissions: ['*'],
      });
    });

    it('should throw UnauthorizedError with invalid secret', async () => {
      mockRequest.headers = {
        'x-internal-secret': 'wrong-secret',
        'x-service-id': 'test-service',
      };
      mockTimingSafeEqual.mockReturnValue(false);

      await expect(
        authenticateInternal(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid internal credentials');

      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid internal service secret',
        expect.objectContaining({ serviceId: 'test-service' })
      );
    });

    it('should log successful authentication', async () => {
      mockRequest.headers = {
        'x-internal-secret': 'internal-service-secret',
        'x-service-id': 'auth-service',
      };
      mockTimingSafeEqual.mockReturnValue(true);

      await authenticateInternal(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'Internal service authenticated',
        expect.objectContaining({
          requestId: 'test-request-id',
          serviceId: 'auth-service',
        })
      );
    });
  });

  describe('verifyWebhookSignature', () => {
    describe('stripe', () => {
      beforeEach(() => {
        const mockDigest = jest.fn().mockReturnValue('valid-signature-hash');
        const mockUpdate = jest.fn().mockReturnValue({ digest: mockDigest });
        mockCreateHmac.mockReturnValue({ update: mockUpdate });
      });

      it('should throw UnauthorizedError when signature missing', async () => {
        const middleware = verifyWebhookSignature('stripe');
        (mockRequest as any).rawBody = '{"event":"test"}';

        await expect(
          middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
        ).rejects.toThrow(UnauthorizedError);
      });

      it('should verify valid Stripe signature', async () => {
        const middleware = verifyWebhookSignature('stripe');
        mockRequest.headers = {
          'stripe-signature': 't=1234567890,v1=valid-signature-hash',
        };
        (mockRequest as any).rawBody = '{"event":"test"}';
        mockTimingSafeEqual.mockReturnValue(true);

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(logger.debug).toHaveBeenCalledWith(
          'Webhook signature verified',
          expect.objectContaining({ provider: 'stripe' })
        );
      });

      it('should throw on invalid Stripe signature format', async () => {
        const middleware = verifyWebhookSignature('stripe');
        mockRequest.headers = { 'stripe-signature': 'invalid-format' };
        (mockRequest as any).rawBody = '{"event":"test"}';

        await expect(
          middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
        ).rejects.toThrow(UnauthorizedError);
      });

      it('should throw on mismatched Stripe signature', async () => {
        const middleware = verifyWebhookSignature('stripe');
        mockRequest.headers = {
          'stripe-signature': 't=1234567890,v1=wrong-signature',
        };
        (mockRequest as any).rawBody = '{"event":"test"}';
        mockTimingSafeEqual.mockReturnValue(false);

        await expect(
          middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
        ).rejects.toThrow(UnauthorizedError);
      });
    });

    describe('square', () => {
      beforeEach(() => {
        const mockDigest = jest.fn().mockReturnValue('valid-signature');
        const mockUpdate = jest.fn().mockReturnValue({ digest: mockDigest });
        mockCreateHmac.mockReturnValue({ update: mockUpdate });
      });

      it('should throw UnauthorizedError when signature missing', async () => {
        const middleware = verifyWebhookSignature('square');
        (mockRequest as any).rawBody = '{"event":"test"}';

        await expect(
          middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
        ).rejects.toThrow(UnauthorizedError);
      });

      it('should verify valid Square signature', async () => {
        const middleware = verifyWebhookSignature('square');
        mockRequest.headers = { 'x-square-signature': 'valid-signature' };
        (mockRequest as any).rawBody = '{"event":"test"}';
        mockTimingSafeEqual.mockReturnValue(true);

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(logger.debug).toHaveBeenCalledWith(
          'Webhook signature verified',
          expect.objectContaining({ provider: 'square' })
        );
      });

      it('should throw on mismatched Square signature', async () => {
        const middleware = verifyWebhookSignature('square');
        mockRequest.headers = { 'x-square-signature': 'wrong-signature' };
        (mockRequest as any).rawBody = '{"event":"test"}';
        mockTimingSafeEqual.mockReturnValue(false);

        await expect(
          middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
        ).rejects.toThrow(UnauthorizedError);
      });
    });

    describe('mailchimp', () => {
      it('should verify with secret in header', async () => {
        const middleware = verifyWebhookSignature('mailchimp');
        mockRequest.headers = { 'x-mailchimp-signature': 'some-signature' };
        (mockRequest as any).rawBody = '{"event":"test"}';

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(logger.debug).toHaveBeenCalled();
      });

      it('should verify with secret in body', async () => {
        const middleware = verifyWebhookSignature('mailchimp');
        mockRequest.body = { secret: 'mailchimp-webhook-secret' };
        (mockRequest as any).rawBody = JSON.stringify(mockRequest.body);

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(logger.debug).toHaveBeenCalled();
      });

      it('should throw on invalid body secret', async () => {
        const middleware = verifyWebhookSignature('mailchimp');
        mockRequest.body = { secret: 'wrong-secret' };
        (mockRequest as any).rawBody = JSON.stringify(mockRequest.body);

        await expect(
          middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
        ).rejects.toThrow(UnauthorizedError);
      });
    });

    describe('quickbooks', () => {
      beforeEach(() => {
        const mockDigest = jest.fn().mockReturnValue('valid-signature');
        const mockUpdate = jest.fn().mockReturnValue({ digest: mockDigest });
        mockCreateHmac.mockReturnValue({ update: mockUpdate });
      });

      it('should throw UnauthorizedError when signature missing', async () => {
        const middleware = verifyWebhookSignature('quickbooks');
        (mockRequest as any).rawBody = '{"event":"test"}';

        await expect(
          middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
        ).rejects.toThrow(UnauthorizedError);
      });

      it('should verify valid QuickBooks signature', async () => {
        const middleware = verifyWebhookSignature('quickbooks');
        mockRequest.headers = { 'intuit-signature': 'valid-signature' };
        (mockRequest as any).rawBody = '{"event":"test"}';
        mockTimingSafeEqual.mockReturnValue(true);

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(logger.debug).toHaveBeenCalledWith(
          'Webhook signature verified',
          expect.objectContaining({ provider: 'quickbooks' })
        );
      });

      it('should throw on mismatched QuickBooks signature', async () => {
        const middleware = verifyWebhookSignature('quickbooks');
        mockRequest.headers = { 'intuit-signature': 'wrong-signature' };
        (mockRequest as any).rawBody = '{"event":"test"}';
        mockTimingSafeEqual.mockReturnValue(false);

        await expect(
          middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
        ).rejects.toThrow(UnauthorizedError);
      });
    });

    describe('unknown provider', () => {
      it('should throw UnauthorizedError for unknown provider', async () => {
        const middleware = verifyWebhookSignature('unknown-provider');
        (mockRequest as any).rawBody = '{"event":"test"}';

        await expect(
          middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
        ).rejects.toThrow('Unknown webhook provider: unknown-provider');
      });
    });
  });
});
