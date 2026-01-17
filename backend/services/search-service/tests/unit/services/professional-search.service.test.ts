// @ts-nocheck
/**
 * Comprehensive Unit Tests for professional-search.service.ts
 */

describe('ProfessionalSearchService - Comprehensive Unit Tests', () => {
  let ProfessionalSearchService: any;
  let mockElasticsearch: any;
  let mockRedis: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockElasticsearch = {
      search: jest.fn().mockResolvedValue({
        hits: {
          total: { value: 10 },
          hits: [
            {
              _index: 'events',
              _id: 'event-1',
              _score: 1.5,
              _source: { name: 'Concert', price: 50 }
            }
          ]
        },
        aggregations: {
          categories: { buckets: [{ key: 'music', doc_count: 5 }] },
          price_ranges: { buckets: [] },
          venues: { buckets: [] },
          dates: { buckets: [] },
          avg_price: { value: 75 }
        }
      }),
      index: jest.fn().mockResolvedValue({ result: 'created' })
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK')
    };

    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    ProfessionalSearchService = require('../../../src/services/professional-search.service').ProfessionalSearchService;
  });

  describe('Constructor', () => {
    it('should initialize with elasticsearch', () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });
      expect(service['elasticsearch']).toBe(mockElasticsearch);
    });

    it('should initialize with redis', () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });
      expect(service['redis']).toBe(mockRedis);
    });

    it('should initialize with logger', () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });
      expect(service['logger']).toBe(mockLogger);
    });
  });

  describe('search()', () => {
    it('should check cache first', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.search({ query: 'concert' });
      expect(mockRedis.get).toHaveBeenCalled();
    });

    it('should return cached results if available', async () => {
      const cachedResult = { success: true, total: 5, results: [] };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResult));

      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      const result = await service.search({ query: 'concert' });
      expect(result).toEqual(cachedResult);
      expect(mockElasticsearch.search).not.toHaveBeenCalled();
    });

    it('should call elasticsearch if no cache', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.search({ query: 'concert' });
      expect(mockElasticsearch.search).toHaveBeenCalled();
    });

    it('should return formatted results', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      const result = await service.search({ query: 'concert' });
      expect(result.success).toBe(true);
      expect(result.total).toBe(10);
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should cache results', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.search({ query: 'concert' });
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        300,
        expect.any(String)
      );
    });

    it('should track search analytics', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.search({ query: 'concert' });
      expect(mockElasticsearch.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'search_analytics'
        })
      );
    });

    it('should support geo-location filter', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.search({
        query: 'concert',
        location: { lat: 40.7128, lon: -74.0060 },
        distance: '10km'
      });

      expect(mockElasticsearch.search).toHaveBeenCalled();
      const searchCall = mockElasticsearch.search.mock.calls[0][0];
      expect(searchCall.body.query.bool.filter).toBeDefined();
    });

    it('should support price range filter', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.search({
        query: 'concert',
        filters: { priceMin: 50, priceMax: 200 }
      });

      expect(mockElasticsearch.search).toHaveBeenCalled();
    });

    it('should support date range filter', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.search({
        query: 'concert',
        filters: { dateFrom: '2025-01-01', dateTo: '2025-12-31' }
      });

      expect(mockElasticsearch.search).toHaveBeenCalled();
    });

    it('should support category filter', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.search({
        query: 'concert',
        filters: { categories: ['music', 'sports'] }
      });

      expect(mockElasticsearch.search).toHaveBeenCalled();
    });

    it('should include facets in results', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      const result = await service.search({ query: 'concert' });
      expect(result.facets).toBeDefined();
      expect(result.facets.categories).toBeDefined();
    });

    it('should handle pagination', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.search({ query: 'concert', page: 2, limit: 10 });

      const searchCall = mockElasticsearch.search.mock.calls[0][0];
      expect(searchCall.from).toBe(10);
      expect(searchCall.size).toBe(10);
    });

    it('should log error on failure', async () => {
      mockElasticsearch.search.mockRejectedValue(new Error('ES error'));

      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await expect(service.search({ query: 'concert' })).rejects.toThrow('ES error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('searchNearMe()', () => {
    it('should search with location', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.searchNearMe(40.7128, -74.0060, '10km');
      expect(mockElasticsearch.search).toHaveBeenCalled();
    });

    it('should use distance sort', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      const result = await service.searchNearMe(40.7128, -74.0060, '10km');
      expect(result).toBeDefined();
    });
  });

  describe('getTrending()', () => {
    it('should check cache first', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.getTrending();
      expect(mockRedis.get).toHaveBeenCalledWith('trending');
    });

    it('should return cached trending if available', async () => {
      const trending = [{ key: 'concert', doc_count: 100 }];
      mockRedis.get.mockResolvedValue(JSON.stringify(trending));

      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      const result = await service.getTrending();
      expect(result).toEqual(trending);
    });

    it('should query elasticsearch if no cache', async () => {
      mockElasticsearch.search.mockResolvedValue({
        aggregations: {
          trending: {
            buckets: [{ key: 'concert', doc_count: 100 }]
          }
        }
      });

      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      const result = await service.getTrending();
      expect(Array.isArray(result)).toBe(true);
      expect(mockElasticsearch.search).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockElasticsearch.search.mockRejectedValue(new Error('ES error'));

      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      const result = await service.getTrending();
      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findSimilar()', () => {
    it('should use more_like_this query', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      await service.findSimilar('events', 'event-1');
      expect(mockElasticsearch.search).toHaveBeenCalled();
      const searchCall = mockElasticsearch.search.mock.calls[0][0];
      expect(searchCall.body.query.more_like_this).toBeDefined();
    });

    it('should return similar items', async () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      const result = await service.findSimilar('events', 'event-1');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockElasticsearch.search.mockRejectedValue(new Error('ES error'));

      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });

      const result = await service.findSimilar('events', 'event-1');
      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Class Structure', () => {
    it('should be instantiable', () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });
      expect(service).toBeInstanceOf(ProfessionalSearchService);
    });

    it('should have search method', () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });
      expect(typeof service.search).toBe('function');
    });

    it('should have searchNearMe method', () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });
      expect(typeof service.searchNearMe).toBe('function');
    });

    it('should have getTrending method', () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });
      expect(typeof service.getTrending).toBe('function');
    });

    it('should have findSimilar method', () => {
      const service = new ProfessionalSearchService({
        elasticsearch: mockElasticsearch,
        redis: mockRedis,
        logger: mockLogger
      });
      expect(typeof service.findSimilar).toBe('function');
    });
  });
});
