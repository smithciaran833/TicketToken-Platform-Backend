/**
 * Dependencies Configuration Integration Tests
 *
 * Tests Awilix DI container registration and service resolution.
 */

import {
  setupTestApp,
  teardownTestApp,
  TestContext
} from '../setup';

describe('Dependencies Configuration Integration Tests', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  // ==========================================================================
  // Container Registration Tests
  // ==========================================================================
  describe('Container Registration', () => {
    it('should have container attached to fastify', () => {
      const container = (context.app as any).container;
      expect(container).toBeDefined();
      expect(container.cradle).toBeDefined();
    });

    it('should resolve db dependency', () => {
      const container = (context.app as any).container;
      const db = container.cradle.db;
      expect(db).toBeDefined();
      expect(typeof db.raw).toBe('function');
    });

    it('should resolve redis dependency', () => {
      const container = (context.app as any).container;
      const redis = container.cradle.redis;
      expect(redis).toBeDefined();
      expect(typeof redis.get).toBe('function');
    });

    it('should resolve logger dependency', () => {
      const container = (context.app as any).container;
      const logger = container.cradle.logger;
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });

  // ==========================================================================
  // Service Resolution Tests
  // ==========================================================================
  describe('Service Resolution', () => {
    it('should resolve venueService', () => {
      const container = (context.app as any).container;
      const venueService = container.cradle.venueService;
      expect(venueService).toBeDefined();
      expect(typeof venueService.getVenueById).toBe('function');
    });

    it('should resolve cacheService', () => {
      const container = (context.app as any).container;
      const cacheService = container.cradle.cacheService;
      expect(cacheService).toBeDefined();
      expect(typeof cacheService.get).toBe('function');
      expect(typeof cacheService.set).toBe('function');
    });

    it('should resolve healthCheckService', () => {
      const container = (context.app as any).container;
      const healthCheckService = container.cradle.healthCheckService;
      expect(healthCheckService).toBeDefined();
      expect(typeof healthCheckService.getLiveness).toBe('function');
    });

    it('should resolve integrationService', () => {
      const container = (context.app as any).container;
      const integrationService = container.cradle.integrationService;
      expect(integrationService).toBeDefined();
    });

    it('should resolve eventPublisher', () => {
      const container = (context.app as any).container;
      const eventPublisher = container.cradle.eventPublisher;
      expect(eventPublisher).toBeDefined();
    });

    it('should resolve onboardingService', () => {
      const container = (context.app as any).container;
      const onboardingService = container.cradle.onboardingService;
      expect(onboardingService).toBeDefined();
    });

    it('should resolve complianceService', () => {
      const container = (context.app as any).container;
      const complianceService = container.cradle.complianceService;
      expect(complianceService).toBeDefined();
    });

    it('should resolve verificationService', () => {
      const container = (context.app as any).container;
      const verificationService = container.cradle.verificationService;
      expect(verificationService).toBeDefined();
    });

    it('should resolve analyticsService', () => {
      const container = (context.app as any).container;
      const analyticsService = container.cradle.analyticsService;
      expect(analyticsService).toBeDefined();
    });
  });

  // ==========================================================================
  // Singleton Behavior Tests
  // ==========================================================================
  describe('Singleton Behavior', () => {
    it('should return same venueService instance', () => {
      const container = (context.app as any).container;
      const service1 = container.cradle.venueService;
      const service2 = container.cradle.venueService;
      expect(service1).toBe(service2);
    });

    it('should return same cacheService instance', () => {
      const container = (context.app as any).container;
      const service1 = container.cradle.cacheService;
      const service2 = container.cradle.cacheService;
      expect(service1).toBe(service2);
    });

    it('should return same healthCheckService instance', () => {
      const container = (context.app as any).container;
      const service1 = container.cradle.healthCheckService;
      const service2 = container.cradle.healthCheckService;
      expect(service1).toBe(service2);
    });
  });
});
