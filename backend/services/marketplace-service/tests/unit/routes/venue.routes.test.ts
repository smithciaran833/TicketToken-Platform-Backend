/**
 * Unit Tests for Venue Routes
 */

import Fastify, { FastifyInstance } from 'fastify';
import venueRoutes from '../../../src/routes/venue.routes';

jest.mock('../../../src/controllers/venue-settings.controller', () => ({
  venueSettingsController: {
    getVenueSettings: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ settings: {} })),
    updateVenueSettings: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ updated: true })),
    getVenueListings: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ listings: [] })),
    getVenueStats: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ stats: {} })),
  },
}));

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: jest.fn((req: any, reply: any, done: any) => { req.user = { id: 'user-123' }; done(); }),
  requireVenueOwner: jest.fn((req: any, reply: any, done: any) => done()),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), child: jest.fn().mockReturnThis() },
}));

describe('Venue Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await fastify.register(venueRoutes);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  describe('GET /:venueId/settings', () => {
    it('should get venue settings', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/550e8400-e29b-41d4-a716-446655440000/settings' });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('PUT /:venueId/settings', () => {
    it('should update venue settings', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/550e8400-e29b-41d4-a716-446655440000/settings',
        payload: { maxMarkupPercentage: 200 },
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /:venueId/listings', () => {
    it('should get venue listings', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/550e8400-e29b-41d4-a716-446655440000/listings' });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /:venueId/stats', () => {
    it('should get venue stats', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/550e8400-e29b-41d4-a716-446655440000/stats' });
      expect(response.statusCode).toBe(200);
    });
  });
});
