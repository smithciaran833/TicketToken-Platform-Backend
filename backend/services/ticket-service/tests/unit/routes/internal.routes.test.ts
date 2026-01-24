import { FastifyInstance } from 'fastify';

// Mock the internal auth middleware BEFORE any imports that use it
jest.mock('../../../src/middleware/internal-auth.middleware', () => ({
  internalAuthMiddlewareNew: jest.fn((req, reply) => Promise.resolve()),
}));

// Mock dependencies
jest.mock('../../../src/services/ticketService', () => ({
  TicketService: jest.fn().mockImplementation(() => ({
    getTicket: jest.fn(),
  })),
}));

const mockQuery = jest.fn();
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: mockQuery,
  },
}));

jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    del: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

jest.mock('../../../src/utils/tenant-db', () => ({
  setTenantContext: jest.fn().mockResolvedValue(undefined),
}));

import internalRoutes from '../../../src/routes/internalRoutes';

describe('Internal Routes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let routes: Record<string, { handler: Function; preHandler?: Function[] }>;

  beforeEach(() => {
    jest.clearAllMocks();
    routes = {};

    mockFastify = {
      get: jest.fn((path, opts, handler) => {
        routes[`GET ${path}`] = { handler, preHandler: opts?.preHandler };
      }),
      post: jest.fn((path, opts, handler) => {
        routes[`POST ${path}`] = { handler, preHandler: opts?.preHandler };
      }),
    };
  });

  it('should register all internal routes', async () => {
    await internalRoutes(mockFastify as FastifyInstance);

    expect(mockFastify.get).toHaveBeenCalledWith(
      '/internal/tickets/:ticketId/status',
      expect.any(Object),
      expect.any(Function)
    );
    expect(mockFastify.post).toHaveBeenCalledWith(
      '/internal/tickets/cancel-batch',
      expect.any(Object),
      expect.any(Function)
    );
    expect(mockFastify.post).toHaveBeenCalledWith(
      '/internal/tickets/calculate-price',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should apply verifyInternalService preHandler to all routes', async () => {
    await internalRoutes(mockFastify as FastifyInstance);

    // All routes should have preHandler
    expect(routes['GET /internal/tickets/:ticketId/status'].preHandler).toBeDefined();
    expect(routes['POST /internal/tickets/cancel-batch'].preHandler).toBeDefined();
    expect(routes['POST /internal/tickets/calculate-price'].preHandler).toBeDefined();
  });

  describe('GET /internal/tickets/:ticketId/status', () => {
    it('should return 400 for missing ticket ID', async () => {
      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = { params: {} };

      await routes['GET /internal/tickets/:ticketId/status'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Ticket ID required' });
    });
  });

  describe('POST /internal/tickets/cancel-batch', () => {
    it('should cancel tickets in batch', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = {
        body: {
          ticketIds: ['ticket-1', 'ticket-2'],
          reason: 'Refund',
          refundId: 'refund-123',
        },
        headers: { 'x-internal-service': 'payment-service' },
      };

      await routes['POST /internal/tickets/cancel-batch'].handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          results: expect.any(Array),
        })
      );
    });

    it('should return 400 for missing ticket IDs', async () => {
      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = { body: {}, headers: {} };

      await routes['POST /internal/tickets/cancel-batch'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for empty ticket IDs array', async () => {
      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = { body: { ticketIds: [] }, headers: {} };

      await routes['POST /internal/tickets/cancel-batch'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /internal/tickets/calculate-price', () => {
    it('should calculate ticket prices', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: 'ticket-1', price_cents: 5000, name: 'VIP' },
          { id: 'ticket-2', price_cents: 3000, name: 'GA' },
        ],
      });

      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = {
        body: { ticketIds: ['ticket-1', 'ticket-2'] },
        headers: { 'x-internal-service': 'payment-service' },
      };

      await routes['POST /internal/tickets/calculate-price'].handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          totalCents: 8000,
          ticketCount: 2,
        })
      );
    });

    it('should return 404 for missing tickets', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'ticket-1', price_cents: 5000, name: 'VIP' }],
      });

      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = {
        body: { ticketIds: ['ticket-1', 'ticket-missing'] },
        headers: {},
      };

      await routes['POST /internal/tickets/calculate-price'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Some tickets not found',
          missingIds: ['ticket-missing'],
        })
      );
    });

    it('should return 400 for missing ticket IDs', async () => {
      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = { body: {}, headers: {} };

      await routes['POST /internal/tickets/calculate-price'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = {
        body: { ticketIds: ['ticket-1'] },
        headers: {},
      };

      await routes['POST /internal/tickets/calculate-price'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /internal/tickets/user/:userId', () => {
    it('should return tickets for a user', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'ticket-1',
              event_id: 'event-1',
              ticket_type_id: 'type-1',
              user_id: 'user-123',
              status: 'active',
              ticket_number: 'TKT-001',
              seat_section: 'A',
              seat_row: '1',
              seat_number: '10',
              is_transferable: true,
              transfer_count: 0,
              token_id: null,
              purchased_at: '2024-01-01T00:00:00Z',
              event_name: 'Test Event',
              event_starts_at: '2024-02-01T00:00:00Z',
              ticket_type_name: 'VIP',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '1' }],
        });

      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = {
        params: { userId: 'user-123' },
        query: {},
        headers: {
          'x-internal-service': 'event-service',
          'x-tenant-id': 'tenant-1',
        },
      };

      await routes['GET /internal/tickets/user/:userId'].handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tickets: expect.arrayContaining([
            expect.objectContaining({
              id: 'ticket-1',
              userId: 'user-123',
              status: 'active',
            }),
          ]),
          count: 1,
          totalCount: 1,
        })
      );
    });

    it('should return 400 for missing user ID', async () => {
      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = {
        params: {},
        query: {},
        headers: {},
      };

      await routes['GET /internal/tickets/user/:userId'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'User ID required' });
    });

    it('should filter by status when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = {
        params: { userId: 'user-123' },
        query: { status: 'active' },
        headers: { 'x-tenant-id': 'tenant-1' },
      };

      await routes['GET /internal/tickets/user/:userId'].handler(mockRequest, mockReply);

      // Verify that query was called with status filter
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND t.status = $'),
        expect.arrayContaining(['user-123', 'tenant-1', 'active'])
      );
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await internalRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const mockRequest = {
        params: { userId: 'user-123' },
        query: {},
        headers: {},
      };

      await routes['GET /internal/tickets/user/:userId'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get tickets' });
    });
  });
});
