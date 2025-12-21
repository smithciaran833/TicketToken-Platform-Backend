/**
 * Dependencies Configuration Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  TestContext,
  db,
  redis,
} from './setup';

describe('Dependencies Configuration', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  // ==========================================================================
  // createDependencyContainer
  // ==========================================================================
  describe('createDependencyContainer', () => {
    it('should create a container', async () => {
      const { createDependencyContainer } = await import('../../src/config/dependencies');
      
      const container = createDependencyContainer();
      expect(container).toBeDefined();
    });

    it('should register config', async () => {
      const { createDependencyContainer } = await import('../../src/config/dependencies');
      
      const container = createDependencyContainer();
      const config = container.resolve('config');
      
      expect(config).toBeDefined();
      expect(config.port).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.redis).toBeDefined();
    });

    it('should register database connection', async () => {
      const { createDependencyContainer } = await import('../../src/config/dependencies');
      
      const container = createDependencyContainer();
      const dbConn = container.resolve('db');
      
      expect(dbConn).toBeDefined();
      expect(typeof dbConn.raw).toBe('function');
    });

    it('should register redis connection', async () => {
      const { createDependencyContainer } = await import('../../src/config/dependencies');
      
      const container = createDependencyContainer();
      const redisConn = container.resolve('redis');
      
      expect(redisConn).toBeDefined();
      expect(typeof redisConn.ping).toBe('function');
    });

    it('should register venueServiceClient', async () => {
      const { createDependencyContainer } = await import('../../src/config/dependencies');
      
      const container = createDependencyContainer();
      const venueClient = container.resolve('venueServiceClient');
      
      expect(venueClient).toBeDefined();
    });

    it('should register eventService', async () => {
      const { createDependencyContainer } = await import('../../src/config/dependencies');
      
      const container = createDependencyContainer();
      const eventService = container.resolve('eventService');
      
      expect(eventService).toBeDefined();
    });

    it('should register pricingService', async () => {
      const { createDependencyContainer } = await import('../../src/config/dependencies');
      
      const container = createDependencyContainer();
      const pricingService = container.resolve('pricingService');
      
      expect(pricingService).toBeDefined();
    });

    it('should register capacityService', async () => {
      const { createDependencyContainer } = await import('../../src/config/dependencies');
      
      const container = createDependencyContainer();
      const capacityService = container.resolve('capacityService');
      
      expect(capacityService).toBeDefined();
    });

    it('should use singleton pattern for services', async () => {
      const { createDependencyContainer } = await import('../../src/config/dependencies');
      
      const container = createDependencyContainer();
      const eventService1 = container.resolve('eventService');
      const eventService2 = container.resolve('eventService');
      
      expect(eventService1).toBe(eventService2);
    });
  });
});
