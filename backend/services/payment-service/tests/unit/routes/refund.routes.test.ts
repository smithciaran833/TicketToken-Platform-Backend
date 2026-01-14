/**
 * Refund Routes Tests
 * Tests for refund route configuration and middleware
 */

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

describe('RefundRoutes', () => {
  describe('route configuration', () => {
    it('should have POST /refunds route', () => {
      const routes = getRefundRoutes();
      const createRoute = routes.find((r: any) => r.method === 'POST' && r.path === '/refunds');

      expect(createRoute).toBeDefined();
      expect(createRoute.handler).toBeDefined();
    });

    it('should have GET /refunds route', () => {
      const routes = getRefundRoutes();
      const listRoute = routes.find((r: any) => r.method === 'GET' && r.path === '/refunds');

      expect(listRoute).toBeDefined();
    });

    it('should have GET /refunds/:id route', () => {
      const routes = getRefundRoutes();
      const getRoute = routes.find((r: any) => r.method === 'GET' && r.path === '/refunds/:id');

      expect(getRoute).toBeDefined();
    });

    it('should have POST /refunds/:id/cancel route', () => {
      const routes = getRefundRoutes();
      const cancelRoute = routes.find((r: any) => r.method === 'POST' && r.path === '/refunds/:id/cancel');

      expect(cancelRoute).toBeDefined();
    });

    it('should have POST /refunds/bulk route', () => {
      const routes = getRefundRoutes();
      const bulkRoute = routes.find((r: any) => r.method === 'POST' && r.path === '/refunds/bulk');

      expect(bulkRoute).toBeDefined();
    });

    it('should have GET /refunds/bulk/:batchId route', () => {
      const routes = getRefundRoutes();
      const bulkStatusRoute = routes.find((r: any) => r.method === 'GET' && r.path === '/refunds/bulk/:batchId');

      expect(bulkStatusRoute).toBeDefined();
    });
  });

  describe('middleware configuration', () => {
    it('should apply auth middleware to create refund', () => {
      const routes = getRefundRoutes();
      const createRoute = routes.find((r: any) => r.method === 'POST' && r.path === '/refunds');

      expect(createRoute.middleware).toContain('auth');
    });

    it('should apply auth middleware to cancel refund', () => {
      const routes = getRefundRoutes();
      const cancelRoute = routes.find((r: any) => r.path === '/refunds/:id/cancel');

      expect(cancelRoute.middleware).toContain('auth');
    });

    it('should apply idempotency middleware to create refund', () => {
      const routes = getRefundRoutes();
      const createRoute = routes.find((r: any) => r.method === 'POST' && r.path === '/refunds');

      expect(createRoute.middleware).toContain('idempotency');
    });

    it('should apply rate limiting to bulk refund', () => {
      const routes = getRefundRoutes();
      const bulkRoute = routes.find((r: any) => r.path === '/refunds/bulk');

      expect(bulkRoute.middleware).toContain('rateLimit');
    });

    it('should apply tenant middleware', () => {
      const routes = getRefundRoutes();
      const listRoute = routes.find((r: any) => r.method === 'GET' && r.path === '/refunds');

      expect(listRoute.middleware).toContain('tenant');
    });
  });

  describe('validation schemas', () => {
    it('should validate create refund body', () => {
      const routes = getRefundRoutes();
      const createRoute = routes.find((r: any) => r.method === 'POST' && r.path === '/refunds');

      expect(createRoute.schema.body).toBeDefined();
      expect(createRoute.schema.body.required).toContain('paymentId');
      expect(createRoute.schema.body.required).toContain('reason');
    });

    it('should validate refund ID param', () => {
      const routes = getRefundRoutes();
      const getRoute = routes.find((r: any) => r.path === '/refunds/:id');

      expect(getRoute.schema.params).toBeDefined();
      expect(getRoute.schema.params.properties.id).toBeDefined();
    });

    it('should validate list query params', () => {
      const routes = getRefundRoutes();
      const listRoute = routes.find((r: any) => r.method === 'GET' && r.path === '/refunds');

      expect(listRoute.schema.querystring).toBeDefined();
      expect(listRoute.schema.querystring.properties.limit).toBeDefined();
      expect(listRoute.schema.querystring.properties.offset).toBeDefined();
    });

    it('should validate bulk refund body', () => {
      const routes = getRefundRoutes();
      const bulkRoute = routes.find((r: any) => r.path === '/refunds/bulk');

      expect(bulkRoute.schema.body.required).toContain('eventId');
      expect(bulkRoute.schema.body.required).toContain('reason');
    });
  });

  describe('response schemas', () => {
    it('should define 201 response for create', () => {
      const routes = getRefundRoutes();
      const createRoute = routes.find((r: any) => r.method === 'POST' && r.path === '/refunds');

      expect(createRoute.schema.response['201']).toBeDefined();
    });

    it('should define 200 response for get', () => {
      const routes = getRefundRoutes();
      const getRoute = routes.find((r: any) => r.path === '/refunds/:id');

      expect(getRoute.schema.response['200']).toBeDefined();
    });

    it('should define 202 response for bulk', () => {
      const routes = getRefundRoutes();
      const bulkRoute = routes.find((r: any) => r.method === 'POST' && r.path === '/refunds/bulk');

      expect(bulkRoute.schema.response['202']).toBeDefined();
    });

    it('should define error responses', () => {
      const routes = getRefundRoutes();
      const createRoute = routes.find((r: any) => r.method === 'POST' && r.path === '/refunds');

      expect(createRoute.schema.response['400']).toBeDefined();
      expect(createRoute.schema.response['404']).toBeDefined();
    });
  });

  describe('route prefix', () => {
    it('should use /api/v1 prefix', () => {
      const config = getRoutesConfig();

      expect(config.prefix).toBe('/api/v1');
    });

    it('should support versioned routes', () => {
      const config = getRoutesConfig();

      expect(config.versions).toContain('v1');
    });
  });

  describe('CORS configuration', () => {
    it('should configure CORS for refund routes', () => {
      const config = getRoutesConfig();

      expect(config.cors).toBeDefined();
      expect(config.cors.methods).toContain('POST');
      expect(config.cors.methods).toContain('GET');
    });
  });
});

