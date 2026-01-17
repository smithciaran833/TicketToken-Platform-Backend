import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import ticketsRoutes from '../../../src/routes/tickets.routes';

// Create axios mock function
const axiosMock = jest.fn();
jest.mock('axios', () => axiosMock);

jest.mock('../../../src/config/services', () => ({
  serviceUrls: {
    ticket: 'http://ticket-service:3004',
  },
}));

jest.mock('../../../src/routes/authenticated-proxy', () => ({
  createAuthenticatedProxy: jest.fn(() => jest.fn()),
}));

jest.mock('../../../src/middleware/validation.middleware', () => ({
  validateBody: jest.fn(() => jest.fn()),
}));

jest.mock('../../../src/utils/internal-auth', () => ({
  generateInternalAuthHeaders: jest.fn(() => ({
    'x-internal-auth': 'internal-token',
    'x-signature': 'signature-value',
  })),
}));

describe('tickets.routes', () => {
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
    it('registers POST /purchase endpoint', async () => {
      await ticketsRoutes(mockServer);

      expect(postHandler).toHaveBeenCalledWith(
        '/purchase',
        expect.objectContaining({
          preHandler: expect.any(Array),
        }),
        expect.any(Function)
      );
    });

    it('registers POST /types endpoint', async () => {
      await ticketsRoutes(mockServer);

      expect(postHandler).toHaveBeenCalledWith(
        '/types',
        expect.objectContaining({
          preHandler: expect.any(Array),
        }),
        expect.any(Function)
      );
    });

    it('registers POST /transfer endpoint', async () => {
      await ticketsRoutes(mockServer);

      expect(postHandler).toHaveBeenCalledWith(
        '/transfer',
        expect.objectContaining({
          preHandler: expect.any(Array),
        }),
        expect.any(Function)
      );
    });

    it('registers POST /validate-qr endpoint', async () => {
      await ticketsRoutes(mockServer);

      expect(postHandler).toHaveBeenCalledWith(
        '/validate-qr',
        expect.objectContaining({
          preHandler: expect.any(Array),
        }),
        expect.any(Function)
      );
    });
  });

  describe('validateIdempotencyKey', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await ticketsRoutes(mockServer);
      handler = routes.get('POST:/purchase')!.handler;

      mockRequest = {
        id: 'req-123',
        method: 'POST',
        ip: '10.0.0.1',
        headers: {
          authorization: 'Bearer token-123',
        },
        user: {
          id: 'user-123',
          tenant_id: 'tenant-456',
        },
        body: {
          ticketTypeId: 'type-123',
          quantity: 2,
        },
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        headers: jest.fn().mockReturnThis(),
      };
    });

    it('accepts valid idempotency key with alphanumeric characters', async () => {
      mockRequest.headers['idempotency-key'] = 'abc123DEF456';

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalled();
      expect(mockReply.code).not.toHaveBeenCalledWith(400);
    });

    it('accepts valid idempotency key with dashes', async () => {
      mockRequest.headers['idempotency-key'] = 'abc-123-def-456';

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalled();
      expect(mockReply.code).not.toHaveBeenCalledWith(400);
    });

    it('accepts valid idempotency key with underscores', async () => {
      mockRequest.headers['idempotency-key'] = 'abc_123_def_456';

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalled();
      expect(mockReply.code).not.toHaveBeenCalledWith(400);
    });

    it('accepts valid idempotency key at max length (128 chars)', async () => {
      mockRequest.headers['idempotency-key'] = 'a'.repeat(128);

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalled();
      expect(mockReply.code).not.toHaveBeenCalledWith(400);
    });

    it('accepts missing idempotency key (optional)', async () => {
      delete mockRequest.headers['idempotency-key'];

      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalled();
      expect(mockReply.code).not.toHaveBeenCalledWith(400);
    });

    it('rejects idempotency key with spaces', async () => {
      mockRequest.headers['idempotency-key'] = 'abc 123';

      await handler(mockRequest, mockReply);

      expect(axiosMock).not.toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid idempotency key',
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be 1-128 alphanumeric characters (dashes and underscores allowed)',
        requestId: 'req-123',
      });
    });

    it('rejects idempotency key with special characters', async () => {
      mockRequest.headers['idempotency-key'] = 'abc@123';

      await handler(mockRequest, mockReply);

      expect(axiosMock).not.toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('rejects idempotency key exceeding 128 characters', async () => {
      mockRequest.headers['idempotency-key'] = 'a'.repeat(129);

      await handler(mockRequest, mockReply);

      expect(axiosMock).not.toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('rejects empty idempotency key', async () => {
      mockRequest.headers['idempotency-key'] = '';

      await handler(mockRequest, mockReply);

      expect(axiosMock).not.toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('rejects idempotency key with dots', async () => {
      mockRequest.headers['idempotency-key'] = 'abc.123';

      await handler(mockRequest, mockReply);

      expect(axiosMock).not.toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /purchase (with idempotency check)', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await ticketsRoutes(mockServer);
      handler = routes.get('POST:/purchase')!.handler;

      mockRequest = {
        id: 'req-purchase',
        method: 'POST',
        ip: '10.0.0.1',
        headers: {
          authorization: 'Bearer token-123',
          'idempotency-key': 'purchase-key-123',
        },
        user: {
          id: 'user-123',
          tenant_id: 'tenant-456',
        },
        body: {
          ticketTypeId: 'type-123',
          quantity: 2,
        },
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        headers: jest.fn().mockReturnThis(),
      };
    });

    it('forwards purchase request to ticket service', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://ticket-service:3004/api/v1/tickets/purchase',
        })
      );
    });

    it('includes idempotency key in headers', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'idempotency-key': 'purchase-key-123',
          }),
        })
      );
    });

    it('includes tenant ID from user', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-tenant-id': 'tenant-456',
          }),
        })
      );
    });

    it('includes user ID from user', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-user-id': 'user-123',
          }),
        })
      );
    });

    it('includes internal auth headers', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-internal-auth': 'internal-token',
            'x-signature': 'signature-value',
          }),
        })
      );
    });

    it('includes correlation ID', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-request-id': 'req-purchase',
            'x-correlation-id': 'req-purchase',
          }),
        })
      );
    });

    it('forwards response with correlation ID header', async () => {
      axiosMock.mockResolvedValue({
        status: 200,
        data: { ticketIds: ['ticket-1', 'ticket-2'] },
        headers: { 'content-type': 'application/json' },
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.headers).toHaveBeenCalledWith(
        expect.objectContaining({
          'x-correlation-id': 'req-purchase',
        })
      );
    });

    it('sets 30 second timeout', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
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
        message: 'Ticket service is unavailable',
        correlationId: 'req-purchase',
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
        message: 'Ticket service timed out',
        correlationId: 'req-purchase',
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
        message: 'Ticket service error',
        correlationId: 'req-purchase',
      });
    });

    it('logs error on failure', async () => {
      axiosMock.mockRejectedValue({
        message: 'Service error',
        code: 'ECONNREFUSED',
      });

      await handler(mockRequest, mockReply);

      expect(mockServer.log.error).toHaveBeenCalledWith(
        {
          error: 'Service error',
          path: '/purchase',
          correlationId: 'req-purchase',
        },
        'Ticket proxy error'
      );
    });
  });

  describe('POST /transfer (with idempotency check)', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await ticketsRoutes(mockServer);
      handler = routes.get('POST:/transfer')!.handler;

      mockRequest = {
        id: 'req-transfer',
        method: 'POST',
        ip: '10.0.0.2',
        headers: {
          authorization: 'Bearer token-456',
          'idempotency-key': 'transfer-key-456',
        },
        user: {
          id: 'user-456',
          tenant_id: 'tenant-789',
        },
        body: {
          ticketId: 'ticket-123',
          toUserId: 'user-789',
        },
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        headers: jest.fn().mockReturnThis(),
      };
    });

    it('forwards transfer request to ticket service', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://ticket-service:3004/api/v1/tickets/transfer',
        })
      );
    });

    it('validates idempotency key before proxying', async () => {
      mockRequest.headers['idempotency-key'] = 'invalid key!';

      await handler(mockRequest, mockReply);

      expect(axiosMock).not.toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /types (no idempotency check)', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await ticketsRoutes(mockServer);
      handler = routes.get('POST:/types')!.handler;

      mockRequest = {
        id: 'req-types',
        method: 'POST',
        ip: '10.0.0.3',
        headers: {
          authorization: 'Bearer token-789',
        },
        user: {
          id: 'user-789',
          tenant_id: 'tenant-999',
        },
        body: {
          name: 'VIP Ticket',
          price: 10000,
        },
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        headers: jest.fn().mockReturnThis(),
      };
    });

    it('forwards to /types endpoint', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://ticket-service:3004/api/v1/tickets/types',
        })
      );
    });

    it('does not require idempotency key', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalled();
      expect(mockReply.code).not.toHaveBeenCalledWith(400);
    });
  });

  describe('POST /validate-qr (no idempotency check)', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await ticketsRoutes(mockServer);
      handler = routes.get('POST:/validate-qr')!.handler;

      mockRequest = {
        id: 'req-validate',
        method: 'POST',
        ip: '10.0.0.4',
        headers: {
          authorization: 'Bearer token-999',
        },
        user: {
          id: 'user-999',
          tenant_id: 'tenant-111',
        },
        body: {
          qrCode: 'QR123456',
        },
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        headers: jest.fn().mockReturnThis(),
      };
    });

    it('forwards to /validate-qr endpoint', async () => {
      await handler(mockRequest, mockReply);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://ticket-service:3004/api/v1/tickets/validate-qr',
        })
      );
    });
  });
});
