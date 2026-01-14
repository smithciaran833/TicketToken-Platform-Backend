/**
 * Unit Tests for middleware/internal-auth.ts
 * 
 * Tests internal service-to-service authentication using HMAC signatures.
 * Priority: 🔴 Critical (Security-related)
 */

import crypto from 'crypto';
import { validateInternalRequest } from '../../../src/middleware/internal-auth';

// =============================================================================
// Mock Setup
// =============================================================================

jest.mock('../../../src/utils/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const createMockRequest = (overrides: any = {}) => ({
  headers: {},
  ip: '127.0.0.1',
  url: '/internal/mint',
  body: {},
  internalService: undefined,
  ...overrides
});

const createMockReply = () => {
  const reply: any = {
    statusCode: 200,
    code: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
  };
  return reply;
};

const TEST_SECRET = 'test-internal-secret-32-chars-minimum';

// Helper to create valid signature
const createValidSignature = (service: string, timestamp: string, body: any, secret: string) => {
  const payload = `${service}:${timestamp}:${JSON.stringify(body)}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

// =============================================================================
// validateInternalRequest Tests
// =============================================================================

describe('validateInternalRequest', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, INTERNAL_SERVICE_SECRET: TEST_SECRET };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('header validation', () => {
    it('should return 401 without x-internal-service header', async () => {
      const request = createMockRequest({
        headers: {
          'x-internal-signature': 'some-signature',
          'x-timestamp': Date.now().toString()
        }
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'UNAUTHORIZED' })
      );
    });

    it('should return 401 without x-internal-signature header', async () => {
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'payment-service',
          'x-timestamp': Date.now().toString()
        }
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('should return 401 without x-timestamp header', async () => {
      const timestamp = Date.now().toString();
      const body = { ticketId: 'test-123' };
      const signature = createValidSignature('payment-service', timestamp, body, TEST_SECRET);
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'payment-service',
          'x-internal-signature': signature
          // No timestamp
        },
        body
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Missing timestamp' })
      );
    });
  });

  describe('service validation', () => {
    it('should return 403 for service not in allowed list', async () => {
      const timestamp = Date.now().toString();
      const body = { ticketId: 'test-123' };
      const signature = createValidSignature('unknown-service', timestamp, body, TEST_SECRET);
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'unknown-service',
          'x-internal-signature': signature,
          'x-timestamp': timestamp
        },
        body
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'FORBIDDEN' })
      );
    });

    it('should allow payment-service', async () => {
      const timestamp = Date.now().toString();
      const body = { ticketId: 'test-123' };
      const signature = createValidSignature('payment-service', timestamp, body, TEST_SECRET);
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'payment-service',
          'x-internal-signature': signature,
          'x-timestamp': timestamp
        },
        body
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(reply.code).not.toHaveBeenCalledWith(403);
    });

    it('should allow ticket-service', async () => {
      const timestamp = Date.now().toString();
      const body = {};
      const signature = createValidSignature('ticket-service', timestamp, body, TEST_SECRET);
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'ticket-service',
          'x-internal-signature': signature,
          'x-timestamp': timestamp
        },
        body
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(reply.code).not.toHaveBeenCalledWith(403);
    });
  });

  describe('timestamp validation', () => {
    it('should return 401 for timestamp older than 5 minutes', async () => {
      const timestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
      const body = {};
      const signature = createValidSignature('payment-service', timestamp, body, TEST_SECRET);
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'payment-service',
          'x-internal-signature': signature,
          'x-timestamp': timestamp
        },
        body
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Request expired' })
      );
    });

    it('should return 401 for timestamp in future > 5 minutes', async () => {
      const timestamp = (Date.now() + 6 * 60 * 1000).toString(); // 6 minutes in future
      const body = {};
      const signature = createValidSignature('payment-service', timestamp, body, TEST_SECRET);
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'payment-service',
          'x-internal-signature': signature,
          'x-timestamp': timestamp
        },
        body
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('should accept timestamp within 5 minute window', async () => {
      const timestamp = (Date.now() - 2 * 60 * 1000).toString(); // 2 minutes ago
      const body = {};
      const signature = createValidSignature('payment-service', timestamp, body, TEST_SECRET);
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'payment-service',
          'x-internal-signature': signature,
          'x-timestamp': timestamp
        },
        body
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(request.internalService).toBe('payment-service');
    });
  });

  describe('configuration validation', () => {
    it('should return 500 without INTERNAL_SERVICE_SECRET configured', async () => {
      delete process.env.INTERNAL_SERVICE_SECRET;
      
      const timestamp = Date.now().toString();
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'payment-service',
          'x-internal-signature': 'some-signature',
          'x-timestamp': timestamp
        }
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'CONFIGURATION_ERROR' })
      );
    });
  });

  describe('signature validation', () => {
    it('should return 401 for invalid signature', async () => {
      const timestamp = Date.now().toString();
      const body = { ticketId: 'test-123' };
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'payment-service',
          'x-internal-signature': 'invalid-signature-that-is-definitely-wrong',
          'x-timestamp': timestamp
        },
        body
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid signature' })
      );
    });

    it('should use HMAC-SHA256 for signature verification', async () => {
      const timestamp = Date.now().toString();
      const body = { ticketId: 'test-123' };
      
      // Create HMAC-SHA256 signature manually
      const payload = `payment-service:${timestamp}:${JSON.stringify(body)}`;
      const expectedSignature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(payload)
        .digest('hex');
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'payment-service',
          'x-internal-signature': expectedSignature,
          'x-timestamp': timestamp
        },
        body
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(request.internalService).toBe('payment-service');
      expect(reply.code).not.toHaveBeenCalledWith(401);
    });

    it('should reject signature with wrong length', async () => {
      const timestamp = Date.now().toString();
      const body = {};
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'payment-service',
          'x-internal-signature': 'abc123', // Too short
          'x-timestamp': timestamp
        },
        body
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
    });
  });

  describe('successful authentication', () => {
    it('should attach internalService to request on success', async () => {
      const timestamp = Date.now().toString();
      const body = { data: 'test' };
      const signature = createValidSignature('payment-service', timestamp, body, TEST_SECRET);
      
      const request = createMockRequest({
        headers: {
          'x-internal-service': 'payment-service',
          'x-internal-signature': signature,
          'x-timestamp': timestamp
        },
        body
      });
      const reply = createMockReply();

      await validateInternalRequest(request as any, reply as any);

      expect(request.internalService).toBe('payment-service');
    });
  });
});
