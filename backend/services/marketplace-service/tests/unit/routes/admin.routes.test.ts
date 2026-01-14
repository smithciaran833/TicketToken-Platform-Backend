/**
 * Unit Tests for Admin Routes
 * Tests admin-only functionality
 */

import Fastify, { FastifyInstance } from 'fastify';
import adminRoutes from '../../../src/routes/admin.routes';

// Mock dependencies
jest.mock('../../../src/controllers/admin.controller', () => ({
  adminController: {
    getStats: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ totalListings: 100, totalSales: 50 })
    ),
    getUsers: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ users: [] })
    ),
    flagUser: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ flagged: true })
    ),
    resolveDispute: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ resolved: true })
    ),
    getPendingListings: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ listings: [] })
    ),
    approveListing: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ approved: true })
    ),
    getAuditLog: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ logs: [] })
    ),
  },
}));

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: jest.fn((req: any, reply: any, done: any) => {
    req.user = { id: 'admin-123', roles: ['admin'] };
    done();
  }),
  requireAdmin: jest.fn((req: any, reply: any, done: any) => done()),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('Admin Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await fastify.register(adminRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /stats', () => {
    it('should return marketplace stats for admin', async () => {
      const { requireAdmin } = require('../../../src/middleware/auth.middleware');

      const response = await fastify.inject({
        method: 'GET',
        url: '/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('totalListings');
    });
  });

  describe('GET /users', () => {
    it('should return user list for admin', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/users',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /users/:id/flag', () => {
    it('should flag user', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/users/550e8400-e29b-41d4-a716-446655440000/flag',
        payload: { reason: 'suspicious activity' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /listings/pending', () => {
    it('should return pending listings', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/listings/pending',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /listings/:id/approve', () => {
    it('should approve listing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/listings/550e8400-e29b-41d4-a716-446655440000/approve',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /audit-log', () => {
    it('should return audit log', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/audit-log',
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
