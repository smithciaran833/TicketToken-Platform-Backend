/**
 * Unit Tests for Search Routes
 * Tests search functionality and query parameter handling
 */

import Fastify, { FastifyInstance } from 'fastify';
import searchRoutes from '../../../src/routes/search.routes';

// Mock dependencies
jest.mock('../../../src/controllers/search.controller', () => ({
  searchController: {
    searchListings: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ listings: [], total: 0, page: 1, limit: 20 })
    ),
    getPriceRange: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ min: 1000, max: 50000 })
    ),
    getCategories: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ categories: ['concerts', 'sports'] })
    ),
    getRecommended: jest.fn().mockImplementation(async (req: any, reply: any) => 
      reply.send({ listings: [] })
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
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('Search Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await fastify.register(searchRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /', () => {
    it('should search listings with default parameters', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('listings');
      expect(body).toHaveProperty('total');
    });

    it('should search with query parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/?q=concert',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should search with event filter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/?eventId=550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should search with venue filter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/?venueId=550e8400-e29b-41d4-a716-446655440001',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should search with price range', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/?minPrice=1000&maxPrice=5000',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should search with pagination', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/?page=2&limit=50',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should search with sort options', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/?sortBy=price&sortOrder=asc',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /price-range', () => {
    it('should return price range for event', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/price-range?eventId=550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('min');
      expect(body).toHaveProperty('max');
    });
  });

  describe('GET /categories', () => {
    it('should return available categories', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/categories',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('categories');
    });
  });

  describe('GET /recommended', () => {
    it('should return recommended listings for authenticated user', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/recommended',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('listings');
    });
  });
});
