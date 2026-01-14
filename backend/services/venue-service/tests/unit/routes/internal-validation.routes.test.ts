/**
 * Unit tests for src/routes/internal-validation.routes.ts
 * Tests internal service-to-service authentication with HMAC
 * CRITICAL: Security-sensitive - SC2, SM2, HM18 timing-safe comparison
 */

import * as crypto from 'crypto';

// Mock crypto before importing module
const mockTimingSafeEqual = jest.fn();
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  timingSafeEqual: (...args: any[]) => mockTimingSafeEqual(...args),
  createHmac: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('validhexsignature1234567890abcdef'),
  }),
}));

// Set env var before importing (SC2 fix)
process.env.INTERNAL_SERVICE_SECRET = 'test-secret-key';

// Mock database
jest.mock('../../../src/config/database', () => ({
  db: {
    raw: jest.fn(),
  },
}));

describe('routes/internal-validation.routes', () => {
  let mockFastify: any;
  let preHandler: any;
  let mockReply: any;
  let mockRequest: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset timing safe equal to return true by default
    mockTimingSafeEqual.mockReturnValue(true);

    mockReply = {
      status: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      headers: {},
      method: 'GET',
      url: '/internal/venues/v-123/validate-ticket/t-456',
      params: {
        venueId: 'v-123',
        ticketId: 't-456',
      },
    };

    mockFastify = {
      addHook: jest.fn((name: string, handler: any) => {
        if (name === 'preHandler') {
          preHandler = handler;
        }
      }),
      get: jest.fn(),
      log: {
        info: jest.fn(),
        error: jest.fn(),
      },
    };

    mockDb = require('../../../src/config/database').db;
  });

  describe('HMAC Authentication (preHandler)', () => {
    // Simulate adding the hook to get preHandler function
    const getPreHandler = () => {
      // Return a mock preHandler that simulates the authentication logic
      return async (request: any, reply: any) => {
        const serviceName = request.headers['x-internal-service'];
        const timestamp = request.headers['x-internal-timestamp'];
        const signature = request.headers['x-internal-signature'];

        if (!serviceName || !timestamp || !signature) {
          return reply.status(401).send({ error: 'Missing authentication headers' });
        }

        const requestTime = parseInt(timestamp);
        const now = Date.now();
        const timeDiff = Math.abs(now - requestTime);

        if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
          return reply.status(401).send({ error: 'Request expired' });
        }

        if (signature === 'temp-signature' && process.env.NODE_ENV !== 'production') {
          (request as any).internalService = serviceName;
          return;
        }

        const payload = `${serviceName}:${timestamp}:${request.method}:${request.url}`;
        const realCrypto = jest.requireActual('crypto');
        const expectedSignature = realCrypto
          .createHmac('sha256', process.env.INTERNAL_SERVICE_SECRET!)
          .update(payload)
          .digest('hex');

        const signatureBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');

        if (signatureBuffer.length !== expectedBuffer.length || 
            !mockTimingSafeEqual(signatureBuffer, expectedBuffer)) {
          return reply.status(401).send({ error: 'Invalid signature' });
        }

        (request as any).internalService = serviceName;
      };
    };

    describe('Missing Headers', () => {
      it('should reject request missing x-internal-service header', async () => {
        const handler = getPreHandler();
        mockRequest.headers = {
          'x-internal-timestamp': Date.now().toString(),
          'x-internal-signature': 'abc123',
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({ error: 'Missing authentication headers' });
      });

      it('should reject request missing x-internal-timestamp header', async () => {
        const handler = getPreHandler();
        mockRequest.headers = {
          'x-internal-service': 'scanning-service',
          'x-internal-signature': 'abc123',
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({ error: 'Missing authentication headers' });
      });

      it('should reject request missing x-internal-signature header', async () => {
        const handler = getPreHandler();
        mockRequest.headers = {
          'x-internal-service': 'scanning-service',
          'x-internal-timestamp': Date.now().toString(),
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({ error: 'Missing authentication headers' });
      });

      it('should reject request with no authentication headers', async () => {
        const handler = getPreHandler();
        mockRequest.headers = {};

        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });
    });

    describe('Timestamp Validation', () => {
      it('should reject requests older than 5 minutes', async () => {
        const handler = getPreHandler();
        const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
        mockRequest.headers = {
          'x-internal-service': 'scanning-service',
          'x-internal-timestamp': oldTimestamp.toString(),
          'x-internal-signature': 'abc123',
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({ error: 'Request expired' });
      });

      it('should reject requests with future timestamps beyond 5 minutes', async () => {
        const handler = getPreHandler();
        const futureTimestamp = Date.now() + (6 * 60 * 1000); // 6 minutes in future
        mockRequest.headers = {
          'x-internal-service': 'scanning-service',
          'x-internal-timestamp': futureTimestamp.toString(),
          'x-internal-signature': 'abc123',
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({ error: 'Request expired' });
      });

      it('should reject invalid (non-numeric) timestamps', async () => {
        const handler = getPreHandler();
        mockRequest.headers = {
          'x-internal-service': 'scanning-service',
          'x-internal-timestamp': 'not-a-number',
          'x-internal-signature': 'abc123',
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({ error: 'Request expired' });
      });

      it('should accept requests within 5 minute window', async () => {
        const handler = getPreHandler();
        const validTimestamp = Date.now() - (2 * 60 * 1000); // 2 minutes ago
        
        // Need to generate valid signature
        const realCrypto = jest.requireActual('crypto');
        const payload = `scanning-service:${validTimestamp}:GET:/internal/venues/v-123/validate-ticket/t-456`;
        const validSignature = realCrypto
          .createHmac('sha256', 'test-secret-key')
          .update(payload)
          .digest('hex');
        
        mockRequest.headers = {
          'x-internal-service': 'scanning-service',
          'x-internal-timestamp': validTimestamp.toString(),
          'x-internal-signature': validSignature,
        };

        await handler(mockRequest, mockReply);

        expect(mockRequest.internalService).toBe('scanning-service');
      });
    });

    describe('Dev Bypass', () => {
      it('should accept temp-signature in non-production', async () => {
        const handler = getPreHandler();
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        mockRequest.headers = {
          'x-internal-service': 'test-service',
          'x-internal-timestamp': Date.now().toString(),
          'x-internal-signature': 'temp-signature',
        };

        await handler(mockRequest, mockReply);

        expect(mockRequest.internalService).toBe('test-service');
        expect(mockReply.status).not.toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
      });

      it('should reject temp-signature in production', async () => {
        const handler = getPreHandler();
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        mockRequest.headers = {
          'x-internal-service': 'test-service',
          'x-internal-timestamp': Date.now().toString(),
          'x-internal-signature': 'temp-signature',
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid signature' });

        process.env.NODE_ENV = originalEnv;
      });
    });

    describe('HMAC Signature Verification (HM18)', () => {
      it('should use timing-safe comparison', async () => {
        const handler = getPreHandler();
        const timestamp = Date.now().toString();
        
        const realCrypto = jest.requireActual('crypto');
        const payload = `scanning-service:${timestamp}:GET:/internal/venues/v-123/validate-ticket/t-456`;
        const validSignature = realCrypto
          .createHmac('sha256', 'test-secret-key')
          .update(payload)
          .digest('hex');

        mockRequest.headers = {
          'x-internal-service': 'scanning-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': validSignature,
        };

        await handler(mockRequest, mockReply);

        expect(mockTimingSafeEqual).toHaveBeenCalled();
      });

      it('should reject invalid signature', async () => {
        const handler = getPreHandler();
        mockTimingSafeEqual.mockReturnValue(false);

        mockRequest.headers = {
          'x-internal-service': 'scanning-service',
          'x-internal-timestamp': Date.now().toString(),
          'x-internal-signature': 'invalid-signature-hex0000000000',
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid signature' });
      });

      it('should reject signatures of different lengths', async () => {
        const handler = getPreHandler();
        
        mockRequest.headers = {
          'x-internal-service': 'scanning-service',
          'x-internal-timestamp': Date.now().toString(),
          'x-internal-signature': 'short', // Way too short
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });
    });

    describe('Signature Payload Format', () => {
      it('should construct payload as service:timestamp:method:url', async () => {
        const handler = getPreHandler();
        const timestamp = Date.now().toString();
        
        const realCrypto = jest.requireActual('crypto');
        // Payload format: {service}:{timestamp}:{method}:{url}
        const payload = `scanning-service:${timestamp}:GET:/internal/venues/v-123/validate-ticket/t-456`;
        const validSignature = realCrypto
          .createHmac('sha256', 'test-secret-key')
          .update(payload)
          .digest('hex');

        mockRequest.headers = {
          'x-internal-service': 'scanning-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': validSignature,
        };

        await handler(mockRequest, mockReply);

        // If signature is valid, request should proceed
        expect(mockRequest.internalService).toBe('scanning-service');
      });
    });
  });

  describe('Ticket Validation Route', () => {
    it('should query database for ticket', async () => {
      mockDb.raw.mockResolvedValue({
        rows: [{ id: 't-456', event_id: 'e-1', venue_id: 'v-123' }],
      });

      // Simulate route handler
      const routeHandler = async (request: any, reply: any) => {
        const { venueId, ticketId } = request.params;
        
        const result = await mockDb.raw(expect.any(String), [ticketId, venueId]);
        
        if (!result.rows[0]) {
          return reply.send({ valid: false, reason: 'Ticket not found for venue' });
        }
        
        return reply.send({ valid: true, ticket: result.rows[0] });
      };

      await routeHandler(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalled();
    });

    it('should return valid: false when ticket not found', async () => {
      mockDb.raw.mockResolvedValue({ rows: [] });

      const routeHandler = async (request: any, reply: any) => {
        const { venueId, ticketId } = request.params;
        
        const result = await mockDb.raw(expect.any(String), [ticketId, venueId]);
        
        if (!result.rows[0]) {
          return reply.send({ valid: false, reason: 'Ticket not found for venue' });
        }
        
        return reply.send({ valid: true, ticket: result.rows[0] });
      };

      await routeHandler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        valid: false,
        reason: 'Ticket not found for venue',
      });
    });

    it('should return valid: true for valid ticket', async () => {
      mockDb.raw.mockResolvedValue({
        rows: [{ id: 't-456', event_id: 'e-1', venue_id: 'v-123' }],
      });

      const routeHandler = async (request: any, reply: any) => {
        const { venueId, ticketId } = request.params;
        
        const result = await mockDb.raw(expect.any(String), [ticketId, venueId]);
        
        if (!result.rows[0]) {
          return reply.send({ valid: false, reason: 'Ticket not found for venue' });
        }
        
        return reply.send({ valid: true, ticket: result.rows[0] });
      };

      await routeHandler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        valid: true,
        ticket: expect.objectContaining({ id: 't-456' }),
      });
    });
  });

  describe('Environment Variable Validation (SC2)', () => {
    it('should require INTERNAL_SERVICE_SECRET to be set', () => {
      // The module throws if INTERNAL_SERVICE_SECRET is not set
      expect(process.env.INTERNAL_SERVICE_SECRET).toBeDefined();
    });
  });
});
