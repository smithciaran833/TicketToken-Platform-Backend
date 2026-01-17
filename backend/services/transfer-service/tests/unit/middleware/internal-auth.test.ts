/**
 * Unit Tests for Internal Service Authentication Middleware
 *
 * Tests the internal service-to-service authentication including:
 * - HMAC-SHA256 signature verification
 * - Timestamp validation and replay attack prevention
 * - Service whitelist validation
 * - Constant-time signature comparison
 * - Signature generation utilities
 * - Request ID propagation
 */

import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import {
  validateInternalRequest,
  generateInternalSignature,
  buildInternalHeaders,
  createInternalFetch,
  validateInternalAuthConfig,
  ALLOWED_SERVICES
} from '../../../src/middleware/internal-auth';
import logger from '../../../src/utils/logger';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('Internal Service Authentication Middleware', () => {
  let mockLogger: jest.Mocked<typeof logger>;
  const originalEnv = process.env;
  const TEST_SECRET = 'test-secret-key-with-at-least-32-characters-for-security';

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = logger as jest.Mocked<typeof logger>;
    process.env = {
      ...originalEnv,
      INTERNAL_SERVICE_SECRET: TEST_SECRET,
      HMAC_REPLAY_WINDOW_MS: '60000'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // CONFIGURATION TESTS
  // ===========================================================================

  describe('ALLOWED_SERVICES', () => {
    it('should include expected services', () => {
      expect(ALLOWED_SERVICES).toContain('api-gateway');
      expect(ALLOWED_SERVICES).toContain('payment-service');
      expect(ALLOWED_SERVICES).toContain('ticket-service');
      expect(ALLOWED_SERVICES).toContain('order-service');
      expect(ALLOWED_SERVICES).toContain('minting-service');
      expect(ALLOWED_SERVICES).toContain('marketplace-service');
      expect(ALLOWED_SERVICES).toContain('blockchain-service');
      expect(ALLOWED_SERVICES).toContain('notification-service');
      expect(ALLOWED_SERVICES).toContain('event-service');
      expect(ALLOWED_SERVICES).toContain('scanning-service');
    });

    it('should have at least 10 allowed services', () => {
      expect(ALLOWED_SERVICES.length).toBeGreaterThanOrEqual(10);
    });
  });

  // ===========================================================================
  // VALIDATE INTERNAL REQUEST TESTS
  // ===========================================================================

  describe('validateInternalRequest()', () => {
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let statusMock: jest.Mock;
    let sendMock: jest.Mock;

    beforeEach(() => {
      sendMock = jest.fn();
      statusMock = jest.fn().mockReturnValue({ send: sendMock });

      mockRequest = {
        id: 'req-123',
        ip: '127.0.0.1',
        url: '/api/v1/internal/test',
        body: {},
        headers: {}
      };

      mockReply = {
        status: statusMock
      };
    });

    it('should reject request without x-internal-service header', async () => {
      mockRequest.headers = {
        'x-internal-signature': 'some-signature',
        'x-timestamp': Date.now().toString()
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'MISSING_INTERNAL_AUTH'
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should reject request without x-internal-signature header', async () => {
      mockRequest.headers = {
        'x-internal-service': 'api-gateway',
        'x-timestamp': Date.now().toString()
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'MISSING_INTERNAL_AUTH'
      });
    });

    it('should reject request from unauthorized service', async () => {
      const timestamp = Date.now().toString();
      const payload = `unauthorized-service:${timestamp}:{}`;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(payload)
        .digest('hex');

      mockRequest.headers = {
        'x-internal-service': 'unauthorized-service',
        'x-internal-signature': signature,
        'x-timestamp': timestamp
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Service not authorized',
        code: 'INVALID_SERVICE'
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid internal service attempted access',
        expect.any(Object)
      );
    });

    it('should reject request when INTERNAL_SERVICE_SECRET is not configured', async () => {
      delete process.env.INTERNAL_SERVICE_SECRET;

      const timestamp = Date.now().toString();
      mockRequest.headers = {
        'x-internal-service': 'api-gateway',
        'x-internal-signature': 'some-signature',
        'x-timestamp': timestamp
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Service authentication not properly configured',
        code: 'AUTH_CONFIG_ERROR'
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should reject request without timestamp', async () => {
      mockRequest.headers = {
        'x-internal-service': 'api-gateway',
        'x-internal-signature': 'some-signature'
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Missing timestamp header',
        code: 'MISSING_TIMESTAMP'
      });
    });

    it('should reject request with expired timestamp', async () => {
      const expiredTimestamp = (Date.now() - 120000).toString(); // 2 minutes ago
      const payload = `api-gateway:${expiredTimestamp}:{}`;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(payload)
        .digest('hex');

      mockRequest.headers = {
        'x-internal-service': 'api-gateway',
        'x-internal-signature': signature,
        'x-timestamp': expiredTimestamp
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Request timestamp expired or invalid',
        code: 'TIMESTAMP_EXPIRED'
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Internal request with invalid or expired timestamp',
        expect.any(Object)
      );
    });

    it('should reject request with invalid timestamp format', async () => {
      mockRequest.headers = {
        'x-internal-service': 'api-gateway',
        'x-internal-signature': 'some-signature',
        'x-timestamp': 'not-a-number'
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Request timestamp expired or invalid',
        code: 'TIMESTAMP_EXPIRED'
      });
    });

    it('should reject request with invalid signature', async () => {
      const timestamp = Date.now().toString();
      // Create a signature with correct length (64 hex chars) but wrong value
      const invalidSignature = 'a'.repeat(64);

      mockRequest.headers = {
        'x-internal-service': 'api-gateway',
        'x-internal-signature': invalidSignature,
        'x-timestamp': timestamp
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE'
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid internal service signature',
        expect.any(Object)
      );
    });

    it('should reject request with non-hex signature', async () => {
      const timestamp = Date.now().toString();

      mockRequest.headers = {
        'x-internal-service': 'api-gateway',
        'x-internal-signature': 'not-hex-zzzz' + 'a'.repeat(52),
        'x-timestamp': timestamp
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Invalid signature format',
        code: 'INVALID_SIGNATURE_FORMAT'
      });
    });

    it('should accept valid request with correct signature', async () => {
      const serviceName = 'api-gateway';
      const timestamp = Date.now().toString();
      const body = { data: 'test' };
      const payload = `${serviceName}:${timestamp}:${JSON.stringify(body)}`;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(payload)
        .digest('hex');

      mockRequest.body = body;
      mockRequest.headers = {
        'x-internal-service': serviceName,
        'x-internal-signature': signature,
        'x-timestamp': timestamp
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
      expect(mockRequest.internalService).toBe(serviceName);
      expect(mockRequest.isInternalRequest).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Internal service authenticated',
        expect.any(Object)
      );
    });

    it('should accept valid request from different allowed services', async () => {
      const services = ['payment-service', 'ticket-service', 'order-service'];

      for (const serviceName of services) {
        jest.clearAllMocks();
        statusMock = jest.fn().mockReturnValue({ send: sendMock });
        mockReply.status = statusMock;

        const timestamp = Date.now().toString();
        const body = { service: serviceName };
        const payload = `${serviceName}:${timestamp}:${JSON.stringify(body)}`;
        const signature = crypto
          .createHmac('sha256', TEST_SECRET)
          .update(payload)
          .digest('hex');

        mockRequest.body = body;
        mockRequest.headers = {
          'x-internal-service': serviceName,
          'x-internal-signature': signature,
          'x-timestamp': timestamp
        };

        await validateInternalRequest(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).not.toHaveBeenCalled();
        expect(mockRequest.internalService).toBe(serviceName);
        expect(mockRequest.isInternalRequest).toBe(true);
      }
    });

    it('should accept request with empty body', async () => {
      const serviceName = 'api-gateway';
      const timestamp = Date.now().toString();
      const payload = `${serviceName}:${timestamp}:{}`;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(payload)
        .digest('hex');

      mockRequest.body = undefined;
      mockRequest.headers = {
        'x-internal-service': serviceName,
        'x-internal-signature': signature,
        'x-timestamp': timestamp
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
      expect(mockRequest.internalService).toBe(serviceName);
      expect(mockRequest.isInternalRequest).toBe(true);
    });

    it('should handle signature verification error gracefully', async () => {
      const serviceName = 'api-gateway';
      const timestamp = Date.now().toString();

      // Mock crypto.timingSafeEqual to throw an error
      const originalTimingSafeEqual = crypto.timingSafeEqual;
      crypto.timingSafeEqual = jest.fn().mockImplementation(() => {
        throw new Error('Crypto error');
      });

      const payload = `${serviceName}:${timestamp}:{}`;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(payload)
        .digest('hex');

      mockRequest.headers = {
        'x-internal-service': serviceName,
        'x-internal-signature': signature,
        'x-timestamp': timestamp
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Authentication failed due to internal error',
        code: 'INTERNAL_ERROR'
      });
      expect(mockLogger.error).toHaveBeenCalled();

      // Restore original
      crypto.timingSafeEqual = originalTimingSafeEqual;
    });

    it('should validate timestamp is within replay window', async () => {
      const serviceName = 'api-gateway';
      // Set timestamp to exactly at the edge of the window
      const timestamp = (Date.now() - 59999).toString(); // Just under 60 seconds
      const payload = `${serviceName}:${timestamp}:{}`;
      const signature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(payload)
        .digest('hex');

      mockRequest.headers = {
        'x-internal-service': serviceName,
        'x-internal-signature': signature,
        'x-timestamp': timestamp
      };

      await validateInternalRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
      expect(mockRequest.internalService).toBe(serviceName);
    });
  });

  // ===========================================================================
  // GENERATE INTERNAL SIGNATURE TESTS
  // ===========================================================================

  describe('generateInternalSignature()', () => {
    it('should generate valid signature and timestamp', () => {
      const serviceName = 'transfer-service';
      const body = { data: 'test' };

      const result = generateInternalSignature(serviceName, body, TEST_SECRET);

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('timestamp');
      expect(result.signature).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
      expect(Number(result.timestamp)).toBeGreaterThan(0);
    });

    it('should generate different signatures for different bodies', () => {
      const serviceName = 'transfer-service';
      const body1 = { data: 'test1' };
      const body2 = { data: 'test2' };

      const result1 = generateInternalSignature(serviceName, body1, TEST_SECRET);
      const result2 = generateInternalSignature(serviceName, body2, TEST_SECRET);

      expect(result1.signature).not.toBe(result2.signature);
    });

    it('should generate different signatures for different services', () => {
      const body = { data: 'test' };

      const result1 = generateInternalSignature('service1', body, TEST_SECRET);
      const result2 = generateInternalSignature('service2', body, TEST_SECRET);

      expect(result1.signature).not.toBe(result2.signature);
    });

    it('should handle empty body', () => {
      const serviceName = 'transfer-service';

      const result = generateInternalSignature(serviceName, {}, TEST_SECRET);

      expect(result).toHaveProperty('signature');
      expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle null body', () => {
      const serviceName = 'transfer-service';

      const result = generateInternalSignature(serviceName, null, TEST_SECRET);

      expect(result).toHaveProperty('signature');
      expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should use environment variable if no secret provided', () => {
      const serviceName = 'transfer-service';
      const body = { data: 'test' };

      const result = generateInternalSignature(serviceName, body);

      expect(result).toHaveProperty('signature');
      expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should throw error if no secret is available', () => {
      delete process.env.INTERNAL_SERVICE_SECRET;

      expect(() => {
        generateInternalSignature('transfer-service', {});
      }).toThrow('INTERNAL_SERVICE_SECRET not configured');
    });

    it('should generate consistent signature for same inputs', () => {
      const serviceName = 'transfer-service';
      const body = { data: 'test' };
      const timestamp = Date.now().toString();

      // Generate signature manually with fixed timestamp
      const payload = `${serviceName}:${timestamp}:${JSON.stringify(body)}`;
      const expectedSignature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(payload)
        .digest('hex');

      // Mock Date.now to return our fixed timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => Number(timestamp));

      const result = generateInternalSignature(serviceName, body, TEST_SECRET);

      expect(result.signature).toBe(expectedSignature);
      expect(result.timestamp).toBe(timestamp);

      Date.now = originalDateNow;
    });
  });

  // ===========================================================================
  // BUILD INTERNAL HEADERS TESTS
  // ===========================================================================

  describe('buildInternalHeaders()', () => {
    it('should build headers with all required fields', () => {
      const body = { data: 'test' };

      const headers = buildInternalHeaders(body);

      expect(headers).toHaveProperty('x-internal-service', 'transfer-service');
      expect(headers).toHaveProperty('x-internal-signature');
      expect(headers).toHaveProperty('x-timestamp');
      expect(headers).toHaveProperty('Content-Type', 'application/json');
      expect(headers['x-internal-signature']).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should include request ID when provided', () => {
      const body = { data: 'test' };
      const requestId = 'req-123';

      const headers = buildInternalHeaders(body, requestId);

      expect(headers).toHaveProperty('x-request-id', requestId);
    });

    it('should not include request ID when not provided', () => {
      const body = { data: 'test' };

      const headers = buildInternalHeaders(body);

      expect(headers).not.toHaveProperty('x-request-id');
    });

    it('should handle empty body', () => {
      const headers = buildInternalHeaders({});

      expect(headers).toHaveProperty('x-internal-service');
      expect(headers).toHaveProperty('x-internal-signature');
      expect(headers).toHaveProperty('x-timestamp');
    });

    it('should handle null body', () => {
      const headers = buildInternalHeaders(null);

      expect(headers).toHaveProperty('x-internal-service');
      expect(headers).toHaveProperty('x-internal-signature');
      expect(headers).toHaveProperty('x-timestamp');
    });
  });

  // ===========================================================================
  // CREATE INTERNAL FETCH TESTS
  // ===========================================================================

  describe('createInternalFetch()', () => {
    const baseUrl = 'http://api-gateway:3000';

    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should create fetch function', () => {
      const internalFetch = createInternalFetch(baseUrl);
      expect(typeof internalFetch).toBe('function');
    });

    it('should call fetch with correct URL', async () => {
      const internalFetch = createInternalFetch(baseUrl);
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue(new Response());

      await internalFetch('/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api-gateway:3000/api/test',
        expect.any(Object)
      );
    });

    it('should include authentication headers', async () => {
      const internalFetch = createInternalFetch(baseUrl);
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue(new Response());

      await internalFetch('/api/test', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' })
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-internal-service': 'transfer-service',
            'x-internal-signature': expect.any(String),
            'x-timestamp': expect.any(String),
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should include request ID when provided', async () => {
      const internalFetch = createInternalFetch(baseUrl);
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue(new Response());

      await internalFetch('/api/test', {}, 'req-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-request-id': 'req-123'
          })
        })
      );
    });

    it('should merge custom headers with auth headers', async () => {
      const internalFetch = createInternalFetch(baseUrl);
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue(new Response());

      await internalFetch('/api/test', {
        headers: {
          'x-custom-header': 'custom-value'
        }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-internal-service': 'transfer-service',
            'x-custom-header': 'custom-value'
          })
        })
      );
    });

    it('should handle GET requests without body', async () => {
      const internalFetch = createInternalFetch(baseUrl);
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue(new Response());

      await internalFetch('/api/test', { method: 'GET' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Object)
        })
      );
    });
  });

  // ===========================================================================
  // VALIDATE INTERNAL AUTH CONFIG TESTS
  // ===========================================================================

  describe('validateInternalAuthConfig()', () => {
    it('should log info when secret is properly configured', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'a-very-long-secret-key-that-is-at-least-32-characters-long';

      validateInternalAuthConfig();

      expect(mockLogger.info).toHaveBeenCalledWith('Internal auth configuration validated');
    });

    it('should warn when secret is too short', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'short';

      validateInternalAuthConfig();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'INTERNAL_SERVICE_SECRET should be at least 32 characters'
      );
    });

    it('should throw error in production when secret is missing', () => {
      delete process.env.INTERNAL_SERVICE_SECRET;
      process.env.NODE_ENV = 'production';

      expect(() => {
        validateInternalAuthConfig();
      }).toThrow('INTERNAL_SERVICE_SECRET is required in production');
    });

    it('should warn in non-production when secret is missing', () => {
      delete process.env.INTERNAL_SERVICE_SECRET;
      process.env.NODE_ENV = 'development';

      validateInternalAuthConfig();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'INTERNAL_SERVICE_SECRET not set - internal auth will reject all requests'
      );
    });

    it('should validate secret length exactly at 32 characters', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'a'.repeat(32);

      validateInternalAuthConfig();

      expect(mockLogger.info).toHaveBeenCalledWith('Internal auth configuration validated');
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should warn for secret with 31 characters', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'a'.repeat(31);

      validateInternalAuthConfig();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'INTERNAL_SERVICE_SECRET should be at least 32 characters'
      );
    });
  });
});
