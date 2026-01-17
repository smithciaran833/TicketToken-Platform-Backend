// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/config/dependencies.ts
 */

// Set up mocks with explicit factory
const mockCreateContainer = jest.fn();
const mockAsClass = jest.fn();
const mockAsValue = jest.fn();

jest.mock('awilix', () => ({
  createContainer: mockCreateContainer,
  asClass: mockAsClass,
  asValue: mockAsValue,
  InjectionMode: { PROXY: 'PROXY' }
}));

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');
jest.mock('ioredis');
jest.mock('@elastic/elasticsearch');
jest.mock('mongodb');
jest.mock('@tickettoken/shared', () => ({
  RatingService: jest.fn()
}));
jest.mock('../../../src/services/search.service');
jest.mock('../../../src/services/autocomplete.service');
jest.mock('../../../src/services/sync.service');
jest.mock('../../../src/services/professional-search.service');
jest.mock('../../../src/services/consistency.service');
jest.mock('../../../src/services/ab-testing.service');
jest.mock('../../../src/services/event-enrichment.service');
jest.mock('../../../src/services/venue-enrichment.service');
jest.mock('../../../src/services/ticket-enrichment.service');
jest.mock('../../../src/services/marketplace-enrichment.service');

describe('src/config/dependencies.ts - Comprehensive Unit Tests', () => {
  let mockContainer: any;
  let mockMongoClient: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    // Mock container
    mockContainer = {
      register: jest.fn()
    };

    // Set up awilix mocks
    mockCreateContainer.mockReturnValue(mockContainer);
    mockAsClass.mockImplementation((cls) => ({ 
      singleton: jest.fn().mockReturnValue(`asClass(${cls.name})`) 
    }));
    mockAsValue.mockImplementation((val) => `asValue(${typeof val})`);

    // Mock MongoDB client
    mockMongoClient = {
      connect: jest.fn().mockResolvedValue(undefined)
    };
    const { MongoClient } = require('mongodb');
    MongoClient.mockImplementation(() => mockMongoClient);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // initializeContainer() - Container Creation
  // =============================================================================

  describe('initializeContainer() - Container Creation', () => {
    it('should create container with PROXY injection mode', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      expect(mockCreateContainer).toHaveBeenCalledWith({
        injectionMode: 'PROXY'
      });
    });

    it('should return container instance', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      const container = await initializeContainer();

      expect(container).toBe(mockContainer);
    });
  });

  // =============================================================================
  // initializeContainer() - MongoDB Connection
  // =============================================================================

  describe('initializeContainer() - MongoDB Connection', () => {
    it('should create MongoClient with default URI', async () => {
      delete process.env.MONGODB_URI;
      const { MongoClient } = require('mongodb');
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      expect(MongoClient).toHaveBeenCalledWith('mongodb://mongodb:27017/tickettoken');
    });

    it('should create MongoClient with environment URI', async () => {
      process.env.MONGODB_URI = 'mongodb://custom:27017/customdb';
      const { MongoClient } = require('mongodb');
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      expect(MongoClient).toHaveBeenCalledWith('mongodb://custom:27017/customdb');
    });

    it('should connect to MongoDB', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      expect(mockMongoClient.connect).toHaveBeenCalled();
    });

    it('should handle MongoDB connection errors', async () => {
      mockMongoClient.connect.mockRejectedValueOnce(new Error('Mongo connection failed'));
      const { initializeContainer } = require('../../../src/config/dependencies');

      await expect(initializeContainer()).rejects.toThrow('Mongo connection failed');
    });
  });

  // =============================================================================
  // initializeContainer() - Infrastructure Registration
  // =============================================================================

  describe('initializeContainer() - Infrastructure Registration', () => {
    it('should register database', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      expect(mockContainer.register).toHaveBeenCalled();
      const firstCall = mockContainer.register.mock.calls[0][0];
      expect(firstCall.db).toBeDefined();
    });

    it('should register logger', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const firstCall = mockContainer.register.mock.calls[0][0];
      expect(firstCall.logger).toBeDefined();
    });

    it('should register redis with default config', async () => {
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      const Redis = require('ioredis');

      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      expect(Redis).toHaveBeenCalledWith({
        host: 'redis',
        port: 6379
      });
    });

    it('should register redis with environment config', async () => {
      process.env.REDIS_HOST = 'custom-redis';
      process.env.REDIS_PORT = '6380';
      const Redis = require('ioredis');

      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      expect(Redis).toHaveBeenCalledWith({
        host: 'custom-redis',
        port: 6380
      });
    });

    it('should register elasticsearch with default node', async () => {
      delete process.env.ELASTICSEARCH_NODE;
      const { Client } = require('@elastic/elasticsearch');

      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      expect(Client).toHaveBeenCalledWith({
        node: 'http://elasticsearch:9200'
      });
    });

    it('should register elasticsearch with environment node', async () => {
      process.env.ELASTICSEARCH_NODE = 'http://custom-es:9200';
      const { Client } = require('@elastic/elasticsearch');

      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      expect(Client).toHaveBeenCalledWith({
        node: 'http://custom-es:9200'
      });
    });

    it('should register mongodb client', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const firstCall = mockContainer.register.mock.calls[0][0];
      expect(firstCall.mongodb).toBeDefined();
    });
  });

  // =============================================================================
  // initializeContainer() - Service Registration
  // =============================================================================

  describe('initializeContainer() - Service Registration', () => {
    it('should register RatingService', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const secondCall = mockContainer.register.mock.calls[1][0];
      expect(secondCall.ratingService).toBeDefined();
    });

    it('should register ConsistencyService', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const thirdCall = mockContainer.register.mock.calls[2][0];
      expect(thirdCall.consistencyService).toBeDefined();
    });

    it('should register ABTestingService', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const thirdCall = mockContainer.register.mock.calls[2][0];
      expect(thirdCall.abTestingService).toBeDefined();
    });

    it('should register SearchService', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const thirdCall = mockContainer.register.mock.calls[2][0];
      expect(thirdCall.searchService).toBeDefined();
    });

    it('should register AutocompleteService', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const thirdCall = mockContainer.register.mock.calls[2][0];
      expect(thirdCall.autocompleteService).toBeDefined();
    });

    it('should register SyncService', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const thirdCall = mockContainer.register.mock.calls[2][0];
      expect(thirdCall.syncService).toBeDefined();
    });

    it('should register ProfessionalSearchService', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const thirdCall = mockContainer.register.mock.calls[2][0];
      expect(thirdCall.professionalSearchService).toBeDefined();
    });
  });

  // =============================================================================
  // initializeContainer() - Enrichment Services
  // =============================================================================

  describe('initializeContainer() - Enrichment Services', () => {
    it('should register EventEnrichmentService', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const fourthCall = mockContainer.register.mock.calls[3][0];
      expect(fourthCall.eventEnrichmentService).toBeDefined();
    });

    it('should register VenueEnrichmentService', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const fourthCall = mockContainer.register.mock.calls[3][0];
      expect(fourthCall.venueEnrichmentService).toBeDefined();
    });

    it('should register TicketEnrichmentService', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const fourthCall = mockContainer.register.mock.calls[3][0];
      expect(fourthCall.ticketEnrichmentService).toBeDefined();
    });

    it('should register MarketplaceEnrichmentService', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const fourthCall = mockContainer.register.mock.calls[3][0];
      expect(fourthCall.marketplaceEnrichmentService).toBeDefined();
    });
  });

  // =============================================================================
  // initializeContainer() - Registration Calls
  // =============================================================================

  describe('initializeContainer() - Registration Calls', () => {
    it('should call register 4 times', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      expect(mockContainer.register).toHaveBeenCalledTimes(4);
    });

    it('should register infrastructure first', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const firstCall = mockContainer.register.mock.calls[0][0];
      expect(firstCall).toHaveProperty('db');
      expect(firstCall).toHaveProperty('redis');
      expect(firstCall).toHaveProperty('elasticsearch');
    });

    it('should register RatingService second', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const secondCall = mockContainer.register.mock.calls[1][0];
      expect(secondCall).toHaveProperty('ratingService');
    });

    it('should register core services third', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const thirdCall = mockContainer.register.mock.calls[2][0];
      expect(thirdCall).toHaveProperty('searchService');
      expect(thirdCall).toHaveProperty('consistencyService');
    });

    it('should register enrichment services last', async () => {
      const { initializeContainer } = require('../../../src/config/dependencies');

      await initializeContainer();

      const fourthCall = mockContainer.register.mock.calls[3][0];
      expect(fourthCall).toHaveProperty('eventEnrichmentService');
      expect(fourthCall).toHaveProperty('venueEnrichmentService');
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export initializeContainer function', () => {
      const module = require('../../../src/config/dependencies');

      expect(module.initializeContainer).toBeDefined();
      expect(typeof module.initializeContainer).toBe('function');
    });
  });
});
