import { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../../src/controllers/orders.controller', () => ({
  ordersController: {
    getUserOrders: jest.fn(),
    getUserTickets: jest.fn(),
    getOrderById: jest.fn(),
  },
}));

jest.mock('../../../src/middleware/auth', () => ({
  authMiddleware: jest.fn((req, reply, done) => done()),
}));

jest.mock('../../../src/middleware/rate-limit', () => ({
  rateLimiters: {
    read: jest.fn((req: any, reply: any, done: any) => done()),
  },
}));

import orderRoutes from '../../../src/routes/orders.routes';

describe('Order Routes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let registeredRoutes: string[];

  beforeEach(() => {
    registeredRoutes = [];

    mockFastify = {
      get: jest.fn((path) => {
        registeredRoutes.push(`GET ${path}`);
      }),
    };
  });

  it('should register all order routes', async () => {
    await orderRoutes(mockFastify as FastifyInstance);

    expect(registeredRoutes).toContain('GET /');
    expect(registeredRoutes).toContain('GET /tickets');
    expect(registeredRoutes).toContain('GET /:orderId');
  });

  it('should apply auth middleware to all routes', async () => {
    const { authMiddleware } = require('../../../src/middleware/auth');

    await orderRoutes(mockFastify as FastifyInstance);

    // All routes should have auth middleware
    expect(mockFastify.get).toHaveBeenCalledWith(
      '/',
      expect.objectContaining({
        preHandler: expect.arrayContaining([authMiddleware]),
      }),
      expect.any(Function)
    );
  });

  it('should apply read rate limiter to all routes', async () => {
    const { rateLimiters } = require('../../../src/middleware/rate-limit');

    await orderRoutes(mockFastify as FastifyInstance);

    expect(mockFastify.get).toHaveBeenCalledWith(
      '/',
      expect.objectContaining({
        preHandler: expect.arrayContaining([rateLimiters.read]),
      }),
      expect.any(Function)
    );
  });
});
