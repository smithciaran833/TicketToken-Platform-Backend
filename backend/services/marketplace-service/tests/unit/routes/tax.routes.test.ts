/**
 * Unit Tests for Tax Routes
 */

import Fastify, { FastifyInstance } from 'fastify';
import taxRoutes from '../../../src/routes/tax.routes';

jest.mock('../../../src/controllers/tax.controller', () => ({
  taxController: {
    getUserTaxSummary: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ summary: {} })),
    downloadTaxReport: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send('CSV data')),
    getTransactionHistory: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ transactions: [] })),
  },
}));

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: jest.fn((req: any, reply: any, done: any) => { req.user = { id: 'user-123' }; done(); }),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), child: jest.fn().mockReturnThis() },
}));

describe('Tax Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await fastify.register(taxRoutes);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  describe('GET /summary', () => {
    it('should get tax summary', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/summary?year=2026' });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /report', () => {
    it('should download tax report', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/report?year=2026&format=csv' });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /transactions', () => {
    it('should get transaction history for tax', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/transactions?year=2026' });
      expect(response.statusCode).toBe(200);
    });
  });
});
