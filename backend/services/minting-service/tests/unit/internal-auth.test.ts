import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import { validateInternalRequest } from '../../src/middleware/internal-auth';

describe('Internal Authentication Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      body: { test: 'data' },
      ip: '127.0.0.1',
      url: '/test'
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };

    process.env.INTERNAL_SERVICE_SECRET = 'test-secret-key-minimum-32-characters-long';
  });

  const generateValidSignature = (service: string, timestamp: string, body: any) => {
    const payload = `${service}:${timestamp}:${JSON.stringify(body)}`;
    return crypto
      .createHmac('sha256', process.env.INTERNAL_SERVICE_SECRET!)
      .update(payload)
      .digest('hex');
  };

  it('should reject request without headers', async () => {
    await validateInternalRequest(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'UNAUTHORIZED'
      })
    );
  });

  it('should reject unknown service', async () => {
    const timestamp = Date.now().toString();
    mockRequest.headers = {
      'x-internal-service': 'unknown-service',
      'x-internal-signature': 'fake-sig',
      'x-timestamp': timestamp
    };

    await validateInternalRequest(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'FORBIDDEN'
      })
    );
  });

  it('should reject expired timestamp', async () => {
    const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 mins ago
    const service = 'payment-service';
    const signature = generateValidSignature(service, oldTimestamp, mockRequest.body);

    mockRequest.headers = {
      'x-internal-service': service,
      'x-internal-signature': signature,
      'x-timestamp': oldTimestamp
    };

    await validateInternalRequest(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Request expired'
      })
    );
  });

  it('should reject invalid signature', async () => {
    const timestamp = Date.now().toString();
    const service = 'payment-service';

    mockRequest.headers = {
      'x-internal-service': service,
      'x-internal-signature': 'invalid-signature',
      'x-timestamp': timestamp
    };

    await validateInternalRequest(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invalid signature'
      })
    );
  });

  it('should accept valid authenticated request', async () => {
    const timestamp = Date.now().toString();
    const service = 'payment-service';
    const signature = generateValidSignature(service, timestamp, mockRequest.body);

    mockRequest.headers = {
      'x-internal-service': service,
      'x-internal-signature': signature,
      'x-timestamp': timestamp
    };

    await validateInternalRequest(mockRequest, mockReply);

    expect(mockRequest.internalService).toBe(service);
    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should work with all allowed services', async () => {
    const allowedServices = ['payment-service', 'ticket-service', 'order-service', 'blockchain-service'];

    for (const service of allowedServices) {
      const timestamp = Date.now().toString();
      const signature = generateValidSignature(service, timestamp, mockRequest.body);

      mockRequest.headers = {
        'x-internal-service': service,
        'x-internal-signature': signature,
        'x-timestamp': timestamp
      };

      // Reset mocks
      mockReply.code.mockClear();
      mockReply.send.mockClear();

      await validateInternalRequest(mockRequest, mockReply);

      expect(mockRequest.internalService).toBe(service);
      expect(mockReply.code).not.toHaveBeenCalled();
    }
  });

  it('should reject if INTERNAL_SERVICE_SECRET not configured', async () => {
    delete process.env.INTERNAL_SERVICE_SECRET;

    const timestamp = Date.now().toString();
    mockRequest.headers = {
      'x-internal-service': 'payment-service',
      'x-internal-signature': 'sig',
      'x-timestamp': timestamp
    };

    await validateInternalRequest(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(500);
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'CONFIGURATION_ERROR'
      })
    );
  });
});
