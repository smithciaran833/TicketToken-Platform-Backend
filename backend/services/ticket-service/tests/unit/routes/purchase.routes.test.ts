import { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../../src/controllers/purchaseController', () => ({
  purchaseController: {
    createOrder: jest.fn(),
  },
}));

jest.mock('../../../src/middleware/auth', () => ({
  authMiddleware: jest.fn((req, reply, done) => done()),
}));

jest.mock('../../../src/middleware/tenant', () => ({
  tenantMiddleware: jest.fn((req, reply, done) => done()),
}));

jest.mock('../../../src/middleware/idempotency.middleware', () => ({
  idempotencyMiddleware: {
    purchase: jest.fn((req: any, reply: any, done: any) => done()),
    reservation: jest.fn((req: any, reply: any, done: any) => done()),
  },
}));

jest.mock('../../../src/middleware/rate-limit', () => ({
  rateLimiters: {
    purchase: jest.fn((req: any, reply: any, done: any) => done()),
  },
  combinedRateLimiter: jest.fn(),
}));

jest.mock('../../../src/schemas', () => ({
  purchaseRequestSchema: { parse: jest.fn((data) => data) },
  confirmPurchaseSchema: { parse: jest.fn((data) => data) },
  validateRequest: jest.fn((schema, data) => data),
}));

jest.mock('../../../src/utils/errors', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(message: string, public details?: any) {
      super(message);
    }
  },
}));

import purchaseRoutes from '../../../src/routes/purchaseRoutes';

describe('Purchase Routes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let registeredRoutes: string[];

  beforeEach(() => {
    registeredRoutes = [];

    mockFastify = {
      post: jest.fn((path) => {
        registeredRoutes.push(`POST ${path}`);
      }),
      delete: jest.fn((path) => {
        registeredRoutes.push(`DELETE ${path}`);
      }),
    };
  });

  it('should register all purchase routes', async () => {
    await purchaseRoutes(mockFastify as FastifyInstance);

    expect(registeredRoutes).toContain('POST /');
    expect(registeredRoutes).toContain('POST /confirm');
    expect(registeredRoutes).toContain('DELETE /:reservationId');
  });

  it('should apply idempotency middleware to purchase route', async () => {
    await purchaseRoutes(mockFastify as FastifyInstance);

    expect(mockFastify.post).toHaveBeenCalledWith(
      '/',
      expect.objectContaining({
        preHandler: expect.arrayContaining([
          expect.any(Function), // rate limiter
          expect.any(Function), // auth
          expect.any(Function), // tenant
          expect.any(Function), // idempotency
        ]),
      }),
      expect.any(Function)
    );
  });

  it('should include schema validation in route config', async () => {
    await purchaseRoutes(mockFastify as FastifyInstance);

    expect(mockFastify.post).toHaveBeenCalledWith(
      '/',
      expect.objectContaining({
        schema: expect.objectContaining({
          body: expect.any(Object),
          response: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });
});
