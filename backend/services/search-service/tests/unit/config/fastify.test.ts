// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/config/fastify.ts
 */

jest.mock('@fastify/cors');
jest.mock('@fastify/helmet');
jest.mock('../../../src/controllers/search.controller');
jest.mock('../../../src/controllers/professional-search.controller');
jest.mock('../../../src/middleware/tenant-context');

describe('src/config/fastify.ts - Comprehensive Unit Tests', () => {
  let mockFastify: any;
  let mockContainer: any;
  let cors: any;
  let helmet: any;
  let setTenantContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock Fastify instance
    mockFastify = {
      register: jest.fn().mockResolvedValue(undefined),
      decorate: jest.fn(),
      addHook: jest.fn(),
      get: jest.fn(),
      log: {
        error: jest.fn()
      }
    };

    // Mock container
    mockContainer = {
      resolve: jest.fn()
    };

    // Mock plugins
    cors = require('@fastify/cors');
    helmet = require('@fastify/helmet');

    // Mock middleware
    setTenantContext = require('../../../src/middleware/tenant-context').setTenantContext;
    setTenantContext.mockResolvedValue(undefined);

    // Mock controllers
    const searchController = require('../../../src/controllers/search.controller');
    searchController.searchRoutes = jest.fn();

    const professionalController = require('../../../src/controllers/professional-search.controller');
    professionalController.professionalSearchRoutes = jest.fn();
  });

  // =============================================================================
  // configureFastify() - Database Decoration
  // =============================================================================

  describe('configureFastify() - Database Decoration', () => {
    it('should decorate with db when available', async () => {
      const mockDb = { query: jest.fn() };
      mockContainer.resolve.mockReturnValue(mockDb);

      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      expect(mockContainer.resolve).toHaveBeenCalledWith('db');
      expect(mockFastify.decorate).toHaveBeenCalledWith('db', mockDb);
    });

    it('should try knex when db not found', async () => {
      mockContainer.resolve.mockImplementation((key) => {
        if (key === 'db') return undefined;
        if (key === 'knex') return { query: jest.fn() };
        return undefined;
      });

      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      expect(mockContainer.resolve).toHaveBeenCalledWith('db');
      expect(mockContainer.resolve).toHaveBeenCalledWith('knex');
    });

    it('should not decorate when no db available', async () => {
      mockContainer.resolve.mockReturnValue(undefined);

      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      expect(mockFastify.decorate).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // configureFastify() - Plugin Registration
  // =============================================================================

  describe('configureFastify() - Plugin Registration', () => {
    it('should register CORS plugin', async () => {
      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        cors,
        expect.objectContaining({
          origin: true,
          credentials: true
        })
      );
    });

    it('should register Helmet plugin', async () => {
      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(helmet);
    });

    it('should enable credentials in CORS', async () => {
      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      const corsCall = mockFastify.register.mock.calls.find(
        call => call[0] === cors
      );
      expect(corsCall[1].credentials).toBe(true);
    });

    it('should allow all origins in CORS', async () => {
      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      const corsCall = mockFastify.register.mock.calls.find(
        call => call[0] === cors
      );
      expect(corsCall[1].origin).toBe(true);
    });
  });

  // =============================================================================
  // configureFastify() - Tenant Context Middleware
  // =============================================================================

  describe('configureFastify() - Tenant Context Middleware', () => {
    it('should add onRequest hook', async () => {
      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      expect(mockFastify.addHook).toHaveBeenCalledWith(
        'onRequest',
        expect.any(Function)
      );
    });

    it('should call setTenantContext in hook', async () => {
      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      const hookCallback = mockFastify.addHook.mock.calls[0][1];
      const mockRequest = {};
      const mockReply = {};

      await hookCallback(mockRequest, mockReply);

      expect(setTenantContext).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should log errors from tenant context', async () => {
      setTenantContext.mockRejectedValueOnce(new Error('Tenant error'));

      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      const hookCallback = mockFastify.addHook.mock.calls[0][1];
      await hookCallback({}, {});

      expect(mockFastify.log.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to set tenant context'
      );
    });

    it('should allow request to proceed on error', async () => {
      setTenantContext.mockRejectedValueOnce(new Error('Tenant error'));

      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      const hookCallback = mockFastify.addHook.mock.calls[0][1];

      await expect(hookCallback({}, {})).resolves.not.toThrow();
    });
  });

  // =============================================================================
  // configureFastify() - Health Check Route
  // =============================================================================

  describe('configureFastify() - Health Check Route', () => {
    it('should register health check route', async () => {
      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      expect(mockFastify.get).toHaveBeenCalledWith(
        '/health',
        expect.any(Function)
      );
    });

    it('should return status ok', async () => {
      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      const healthHandler = mockFastify.get.mock.calls[0][1];
      const result = await healthHandler();

      expect(result.status).toBe('ok');
    });

    it('should return service name', async () => {
      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      const healthHandler = mockFastify.get.mock.calls[0][1];
      const result = await healthHandler();

      expect(result.service).toBe('search-service');
    });
  });

  // =============================================================================
  // configureFastify() - Route Registration
  // =============================================================================

  describe('configureFastify() - Route Registration', () => {
    it('should register search routes', async () => {
      const { searchRoutes } = require('../../../src/controllers/search.controller');
      const { configureFastify } = require('../../../src/config/fastify');

      await configureFastify(mockFastify, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        searchRoutes,
        { prefix: '/api/v1/search' }
      );
    });

    it('should register professional search routes', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      const { configureFastify } = require('../../../src/config/fastify');

      await configureFastify(mockFastify, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        professionalSearchRoutes,
        { prefix: '/api/v1/pro' }
      );
    });

    it('should use correct prefix for search routes', async () => {
      const { configureFastify } = require('../../../src/config/fastify');

      await configureFastify(mockFastify, mockContainer);

      const searchCall = mockFastify.register.mock.calls.find(
        call => call[1]?.prefix === '/api/v1/search'
      );
      expect(searchCall).toBeDefined();
    });

    it('should use correct prefix for pro routes', async () => {
      const { configureFastify } = require('../../../src/config/fastify');

      await configureFastify(mockFastify, mockContainer);

      const proCall = mockFastify.register.mock.calls.find(
        call => call[1]?.prefix === '/api/v1/pro'
      );
      expect(proCall).toBeDefined();
    });
  });

  // =============================================================================
  // configureFastify() - Registration Order
  // =============================================================================

  describe('configureFastify() - Registration Order', () => {
    it('should register plugins before routes', async () => {
      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      const corsIndex = mockFastify.register.mock.calls.findIndex(
        call => call[0] === cors
      );
      const routeIndex = mockFastify.register.mock.calls.findIndex(
        call => call[1]?.prefix === '/api/v1/search'
      );

      expect(corsIndex).toBeLessThan(routeIndex);
    });

    it('should register CORS before Helmet', async () => {
      const { configureFastify } = require('../../../src/config/fastify');
      await configureFastify(mockFastify, mockContainer);

      const corsIndex = mockFastify.register.mock.calls.findIndex(
        call => call[0] === cors
      );
      const helmetIndex = mockFastify.register.mock.calls.findIndex(
        call => call[0] === helmet
      );

      expect(corsIndex).toBeLessThan(helmetIndex);
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export configureFastify function', () => {
      const module = require('../../../src/config/fastify');

      expect(module.configureFastify).toBeDefined();
      expect(typeof module.configureFastify).toBe('function');
    });
  });
});
