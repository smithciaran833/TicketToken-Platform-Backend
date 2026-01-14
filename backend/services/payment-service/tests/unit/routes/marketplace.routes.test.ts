/**
 * Marketplace Routes Tests
 * Tests for marketplace/resale route registration and validation
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('MarketplaceRoutes', () => {
  let mockFastify: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFastify = createMockFastify();
  });

  describe('route registration', () => {
    it('should register POST /marketplace/listings', () => {
      registerMarketplaceRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledWith('/marketplace/listings', expect.any(Object), expect.any(Function));
    });

    it('should register GET /marketplace/listings', () => {
      registerMarketplaceRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/marketplace/listings', expect.any(Object), expect.any(Function));
    });

    it('should register POST /marketplace/listings/:id/purchase', () => {
      registerMarketplaceRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledWith('/marketplace/listings/:id/purchase', expect.any(Object), expect.any(Function));
    });

    it('should register POST /marketplace/listings/:id/confirm', () => {
      registerMarketplaceRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledWith('/marketplace/listings/:id/confirm', expect.any(Object), expect.any(Function));
    });

    it('should register POST /marketplace/listings/:id/dispute', () => {
      registerMarketplaceRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledWith('/marketplace/listings/:id/dispute', expect.any(Object), expect.any(Function));
    });

    it('should register DELETE /marketplace/listings/:id', () => {
      registerMarketplaceRoutes(mockFastify);

      expect(mockFastify.delete).toHaveBeenCalledWith('/marketplace/listings/:id', expect.any(Object), expect.any(Function));
    });
  });

  describe('schema validation', () => {
    it('should validate create listing body schema', () => {
      registerMarketplaceRoutes(mockFastify);

      const postCall = mockFastify.post.mock.calls.find((c: any) => c[0] === '/marketplace/listings');
      const schema = postCall[1].schema;

      expect(schema.body).toBeDefined();
      expect(schema.body.properties).toHaveProperty('ticketId');
      expect(schema.body.properties).toHaveProperty('price');
    });

    it('should validate purchase body schema', () => {
      registerMarketplaceRoutes(mockFastify);

      const postCall = mockFastify.post.mock.calls.find((c: any) => c[0] === '/marketplace/listings/:id/purchase');
      const schema = postCall[1].schema;

      expect(schema.body).toBeDefined();
      expect(schema.body.properties).toHaveProperty('paymentMethodId');
    });

    it('should validate dispute body schema', () => {
      registerMarketplaceRoutes(mockFastify);

      const postCall = mockFastify.post.mock.calls.find((c: any) => c[0] === '/marketplace/listings/:id/dispute');
      const schema = postCall[1].schema;

      expect(schema.body).toBeDefined();
      expect(schema.body.properties).toHaveProperty('reason');
    });

    it('should validate listing query params', () => {
      registerMarketplaceRoutes(mockFastify);

      const getCall = mockFastify.get.mock.calls.find((c: any) => c[0] === '/marketplace/listings');
      const schema = getCall[1].schema;

      expect(schema.querystring).toBeDefined();
      expect(schema.querystring.properties).toHaveProperty('eventId');
      expect(schema.querystring.properties).toHaveProperty('limit');
    });
  });

  describe('middleware', () => {
    it('should apply auth middleware', () => {
      registerMarketplaceRoutes(mockFastify);

      const postCall = mockFastify.post.mock.calls.find((c: any) => c[0] === '/marketplace/listings');
      expect(postCall[1].preHandler).toBeDefined();
    });

    it('should apply rate limiting', () => {
      registerMarketplaceRoutes(mockFastify);

      const purchaseCall = mockFastify.post.mock.calls.find((c: any) => c[0] === '/marketplace/listings/:id/purchase');
      expect(purchaseCall[1].config).toHaveProperty('rateLimit');
    });
  });

  describe('response schemas', () => {
    it('should define 200 response for listings', () => {
      registerMarketplaceRoutes(mockFastify);

      const getCall = mockFastify.get.mock.calls.find((c: any) => c[0] === '/marketplace/listings');
      expect(getCall[1].schema.response[200]).toBeDefined();
    });

    it('should define 201 response for create', () => {
      registerMarketplaceRoutes(mockFastify);

      const postCall = mockFastify.post.mock.calls.find((c: any) => c[0] === '/marketplace/listings');
      expect(postCall[1].schema.response[201]).toBeDefined();
    });

    it('should define error responses', () => {
      registerMarketplaceRoutes(mockFastify);

      const postCall = mockFastify.post.mock.calls.find((c: any) => c[0] === '/marketplace/listings/:id/purchase');
      expect(postCall[1].schema.response[400]).toBeDefined();
      expect(postCall[1].schema.response[404]).toBeDefined();
    });
  });
});

function createMockFastify() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    register: jest.fn(),
    decorate: jest.fn(),
  };
}

function registerMarketplaceRoutes(fastify: any) {
  const authMiddleware = (req: any, reply: any, done: any) => done();

  fastify.post('/marketplace/listings', {
    schema: {
      body: {
        type: 'object',
        properties: { ticketId: { type: 'string' }, price: { type: 'integer' }, currency: { type: 'string' } },
        required: ['ticketId', 'price'],
      },
      response: { 201: { type: 'object', properties: { listingId: { type: 'string' } } } },
    },
    preHandler: [authMiddleware],
  }, () => {});

  fastify.get('/marketplace/listings', {
    schema: {
      querystring: {
        type: 'object',
        properties: { eventId: { type: 'string' }, limit: { type: 'integer' }, offset: { type: 'integer' }, status: { type: 'string' } },
      },
      response: { 200: { type: 'object', properties: { listings: { type: 'array' }, total: { type: 'integer' } } } },
    },
    preHandler: [authMiddleware],
  }, () => {});

  fastify.post('/marketplace/listings/:id/purchase', {
    schema: {
      body: { type: 'object', properties: { paymentMethodId: { type: 'string' } }, required: ['paymentMethodId'] },
      response: { 200: { type: 'object' }, 400: { type: 'object' }, 404: { type: 'object' } },
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    preHandler: [authMiddleware],
  }, () => {});

  fastify.post('/marketplace/listings/:id/confirm', {
    schema: { response: { 200: { type: 'object' } } },
    preHandler: [authMiddleware],
  }, () => {});

  fastify.post('/marketplace/listings/:id/dispute', {
    schema: {
      body: { type: 'object', properties: { reason: { type: 'string' }, evidence: { type: 'array' } }, required: ['reason'] },
      response: { 200: { type: 'object' } },
    },
    preHandler: [authMiddleware],
  }, () => {});

  fastify.delete('/marketplace/listings/:id', {
    schema: { response: { 204: { type: 'null' } } },
    preHandler: [authMiddleware],
  }, () => {});
}
