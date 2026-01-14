/**
 * Unit Tests for Disputes Routes
 */

import Fastify, { FastifyInstance } from 'fastify';
import disputesRoutes from '../../../src/routes/disputes.routes';

jest.mock('../../../src/controllers/dispute.controller', () => ({
  disputeController: {
    createDispute: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ id: 'dispute-123' })
    ),
    getDispute: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ id: req.params.id })
    ),
    getMyDisputes: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ disputes: [] })
    ),
    addEvidence: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ added: true })
    ),
  },
}));

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: jest.fn((req: any, reply: any, done: any) => {
    req.user = { id: 'user-123' };
    done();
  }),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), child: jest.fn().mockReturnThis() },
}));

describe('Disputes Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await fastify.register(disputesRoutes);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  describe('POST /', () => {
    it('should create dispute', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: { transferId: '550e8400-e29b-41d4-a716-446655440000', reason: 'Item not received' },
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /:id', () => {
    it('should get dispute by ID', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/550e8400-e29b-41d4-a716-446655440000' });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /my-disputes', () => {
    it('should get user disputes', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/my-disputes' });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /:id/evidence', () => {
    it('should add evidence to dispute', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/550e8400-e29b-41d4-a716-446655440000/evidence',
        payload: { type: 'screenshot', data: 'base64data' },
      });
      expect(response.statusCode).toBe(200);
    });
  });
});