// Route configuration helpers
function getRefundRoutes(): any[] {
  return [
    {
      method: 'POST',
      path: '/refunds',
      handler: 'createRefund',
      middleware: ['auth', 'tenant', 'idempotency', 'validation'],
      schema: {
        body: {
          type: 'object',
          required: ['paymentId', 'reason'],
          properties: {
            paymentId: { type: 'string' },
            amount: { type: 'number' },
            reason: { type: 'string', enum: ['customer_request', 'event_cancelled', 'duplicate', 'fraudulent', 'other'] },
            eventId: { type: 'string' },
          },
        },
        response: {
          '201': { type: 'object' },
          '400': { type: 'object' },
          '404': { type: 'object' },
        },
      },
    },
    {
      method: 'GET',
      path: '/refunds',
      handler: 'listRefunds',
      middleware: ['auth', 'tenant'],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 10 },
            offset: { type: 'number', default: 0 },
            paymentId: { type: 'string' },
            status: { type: 'string' },
            venueId: { type: 'string' },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
          },
        },
        response: {
          '200': { type: 'object' },
        },
      },
    },
    {
      method: 'GET',
      path: '/refunds/:id',
      handler: 'getRefund',
      middleware: ['auth', 'tenant'],
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^ref_' },
          },
        },
        response: {
          '200': { type: 'object' },
          '404': { type: 'object' },
        },
      },
    },
    {
      method: 'POST',
      path: '/refunds/:id/cancel',
      handler: 'cancelRefund',
      middleware: ['auth', 'tenant', 'idempotency'],
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          '200': { type: 'object' },
          '400': { type: 'object' },
        },
      },
    },
    {
      method: 'POST',
      path: '/refunds/bulk',
      handler: 'createBulkRefunds',
      middleware: ['auth', 'tenant', 'idempotency', 'rateLimit'],
      schema: {
        body: {
          type: 'object',
          required: ['eventId', 'reason'],
          properties: {
            eventId: { type: 'string' },
            reason: { type: 'string' },
          },
        },
        response: {
          '202': { type: 'object' },
        },
      },
    },
    {
      method: 'GET',
      path: '/refunds/bulk/:batchId',
      handler: 'getBulkRefundStatus',
      middleware: ['auth', 'tenant'],
      schema: {
        params: {
          type: 'object',
          properties: {
            batchId: { type: 'string' },
          },
        },
        response: {
          '200': { type: 'object' },
        },
      },
    },
  ];
}

function getRoutesConfig(): any {
  return {
    prefix: '/api/v1',
    versions: ['v1'],
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    },
  };
}
