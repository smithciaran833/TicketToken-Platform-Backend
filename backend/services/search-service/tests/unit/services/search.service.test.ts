// @ts-nocheck
/**
 * Unit Tests for search.service.ts
 */

// Mock tenant filter utilities
const mockAddTenantFilter = jest.fn((query) => query);
const mockCanAccessCrossTenant = jest.fn(() => false);

jest.mock('../../../src/utils/tenant-filter', () => ({
  addTenantFilter: mockAddTenantFilter,
  canAccessCrossTenant: mockCanAccessCrossTenant
}));

describe('SearchService - Unit Tests', () => {
  let SearchService: any;
  let mockElasticsearch: any;
  let mockLogger: any;
  let mockConsistencyService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Elasticsearch
    mockElasticsearch = {
      search: jest.fn().mockResolvedValue({
        hits: {
          total: { value: 2 },
          hits: [
            {
              _index: 'events',
              _id: 'event-1',
              _score: 1.5,
              _source: { name: 'Concert', _version: 1 }
            },
            {
              _index: 'venues',
              _id: 'venue-1',
              _score: 1.2,
              _source: { name: 'Stadium', _version: 2 }
            }
          ]
        }
      }),
      index: jest.fn().mockResolvedValue({ result: 'created' })
    };

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Mock ConsistencyService
    mockConsistencyService = {
      waitForConsistency: jest.fn().mockResolvedValue(true)
    };

    // Reset utility mocks
    mockAddTenantFilter.mockImplementation((query) => query);
    mockCanAccessCrossTenant.mockReturnValue(false);

    SearchService = require('../../../src/services/search.service').SearchService;
  });

  describe('Constructor', () => {
    it('should initialize with elasticsearch', () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      expect(service['elasticsearch']).toBe(mockElasticsearch);
    });

    it('should initialize with logger', () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      expect(service['logger']).toBe(mockLogger);
    });

    it('should initialize with consistencyService', () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      expect(service['consistencyService']).toBe(mockConsistencyService);
    });
  });

  describe('search()', () => {
    it('should search with query', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('concert');

      expect(mockElasticsearch.search).toHaveBeenCalled();
      const searchCall = mockElasticsearch.search.mock.calls[0][0];
      expect(searchCall.body.query.multi_match.query).toBe('concert');
    });

    it('should search specific type', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('concert', 'events');

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: ['events']
        })
      );
    });

    it('should search all types when no type specified', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('concert');

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: ['venues', 'events']
        })
      );
    });

    it('should respect limit parameter', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('concert', undefined, 50);

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          size: 50
        })
      );
    });

    it('should wait for consistency when token provided', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('concert', undefined, 20, {
        consistencyToken: 'token-123'
      });

      expect(mockConsistencyService.waitForConsistency).toHaveBeenCalledWith('token-123', 5000);
    });

    it('should skip consistency wait when waitForConsistency is false', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('concert', undefined, 20, {
        consistencyToken: 'token-123',
        waitForConsistency: false
      });

      expect(mockConsistencyService.waitForConsistency).not.toHaveBeenCalled();
    });

    it('should log warning when consistency not achieved', async () => {
      mockConsistencyService.waitForConsistency.mockResolvedValue(false);

      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('concert', undefined, 20, {
        consistencyToken: 'token-123'
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Search performed without full consistency',
        { token: 'token-123' }
      );
    });

    it('should add tenant filter when venueId provided', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('concert', undefined, 20, {
        venueId: 'venue-123'
      });

      expect(mockAddTenantFilter).toHaveBeenCalled();
    });

    it('should check cross-tenant access for admin roles', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('concert', undefined, 20, {
        venueId: 'venue-123',
        userRole: 'admin'
      });

      expect(mockCanAccessCrossTenant).toHaveBeenCalledWith('admin');
    });

    it('should return formatted results', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      const result = await service.search('concert');

      expect(result.success).toBe(true);
      expect(result.total).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({
        type: 'events',
        id: 'event-1',
        score: 1.5,
        data: { name: 'Concert', _version: 1 },
        version: 1
      });
    });

    it('should track search analytics', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('concert', undefined, 20, {
        userId: 'user-123'
      });

      expect(mockElasticsearch.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'search_analytics',
          body: expect.objectContaining({
            query: 'concert',
            results_count: 2,
            user_id: 'user-123'
          })
        })
      );
    });

    it('should use match_all for empty query', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('');

      const searchCall = mockElasticsearch.search.mock.calls[0][0];
      expect(searchCall.body.query).toEqual({ match_all: {} });
    });

    it('should handle search errors gracefully', async () => {
      mockElasticsearch.search.mockRejectedValue(new Error('ES error'));

      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      const result = await service.search('concert');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Search failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use preference for session stickiness', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.search('concert', undefined, 20, {
        userId: 'user-123'
      });

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          preference: 'user-123'
        })
      );
    });
  });

  describe('searchVenues()', () => {
    it('should call search with venues type', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.searchVenues('stadium');

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: ['venues'],
          size: 20
        })
      );
    });

    it('should pass options through', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.searchVenues('stadium', { userId: 'user-123' });

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          preference: 'user-123'
        })
      );
    });
  });

  describe('searchEvents()', () => {
    it('should call search with events type', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.searchEvents('concert');

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: ['events'],
          size: 20
        })
      );
    });

    it('should pass options through', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.searchEvents('concert', { consistencyToken: 'token-123' });

      expect(mockConsistencyService.waitForConsistency).toHaveBeenCalled();
    });
  });

  describe('searchEventsByDate()', () => {
    it('should search with date range', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.searchEventsByDate('2025-01-01', '2025-12-31');

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'events',
          body: expect.objectContaining({
            query: expect.objectContaining({
              bool: expect.objectContaining({
                must: expect.arrayContaining([
                  expect.objectContaining({
                    range: expect.objectContaining({
                      date: expect.objectContaining({
                        gte: '2025-01-01',
                        lte: '2025-12-31'
                      })
                    })
                  })
                ])
              })
            })
          })
        })
      );
    });

    it('should handle only dateFrom', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.searchEventsByDate('2025-01-01');

      const searchCall = mockElasticsearch.search.mock.calls[0][0];
      expect(searchCall.body.query.bool.must[0].range.date.gte).toBe('2025-01-01');
      expect(searchCall.body.query.bool.must[0].range.date.lte).toBeUndefined();
    });

    it('should handle only dateTo', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.searchEventsByDate(undefined, '2025-12-31');

      const searchCall = mockElasticsearch.search.mock.calls[0][0];
      expect(searchCall.body.query.bool.must[0].range.date.lte).toBe('2025-12-31');
      expect(searchCall.body.query.bool.must[0].range.date.gte).toBeUndefined();
    });

    it('should sort by date ascending', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.searchEventsByDate('2025-01-01', '2025-12-31');

      expect(mockElasticsearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            sort: [{ date: 'asc' }]
          })
        })
      );
    });

    it('should wait for consistency when token provided', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.searchEventsByDate('2025-01-01', '2025-12-31', {
        consistencyToken: 'token-123'
      });

      expect(mockConsistencyService.waitForConsistency).toHaveBeenCalledWith('token-123');
    });

    it('should add tenant filter when venueId provided', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.searchEventsByDate('2025-01-01', '2025-12-31', {
        venueId: 'venue-123'
      });

      expect(mockAddTenantFilter).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockElasticsearch.search.mockRejectedValue(new Error('ES error'));

      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      const result = await service.searchEventsByDate('2025-01-01');

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('trackSearch()', () => {
    it('should index search analytics', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.trackSearch('concert', 10, 'user-123');

      expect(mockElasticsearch.index).toHaveBeenCalledWith({
        index: 'search_analytics',
        body: {
          query: 'concert',
          results_count: 10,
          user_id: 'user-123',
          timestamp: expect.any(Date)
        }
      });
    });

    it('should handle missing userId', async () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await service.trackSearch('concert', 10);

      expect(mockElasticsearch.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            user_id: null
          })
        })
      );
    });

    it('should fail silently on error', async () => {
      mockElasticsearch.index.mockRejectedValue(new Error('Index error'));

      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      await expect(service.trackSearch('concert', 10)).resolves.toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('getPopularSearches()', () => {
    it('should query aggregations', async () => {
      mockElasticsearch.search.mockResolvedValue({
        aggregations: {
          popular_queries: {
            buckets: [
              { key: 'concert', doc_count: 100 },
              { key: 'stadium', doc_count: 50 }
            ]
          }
        }
      });

      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      const result = await service.getPopularSearches(10);

      expect(mockElasticsearch.search).toHaveBeenCalledWith({
        index: 'search_analytics',
        size: 0,
        body: {
          aggs: {
            popular_queries: {
              terms: {
                field: 'query.keyword',
                size: 10
              }
            }
          }
        }
      });

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('concert');
    });

    it('should handle errors gracefully', async () => {
      mockElasticsearch.search.mockRejectedValue(new Error('ES error'));

      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      const result = await service.getPopularSearches();

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return empty array when no aggregations', async () => {
      mockElasticsearch.search.mockResolvedValue({});

      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      const result = await service.getPopularSearches();

      expect(result).toEqual([]);
    });
  });

  describe('Class Structure', () => {
    it('should be instantiable', () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      expect(service).toBeInstanceOf(SearchService);
    });

    it('should have search method', () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      expect(typeof service.search).toBe('function');
    });

    it('should have searchVenues method', () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      expect(typeof service.searchVenues).toBe('function');
    });

    it('should have searchEvents method', () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      expect(typeof service.searchEvents).toBe('function');
    });

    it('should have searchEventsByDate method', () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      expect(typeof service.searchEventsByDate).toBe('function');
    });

    it('should have trackSearch method', () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      expect(typeof service.trackSearch).toBe('function');
    });

    it('should have getPopularSearches method', () => {
      const service = new SearchService({
        elasticsearch: mockElasticsearch,
        logger: mockLogger,
        consistencyService: mockConsistencyService
      });

      expect(typeof service.getPopularSearches).toBe('function');
    });
  });
});
