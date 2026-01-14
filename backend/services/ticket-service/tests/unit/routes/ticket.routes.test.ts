import { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../../src/controllers/ticketController', () => ({
  ticketController: {
    createTicketType: jest.fn(),
    getTicketTypes: jest.fn(),
    createReservation: jest.fn(),
    confirmPurchase: jest.fn(),
    releaseReservation: jest.fn(),
    generateQR: jest.fn(),
    validateQR: jest.fn(),
    getUserTickets: jest.fn(),
    getTicketType: jest.fn(),
    updateTicketType: jest.fn(),
    getTicketById: jest.fn(),
    getCurrentUserTickets: jest.fn(),
  },
}));

jest.mock('../../../src/utils/validation', () => ({
  validate: jest.fn(() => (req: any, reply: any, done: any) => done()),
  ticketSchemas: {
    createTicketType: {},
    purchaseTickets: {},
  },
}));

jest.mock('../../../src/middleware/auth', () => ({
  authMiddleware: jest.fn((req, reply, done) => done()),
  requireRole: jest.fn(() => (req: any, reply: any, done: any) => done()),
}));

jest.mock('../../../src/middleware/tenant', () => ({
  tenantMiddleware: jest.fn((req, reply, done) => done()),
}));

jest.mock('../../../src/middleware/rate-limit', () => ({
  rateLimiters: {
    read: jest.fn((req: any, reply: any, done: any) => done()),
    write: jest.fn((req: any, reply: any, done: any) => done()),
    purchase: jest.fn((req: any, reply: any, done: any) => done()),
    qrScan: jest.fn((req: any, reply: any, done: any) => done()),
  },
}));

import ticketRoutes from '../../../src/routes/ticketRoutes';

describe('Ticket Routes', () => {
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
      put: jest.fn((path) => {
        registeredRoutes.push(`PUT ${path}`);
      }),
      delete: jest.fn((path) => {
        registeredRoutes.push(`DELETE ${path}`);
      }),
    };
  });

  it('should register all ticket routes', async () => {
    await ticketRoutes(mockFastify as FastifyInstance);

    expect(registeredRoutes).toContain('POST /types');
    expect(registeredRoutes).toContain('GET /events/:eventId/types');
    expect(registeredRoutes).toContain('POST /purchase');
    expect(registeredRoutes).toContain('POST /reservations/:reservationId/confirm');
    expect(registeredRoutes).toContain('DELETE /reservations/:reservationId');
    expect(registeredRoutes).toContain('GET /:ticketId/qr');
    expect(registeredRoutes).toContain('POST /validate-qr');
    expect(registeredRoutes).toContain('GET /users/:userId');
    expect(registeredRoutes).toContain('GET /types/:id');
    expect(registeredRoutes).toContain('PUT /types/:id');
    expect(registeredRoutes).toContain('GET /:ticketId');
    expect(registeredRoutes).toContain('GET /');
  });

  it('should apply auth middleware to protected routes', async () => {
    await ticketRoutes(mockFastify as FastifyInstance);

    // POST /types should have auth and role middleware
    expect(mockFastify.post).toHaveBeenCalledWith(
      '/types',
      expect.objectContaining({
        preHandler: expect.arrayContaining([
          expect.any(Function), // rate limiter
          expect.any(Function), // auth
          expect.any(Function), // requireRole
        ]),
      }),
      expect.any(Function)
    );
  });

  it('should apply tenant middleware to public routes', async () => {
    await ticketRoutes(mockFastify as FastifyInstance);

    // GET /events/:eventId/types should have tenant middleware
    expect(mockFastify.get).toHaveBeenCalledWith(
      '/events/:eventId/types',
      expect.objectContaining({
        preHandler: expect.arrayContaining([
          expect.any(Function), // rate limiter
          expect.any(Function), // tenant
        ]),
      }),
      expect.any(Function)
    );
  });
});
