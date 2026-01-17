// Mock dependencies BEFORE imports
const mockTimingSafeEqual = jest.fn();
const mockCreateHmac = jest.fn();

jest.mock('crypto', () => ({
  timingSafeEqual: mockTimingSafeEqual,
  createHmac: mockCreateHmac,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/index', () => ({
  config: {
    security: {
      internalServiceKey: 'test-internal-key-123',
    },
  },
}));

jest.mock('../../../src/errors/index', () => ({
  AuthenticationError: class AuthenticationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AuthenticationError';
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ForbiddenError';
    }
  },
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import {
  internalAuthMiddleware,
  hasPermission,
  requirePermission,
  getInternalRequestHeaders,
  getSignedInternalHeaders,
} from '../../../src/middleware/internal-auth';
import { AuthenticationError, ForbiddenError } from '../../../src/errors/index';
import { logger } from '../../../src/utils/logger';

describe('internal-auth middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock implementations completely
    mockTimingSafeEqual.mockReset();
    mockCreateHmac.mockReset();

    mockRequest = {
      headers: {},
      method: 'POST',
      url: '/api/test',
    };

    mockReply = {};

    // Default: key comparison succeeds
    mockTimingSafeEqual.mockReturnValue(true);
  });

  describe('internalAuthMiddleware', () => {
    it('should throw AuthenticationError when service key missing', async () => {
      await expect(
        internalAuthMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Missing internal service key');
    });

    it('should throw AuthenticationError when service key invalid', async () => {
      mockRequest.headers = {
        'x-internal-service-key': 'wrong-key',
        'x-service-name': 'auth-service',
      };
      mockTimingSafeEqual.mockReturnValue(false);

      await expect(
        internalAuthMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid internal service key');

      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid internal service key',
        expect.any(Object)
      );
    });

    it('should throw AuthenticationError when service name missing', async () => {
      mockRequest.headers = {
        'x-internal-service-key': 'test-internal-key-123',
      };

      await expect(
        internalAuthMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Missing service name');
    });

    it('should throw ForbiddenError for unauthorized service', async () => {
      mockRequest.headers = {
        'x-internal-service-key': 'test-internal-key-123',
        'x-service-name': 'unknown-service',
      };

      await expect(
        internalAuthMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);

      expect(logger.warn).toHaveBeenCalledWith(
        'Unauthorized service attempted access',
        expect.any(Object)
      );
    });

    it('should authenticate valid auth-service', async () => {
      mockRequest.headers = {
        'x-internal-service-key': 'test-internal-key-123',
        'x-service-name': 'auth-service',
      };

      await internalAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.internalService).toEqual({
        serviceName: 'auth-service',
        permissions: ['integrations:read', 'integrations:write', 'webhooks:*'],
        isInternal: true,
      });
    });

    it('should authenticate valid event-service', async () => {
      mockRequest.headers = {
        'x-internal-service-key': 'test-internal-key-123',
        'x-service-name': 'event-service',
      };

      await internalAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.internalService).toEqual({
        serviceName: 'event-service',
        permissions: ['integrations:read', 'sync:events', 'webhooks:receive'],
        isInternal: true,
      });
    });

    it('should normalize service name to lowercase', async () => {
      mockRequest.headers = {
        'x-internal-service-key': 'test-internal-key-123',
        'x-service-name': 'Auth-Service',
      };

      await internalAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.internalService?.serviceName).toBe('auth-service');
    });

    it('should validate timestamp and reject old requests', async () => {
      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago

      mockRequest.headers = {
        'x-internal-service-key': 'test-internal-key-123',
        'x-service-name': 'auth-service',
        'x-request-timestamp': oldTimestamp,
      };

      await expect(
        internalAuthMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Request timestamp invalid or expired');
    });

    it('should accept recent timestamp', async () => {
      const recentTimestamp = Date.now().toString();

      mockRequest.headers = {
        'x-internal-service-key': 'test-internal-key-123',
        'x-service-name': 'auth-service',
        'x-request-timestamp': recentTimestamp,
      };

      await internalAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.internalService).toBeDefined();
    });

    it('should validate signature when provided', async () => {
      const timestamp = Date.now().toString();
      const mockDigest = jest.fn().mockReturnValue('valid-signature');
      const mockUpdate = jest.fn().mockReturnValue({ digest: mockDigest });
      mockCreateHmac.mockReturnValue({ update: mockUpdate });

      mockRequest.headers = {
        'x-internal-service-key': 'test-internal-key-123',
        'x-service-name': 'auth-service',
        'x-request-timestamp': timestamp,
        'x-request-signature': 'valid-signature',
      };

      await internalAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCreateHmac).toHaveBeenCalledWith('sha256', 'test-internal-key-123');
      expect(mockRequest.internalService).toBeDefined();
    });

    it('should reject invalid signature', async () => {
      const timestamp = Date.now().toString();
      const mockDigest = jest.fn().mockReturnValue('expected-signature');
      const mockUpdate = jest.fn().mockReturnValue({ digest: mockDigest });
      mockCreateHmac.mockReturnValue({ update: mockUpdate });

      // Mock returns true for key check, false for signature check
      mockTimingSafeEqual
        .mockReturnValueOnce(true)  // Key validation passes
        .mockReturnValueOnce(false); // Signature validation fails

      mockRequest.headers = {
        'x-internal-service-key': 'test-internal-key-123',
        'x-service-name': 'auth-service',
        'x-request-timestamp': timestamp,
        'x-request-signature': 'invalid-signature',
      };

      await expect(
        internalAuthMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid request signature');
    });

    it('should log successful authentication', async () => {
      mockRequest.headers = {
        'x-internal-service-key': 'test-internal-key-123',
        'x-service-name': 'payment-service',
      };

      await internalAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'Internal service authenticated',
        expect.objectContaining({
          serviceName: 'payment-service',
          method: 'POST',
          url: '/api/test',
        })
      );
    });
  });

  describe('hasPermission', () => {
    it('should return false when no internal service set', () => {
      const result = hasPermission(mockRequest as FastifyRequest, 'integrations:read');
      expect(result).toBe(false);
    });

    it('should return true for exact permission match', () => {
      mockRequest.internalService = {
        serviceName: 'auth-service',
        permissions: ['integrations:read', 'integrations:write'],
        isInternal: true,
      };

      const result = hasPermission(mockRequest as FastifyRequest, 'integrations:read');
      expect(result).toBe(true);
    });

    it('should return false for missing permission', () => {
      mockRequest.internalService = {
        serviceName: 'event-service',
        permissions: ['integrations:read'],
        isInternal: true,
      };

      const result = hasPermission(mockRequest as FastifyRequest, 'integrations:write');
      expect(result).toBe(false);
    });

    it('should match wildcard permissions', () => {
      mockRequest.internalService = {
        serviceName: 'auth-service',
        permissions: ['webhooks:*'],
        isInternal: true,
      };

      const result = hasPermission(mockRequest as FastifyRequest, 'webhooks:receive');
      expect(result).toBe(true);
    });

    it('should not match incorrect wildcard', () => {
      mockRequest.internalService = {
        serviceName: 'auth-service',
        permissions: ['integrations:*'],
        isInternal: true,
      };

      const result = hasPermission(mockRequest as FastifyRequest, 'webhooks:receive');
      expect(result).toBe(false);
    });
  });

  describe('requirePermission', () => {
    it('should throw ForbiddenError when permission missing', async () => {
      mockRequest.internalService = {
        serviceName: 'event-service',
        permissions: ['integrations:read'],
        isInternal: true,
      };

      const middleware = requirePermission('integrations:write');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should pass when permission exists', async () => {
      mockRequest.internalService = {
        serviceName: 'auth-service',
        permissions: ['integrations:write'],
        isInternal: true,
      };

      const middleware = requirePermission('integrations:write');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should pass with wildcard permission', async () => {
      mockRequest.internalService = {
        serviceName: 'payment-service',
        permissions: ['webhooks:*'],
        isInternal: true,
      };

      const middleware = requirePermission('webhooks:receive');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(true).toBe(true);
    });
  });

  describe('getInternalRequestHeaders', () => {
    it('should generate headers with service key and name', () => {
      const headers = getInternalRequestHeaders('test-service');

      expect(headers).toHaveProperty('x-internal-service-key', 'test-internal-key-123');
      expect(headers).toHaveProperty('x-service-name', 'test-service');
      expect(headers).toHaveProperty('x-request-timestamp');
    });

    it('should use default service name', () => {
      const headers = getInternalRequestHeaders();

      expect(headers['x-service-name']).toBe('integration-service');
    });

    it('should generate timestamp', () => {
      const beforeTime = Date.now();
      const headers = getInternalRequestHeaders();
      const afterTime = Date.now();

      const timestamp = parseInt(headers['x-request-timestamp']);
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('getSignedInternalHeaders', () => {
    beforeEach(() => {
      const mockDigest = jest.fn().mockReturnValue('test-signature');
      const mockUpdate = jest.fn().mockReturnValue({ digest: mockDigest });
      mockCreateHmac.mockReturnValue({ update: mockUpdate });
    });

    it('should generate signed headers', () => {
      const headers = getSignedInternalHeaders('POST', '/api/test', 'auth-service');

      expect(headers).toHaveProperty('x-internal-service-key');
      expect(headers).toHaveProperty('x-service-name', 'auth-service');
      expect(headers).toHaveProperty('x-request-timestamp');
      expect(headers).toHaveProperty('x-request-signature', 'test-signature');
    });

    it('should use default service name', () => {
      const headers = getSignedInternalHeaders('GET', '/api/test');

      expect(headers['x-service-name']).toBe('integration-service');
    });

    it('should create HMAC with correct payload', () => {
      const mockDigest = jest.fn().mockReturnValue('signature');
      const mockUpdate = jest.fn().mockReturnValue({ digest: mockDigest });
      mockCreateHmac.mockReturnValue({ update: mockUpdate });

      getSignedInternalHeaders('POST', '/api/endpoint', 'test-service');

      expect(mockCreateHmac).toHaveBeenCalledWith('sha256', 'test-internal-key-123');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.stringContaining('test-service')
      );
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.stringContaining('POST')
      );
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.stringContaining('/api/endpoint')
      );
    });
  });
});
