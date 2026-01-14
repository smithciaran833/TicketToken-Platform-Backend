/**
 * Unit Tests for Transfers Routes
 * Tests transfer initiation and status endpoints
 */

import Fastify, { FastifyInstance } from 'fastify';
import transfersRoutes from '../../../src/routes/transfers.routes';

// Mock dependencies
jest.mock('../../../src/controllers/transfer.controller', () => ({
  transferController: {
    initiateTransfer: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ transferId: 'transfer-123', status: 'initiated' })
    ),
    getTransfer: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ id: req.params.id, status: 'completed' })
    ),
    getMyTransfers: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ transfers: [], total: 0 })
    ),
    cancelTransfer: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ cancelled: true })
    ),
  },
}));

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: jest.fn((req: any, reply: any, done: any) => {
    req.user = { id: 'user-123' };
    done();
  }),
}));

jest.mock('../../../src/middleware/wallet.middleware', () => ({
  walletMiddleware: jest.fn((req: any, reply: any, done: any) => done()),
}));

jest.mock('../../../src/middleware/idempotency', () => ({
  idempotencyMiddleware: jest.fn((req: any, reply: any, done: any) => done()),
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

describe('Transfers Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await fastify.register(transfersRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /', () => {
    it('should initiate transfer with auth and idempotency', async () => {
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');

      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: {
          listingId: '550e8400-e29b-41d4-a716-446655440000',
          paymentMethod: 'crypto',
        },
        headers: {
          'idempotency-key': 'unique-key-123',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(authMiddleware).toHaveBeenCalled();
    });
  });

  describe('GET /:id', () => {
    it('should get transfer by ID', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('status');
    });
  });

  describe('GET /my-transfers', () => {
    it('should get user transfers with auth', async () => {
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');

      const response = await fastify.inject({
        method: 'GET',
        url: '/my-transfers',
      });

      expect(response.statusCode).toBe(200);
      expect(authMiddleware).toHaveBeenCalled();
    });

    it('should support pagination and filters', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/my-transfers?page=1&limit=20&status=completed',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('DELETE /:id', () => {
    it('should cancel pending transfer', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.cancelled).toBe(true);
    });
  });
});
