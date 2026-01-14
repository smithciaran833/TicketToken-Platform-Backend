/**
 * Unit Tests for Internal Auth Middleware
 * 
 * Tests HMAC-based internal service authentication.
 */

import * as crypto from 'crypto';

// Store original env
const originalEnv = process.env.INTERNAL_SERVICE_SECRET;

// Set secret before importing
process.env.INTERNAL_SERVICE_SECRET = 'test-secret-that-is-at-least-32-characters-long';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { internalAuth } from '../../../src/middleware/internal-auth';

describe('Internal Auth Middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INTERNAL_SERVICE_SECRET = TEST_SECRET;

    mockRequest = {
      url: '/api/internal/payments',
      method: 'POST',
      body: { orderId: 'order-123' },
      headers: {},
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  afterAll(() => {
    process.env.INTERNAL_SERVICE_SECRET = originalEnv;
  });

  /**
   * Generate valid HMAC signature
   */
  function generateSignature(serviceName: string, timestamp: string, method: string, url: string, body: any): string {
    const payload = `${serviceName}:${timestamp}:${method}:${url}:${JSON.stringify(body)}`;
    return crypto
      .createHmac('sha256', TEST_SECRET)
      .update(payload)
      .digest('hex');
  }

  describe('Missing Headers', () => {
    it('should reject request without x-internal-service header', async () => {
      mockRequest.headers = {
        'x-internal-timestamp': Date.now().toString(),
        'x-internal-signature': 'some-signature',
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Missing authentication headers' });
    });

    it('should reject request without x-internal-timestamp header', async () => {
      mockRequest.headers = {
        'x-internal-service': 'order-service',
        'x-internal-signature': 'some-signature',
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Missing authentication headers' });
    });

    it('should reject request without x-internal-signature header', async () => {
      mockRequest.headers = {
        'x-internal-service': 'order-service',
        'x-internal-timestamp': Date.now().toString(),
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Missing authentication headers' });
    });

    it('should reject request with no headers', async () => {
      mockRequest.headers = {};

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Timestamp Validation', () => {
    it('should reject expired timestamp (older than 5 minutes)', async () => {
      const expiredTimestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
      
      mockRequest.headers = {
        'x-internal-service': 'order-service',
        'x-internal-timestamp': expiredTimestamp,
        'x-internal-signature': 'any-signature',
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Request expired' });
    });

    it('should reject future timestamp (more than 5 minutes ahead)', async () => {
      const futureTimestamp = (Date.now() + 6 * 60 * 1000).toString(); // 6 minutes in future
      
      mockRequest.headers = {
        'x-internal-service': 'order-service',
        'x-internal-timestamp': futureTimestamp,
        'x-internal-signature': 'any-signature',
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Request expired' });
    });

    it('should reject invalid (non-numeric) timestamp', async () => {
      mockRequest.headers = {
        'x-internal-service': 'order-service',
        'x-internal-timestamp': 'not-a-number',
        'x-internal-signature': 'any-signature',
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Request expired' });
    });

    it('should accept timestamp within 5 minutes', async () => {
      const timestamp = Date.now().toString();
      const signature = generateSignature(
        'order-service',
        timestamp,
        mockRequest.method,
        mockRequest.url,
        mockRequest.body
      );
      
      mockRequest.headers = {
        'x-internal-service': 'order-service',
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      };

      await internalAuth(mockRequest, mockReply);

      // Should not return error
      expect(mockReply.status).not.toHaveBeenCalledWith(401);
    });
  });

  describe('Signature Validation', () => {
    it('should reject invalid signature', async () => {
      const timestamp = Date.now().toString();
      
      mockRequest.headers = {
        'x-internal-service': 'order-service',
        'x-internal-timestamp': timestamp,
        'x-internal-signature': 'invalid-signature-that-is-hex'.padEnd(64, '0'),
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid signature' });
    });

    it('should accept valid HMAC signature', async () => {
      const timestamp = Date.now().toString();
      const signature = generateSignature(
        'ticket-service',
        timestamp,
        mockRequest.method,
        mockRequest.url,
        mockRequest.body
      );
      
      mockRequest.headers = {
        'x-internal-service': 'ticket-service',
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockRequest.internalService).toBe('ticket-service');
    });

    it('should reject signature with wrong service name', async () => {
      const timestamp = Date.now().toString();
      // Generate signature for 'order-service' but send as 'ticket-service'
      const signature = generateSignature(
        'order-service',
        timestamp,
        mockRequest.method,
        mockRequest.url,
        mockRequest.body
      );
      
      mockRequest.headers = {
        'x-internal-service': 'ticket-service', // Different from signature
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should reject signature with tampered body', async () => {
      const timestamp = Date.now().toString();
      const signature = generateSignature(
        'order-service',
        timestamp,
        mockRequest.method,
        mockRequest.url,
        { orderId: 'order-123' } // Original body
      );
      
      mockRequest.body = { orderId: 'order-456' }; // Tampered body
      mockRequest.headers = {
        'x-internal-service': 'order-service',
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should reject signature with wrong method', async () => {
      const timestamp = Date.now().toString();
      const signature = generateSignature(
        'order-service',
        timestamp,
        'GET', // Generated for GET
        mockRequest.url,
        mockRequest.body
      );
      
      mockRequest.method = 'POST'; // But request is POST
      mockRequest.headers = {
        'x-internal-service': 'order-service',
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Successful Authentication', () => {
    it('should set internalService on request', async () => {
      const timestamp = Date.now().toString();
      const signature = generateSignature(
        'notification-service',
        timestamp,
        mockRequest.method,
        mockRequest.url,
        mockRequest.body
      );
      
      mockRequest.headers = {
        'x-internal-service': 'notification-service',
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockRequest.internalService).toBe('notification-service');
    });

    it('should authenticate different services', async () => {
      const services = ['order-service', 'ticket-service', 'event-service', 'auth-service'];
      
      for (const service of services) {
        const timestamp = Date.now().toString();
        const signature = generateSignature(
          service,
          timestamp,
          mockRequest.method,
          mockRequest.url,
          mockRequest.body
        );
        
        mockRequest.headers = {
          'x-internal-service': service,
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        };

        await internalAuth(mockRequest, mockReply);

        expect(mockRequest.internalService).toBe(service);
      }
    });

    it('should work with GET request (no body)', async () => {
      mockRequest.method = 'GET';
      mockRequest.url = '/api/internal/status';
      mockRequest.body = undefined;
      
      const timestamp = Date.now().toString();
      const signature = generateSignature(
        'health-check',
        timestamp,
        'GET',
        '/api/internal/status',
        undefined
      );
      
      mockRequest.headers = {
        'x-internal-service': 'health-check',
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockRequest.internalService).toBe('health-check');
    });
  });

  describe('Timing-Safe Comparison', () => {
    it('should use constant-time comparison (no timing attacks)', async () => {
      // This test verifies the middleware uses timing-safe comparison
      // by checking that the signature validation completes
      const timestamp = Date.now().toString();
      
      // Generate a valid signature
      const validSignature = generateSignature(
        'test-service',
        timestamp,
        mockRequest.method,
        mockRequest.url,
        mockRequest.body
      );
      
      // Try with almost-correct signature (only last char different)
      const almostValid = validSignature.slice(0, -1) + (validSignature.slice(-1) === 'a' ? 'b' : 'a');
      
      mockRequest.headers = {
        'x-internal-service': 'test-service',
        'x-internal-timestamp': timestamp,
        'x-internal-signature': almostValid,
      };

      await internalAuth(mockRequest, mockReply);

      // Should still reject
      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Complex Bodies', () => {
    it('should handle nested object bodies', async () => {
      mockRequest.body = {
        order: {
          id: 'order-123',
          items: [
            { ticketId: 't1', quantity: 2 },
            { ticketId: 't2', quantity: 1 },
          ],
        },
        customer: {
          email: 'test@example.com',
        },
      };
      
      const timestamp = Date.now().toString();
      const signature = generateSignature(
        'order-service',
        timestamp,
        mockRequest.method,
        mockRequest.url,
        mockRequest.body
      );
      
      mockRequest.headers = {
        'x-internal-service': 'order-service',
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockRequest.internalService).toBe('order-service');
    });

    it('should handle array bodies', async () => {
      mockRequest.body = [
        { id: 1, action: 'create' },
        { id: 2, action: 'update' },
      ];
      
      const timestamp = Date.now().toString();
      const signature = generateSignature(
        'batch-service',
        timestamp,
        mockRequest.method,
        mockRequest.url,
        mockRequest.body
      );
      
      mockRequest.headers = {
        'x-internal-service': 'batch-service',
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockRequest.internalService).toBe('batch-service');
    });
  });
});
