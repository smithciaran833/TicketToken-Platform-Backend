/**
 * Internal Auth Middleware Unit Tests
 */

import crypto from 'crypto';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

// Store original env
const originalEnv = process.env;

describe('Internal Auth Middleware', () => {
  let internalAuthMiddleware: any;
  let requireInternalAuth: any;
  let generateInternalAuthHeaders: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Set up test environment
    process.env = {
      ...originalEnv,
      INTERNAL_SERVICE_SECRET: 'test-internal-secret-32-characters-long',
      ALLOWED_INTERNAL_SERVICES: 'api-gateway,event-service,ticket-service',
      SERVICE_NAME: 'analytics-service',
      SERVICE_MESH_ENABLED: 'false',
    };

    // Re-import after setting env
    const internalAuth = require('../../../src/middleware/internal-auth');
    internalAuthMiddleware = internalAuth.internalAuthMiddleware;
    requireInternalAuth = internalAuth.requireInternalAuth;
    generateInternalAuthHeaders = internalAuth.generateInternalAuthHeaders;

    mockRequest = {
      headers: {},
      method: 'GET',
      url: '/api/internal/metrics',
      body: undefined,
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('internalAuthMiddleware', () => {
    it('should initialize empty context for requests without internal headers', async () => {
      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockRequest.internalAuth).toEqual({
        isInternalRequest: false,
        sourceService: null,
        verified: false,
      });
    });

    it('should reject unknown service', async () => {
      mockRequest.headers['x-internal-service'] = 'unknown-service';

      await expect(internalAuthMiddleware(mockRequest, mockReply))
        .rejects.toThrow('Service not authorized for internal access');
    });

    it('should reject request with missing signature header', async () => {
      mockRequest.headers['x-internal-service'] = 'api-gateway';
      mockRequest.headers['x-internal-timestamp'] = Date.now().toString();

      await expect(internalAuthMiddleware(mockRequest, mockReply))
        .rejects.toThrow('Missing internal authentication headers');
    });

    it('should reject request with missing timestamp header', async () => {
      mockRequest.headers['x-internal-service'] = 'api-gateway';
      mockRequest.headers['x-internal-signature'] = 'some-signature';

      await expect(internalAuthMiddleware(mockRequest, mockReply))
        .rejects.toThrow('Missing internal authentication headers');
    });

    it('should reject expired request (timestamp too old)', async () => {
      const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
      mockRequest.headers['x-internal-service'] = 'api-gateway';
      mockRequest.headers['x-internal-timestamp'] = oldTimestamp;
      mockRequest.headers['x-internal-signature'] = 'some-signature';

      await expect(internalAuthMiddleware(mockRequest, mockReply))
        .rejects.toThrow('Internal request expired');
    });

    it('should reject invalid signature', async () => {
      const timestamp = Date.now().toString();
      mockRequest.headers['x-internal-service'] = 'api-gateway';
      mockRequest.headers['x-internal-timestamp'] = timestamp;
      mockRequest.headers['x-internal-signature'] = 'invalid-signature';

      await expect(internalAuthMiddleware(mockRequest, mockReply))
        .rejects.toThrow('Invalid internal authentication signature');
    });

    it('should authenticate valid internal request', async () => {
      const headers = generateInternalAuthHeaders('GET', '/api/internal/metrics');
      mockRequest.headers = {
        ...headers,
        'x-internal-service': 'api-gateway',
      };
      // Override the service name in signature
      const timestamp = Date.now().toString();
      const payload = `api-gateway:${timestamp}:GET:/api/internal/metrics:`;
      const signature = crypto
        .createHmac('sha256', 'test-internal-secret-32-characters-long')
        .update(payload)
        .digest('hex');

      mockRequest.headers['x-internal-service'] = 'api-gateway';
      mockRequest.headers['x-internal-timestamp'] = timestamp;
      mockRequest.headers['x-internal-signature'] = signature;

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockRequest.internalAuth).toEqual({
        isInternalRequest: true,
        sourceService: 'api-gateway',
        verified: true,
      });
    });

    it('should authenticate with request body', async () => {
      mockRequest.method = 'POST';
      mockRequest.body = { data: 'test' };
      
      const timestamp = Date.now().toString();
      const bodyStr = JSON.stringify(mockRequest.body);
      const payload = `event-service:${timestamp}:POST:/api/internal/metrics:${bodyStr}`;
      const signature = crypto
        .createHmac('sha256', 'test-internal-secret-32-characters-long')
        .update(payload)
        .digest('hex');

      mockRequest.headers['x-internal-service'] = 'event-service';
      mockRequest.headers['x-internal-timestamp'] = timestamp;
      mockRequest.headers['x-internal-signature'] = signature;

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockRequest.internalAuth.verified).toBe(true);
    });
  });

  describe('requireInternalAuth', () => {
    it('should run internal auth middleware if not already run', async () => {
      await expect(requireInternalAuth(mockRequest, mockReply))
        .rejects.toThrow('This endpoint requires internal service authentication');
    });

    it('should reject if not an internal request', async () => {
      mockRequest.internalAuth = {
        isInternalRequest: false,
        sourceService: null,
        verified: false,
      };

      await expect(requireInternalAuth(mockRequest, mockReply))
        .rejects.toThrow('This endpoint requires internal service authentication');
    });

    it('should reject if not verified', async () => {
      mockRequest.internalAuth = {
        isInternalRequest: true,
        sourceService: 'api-gateway',
        verified: false,
      };

      await expect(requireInternalAuth(mockRequest, mockReply))
        .rejects.toThrow('This endpoint requires internal service authentication');
    });

    it('should allow verified internal request', async () => {
      mockRequest.internalAuth = {
        isInternalRequest: true,
        sourceService: 'api-gateway',
        verified: true,
      };

      await requireInternalAuth(mockRequest, mockReply);
      // No error thrown = success
    });
  });

  describe('generateInternalAuthHeaders', () => {
    it('should generate required headers', () => {
      const headers = generateInternalAuthHeaders('POST', '/api/data', { test: true });

      expect(headers).toHaveProperty('x-internal-service', 'analytics-service');
      expect(headers).toHaveProperty('x-internal-signature');
      expect(headers).toHaveProperty('x-internal-timestamp');
    });

    it('should generate valid signature', () => {
      const headers = generateInternalAuthHeaders('GET', '/api/test');
      
      expect(headers['x-internal-signature']).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate timestamp as string', () => {
      const headers = generateInternalAuthHeaders('GET', '/api/test');
      
      const timestamp = parseInt(headers['x-internal-timestamp'], 10);
      expect(timestamp).toBeGreaterThan(0);
      expect(Date.now() - timestamp).toBeLessThan(1000); // Within 1 second
    });
  });

  describe('service mesh mode', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.SERVICE_MESH_ENABLED = 'true';
      
      const internalAuth = require('../../../src/middleware/internal-auth');
      internalAuthMiddleware = internalAuth.internalAuthMiddleware;
    });

    it('should trust headers without signature when service mesh enabled', async () => {
      mockRequest.headers['x-internal-service'] = 'api-gateway';

      await internalAuthMiddleware(mockRequest, mockReply);

      expect(mockRequest.internalAuth).toEqual({
        isInternalRequest: true,
        sourceService: 'api-gateway',
        verified: true,
      });
    });
  });
});
