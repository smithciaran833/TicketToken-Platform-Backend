/**
 * Unit Tests for Internal Auth Middleware
 * Tests HMAC-SHA256 service-to-service authentication
 */

import crypto from 'crypto';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Helper to generate valid signature
const generateValidSignature = (
  serviceName: string,
  timestamp: string,
  body: any,
  secret: string
): string => {
  const payload = `${serviceName}:${timestamp}:${JSON.stringify(body || {})}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

// Helper to create mock request
const createMockRequest = (options: {
  headers?: Record<string, string>;
  body?: any;
  url?: string;
  ip?: string;
  id?: string;
}) => ({
  headers: options.headers || {},
  body: options.body || {},
  url: options.url || '/internal/test',
  ip: options.ip || '127.0.0.1',
  id: options.id || 'test-request-id'
});

// Helper to create mock reply
const createMockReply = () => {
  const reply: any = {
    statusCode: 200,
    body: null
  };
  reply.status = jest.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send = jest.fn((body: any) => {
    reply.body = body;
    return reply;
  });
  return reply;
};

describe('Internal Auth Middleware', () => {
  const TEST_SECRET = 'test-internal-service-secret-at-least-32-chars';
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env.INTERNAL_SERVICE_SECRET = TEST_SECRET;
  });

  describe('validateInternalRequest', () => {
    it('should reject request without authentication headers', async () => {
      const { validateInternalRequest } = require('../../../src/middleware/internal-auth');
      
      const request = createMockRequest({});
      const reply = createMockReply();
      
      await validateInternalRequest(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.body.code).toBe('MISSING_INTERNAL_AUTH');
    });

    it('should reject request with missing signature', async () => {
      const { validateInternalRequest } = require('../../../src/middleware/internal-auth');
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'api-gateway'
        }
      });
      const reply = createMockReply();
      
      await validateInternalRequest(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.body.code).toBe('MISSING_INTERNAL_AUTH');
    });

    it('should reject invalid service name', async () => {
      const { validateInternalRequest } = require('../../../src/middleware/internal-auth');
      
      const timestamp = Date.now().toString();
      const signature = generateValidSignature('unknown-service', timestamp, {}, TEST_SECRET);
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'unknown-service',
          'x-internal-signature': signature,
          'x-timestamp': timestamp
        }
      });
      const reply = createMockReply();
      
      await validateInternalRequest(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.body.code).toBe('INVALID_SERVICE');
    });

    it('should reject if INTERNAL_SERVICE_SECRET not configured', async () => {
      delete process.env.INTERNAL_SERVICE_SECRET;
      jest.resetModules();
      
      const { validateInternalRequest } = require('../../../src/middleware/internal-auth');
      
      const timestamp = Date.now().toString();
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'api-gateway',
          'x-internal-signature': 'some-signature',
          'x-timestamp': timestamp
        }
      });
      const reply = createMockReply();
      
      await validateInternalRequest(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.body.code).toBe('AUTH_CONFIG_ERROR');
      
      process.env.INTERNAL_SERVICE_SECRET = TEST_SECRET;
    });

    it('should reject missing timestamp', async () => {
      const { validateInternalRequest } = require('../../../src/middleware/internal-auth');
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'api-gateway',
          'x-internal-signature': 'some-signature'
        }
      });
      const reply = createMockReply();
      
      await validateInternalRequest(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.body.code).toBe('MISSING_TIMESTAMP');
    });

    it('should reject expired timestamp', async () => {
      const { validateInternalRequest } = require('../../../src/middleware/internal-auth');
      
      const expiredTimestamp = (Date.now() - 120000).toString(); // 2 minutes ago
      const signature = generateValidSignature('api-gateway', expiredTimestamp, {}, TEST_SECRET);
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'api-gateway',
          'x-internal-signature': signature,
          'x-timestamp': expiredTimestamp
        }
      });
      const reply = createMockReply();
      
      await validateInternalRequest(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.body.code).toBe('TIMESTAMP_EXPIRED');
    });

    it('should reject invalid signature format', async () => {
      const { validateInternalRequest } = require('../../../src/middleware/internal-auth');
      
      const timestamp = Date.now().toString();
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'api-gateway',
          'x-internal-signature': 'not-a-valid-hex-signature!',
          'x-timestamp': timestamp
        }
      });
      const reply = createMockReply();
      
      await validateInternalRequest(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('should reject invalid signature', async () => {
      const { validateInternalRequest } = require('../../../src/middleware/internal-auth');
      
      const timestamp = Date.now().toString();
      const wrongSignature = generateValidSignature('api-gateway', timestamp, {}, 'wrong-secret-that-is-long-enough');
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'api-gateway',
          'x-internal-signature': wrongSignature,
          'x-timestamp': timestamp
        }
      });
      const reply = createMockReply();
      
      await validateInternalRequest(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.body.code).toBe('INVALID_SIGNATURE');
    });

    it('should accept valid request from allowed service', async () => {
      const { validateInternalRequest } = require('../../../src/middleware/internal-auth');
      
      const timestamp = Date.now().toString();
      const body = { test: 'data' };
      const signature = generateValidSignature('api-gateway', timestamp, body, TEST_SECRET);
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'api-gateway',
          'x-internal-signature': signature,
          'x-timestamp': timestamp
        },
        body
      }) as any;
      const reply = createMockReply();
      
      await validateInternalRequest(request, reply);
      
      expect(reply.status).not.toHaveBeenCalled();
      expect(request.internalService).toBe('api-gateway');
      expect(request.isInternalRequest).toBe(true);
    });

    it('should accept all allowed services', async () => {
      const allowedServices = [
        'api-gateway',
        'payment-service',
        'ticket-service',
        'order-service',
        'minting-service',
        'transfer-service',
        'blockchain-service',
        'notification-service',
        'event-service'
      ];

      for (const service of allowedServices) {
        jest.resetModules();
        process.env.INTERNAL_SERVICE_SECRET = TEST_SECRET;
        
        const { validateInternalRequest } = require('../../../src/middleware/internal-auth');
        
        const timestamp = Date.now().toString();
        const signature = generateValidSignature(service, timestamp, {}, TEST_SECRET);
        
        const request = createMockRequest({
          headers: {
            'x-internal-service': service,
            'x-internal-signature': signature,
            'x-timestamp': timestamp
          }
        }) as any;
        const reply = createMockReply();
        
        await validateInternalRequest(request, reply);
        
        expect(reply.status).not.toHaveBeenCalled();
        expect(request.internalService).toBe(service);
      }
    });
  });

  describe('generateInternalSignature', () => {
    beforeEach(() => {
      process.env.INTERNAL_SERVICE_SECRET = TEST_SECRET;
      jest.resetModules();
    });

    it('should generate signature and timestamp', () => {
      const { generateInternalSignature } = require('../../../src/middleware/internal-auth');
      
      const body = { test: 'data' };
      const result = generateInternalSignature('marketplace-service', body);
      
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('timestamp');
      expect(result.signature).toHaveLength(64); // SHA256 hex = 64 chars
    });

    it('should throw if secret not configured', () => {
      delete process.env.INTERNAL_SERVICE_SECRET;
      jest.resetModules();
      
      const { generateInternalSignature } = require('../../../src/middleware/internal-auth');
      
      expect(() => generateInternalSignature('marketplace-service', {}))
        .toThrow('INTERNAL_SERVICE_SECRET not configured');
      
      process.env.INTERNAL_SERVICE_SECRET = TEST_SECRET;
    });

    it('should use provided secret if given', () => {
      const { generateInternalSignature } = require('../../../src/middleware/internal-auth');
      
      const customSecret = 'custom-secret-for-testing-purposes';
      const result = generateInternalSignature('marketplace-service', {}, customSecret);
      
      expect(result.signature).toBeDefined();
    });

    it('should produce consistent signatures', () => {
      const { generateInternalSignature } = require('../../../src/middleware/internal-auth');
      
      const body = { test: 'data' };
      const timestamp = Date.now().toString();
      
      // Manually compute expected signature
      const payload = `marketplace-service:${timestamp}:${JSON.stringify(body)}`;
      const expectedSignature = crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('hex');
      
      // Generate signature at same timestamp
      jest.spyOn(Date, 'now').mockReturnValue(parseInt(timestamp));
      const result = generateInternalSignature('marketplace-service', body);
      jest.spyOn(Date, 'now').mockRestore();
      
      expect(result.timestamp).toBe(timestamp);
    });
  });

  describe('buildInternalHeaders', () => {
    beforeEach(() => {
      process.env.INTERNAL_SERVICE_SECRET = TEST_SECRET;
      jest.resetModules();
    });

    it('should build required headers', () => {
      const { buildInternalHeaders } = require('../../../src/middleware/internal-auth');
      
      const headers = buildInternalHeaders({ test: 'data' });
      
      expect(headers['x-internal-service']).toBe('marketplace-service');
      expect(headers['x-internal-signature']).toBeDefined();
      expect(headers['x-timestamp']).toBeDefined();
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should include request ID when provided', () => {
      const { buildInternalHeaders } = require('../../../src/middleware/internal-auth');
      
      const headers = buildInternalHeaders({}, 'req-123');
      
      expect(headers['x-request-id']).toBe('req-123');
    });

    it('should not include request ID when not provided', () => {
      const { buildInternalHeaders } = require('../../../src/middleware/internal-auth');
      
      const headers = buildInternalHeaders({});
      
      expect(headers['x-request-id']).toBeUndefined();
    });
  });

  describe('createInternalFetch', () => {
    beforeEach(() => {
      process.env.INTERNAL_SERVICE_SECRET = TEST_SECRET;
      jest.resetModules();
      (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
    });

    afterEach(() => {
      delete (global as any).fetch;
    });

    it('should create authenticated fetch function', () => {
      const { createInternalFetch } = require('../../../src/middleware/internal-auth');
      
      const internalFetch = createInternalFetch('http://localhost:3000');
      
      expect(typeof internalFetch).toBe('function');
    });

    it('should call fetch with authentication headers', async () => {
      const { createInternalFetch } = require('../../../src/middleware/internal-auth');
      
      const internalFetch = createInternalFetch('http://localhost:3000');
      await internalFetch('/api/test', { method: 'POST', body: JSON.stringify({ data: 'test' }) });
      
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-internal-service': 'marketplace-service',
            'x-internal-signature': expect.any(String),
            'x-timestamp': expect.any(String)
          })
        })
      );
    });

    it('should pass through request ID', async () => {
      const { createInternalFetch } = require('../../../src/middleware/internal-auth');
      
      const internalFetch = createInternalFetch('http://localhost:3000');
      await internalFetch('/api/test', {}, 'req-456');
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-request-id': 'req-456'
          })
        })
      );
    });
  });

  describe('validateInternalAuthConfig', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('should warn if secret not set', () => {
      delete process.env.INTERNAL_SERVICE_SECRET;
      
      const { validateInternalAuthConfig } = require('../../../src/middleware/internal-auth');
      const { logger } = require('../../../src/utils/logger');
      
      validateInternalAuthConfig();
      
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not set'));
    });

    it('should warn if secret too short', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'short';
      jest.resetModules();
      
      const { validateInternalAuthConfig } = require('../../../src/middleware/internal-auth');
      const { logger } = require('../../../src/utils/logger');
      
      validateInternalAuthConfig();
      
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('32 characters'));
    });

    it('should log info if properly configured', () => {
      process.env.INTERNAL_SERVICE_SECRET = TEST_SECRET;
      jest.resetModules();
      
      const { validateInternalAuthConfig } = require('../../../src/middleware/internal-auth');
      const { logger } = require('../../../src/utils/logger');
      
      validateInternalAuthConfig();
      
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('validated'));
    });
  });
});
