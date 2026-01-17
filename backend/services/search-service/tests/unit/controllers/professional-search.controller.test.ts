// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/controllers/professional-search.controller.ts
 */

jest.mock('../../../src/middleware/auth.middleware');

describe('src/controllers/professional-search.controller.ts - Comprehensive Unit Tests', () => {
  let mockFastify: any;
  let mockProfessionalSearchService: any;
  let authenticate: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock service
    mockProfessionalSearchService = {
      search: jest.fn().mockResolvedValue({ results: [] }),
      searchNearMe: jest.fn().mockResolvedValue({ results: [] }),
      getTrending: jest.fn().mockResolvedValue(['trending1', 'trending2']),
      findSimilar: jest.fn().mockResolvedValue(['similar1', 'similar2'])
    };

    // Mock Fastify instance
    mockFastify = {
      post: jest.fn(),
      get: jest.fn(),
      container: {
        cradle: {
          professionalSearchService: mockProfessionalSearchService
        }
      }
    };

    // Mock middleware
    authenticate = require('../../../src/middleware/auth.middleware').authenticate;
  });

  // =============================================================================
  // professionalSearchRoutes() - Route Registration
  // =============================================================================

  describe('professionalSearchRoutes() - Route Registration', () => {
    it('should register 4 routes', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledTimes(1);
      expect(mockFastify.get).toHaveBeenCalledTimes(3);
    });

    it('should register advanced search route', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledWith('/advanced', expect.any(Object), expect.any(Function));
    });

    it('should register near-me route', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/near-me', expect.any(Object), expect.any(Function));
    });

    it('should register trending route', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/trending', expect.any(Object), expect.any(Function));
    });

    it('should register similar route', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/:index/:id/similar', expect.any(Object), expect.any(Function));
    });
  });

  // =============================================================================
  // Advanced Search Route - Middleware
  // =============================================================================

  describe('Advanced Search Route - Middleware', () => {
    it('should use authenticate middleware', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const advancedRoute = mockFastify.post.mock.calls[0];
      expect(advancedRoute[1].preHandler).toBe(authenticate);
    });
  });

  // =============================================================================
  // Advanced Search Route - Handler
  // =============================================================================

  describe('Advanced Search Route - Handler', () => {
    it('should call professionalSearchService.search', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const handler = mockFastify.post.mock.calls[0][2];
      const mockRequest = { body: { query: 'test', filters: {} } };

      await handler(mockRequest, {});

      expect(mockProfessionalSearchService.search).toHaveBeenCalledWith({ query: 'test', filters: {} });
    });

    it('should return search results', async () => {
      mockProfessionalSearchService.search.mockResolvedValue({ results: ['result1'] });

      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const handler = mockFastify.post.mock.calls[0][2];
      const result = await handler({ body: {} }, {});

      expect(result).toEqual({ results: ['result1'] });
    });
  });

  // =============================================================================
  // Near Me Route - Middleware
  // =============================================================================

  describe('Near Me Route - Middleware', () => {
    it('should use authenticate middleware', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const nearMeRoute = mockFastify.get.mock.calls.find(call => call[0] === '/near-me');
      expect(nearMeRoute[1].preHandler).toBe(authenticate);
    });
  });

  // =============================================================================
  // Near Me Route - Handler
  // =============================================================================

  describe('Near Me Route - Handler', () => {
    it('should return 400 when lat missing', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/near-me')[2];
      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };

      await handler({ query: { lon: '40' } }, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'lat and lon required' });
    });

    it('should return 400 when lon missing', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/near-me')[2];
      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };

      await handler({ query: { lat: '30' } }, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'lat and lon required' });
    });

    it('should parse lat and lon as floats', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/near-me')[2];
      await handler({ query: { lat: '40.7128', lon: '-74.0060', distance: '10', type: 'venues' } }, {});

      expect(mockProfessionalSearchService.searchNearMe).toHaveBeenCalledWith(40.7128, -74.006, '10', 'venues');
    });

    it('should return near me results', async () => {
      mockProfessionalSearchService.searchNearMe.mockResolvedValue({ results: ['nearby1'] });

      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/near-me')[2];
      const result = await handler({ query: { lat: '40', lon: '-74' } }, {});

      expect(result).toEqual({ results: ['nearby1'] });
    });

    it('should handle distance and type parameters', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/near-me')[2];
      await handler({ query: { lat: '40', lon: '-74', distance: '50km', type: 'events' } }, {});

      expect(mockProfessionalSearchService.searchNearMe).toHaveBeenCalledWith(40, -74, '50km', 'events');
    });
  });

  // =============================================================================
  // Trending Route - Handler
  // =============================================================================

  describe('Trending Route - Handler', () => {
    it('should use authenticate middleware', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const trendingRoute = mockFastify.get.mock.calls.find(call => call[0] === '/trending');
      expect(trendingRoute[1].preHandler).toBe(authenticate);
    });

    it('should call getTrending', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/trending')[2];
      await handler({}, {});

      expect(mockProfessionalSearchService.getTrending).toHaveBeenCalled();
    });

    it('should return trending wrapped in object', async () => {
      mockProfessionalSearchService.getTrending.mockResolvedValue(['trending1', 'trending2']);

      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/trending')[2];
      const result = await handler({}, {});

      expect(result).toEqual({ trending: ['trending1', 'trending2'] });
    });
  });

  // =============================================================================
  // Similar Route - Handler
  // =============================================================================

  describe('Similar Route - Handler', () => {
    it('should use authenticate middleware', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const similarRoute = mockFastify.get.mock.calls.find(call => call[0] === '/:index/:id/similar');
      expect(similarRoute[1].preHandler).toBe(authenticate);
    });

    it('should extract index and id from params', async () => {
      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/:index/:id/similar')[2];
      await handler({ params: { index: 'events', id: 'event-123' } }, {});

      expect(mockProfessionalSearchService.findSimilar).toHaveBeenCalledWith('events', 'event-123');
    });

    it('should return similar wrapped in object', async () => {
      mockProfessionalSearchService.findSimilar.mockResolvedValue(['similar1', 'similar2']);

      const { professionalSearchRoutes } = require('../../../src/controllers/professional-search.controller');
      await professionalSearchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/:index/:id/similar')[2];
      const result = await handler({ params: { index: 'venues', id: 'venue-1' } }, {});

      expect(result).toEqual({ similar: ['similar1', 'similar2'] });
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export professionalSearchRoutes function', () => {
      const module = require('../../../src/controllers/professional-search.controller');

      expect(module.professionalSearchRoutes).toBeDefined();
      expect(typeof module.professionalSearchRoutes).toBe('function');
    });
  });
});
