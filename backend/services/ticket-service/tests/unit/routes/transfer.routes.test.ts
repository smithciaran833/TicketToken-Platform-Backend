import { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../../src/controllers/transferController', () => ({
  transferController: {
    transferTicket: jest.fn(),
    getTransferHistory: jest.fn(),
    validateTransfer: jest.fn(),
  },
}));

jest.mock('../../../src/utils/validation', () => ({
  validate: jest.fn(() => (req: any, reply: any, done: any) => done()),
  ticketSchemas: {
    transferTicket: {},
  },
}));

jest.mock('../../../src/middleware/auth', () => ({
  authMiddleware: jest.fn((req, reply, done) => done()),
}));

jest.mock('../../../src/middleware/tenant', () => ({
  tenantMiddleware: jest.fn((req, reply, done) => done()),
}));

jest.mock('../../../src/middleware/rate-limit', () => ({
  rateLimiters: {
    transfer: jest.fn((req: any, reply: any, done: any) => done()),
    read: jest.fn((req: any, reply: any, done: any) => done()),
  },
}));

import transferRoutes from '../../../src/routes/transferRoutes';

describe('Transfer Routes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let registeredRoutes: string[];

  beforeEach(() => {
    registeredRoutes = [];

    mockFastify = {
      get: jest.fn((path) => {
        registeredRoutes.push(`GET ${path}`);
      }),
      post: jest.fn((path) => {
        registeredRoutes.push(`POST ${path}`);
      }),
    };
  });

  it('should register all transfer routes', async () => {
    await transferRoutes(mockFastify as FastifyInstance);

    expect(registeredRoutes).toContain('POST /');
    expect(registeredRoutes).toContain('GET /:ticketId/history');
    expect(registeredRoutes).toContain('POST /validate');
  });

  it('should apply transfer rate limiter to POST /', async () => {
    const { rateLimiters } = require('../../../src/middleware/rate-limit');

    await transferRoutes(mockFastify as FastifyInstance);

    expect(mockFastify.post).toHaveBeenCalledWith(
      '/',
      expect.objectContaining({
        preHandler: expect.arrayContaining([rateLimiters.transfer]),
      }),
      expect.any(Function)
    );
  });

  it('should apply read rate limiter to history endpoint', async () => {
    const { rateLimiters } = require('../../../src/middleware/rate-limit');

    await transferRoutes(mockFastify as FastifyInstance);

    expect(mockFastify.get).toHaveBeenCalledWith(
      '/:ticketId/history',
      expect.objectContaining({
        preHandler: expect.arrayContaining([rateLimiters.read]),
      }),
      expect.any(Function)
    );
  });
});
