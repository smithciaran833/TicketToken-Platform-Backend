/**
 * Unit Tests for Listings Routes
 * Tests route registration, middleware, and schema validation
 */

import Fastify, { FastifyInstance } from 'fastify';
import listingsRoutes from '../../../src/routes/listings.routes';

// Mock all dependencies
jest.mock('../../../src/controllers/listing.controller', () => ({
  listingController: {
    getListing: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ id: req.params.id })),
    getMyListings: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ listings: [] })),
    createListing: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ id: 'new-listing' })),
    updateListingPrice: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ updated: true })),
    cancelListing: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ cancelled: true })),
  },
}));

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: jest.fn((req: any, reply: any, done: any) => {
    req.user = { id: 'user-123' };
    done();
  }),
  verifyListingOwnership: jest.fn((req: any, reply: any, done: any) => done()),
}));

jest.mock('../../../src/middleware/wallet.middleware', () => ({
  walletMiddleware: jest.fn((req: any, reply: any, done: any) => done()),
}));

jest.mock('../../../src/middleware/validation.middleware', () => ({
  validate: jest.fn(() => (req: any, reply: any, done: any) => done()),
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

describe('Listings Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await fastify.register(listingsRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /:id', () => {
    it('should get listing by ID with valid UUID', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should reject invalid UUID format', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/invalid-uuid',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /my-listings', () => {
    it('should get user listings with auth middleware', async () => {
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      
      const response = await fastify.inject({
        method: 'GET',
        url: '/my-listings',
      });

      expect(response.statusCode).toBe(200);
      expect(authMiddleware).toHaveBeenCalled();
    });

    it('should accept pagination query params', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/my-listings?page=1&limit=20&status=active',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid limit value', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/my-listings?limit=500',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /', () => {
    it('should create listing with all middleware', async () => {
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      const { walletMiddleware } = require('../../../src/middleware/wallet.middleware');

      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: {
          ticketId: '550e8400-e29b-41d4-a716-446655440001',
          eventId: '550e8400-e29b-41d4-a716-446655440002',
          venueId: '550e8400-e29b-41d4-a716-446655440003',
          price: 5000,
          originalFaceValue: 4000,
          eventStartTime: '2026-06-15T19:00:00Z',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(authMiddleware).toHaveBeenCalled();
      expect(walletMiddleware).toHaveBeenCalled();
    });
  });

  describe('PUT /:id/price', () => {
    it('should update price with ownership verification', async () => {
      const { verifyListingOwnership } = require('../../../src/middleware/auth.middleware');

      const response = await fastify.inject({
        method: 'PUT',
        url: '/550e8400-e29b-41d4-a716-446655440000/price',
        payload: { price: 6000 },
      });

      expect(response.statusCode).toBe(200);
      expect(verifyListingOwnership).toHaveBeenCalled();
    });

    it('should reject price below minimum', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/550e8400-e29b-41d4-a716-446655440000/price',
        payload: { price: 50 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject price above maximum', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/550e8400-e29b-41d4-a716-446655440000/price',
        payload: { price: 100000001 },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /:id', () => {
    it('should cancel listing with ownership verification', async () => {
      const { verifyListingOwnership } = require('../../../src/middleware/auth.middleware');

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(200);
      expect(verifyListingOwnership).toHaveBeenCalled();
    });
  });
});
