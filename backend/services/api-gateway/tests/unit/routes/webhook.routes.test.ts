import { FastifyInstance } from 'fastify';
import webhookRoutes from '../../../src/routes/webhook.routes';

// Mock axios as a function
const mockedAxios = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../../src/config/services', () => ({
  serviceUrls: {
    payment: 'http://payment-service:3005',
  },
}));

// Get the mocked axios after jest processes the mock
import axios from 'axios';
const axiosMock = axios as jest.MockedFunction<typeof axios>;

describe('webhook.routes', () => {
  let mockServer: any;
  let postHandler: jest.Mock;
  let allHandler: jest.Mock;
  let routes: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    routes = new Map();

    postHandler = jest.fn((path: string, ...args: any[]) => {
      const handler = args[args.length - 1];
      routes.set(`POST:${path}`, { handler, options: args.length > 1 ? args[0] : {} });
    });

    allHandler = jest.fn((path: string, handler: Function) => {
      routes.set(`ALL:${path}`, { handler });
    });

    mockServer = {
      post: postHandler,
      all: allHandler,
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
    } as any);
  });

  describe('route registration', () => {
    it('registers Stripe webhook endpoint', async () => {
      await webhookRoutes(mockServer);

      expect(postHandler).toHaveBeenCalledWith(
        '/stripe',
        expect.objectContaining({
          config: { rawBody: true },
        }),
        expect.any(Function)
      );
    });

    it('registers wildcard webhook endpoint', async () => {
      await webhookRoutes(mockServer);

      expect(allHandler).toHaveBeenCalledWith('/*', expect.any(Function));
    });
  });

  describe('POST /stripe (Stripe webhook)', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await webhookRoutes(mockServer);
      handler = routes.get('POST:/stripe')!.handler;

      mockRequest = {
        headers: {
          'stripe-signature': 'test-signature',
          'stripe-webhook-id': 'webhook-123',
          'content-type': 'application/json',
          'host': 'api.example.com',
        },
        ip: '192.168.1.1',
        rawBody: Buffer.from('{"event": "payment.succeeded"}'),
        body: { event: 'payment.succeeded' },
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
    });

    it('forwards webhook with raw body to payment service', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://payment-service:3005/api/v1/webhooks/stripe',
          data: mockRequest.rawBody,
        })
      );
    });

    it('preserves Stripe signature header', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'stripe-signature': 'test-signature',
          }),
        })
      );
    });

    it('preserves Stripe webhook ID header', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'stripe-webhook-id': 'webhook-123',
          }),
        })
      );
    });

    it('includes content-type header', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': 'application/json',
          }),
        })
      );
    });

    it('includes content-length based on raw body', async () => {
      const rawBody = Buffer.from('{"event": "test"}');
      mockRequest.rawBody = rawBody;

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-length': Buffer.byteLength(rawBody).toString(),
          }),
        })
      );
    });

    it('forwards client IP address', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-forwarded-for': '192.168.1.1',
          }),
        })
      );
    });

    it('forwards original host header', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-original-host': 'api.example.com',
          }),
        })
      );
    });

    it('uses body as raw buffer when rawBody is missing', async () => {
      delete mockRequest.rawBody;
      mockRequest.body = { event: 'test' };

      await handler(mockRequest, mockReply);

      const expectedBuffer = Buffer.from(JSON.stringify({ event: 'test' }));
      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expectedBuffer,
        })
      );
    });

    it('removes undefined headers', async () => {
      delete mockRequest.headers['stripe-webhook-id'];

      await handler(mockRequest, mockReply);

      const axiosCall = axiosMock.mock.calls[0][0] as any;
      expect(axiosCall.headers).not.toHaveProperty('stripe-webhook-id');
    });

    it('sets 10 second timeout', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000,
        })
      );
    });

    it('disables body length limits', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        })
      );
    });

    it('accepts all HTTP status codes', async () => {
      await handler(mockRequest, mockReply);

      const axiosCall = axiosMock.mock.calls[0][0] as any;
      expect(axiosCall.validateStatus()).toBe(true);
    });

    it('does not transform request data', async () => {
      await handler(mockRequest, mockReply);

      const axiosCall = axiosMock.mock.calls[0][0] as any;
      const testData = Buffer.from('test');
      expect(axiosCall.transformRequest[0](testData)).toBe(testData);
    });

    it('returns response with correct status code', async () => {
      axiosMock.mockResolvedValue({
        status: 200,
        data: { received: true },
      } as any);

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({ received: true });
    });

    it('forwards non-200 status codes', async () => {
      axiosMock.mockResolvedValue({
        status: 400,
        data: { error: 'Bad Request' },
      } as any);

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Bad Request' });
    });

    it('returns 500 on connection error', async () => {
      axiosMock.mockRejectedValue({
        message: 'Connection refused',
        code: 'ECONNREFUSED',
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to process webhook',
      });
    });

    it('logs error on failure', async () => {
      const error = new Error('Network error');
      (error as any).code = 'ENETWORK';
      axiosMock.mockRejectedValue(error);

      await handler(mockRequest, mockReply);

      expect(mockServer.log.error).toHaveBeenCalledWith(
        {
          error: 'Network error',
          code: 'ENETWORK',
          path: '/webhooks/stripe',
        },
        'Stripe webhook proxy error'
      );
    });

    it('returns 500 on timeout', async () => {
      axiosMock.mockRejectedValue({
        message: 'Timeout exceeded',
        code: 'ETIMEDOUT',
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('handles missing content-type header', async () => {
      delete mockRequest.headers['content-type'];

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': 'application/json',
          }),
        })
      );
    });
  });

  describe('ALL /* (generic webhook)', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await webhookRoutes(mockServer);
      handler = routes.get('ALL:/*')!.handler;

      mockRequest = {
        method: 'POST',
        params: { '*': 'shopify/order-created' },
        headers: {
          'content-type': 'application/json',
        },
        ip: '10.0.0.5',
        body: { order: { id: '123' } },
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        headers: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
    });

    it('forwards webhook to payment service with correct path', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://payment-service:3005/api/v1/webhooks/shopify/order-created',
          data: { order: { id: '123' } },
        })
      );
    });

    it('handles empty wildcard path', async () => {
      mockRequest.params = {};

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://payment-service:3005/api/v1/webhooks/',
        })
      );
    });

    it('forwards content-type header', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': 'application/json',
          }),
        })
      );
    });

    it('forwards client IP', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-forwarded-for': '10.0.0.5',
          }),
        })
      );
    });

    it('supports GET method', async () => {
      mockRequest.method = 'GET';

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('supports PUT method', async () => {
      mockRequest.method = 'PUT';

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });

    it('supports DELETE method', async () => {
      mockRequest.method = 'DELETE';

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('sets 10 second timeout', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000,
        })
      );
    });

    it('returns response with status and headers', async () => {
      axiosMock.mockResolvedValue({
        status: 201,
        data: { created: true },
        headers: {
          'content-type': 'application/json',
          'x-custom-header': 'value',
        },
      } as any);

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.headers).toHaveBeenCalledWith({
        'content-type': 'application/json',
        'x-custom-header': 'value',
      });
      expect(mockReply.send).toHaveBeenCalledWith({ created: true });
    });

    it('returns 500 on error', async () => {
      axiosMock.mockRejectedValue({
        message: 'Service unavailable',
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Webhook processing failed',
      });
    });

    it('logs error on failure', async () => {
      const error = new Error('Connection timeout');
      axiosMock.mockRejectedValue(error);

      await handler(mockRequest, mockReply);

      expect(mockServer.log.error).toHaveBeenCalledWith(
        { error: 'Connection timeout' },
        'Webhook proxy error'
      );
    });

    it('handles complex nested paths', async () => {
      mockRequest.params = { '*': 'provider/v2/events/payment.completed' };

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://payment-service:3005/api/v1/webhooks/provider/v2/events/payment.completed',
        })
      );
    });
  });
});
