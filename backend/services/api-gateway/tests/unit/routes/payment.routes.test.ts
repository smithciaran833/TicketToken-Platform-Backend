import { FastifyInstance } from 'fastify';
import paymentRoutes from '../../../src/routes/payment.routes';

// Create axios mock function
const axiosMock = jest.fn();

// Mock axios module to return our mock function
jest.mock('axios', () => axiosMock);

jest.mock('../../../src/config/services', () => ({
  serviceUrls: {
    payment: 'http://payment-service:3005',
  },
}));

jest.mock('../../../src/routes/authenticated-proxy', () => ({
  createAuthenticatedProxy: jest.fn(() => jest.fn()),
}));

jest.mock('../../../src/middleware/validation.middleware', () => ({
  validateBody: jest.fn(() => jest.fn()),
  validateUuidParam: jest.fn(() => jest.fn()),
}));

describe('payment.routes', () => {
  let mockServer: any;
  let postHandler: jest.Mock;
  let routes: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    routes = new Map();

    postHandler = jest.fn((path: string, ...args: any[]) => {
      const handler = args[args.length - 1];
      routes.set(`POST:${path}`, { 
        handler, 
        options: args.length > 1 ? args[0] : {} 
      });
    });

    mockServer = {
      post: postHandler,
      authenticate: jest.fn(),
      log: {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      },
    };

    axiosMock.mockResolvedValue({
      status: 200,
      data: { success: true },
      headers: {},
    });
  });

  describe('route registration', () => {
    it('registers POST / endpoint with validation', async () => {
      await paymentRoutes(mockServer);

      expect(postHandler).toHaveBeenCalledWith(
        '/',
        expect.objectContaining({
          preHandler: expect.any(Array),
        }),
        expect.any(Function)
      );
    });

    it('registers POST /calculate-fees endpoint with validation', async () => {
      await paymentRoutes(mockServer);

      expect(postHandler).toHaveBeenCalledWith(
        '/calculate-fees',
        expect.objectContaining({
          preHandler: expect.any(Array),
        }),
        expect.any(Function)
      );
    });

    it('registers POST /:id/refund endpoint with validation', async () => {
      await paymentRoutes(mockServer);

      expect(postHandler).toHaveBeenCalledWith(
        '/:id/refund',
        expect.objectContaining({
          preHandler: expect.any(Array),
        }),
        expect.any(Function)
      );
    });
  });

  describe('POST / (process payment)', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await paymentRoutes(mockServer);
      handler = routes.get('POST:/')!.handler;

      mockRequest = {
        id: 'req-123',
        method: 'POST',
        ip: '10.0.0.1',
        headers: {
          authorization: 'Bearer token-123',
        },
        user: {
          tenant_id: 'tenant-456',
        },
        body: {
          amount: 1000,
          currency: 'USD',
        },
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        headers: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
    });

    it('forwards payment request to payment service', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://payment-service:3005/api/v1/payments',
          data: { amount: 1000, currency: 'USD' },
        })
      );
    });

    it('includes required headers', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': 'application/json',
            'x-request-id': 'req-123',
            'x-gateway-forwarded': 'true',
            'x-original-ip': '10.0.0.1',
          }),
        })
      );
    });

    it('forwards authorization header', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer token-123',
          }),
        })
      );
    });

    it('includes tenant ID from JWT', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-tenant-id': 'tenant-456',
            'x-tenant-source': 'jwt',
          }),
        })
      );
    });

    it('sets 30 second timeout for payments', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('accepts all HTTP status codes', async () => {
      await handler(mockRequest, mockReply);

      const axiosCall = axiosMock.mock.calls[0][0] as any;
      expect(axiosCall.validateStatus()).toBe(true);
    });

    it('returns response with status and data', async () => {
      axiosMock.mockResolvedValue({
        status: 200,
        data: { transactionId: 'txn-123', success: true },
        headers: { 'x-transaction-id': 'txn-123' },
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.headers).toHaveBeenCalledWith({ 'x-transaction-id': 'txn-123' });
      expect(mockReply.send).toHaveBeenCalledWith({ transactionId: 'txn-123', success: true });
    });

    it('forwards non-200 status codes', async () => {
      axiosMock.mockResolvedValue({
        status: 402,
        data: { error: 'Insufficient funds' },
        headers: {},
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(402);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Insufficient funds' });
    });

    it('returns 503 on connection refused', async () => {
      axiosMock.mockRejectedValue({
        message: 'Connection refused',
        code: 'ECONNREFUSED',
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Service Unavailable',
        message: 'Payment service is unavailable',
      });
    });

    it('returns 504 on timeout', async () => {
      axiosMock.mockRejectedValue({
        message: 'Request timeout',
        code: 'ETIMEDOUT',
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(504);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Gateway Timeout',
        message: 'Payment service timed out',
      });
    });

    it('returns 504 on connection aborted', async () => {
      axiosMock.mockRejectedValue({
        message: 'Connection aborted',
        code: 'ECONNABORTED',
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(504);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Gateway Timeout',
        message: 'Payment service timed out',
      });
    });

    it('returns 502 on generic error', async () => {
      axiosMock.mockRejectedValue({
        message: 'Unknown error',
        code: 'EUNKNOWN',
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(502);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Bad Gateway',
        message: 'Payment service error',
      });
    });

    it('logs error on failure', async () => {
      axiosMock.mockRejectedValue({
        message: 'Service error',
        code: 'ECONNREFUSED',
      });

      await handler(mockRequest, mockReply);

      expect(mockServer.log.error).toHaveBeenCalledWith(
        { error: 'Service error', path: '' },
        'Payment proxy error'
      );
    });

    it('handles missing authorization header', async () => {
      delete mockRequest.headers.authorization;

      await handler(mockRequest, mockReply);

      const axiosCall = axiosMock.mock.calls[0][0] as any;
      expect(axiosCall.headers).not.toHaveProperty('authorization');
    });

    it('handles missing tenant ID', async () => {
      delete mockRequest.user;

      await handler(mockRequest, mockReply);

      const axiosCall = axiosMock.mock.calls[0][0] as any;
      expect(axiosCall.headers).not.toHaveProperty('x-tenant-id');
    });
  });

  describe('POST /calculate-fees', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await paymentRoutes(mockServer);
      handler = routes.get('POST:/calculate-fees')!.handler;

      mockRequest = {
        id: 'req-456',
        method: 'POST',
        ip: '10.0.0.2',
        headers: {
          authorization: 'Bearer token-456',
        },
        user: {
          tenant_id: 'tenant-789',
        },
        body: {
          amount: 5000,
          currency: 'USD',
        },
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        headers: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
    });

    it('forwards to correct calculate-fees endpoint', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://payment-service:3005/api/v1/payments/calculate-fees',
        })
      );
    });

    it('includes request body', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { amount: 5000, currency: 'USD' },
        })
      );
    });
  });

  describe('POST /:id/refund', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await paymentRoutes(mockServer);
      handler = routes.get('POST:/:id/refund')!.handler;

      mockRequest = {
        id: 'req-789',
        method: 'POST',
        ip: '10.0.0.3',
        headers: {
          authorization: 'Bearer token-789',
        },
        params: {
          id: 'payment-123',
        },
        user: {
          tenant_id: 'tenant-999',
        },
        body: {
          amount: 1000,
          reason: 'Customer request',
        },
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        headers: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
    });

    it('forwards to correct refund endpoint with payment ID', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://payment-service:3005/api/v1/payments/payment-123/refund',
        })
      );
    });

    it('includes refund body', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { amount: 1000, reason: 'Customer request' },
        })
      );
    });

    it('logs error with correct path', async () => {
      axiosMock.mockRejectedValue({
        message: 'Refund failed',
        code: 'EREFUND',
      });

      await handler(mockRequest, mockReply);

      expect(mockServer.log.error).toHaveBeenCalledWith(
        { error: 'Refund failed', path: '/payment-123/refund' },
        'Payment proxy error'
      );
    });
  });
});
