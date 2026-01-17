// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/controllers/search.controller.ts
 */

jest.mock('../../../src/middleware/auth.middleware');
jest.mock('../../../src/middleware/tenant.middleware');
jest.mock('../../../src/utils/sanitizer');

describe('src/controllers/search.controller.ts - Comprehensive Unit Tests', () => {
  let mockFastify: any;
  let mockSearchService: any;
  let mockAutocompleteService: any;
  let SearchSanitizer: any;
  let authenticate: any;
  let requireTenant: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock services
    mockSearchService = {
      search: jest.fn().mockResolvedValue({ results: [] }),
      searchVenues: jest.fn().mockResolvedValue({ results: [] }),
      searchEvents: jest.fn().mockResolvedValue({ results: [] }),
      searchEventsByDate: jest.fn().mockResolvedValue({ results: [] })
    };

    mockAutocompleteService = {
      getSuggestions: jest.fn().mockResolvedValue(['suggestion1', 'suggestion2'])
    };

    // Mock Fastify instance
    mockFastify = {
      get: jest.fn(),
      container: {
        cradle: {
          searchService: mockSearchService,
          autocompleteService: mockAutocompleteService
        }
      }
    };

    // Mock middleware
    authenticate = require('../../../src/middleware/auth.middleware').authenticate;
    requireTenant = require('../../../src/middleware/tenant.middleware').requireTenant;

    // Mock SearchSanitizer
    SearchSanitizer = require('../../../src/utils/sanitizer').SearchSanitizer;
    SearchSanitizer.sanitizeQuery = jest.fn((input) => input || '');
    SearchSanitizer.sanitizeNumber = jest.fn((val, def) => parseInt(val) || def);
  });

  // =============================================================================
  // searchRoutes() - Route Registration
  // =============================================================================

  describe('searchRoutes() - Route Registration', () => {
    it('should register 4 routes', async () => {
      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledTimes(4);
    });

    it('should register main search route', async () => {
      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/', expect.any(Object), expect.any(Function));
    });

    it('should register venues route', async () => {
      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/venues', expect.any(Object), expect.any(Function));
    });

    it('should register events route', async () => {
      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/events', expect.any(Object), expect.any(Function));
    });

    it('should register suggest route', async () => {
      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/suggest', expect.any(Object), expect.any(Function));
    });
  });

  // =============================================================================
  // Main Search Route - Middleware
  // =============================================================================

  describe('Main Search Route - Middleware', () => {
    it('should use authenticate and requireTenant middleware', async () => {
      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      const mainRoute = mockFastify.get.mock.calls.find(call => call[0] === '/');
      expect(mainRoute[1].preHandler).toEqual([authenticate, requireTenant]);
    });
  });

  // =============================================================================
  // Main Search Route - Handler
  // =============================================================================

  describe('Main Search Route - Handler', () => {
    it('should sanitize query, type, and limit', async () => {
      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/')[2];
      await handler({ query: { q: 'test', type: 'events', limit: 50 }, user: { id: 'u1' } }, {});

      expect(SearchSanitizer.sanitizeQuery).toHaveBeenCalledWith('test');
      expect(SearchSanitizer.sanitizeQuery).toHaveBeenCalledWith('events');
      expect(SearchSanitizer.sanitizeNumber).toHaveBeenCalledWith(50, 20, 1, 100);
    });

    it('should call searchService with context', async () => {
      SearchSanitizer.sanitizeQuery.mockReturnValue('clean');
      SearchSanitizer.sanitizeNumber.mockReturnValue(30);

      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/')[2];
      await handler({ query: { q: 'test', limit: 30 }, user: { id: 'u1', venueId: 'v1', role: 'admin' } }, {});

      expect(mockSearchService.search).toHaveBeenCalledWith('clean', undefined, 30, {
        userId: 'u1',
        venueId: 'v1',
        userRole: 'admin'
      });
    });

    it('should return search results', async () => {
      mockSearchService.search.mockResolvedValue({ results: ['r1'] });

      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/')[2];
      const result = await handler({ query: { q: 'test' }, user: { id: 'u1' } }, {});

      expect(result).toEqual({ results: ['r1'] });
    });
  });

  // =============================================================================
  // Venues Route - Handler
  // =============================================================================

  describe('Venues Route - Handler', () => {
    it('should sanitize query', async () => {
      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/venues')[2];
      await handler({ query: { q: 'stadium' }, user: { id: 'u1' } }, {});

      expect(SearchSanitizer.sanitizeQuery).toHaveBeenCalledWith('stadium');
    });

    it('should call searchVenues', async () => {
      SearchSanitizer.sanitizeQuery.mockReturnValue('clean-stadium');

      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/venues')[2];
      await handler({ query: { q: 'stadium' }, user: { id: 'u1', venueId: 'v1', role: 'user' } }, {});

      expect(mockSearchService.searchVenues).toHaveBeenCalledWith('clean-stadium', {
        userId: 'u1',
        venueId: 'v1',
        userRole: 'user'
      });
    });
  });

  // =============================================================================
  // Events Route - Handler
  // =============================================================================

  describe('Events Route - Handler', () => {
    it('should call searchEvents without dates', async () => {
      SearchSanitizer.sanitizeQuery.mockReturnValue('concert');

      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/events')[2];
      await handler({ query: { q: 'concert' }, user: { id: 'u1' } }, {});

      expect(mockSearchService.searchEvents).toHaveBeenCalled();
    });

    it('should call searchEventsByDate when dates provided', async () => {
      SearchSanitizer.sanitizeQuery.mockImplementation((v) => v);

      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/events')[2];
      await handler({ query: { q: 'concert', date_from: '2024-01-01', date_to: '2024-12-31' }, user: { id: 'u1' } }, {});

      expect(mockSearchService.searchEventsByDate).toHaveBeenCalledWith('2024-01-01', '2024-12-31', expect.any(Object));
    });
  });

  // =============================================================================
  // Suggest Route - Handler
  // =============================================================================

  describe('Suggest Route - Handler', () => {
    it('should sanitize query and call autocomplete', async () => {
      SearchSanitizer.sanitizeQuery.mockReturnValue('rock');
      mockAutocompleteService.getSuggestions.mockResolvedValue(['rock band', 'rock concert']);

      const { searchRoutes } = require('../../../src/controllers/search.controller');
      await searchRoutes(mockFastify);

      const handler = mockFastify.get.mock.calls.find(call => call[0] === '/suggest')[2];
      const result = await handler({ query: { q: 'rock' } }, {});

      expect(SearchSanitizer.sanitizeQuery).toHaveBeenCalledWith('rock');
      expect(mockAutocompleteService.getSuggestions).toHaveBeenCalledWith('rock');
      expect(result).toEqual({ suggestions: ['rock band', 'rock concert'] });
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export searchRoutes function', () => {
      const module = require('../../../src/controllers/search.controller');

      expect(module.searchRoutes).toBeDefined();
      expect(typeof module.searchRoutes).toBe('function');
    });
  });
});
