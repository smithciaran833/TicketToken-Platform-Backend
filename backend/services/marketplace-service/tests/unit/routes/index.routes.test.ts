/**
 * Unit Tests for Index Routes
 * Tests main route registration and root endpoints
 */

import Fastify, { FastifyInstance } from 'fastify';
import routes from '../../../src/routes/index';

// Mock all route modules
jest.mock('../../../src/routes/listings.routes', () => jest.fn(async () => {}));
jest.mock('../../../src/routes/transfers.routes', () => jest.fn(async () => {}));
jest.mock('../../../src/routes/venue.routes', () => jest.fn(async () => {}));
jest.mock('../../../src/routes/search.routes', () => jest.fn(async () => {}));
jest.mock('../../../src/routes/admin.routes', () => jest.fn(async () => {}));
jest.mock('../../../src/routes/disputes.routes', () => jest.fn(async () => {}));
jest.mock('../../../src/routes/tax.routes', () => jest.fn(async () => {}));
jest.mock('../../../src/routes/health.routes', () => jest.fn(async () => {}));
jest.mock('../../../src/routes/webhook.routes', () => jest.fn(async () => {}));
jest.mock('../../../src/routes/seller-onboarding.routes', () => ({
  sellerOnboardingRoutes: jest.fn(async () => {}),
}));

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: jest.fn((req: any, reply: any, done: any) => done()),
  AuthRequest: {},
}));

jest.mock('../../../src/services/cache-integration', () => ({
  cache: {
    getStats: jest.fn().mockResolvedValue({ hits: 100, misses: 20 }),
    flush: jest.fn().mockResolvedValue(undefined),
  },
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

describe('Index Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(routes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('route registration', () => {
    it('should register all route modules', async () => {
      const listingsRoutes = require('../../../src/routes/listings.routes');
      const transfersRoutes = require('../../../src/routes/transfers.routes');
      const venueRoutes = require('../../../src/routes/venue.routes');
      const searchRoutes = require('../../../src/routes/search.routes');
      const adminRoutes = require('../../../src/routes/admin.routes');
      const disputesRoutes = require('../../../src/routes/disputes.routes');
      const taxRoutes = require('../../../src/routes/tax.routes');
      const healthRoutes = require('../../../src/routes/health.routes');
      const webhookRoutes = require('../../../src/routes/webhook.routes');
      const { sellerOnboardingRoutes } = require('../../../src/routes/seller-onboarding.routes');

      expect(healthRoutes).toHaveBeenCalled();
      expect(listingsRoutes).toHaveBeenCalled();
      expect(transfersRoutes).toHaveBeenCalled();
      expect(venueRoutes).toHaveBeenCalled();
      expect(searchRoutes).toHaveBeenCalled();
      expect(adminRoutes).toHaveBeenCalled();
      expect(disputesRoutes).toHaveBeenCalled();
      expect(taxRoutes).toHaveBeenCalled();
      expect(sellerOnboardingRoutes).toHaveBeenCalled();
      expect(webhookRoutes).toHaveBeenCalled();
    });
  });

  describe('GET /stats', () => {
    it('should return marketplace statistics', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('totalListings');
      expect(body).toHaveProperty('totalSales');
      expect(body).toHaveProperty('volume24h');
      expect(body).toHaveProperty('averagePrice');
    });
  });

  describe('GET /cache/stats', () => {
    it('should return 403 for non-admin users', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/cache/stats',
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Admin access required');
    });
  });

  describe('DELETE /cache/flush', () => {
    it('should return 403 for non-admin users', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/cache/flush',
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Admin access required');
    });
  });
});
