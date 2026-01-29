/**
 * COMPONENT TEST: InternalAuthMiddleware
 *
 * Tests HMAC-based service-to-service authentication
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.INTERNAL_HMAC_SECRET = 'test-hmac-secret-that-is-at-least-32-characters-long';
process.env.USE_NEW_HMAC = 'true';
process.env.ALLOWED_INTERNAL_SERVICES = 'order-service,ticket-service,event-service';

// Mock HMAC validator
let mockHmacResult: { valid: boolean; error?: string; errorCode?: string } = { valid: true };
let mockHmacError: Error | null = null;

jest.mock('@tickettoken/shared', () => ({
  createHmacValidator: jest.fn(() => ({
    validate: jest.fn(async () => {
      if (mockHmacError) throw mockHmacError;
      return mockHmacResult;
    }),
  })),
  HmacValidationResult: {},
  HmacError: class HmacError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'HmacError';
    }
  },
  ReplayAttackError: class ReplayAttackError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ReplayAttackError';
    }
  },
  SignatureError: class SignatureError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SignatureError';
    }
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { internalAuthMiddlewareNew } from '../../../src/middleware/internal-auth.middleware';

// Helper to create mock request
function createMockRequest(overrides: Record<string, any> = {}): FastifyRequest {
  return {
    url: '/internal/api/v1/payments',
    method: 'POST',
    headers: {},
    body: {},
    ...overrides,
  } as unknown as FastifyRequest;
}

// Helper to create mock reply
function createMockReply(): {
  reply: FastifyReply;
  getSentStatus: () => number;
  getSentResponse: () => any;
} {
  let sentStatus = 200;
  let sentResponse: any = null;

  const reply = {
    status: jest.fn().mockImplementation((code: number) => {
      sentStatus = code;
      return reply;
    }),
    send: jest.fn().mockImplementation((response: any) => {
      sentResponse = response;
      return reply;
    }),
  } as unknown as FastifyReply;

  return {
    reply,
    getSentStatus: () => sentStatus,
    getSentResponse: () => sentResponse,
  };
}

describe('InternalAuthMiddleware Component Tests', () => {
  beforeEach(() => {
    mockHmacResult = { valid: true };
    mockHmacError = null;
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockHmacResult = { valid: true };
    mockHmacError = null;
    jest.clearAllMocks();
  });

  // ===========================================================================
  // MISSING HEADERS
  // ===========================================================================
  describe('missing headers', () => {
    it('should reject request without X-Internal-Service header', async () => {
      const mockRequest = createMockRequest({
        headers: {
          'x-internal-signature': 'some-signature',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().message).toContain('Missing');
    });

    it('should reject request without X-Internal-Signature header', async () => {
      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'order-service',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().message).toContain('Missing');
    });

    it('should reject request with no auth headers', async () => {
      const mockRequest = createMockRequest({
        headers: {},
      });
      const { reply } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
    });
  });

  // ===========================================================================
  // VALID AUTHENTICATION
  // ===========================================================================
  describe('valid authentication', () => {
    it('should authenticate valid service request', async () => {
      mockHmacResult = { valid: true };

      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-signature': 'valid-signature',
        },
      });
      const { reply } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect((mockRequest as any).internalServiceNew).toBeDefined();
      expect((mockRequest as any).internalServiceNew.serviceName).toBe('order-service');
      expect((mockRequest as any).internalServiceNew.isInternal).toBe(true);
    });

    it('should normalize service name to lowercase', async () => {
      mockHmacResult = { valid: true };

      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'Order-Service',
          'x-internal-signature': 'valid-signature',
        },
      });
      const { reply } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect((mockRequest as any).internalServiceNew.serviceName).toBe('order-service');
    });

    it('should set legacy internalService property for backwards compatibility', async () => {
      mockHmacResult = { valid: true };

      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-signature': 'valid-signature',
        },
      });
      const { reply } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect((mockRequest as any).internalService).toBe('order-service');
    });
  });

  // ===========================================================================
  // INVALID SIGNATURE
  // ===========================================================================
  describe('invalid signature', () => {
    it('should reject invalid HMAC signature', async () => {
      mockHmacResult = { valid: false, error: 'Invalid signature' };

      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-signature': 'invalid-signature',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().message).toContain('Invalid signature');
    });
  });

  // ===========================================================================
  // UNAUTHORIZED SERVICES
  // ===========================================================================
  describe('unauthorized services', () => {
    it('should reject unknown service', async () => {
      mockHmacResult = { valid: true };

      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'unknown-service',
          'x-internal-signature': 'valid-signature',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(getSentResponse().message).toContain('not authorized');
    });

    it('should accept allowed service: ticket-service', async () => {
      mockHmacResult = { valid: true };

      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'ticket-service',
          'x-internal-signature': 'valid-signature',
        },
      });
      const { reply } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalledWith(403);
    });

    it('should accept allowed service: event-service', async () => {
      mockHmacResult = { valid: true };

      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'event-service',
          'x-internal-signature': 'valid-signature',
        },
      });
      const { reply } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalledWith(403);
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should handle ReplayAttackError', async () => {
      const { ReplayAttackError } = require('@tickettoken/shared');
      mockHmacError = new ReplayAttackError('Request already processed');

      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-signature': 'valid-signature',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().message).toContain('already processed');
    });

    it('should handle SignatureError', async () => {
      const { SignatureError } = require('@tickettoken/shared');
      mockHmacError = new SignatureError('Invalid signature');

      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-signature': 'invalid-signature',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().message).toContain('Invalid signature');
    });

    it('should handle HmacError', async () => {
      const { HmacError } = require('@tickettoken/shared');
      mockHmacError = new HmacError('HMAC validation failed');

      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-signature': 'valid-signature',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().message).toContain('HMAC validation failed');
    });

    it('should handle unexpected errors', async () => {
      mockHmacError = new Error('Unexpected error');

      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-signature': 'valid-signature',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(getSentResponse().message).toContain('Authentication failed');
    });
  });

  // ===========================================================================
  // FEATURE FLAG
  // ===========================================================================
  describe('feature flag', () => {
    it('should skip validation when USE_NEW_HMAC is false', async () => {
      // Store original value
      const originalValue = process.env.USE_NEW_HMAC;
      process.env.USE_NEW_HMAC = 'false';

      // Need to re-import to get the new env value
      jest.resetModules();
      
      // Re-mock dependencies
      jest.doMock('@tickettoken/shared', () => ({
        createHmacValidator: jest.fn(() => ({
          validate: jest.fn(async () => ({ valid: true })),
        })),
        HmacValidationResult: {},
        HmacError: class HmacError extends Error {},
        ReplayAttackError: class ReplayAttackError extends Error {},
        SignatureError: class SignatureError extends Error {},
      }));

      jest.doMock('../../../src/utils/logger', () => ({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
          child: () => ({
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          }),
        },
      }));

      const { internalAuthMiddlewareNew: middleware } = require('../../../src/middleware/internal-auth.middleware');

      const mockRequest = createMockRequest({
        headers: {
          // No auth headers
        },
      });
      const { reply } = createMockReply();

      await middleware(mockRequest, reply);

      // Should not reject - validation skipped
      expect(reply.status).not.toHaveBeenCalledWith(401);

      // Restore
      process.env.USE_NEW_HMAC = originalValue;
    });
  });

  // ===========================================================================
  // AUTHENTICATED AT TIMESTAMP
  // ===========================================================================
  describe('authenticated at timestamp', () => {
    it('should set authenticatedAt timestamp', async () => {
      mockHmacResult = { valid: true };

      const beforeTime = Date.now();
      const mockRequest = createMockRequest({
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-signature': 'valid-signature',
        },
      });
      const { reply } = createMockReply();

      await internalAuthMiddlewareNew(mockRequest, reply);

      const afterTime = Date.now();
      const authenticatedAt = (mockRequest as any).internalServiceNew.authenticatedAt;

      expect(authenticatedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(authenticatedAt).toBeLessThanOrEqual(afterTime);
    });
  });
});
