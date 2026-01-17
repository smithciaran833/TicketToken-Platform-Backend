/**
 * Index Routes Unit Tests
 */

import Fastify, { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock cache integration
const mockGetStats = jest.fn(() => ({
  hits: 100,
  misses: 10,
  size: 50,
}));

const mockFlush = jest.fn(async () => {});

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {
    getStats: mockGetStats,
    flush: mockFlush,
  },
}));

// Mock analytics routes
jest.mock('../../../src/routes/analytics.routes', () => {
  return async (app: FastifyInstance) => {
    app.get('/test', async (req, reply) => {
      return reply.send({ test: true });
    });
  };
});

import routes from '../../../src/routes/index';

describe('Index Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(routes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Analytics Routes Mount', () => {
    it('should mount analytics routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.test).toBe(true);
    });
  });

  describe('GET /cache/stats', () => {
    it('should return cache statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/cache/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.hits).toBe(100);
      expect(body.misses).toBe(10);
      expect(body.size).toBe(50);
      expect(mockGetStats).toHaveBeenCalled();
    });
  });

  describe('DELETE /cache/flush', () => {
    it('should flush cache', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/cache/flush',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Cache flushed');
      expect(mockFlush).toHaveBeenCalled();
    });

    it('should call flush method', async () => {
      await app.inject({
        method: 'DELETE',
        url: '/cache/flush',
      });

      expect(mockFlush).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache Endpoints Error Handling', () => {
    it('should handle getStats errors gracefully', async () => {
      mockGetStats.mockImplementationOnce(() => {
        throw new Error('Cache error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/cache/stats',
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle flush errors gracefully', async () => {
      mockFlush.mockRejectedValueOnce(new Error('Flush error'));

      const response = await app.inject({
        method: 'DELETE',
        url: '/cache/flush',
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
