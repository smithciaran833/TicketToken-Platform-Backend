/**
 * Unit Tests: Internal Auth Middleware
 * Tests S2S authentication for internal services
 */

import crypto from 'crypto';

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Store original env
const originalEnv = process.env;

describe('internalAuthMiddleware', () => {
  let internalAuthMiddleware: any;
  let optionalInternalAuth: any;
  let mockRequest: any;
  let mockReply: any;
  const testSecret = 'test-internal-secret-12345';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Set environment variables before importing
    process.env = {
      ...originalEnv,
      INTERNAL_SERVICE_SECRET: testSecret,
      ALLOWED_INTERNAL_SERVICES: 'payment-service,ticket-service,event-service',
    };

    // Import after setting env
    const middleware = require('../../../src/middleware/internal-auth.middleware');
    internalAuthMiddleware = middleware.internalAuthMiddleware;
    optionalInternalAuth = middleware.optionalInternalAuth;

    mockRequest = {
      headers: {},
      url: '/internal/orders/123',
      method: 'GET',
    };
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function generateValidAuth(serviceName: string, timestamp: number, nonce: string, method: string, url: string) {
    return crypto
      .createHmac('sha256', testSecret)
      .update(`${serviceName}:${timestamp}:${nonce}:${method}:${url}`)
      .digest('hex');
  }

  describe('Header validation', () => {
    it('should reject missing auth header', async () => {
      mockRequest.headers = {
        'x-service-name': 'payment-service',
        'x-request-timestamp': Date.now().toString(),
        'x-request-nonce': 'nonce-123',
      };

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Missing internal authentication headers',
      }));
    });

    it('should reject missing service name', async () => {
      mockRequest.headers = {
        'x-internal-auth': 'some-auth',
        'x-request-timestamp': Date.now().toString(),
        'x-request-nonce': 'nonce-123',
      };

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should reject missing timestamp', async () => {
      mockRequest.headers = {
        'x-internal-auth': 'some-auth',
        'x-service-name': 'payment-service',
        'x-request-nonce': 'nonce-123',
      };

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should reject missing nonce', async () => {
      mockRequest.headers = {
        'x-internal-auth': 'some-auth',
        'x-service-name': 'payment-service',
        'x-request-timestamp': Date.now().toString(),
      };

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Timestamp validation', () => {
    it('should reject expired timestamp', async () => {
      const oldTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      const nonce = 'nonce-expired';
      const signature = generateValidAuth('payment-service', oldTimestamp, nonce, 'GET', '/internal/orders/123');

      mockRequest.headers = {
        'x-internal-auth': signature,
        'x-service-name': 'payment-service',
        'x-request-timestamp': oldTimestamp.toString(),
        'x-request-nonce': nonce,
      };

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Request timestamp invalid or expired',
      }));
    });

    it('should reject future timestamp', async () => {
      const futureTimestamp = Date.now() + 6 * 60 * 1000; // 6 minutes in future
      const nonce = 'nonce-future';
      const signature = generateValidAuth('payment-service', futureTimestamp, nonce, 'GET', '/internal/orders/123');

      mockRequest.headers = {
        'x-internal-auth': signature,
        'x-service-name': 'payment-service',
        'x-request-timestamp': futureTimestamp.toString(),
        'x-request-nonce': nonce,
      };

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Service whitelist', () => {
    it('should reject unknown service', async () => {
      const timestamp = Date.now();
      const nonce = 'nonce-unknown';
      const signature = generateValidAuth('unknown-service', timestamp, nonce, 'GET', '/internal/orders/123');

      mockRequest.headers = {
        'x-internal-auth': signature,
        'x-service-name': 'unknown-service',
        'x-request-timestamp': timestamp.toString(),
        'x-request-nonce': nonce,
      };

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Service not authorized',
      }));
    });
  });

  describe('Signature validation', () => {
    it('should accept valid signature', async () => {
      const timestamp = Date.now();
      const nonce = 'unique-nonce-' + Date.now();
      const signature = generateValidAuth('payment-service', timestamp, nonce, 'GET', '/internal/orders/123');

      mockRequest.headers = {
        'x-internal-auth': signature,
        'x-service-name': 'payment-service',
        'x-request-timestamp': timestamp.toString(),
        'x-request-nonce': nonce,
      };

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockRequest.internalService).toEqual({
        name: 'payment-service',
        authenticatedAt: expect.any(Number),
      });
    });

    it('should reject invalid signature', async () => {
      const timestamp = Date.now();
      const nonce = 'nonce-invalid-sig';

      mockRequest.headers = {
        'x-internal-auth': 'invalid-signature-here',
        'x-service-name': 'payment-service',
        'x-request-timestamp': timestamp.toString(),
        'x-request-nonce': nonce,
      };

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid authentication signature',
      }));
    });
  });

  describe('Replay protection', () => {
    it('should reject reused nonce', async () => {
      const timestamp = Date.now();
      const nonce = 'reused-nonce-' + Date.now();
      const signature = generateValidAuth('payment-service', timestamp, nonce, 'GET', '/internal/orders/123');

      mockRequest.headers = {
        'x-internal-auth': signature,
        'x-service-name': 'payment-service',
        'x-request-timestamp': timestamp.toString(),
        'x-request-nonce': nonce,
      };

      // First request should succeed
      await internalAuthMiddleware(mockRequest, mockReply);
      expect(mockReply.status).not.toHaveBeenCalled();

      // Reset mocks for second request
      mockReply.status.mockClear();
      mockReply.send.mockClear();

      // Second request with same nonce should fail
      await internalAuthMiddleware(mockRequest, mockReply);
      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('optionalInternalAuth', () => {
    it('should validate when auth header present', async () => {
      const timestamp = Date.now();
      const nonce = 'optional-nonce-' + Date.now();
      const signature = generateValidAuth('payment-service', timestamp, nonce, 'GET', '/internal/orders/123');

      mockRequest.headers = {
        'x-internal-auth': signature,
        'x-service-name': 'payment-service',
        'x-request-timestamp': timestamp.toString(),
        'x-request-nonce': nonce,
      };

      await optionalInternalAuth(mockRequest, mockReply);

      expect(mockRequest.internalService).toBeDefined();
    });

    it('should skip validation when no auth header', async () => {
      mockRequest.headers = {};

      await optionalInternalAuth(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockRequest.internalService).toBeUndefined();
    });
  });
});
