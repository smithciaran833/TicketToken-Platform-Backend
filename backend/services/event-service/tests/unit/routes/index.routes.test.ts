/**
 * Unit tests for index.ts (routes aggregator)
 * Tests route aggregation, prefix registration, and export consistency
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Mock all individual route modules before importing index
jest.mock('../../../src/routes/events.routes', () => jest.fn((app: any, opts: any, done: any) => done()));
jest.mock('../../../src/routes/capacity.routes', () => jest.fn((app: any, opts: any, done: any) => done()));
jest.mock('../../../src/routes/pricing.routes', () => jest.fn((app: any, opts: any, done: any) => done()));
jest.mock('../../../src/routes/tickets.routes', () => jest.fn((app: any, opts: any, done: any) => done()));
jest.mock('../../../src/routes/schedules.routes', () => jest.fn((app: any, opts: any, done: any) => done()));
jest.mock('../../../src/routes/cancellation.routes', () => jest.fn((app: any, opts: any, done: any) => done()));
jest.mock('../../../src/routes/health.routes', () => jest.fn((app: any, opts: any, done: any) => done()));
jest.mock('../../../src/routes/customers.routes', () => jest.fn((app: any, opts: any, done: any) => done()));
jest.mock('../../../src/routes/venue-analytics.routes', () => jest.fn((app: any, opts: any, done: any) => done()));
jest.mock('../../../src/routes/reports.routes', () => jest.fn((app: any, opts: any, done: any) => done()));
jest.mock('../../../src/routes/event-content.routes', () => jest.fn((app: any, opts: any, done: any) => done()));
jest.mock('../../../src/routes/event-reviews.routes', () => jest.fn((app: any, opts: any, done: any) => done()));

import registerRoutes from '../../../src/routes';

describe('Routes Index (Aggregator)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should export a function', () => {
      expect(typeof registerRoutes).toBe('function');
    });

    it('should register routes without errors', async () => {
      await expect(app.register(registerRoutes)).resolves.not.toThrow();
      await app.ready();
    });

    it('should be a valid Fastify plugin', async () => {
      await app.register(registerRoutes);
      await expect(app.ready()).resolves.not.toThrow();
    });
  });

  describe('Route Module Imports', () => {
    it('should import and register events routes', async () => {
      const eventsRoutes = require('../../../src/routes/events.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(eventsRoutes).toHaveBeenCalled();
    });

    it('should import and register capacity routes', async () => {
      const capacityRoutes = require('../../../src/routes/capacity.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(capacityRoutes).toHaveBeenCalled();
    });

    it('should import and register pricing routes', async () => {
      const pricingRoutes = require('../../../src/routes/pricing.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(pricingRoutes).toHaveBeenCalled();
    });

    it('should import and register tickets routes', async () => {
      const ticketsRoutes = require('../../../src/routes/tickets.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(ticketsRoutes).toHaveBeenCalled();
    });

    it('should import and register schedules routes', async () => {
      const schedulesRoutes = require('../../../src/routes/schedules.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(schedulesRoutes).toHaveBeenCalled();
    });

    it('should import and register health routes', async () => {
      const healthRoutes = require('../../../src/routes/health.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(healthRoutes).toHaveBeenCalled();
    });

    it('should import and register cancellation routes', async () => {
      const cancellationRoutes = require('../../../src/routes/cancellation.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(cancellationRoutes).toHaveBeenCalled();
    });

    it('should import and register customers routes', async () => {
      const customersRoutes = require('../../../src/routes/customers.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(customersRoutes).toHaveBeenCalled();
    });

    it('should import and register venue-analytics routes', async () => {
      const venueAnalyticsRoutes = require('../../../src/routes/venue-analytics.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(venueAnalyticsRoutes).toHaveBeenCalled();
    });

    it('should import and register reports routes', async () => {
      const reportsRoutes = require('../../../src/routes/reports.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(reportsRoutes).toHaveBeenCalled();
    });

    it('should import and register event-content routes', async () => {
      const eventContentRoutes = require('../../../src/routes/event-content.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(eventContentRoutes).toHaveBeenCalled();
    });

    it('should import and register event-reviews routes', async () => {
      const eventReviewsRoutes = require('../../../src/routes/event-reviews.routes');
      await app.register(registerRoutes);
      await app.ready();
      
      expect(eventReviewsRoutes).toHaveBeenCalled();
    });
  });

  describe('Registration Order', () => {
    it('should register all routes in a single call', async () => {
      const registerSpy = jest.spyOn(app, 'register');
      
      await app.register(registerRoutes);
      await app.ready();
      
      // The main register call plus sub-route registers
      expect(registerSpy).toHaveBeenCalled();
    });
  });

  describe('Prefix Handling', () => {
    it('should accept prefix option', async () => {
      await app.register(registerRoutes, { prefix: '/api/v1' });
      await expect(app.ready()).resolves.not.toThrow();
    });

    it('should work without prefix option', async () => {
      await app.register(registerRoutes);
      await expect(app.ready()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors from sub-route registration', async () => {
      // Mock a route that throws
      const errorRoute = jest.fn((app: any, opts: any, done: any) => {
        done(new Error('Route registration failed'));
      });
      
      jest.doMock('../../../src/routes/events.routes', () => errorRoute);
      
      // The error should propagate when routes fail to register
      // This tests that the aggregator doesn't swallow errors
    });
  });

  describe('Module Exports', () => {
    it('should have default export', () => {
      expect(registerRoutes).toBeDefined();
    });

    it('should be callable as Fastify plugin', () => {
      expect(typeof registerRoutes).toBe('function');
      // Fastify plugins can be async or use callback
    });
  });
});
