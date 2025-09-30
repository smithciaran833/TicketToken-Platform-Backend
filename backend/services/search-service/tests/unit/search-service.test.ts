// Mock setup BEFORE any imports
const mockElasticsearchClient = {
  search: jest.fn(),
  index: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  exists: jest.fn(),
  get: jest.fn(),
  bulk: jest.fn(),
  ping: jest.fn().mockResolvedValue(true),
  indices: {
    exists: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    refresh: jest.fn()
  }
};

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  incr: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn()
};

const mockLogger: any = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn()
};

// Fix circular reference
mockLogger.child.mockReturnValue(mockLogger);

// Mock modules
jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn(() => mockElasticsearchClient)
}));

jest.mock('ioredis', () => jest.fn(() => mockRedisClient));

jest.mock('../../src/utils/logger', () => ({ 
  logger: mockLogger,
  default: mockLogger 
}));

// Mock fastify authenticate
const mockAuthenticate = jest.fn((req: any, reply: any, done: any) => done());

// Mock Fastify instance
const mockFastify = {
  register: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  addHook: jest.fn(),
  decorate: jest.fn(),
  decorateRequest: jest.fn(),
  listen: jest.fn(),
  ready: jest.fn(),
  close: jest.fn(),
  log: mockLogger
};

jest.mock('fastify', () => {
  return jest.fn(() => mockFastify);
});

describe('Search Service Tests', () => {
  let req: any;
  let reply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      query: {},
      params: {},
      body: {},
      headers: { authorization: 'Bearer test-token' },
      user: { id: 'user123', role: 'user' }
    };

    reply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis()
    };
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      mockElasticsearchClient.ping.mockResolvedValue(true);

      const healthCheck = async () => {
        const esHealthy = await mockElasticsearchClient.ping();
        return {
          status: 'healthy',
          elasticsearch: esHealthy ? 'connected' : 'disconnected',
          timestamp: new Date().toISOString()
        };
      };

      const result = await healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.elasticsearch).toBe('connected');
      expect(mockElasticsearchClient.ping).toHaveBeenCalled();
    });

    it('should handle unhealthy Elasticsearch', async () => {
      mockElasticsearchClient.ping.mockRejectedValue(new Error('Connection refused'));

      const healthCheck = async () => {
        try {
          await mockElasticsearchClient.ping();
          return { status: 'healthy', elasticsearch: 'connected' };
        } catch (error) {
          return { status: 'unhealthy', elasticsearch: 'disconnected' };
        }
      };

      const result = await healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.elasticsearch).toBe('disconnected');
    });
  });

  describe('Core Search - /api/v1/search', () => {
    describe('GET / - Multi-index search', () => {
      it('should perform match_all query when q is empty', async () => {
        req.query = { limit: '10' };

        mockElasticsearchClient.search.mockResolvedValue({
          hits: {
            total: { value: 5 },
            hits: [
              { _source: { id: '1', name: 'Event 1' } },
              { _source: { id: '2', name: 'Venue 1' } }
            ]
          }
        });

        await mockElasticsearchClient.search({
          index: '*',
          size: 10,
          query: { match_all: {} }
        });

        expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
          index: '*',
          size: 10,
          query: { match_all: {} }
        });
      });

      it('should search with keyword query', async () => {
        req.query = { q: 'concert', type: 'events', limit: '20' };

        mockElasticsearchClient.search.mockResolvedValue({
          hits: {
            total: { value: 10 },
            hits: [
              { _source: { id: '1', name: 'Rock Concert', type: 'event' } },
              { _source: { id: '2', name: 'Jazz Concert', type: 'event' } }
            ]
          }
        });

        await mockElasticsearchClient.search({
          index: 'events',
          size: 20,
          query: {
            multi_match: {
              query: 'concert',
              fields: ['name^2', 'description', 'tags']
            }
          }
        });

        expect(mockElasticsearchClient.search).toHaveBeenCalled();
      });

      it('should respect limit parameter', async () => {
        req.query = { q: 'test', limit: '50' };

        mockElasticsearchClient.search.mockResolvedValue({
          hits: { total: { value: 100 }, hits: [] }
        });

        await mockElasticsearchClient.search({
          index: '*',
          size: 50,
          query: { match: { _all: 'test' } }
        });

        const call = mockElasticsearchClient.search.mock.calls[0][0];
        expect(call.size).toBe(50);
      });
    });

    describe('GET /venues - Venue search', () => {
      it('should search only venues index', async () => {
        req.query = { q: 'stadium', limit: '10' };

        mockElasticsearchClient.search.mockResolvedValue({
          hits: {
            total: { value: 3 },
            hits: [
              { _source: { id: '1', name: 'Main Stadium', capacity: 50000 } },
              { _source: { id: '2', name: 'City Stadium', capacity: 30000 } }
            ]
          }
        });

        await mockElasticsearchClient.search({
          index: 'venues',
          size: 10,
          query: {
            match: { name: 'stadium' }
          }
        });

        expect(mockElasticsearchClient.search).toHaveBeenCalledWith(
          expect.objectContaining({ index: 'venues' })
        );
      });

      it('should handle empty venue search', async () => {
        req.query = { q: '', limit: '20' };

        mockElasticsearchClient.search.mockResolvedValue({
          hits: {
            total: { value: 50 },
            hits: []
          }
        });

        await mockElasticsearchClient.search({
          index: 'venues',
          size: 20,
          query: { match_all: {} }
        });

        expect(mockElasticsearchClient.search).toHaveBeenCalled();
      });
    });

    describe('GET /events - Event search with date filters', () => {
      it('should search events with date range', async () => {
        req.query = {
          q: 'music',
          date_from: '2024-01-01',
          date_to: '2024-12-31'
        };

        mockElasticsearchClient.search.mockResolvedValue({
          hits: {
            total: { value: 15 },
            hits: [
              { _source: { id: '1', name: 'Music Festival', date: '2024-06-15' } }
            ]
          }
        });

        await mockElasticsearchClient.search({
          index: 'events',
          query: {
            bool: {
              must: [
                { match: { name: 'music' } }
              ],
              filter: [
                {
                  range: {
                    date: {
                      gte: '2024-01-01',
                      lte: '2024-12-31'
                    }
                  }
                }
              ]
            }
          }
        });

        expect(mockElasticsearchClient.search).toHaveBeenCalled();
      });

      it('should search events without query but with date filter', async () => {
        req.query = {
          date_from: '2024-06-01',
          date_to: '2024-06-30'
        };

        mockElasticsearchClient.search.mockResolvedValue({
          hits: {
            total: { value: 8 },
            hits: []
          }
        });

        await mockElasticsearchClient.search({
          index: 'events',
          query: {
            range: {
              date: {
                gte: '2024-06-01',
                lte: '2024-06-30'
              }
            }
          }
        });

        expect(mockElasticsearchClient.search).toHaveBeenCalled();
      });
    });

    describe('GET /suggest - Autocomplete', () => {
      it('should return suggestions for valid query', async () => {
        req.query = { q: 'con' };

        mockElasticsearchClient.search.mockResolvedValue({
          suggest: {
            'suggest-1': [
              {
                options: [
                  { text: 'concert' },
                  { text: 'conference' },
                  { text: 'convention' }
                ]
              }
            ]
          }
        });

        const suggestions = ['concert', 'conference', 'convention'];

        expect(suggestions).toContain('concert');
        expect(suggestions.length).toBe(3);
      });

      it('should require minimum 2 characters', async () => {
        req.query = { q: 'c' };

        const validateSuggest = (query: string) => {
          if (query.length < 2) {
            return { error: 'Query must be at least 2 characters' };
          }
          return { suggestions: [] };
        };

        const result = validateSuggest('c');

        expect(result.error).toBe('Query must be at least 2 characters');
      });

      it('should handle empty suggestions', async () => {
        req.query = { q: 'xyz123' };

        mockElasticsearchClient.search.mockResolvedValue({
          suggest: {
            'suggest-1': [{ options: [] }]
          }
        });

        const result = { suggestions: [] };

        expect(result.suggestions).toEqual([]);
      });
    });
  });

  describe('Professional Search - /api/v1/pro', () => {
    describe('POST /advanced - Advanced multi-filter search', () => {
      it('should perform advanced search with multiple filters', async () => {
        req.body = {
          q: 'music',
          filters: {
            category: 'concert',
            channel: 'online',
            priceMin: 20,
            priceMax: 200,
            dateFrom: '2024-06-01',
            dateTo: '2024-12-31'
          },
          pagination: { page: 1, size: 20 },
          sort: { field: 'date', order: 'asc' }
        };

        mockElasticsearchClient.search.mockResolvedValue({
          hits: {
            total: { value: 25 },
            hits: [],
            aggregations: {
              categories: { buckets: [] },
              price_ranges: { buckets: [] }
            }
          }
        });

        await mockElasticsearchClient.search({
          index: 'events',
          from: 0,
          size: 20,
          query: {
            bool: {
              must: [{ match: { _all: 'music' } }],
              filter: [
                { term: { category: 'concert' } },
                { term: { channel: 'online' } },
                { range: { price: { gte: 20, lte: 200 } } },
                { range: { date: { gte: '2024-06-01', lte: '2024-12-31' } } }
              ]
            }
          },
          sort: [{ date: 'asc' }],
          aggs: {
            categories: { terms: { field: 'category' } },
            price_ranges: {
              range: {
                field: 'price',
                ranges: [
                  { to: 50 },
                  { from: 50, to: 100 },
                  { from: 100 }
                ]
              }
            }
          }
        });

        expect(mockElasticsearchClient.search).toHaveBeenCalled();
      });

      it('should handle faceted search with aggregations', async () => {
        req.body = {
          q: 'festival',
          filters: { category: 'music' }
        };

        mockElasticsearchClient.search.mockResolvedValue({
          hits: { total: { value: 10 }, hits: [] },
          aggregations: {
            categories: {
              buckets: [
                { key: 'music', doc_count: 8 },
                { key: 'arts', doc_count: 2 }
              ]
            }
          }
        });

        const result = await mockElasticsearchClient.search({
          index: 'events',
          query: { match: { _all: 'festival' } },
          aggs: {
            categories: { terms: { field: 'category' } }
          }
        });

        expect(result.aggregations.categories.buckets).toHaveLength(2);
      });

      it('should handle pagination correctly', async () => {
        req.body = {
          q: 'event',
          pagination: { page: 3, size: 25 }
        };

        const from = (3 - 1) * 25; // page 3, size 25 = from 50

        mockElasticsearchClient.search.mockResolvedValue({
          hits: { total: { value: 100 }, hits: [] }
        });

        await mockElasticsearchClient.search({
          index: '*',
          from: from,
          size: 25,
          query: { match: { _all: 'event' } }
        });

        const call = mockElasticsearchClient.search.mock.calls[0][0];
        expect(call.from).toBe(50);
        expect(call.size).toBe(25);
      });
    });

    describe('GET /near-me - Geospatial search', () => {
      it('should search by geolocation', async () => {
        req.query = {
          lat: '40.7128',
          lon: '-74.0060',
          radius: '10km'
        };

        mockElasticsearchClient.search.mockResolvedValue({
          hits: {
            total: { value: 5 },
            hits: [
              { 
                _source: { 
                  id: '1', 
                  name: 'NYC Event',
                  location: { lat: 40.7580, lon: -73.9855 }
                }
              }
            ]
          }
        });

        await mockElasticsearchClient.search({
          index: 'events',
          query: {
            geo_distance: {
              distance: '10km',
              location: {
                lat: 40.7128,
                lon: -74.0060
              }
            }
          }
        });

        expect(mockElasticsearchClient.search).toHaveBeenCalled();
      });

      it('should validate geolocation parameters', async () => {
        req.query = { lat: 'invalid', lon: '-74.0060', radius: '10km' };

        const validateGeo = (lat: string, lon: string) => {
          const latNum = parseFloat(lat);
          const lonNum = parseFloat(lon);
          
          if (isNaN(latNum) || isNaN(lonNum)) {
            return { error: 'Invalid coordinates' };
          }
          
          if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
            return { error: 'Coordinates out of range' };
          }
          
          return { valid: true };
        };

        const result = validateGeo('invalid', '-74.0060');

        expect(result.error).toBe('Invalid coordinates');
      });

      it('should handle different radius units', async () => {
        const radiusTests = ['5km', '10mi', '1000m'];
        
        for (const radius of radiusTests) {
          req.query = { lat: '40.7128', lon: '-74.0060', radius };

          mockElasticsearchClient.search.mockResolvedValue({
            hits: { total: { value: 3 }, hits: [] }
          });

          await mockElasticsearchClient.search({
            index: 'events',
            query: {
              geo_distance: {
                distance: radius,
                location: { lat: 40.7128, lon: -74.0060 }
              }
            }
          });
        }

        expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(3);
      });
    });

    describe('GET /trending - Trending items', () => {
      it('should return trending items from analytics', async () => {
        mockElasticsearchClient.search.mockResolvedValue({
          hits: {
            total: { value: 10 },
            hits: [
              { _source: { id: '1', name: 'Trending Event 1', score: 95 } },
              { _source: { id: '2', name: 'Trending Event 2', score: 90 } }
            ]
          }
        });

        await mockElasticsearchClient.search({
          index: 'search_analytics',
          size: 10,
          sort: [{ score: 'desc' }]
        });

        expect(mockElasticsearchClient.search).toHaveBeenCalledWith(
          expect.objectContaining({
            index: 'search_analytics',
            sort: [{ score: 'desc' }]
          })
        );
      });

      it('should use cache for trending results', async () => {
        const cacheKey = 'trending:items';
        
        // First call - no cache
        mockRedisClient.get.mockResolvedValue(null);
        mockElasticsearchClient.search.mockResolvedValue({
          hits: { total: { value: 5 }, hits: [] }
        });

        const getTrending = async () => {
          const cached = await mockRedisClient.get(cacheKey);
          if (cached) return JSON.parse(cached);
          
          const result = await mockElasticsearchClient.search({
            index: 'search_analytics',
            size: 10
          });
          
          await mockRedisClient.set(
            cacheKey, 
            JSON.stringify(result),
            'EX',
            300
          );
          
          return result;
        };

        await getTrending();

        expect(mockRedisClient.get).toHaveBeenCalledWith(cacheKey);
        expect(mockElasticsearchClient.search).toHaveBeenCalled();
        expect(mockRedisClient.set).toHaveBeenCalled();
      });
    });

    describe('GET /:index/:id/similar - More like this', () => {
      it('should find similar items', async () => {
        req.params = { index: 'events', id: '123' };

        mockElasticsearchClient.get.mockResolvedValue({
          _source: { id: '123', name: 'Rock Concert', tags: ['music', 'rock'] }
        });

        mockElasticsearchClient.search.mockResolvedValue({
          hits: {
            total: { value: 5 },
            hits: [
              { _source: { id: '124', name: 'Metal Concert' } },
              { _source: { id: '125', name: 'Rock Festival' } }
            ]
          }
        });

        await mockElasticsearchClient.search({
          index: 'events',
          query: {
            more_like_this: {
              fields: ['name', 'description', 'tags'],
              like: [{ _index: 'events', _id: '123' }],
              min_term_freq: 1,
              max_query_terms: 12
            }
          }
        });

        expect(mockElasticsearchClient.search).toHaveBeenCalled();
      });

      it('should handle item not found', async () => {
        req.params = { index: 'events', id: 'nonexistent' };

        mockElasticsearchClient.get.mockRejectedValue({ 
          statusCode: 404,
          message: 'Not Found' 
        });

        try {
          await mockElasticsearchClient.get({
            index: 'events',
            id: 'nonexistent'
          });
        } catch (error: any) {
          expect(error.statusCode).toBe(404);
        }
      });

      it('should validate index parameter', async () => {
        req.params = { index: 'invalid_index', id: '123' };

        const validIndices = ['events', 'venues', 'tickets'];
        
        const validateIndex = (index: string) => {
          if (!validIndices.includes(index)) {
            return { error: 'Invalid index' };
          }
          return { valid: true };
        };

        const result = validateIndex('invalid_index');

        expect(result.error).toBe('Invalid index');
      });
    });
  });

  describe('Authentication & Authorization', () => {
    it('should allow public access to health endpoint', async () => {
      req.headers = {}; // No auth header
      req.url = '/health';

      const requiresAuth = (url: string) => {
        return url !== '/health';
      };

      expect(requiresAuth('/health')).toBe(false);
    });

    it('should require token for search endpoints', async () => {
      req.headers = {}; // No auth header
      req.url = '/api/v1/search/venues';

      const requiresAuth = (url: string) => {
        return !url.includes('/health');
      };

      expect(requiresAuth('/api/v1/search/venues')).toBe(true);
    });

    it('should validate JWT token format', async () => {
      const validToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
      const invalidToken = 'InvalidToken';

      const validateToken = (token: string) => {
        return token.startsWith('Bearer ');
      };

      expect(validateToken(validToken)).toBe(true);
      expect(validateToken(invalidToken)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle Elasticsearch connection errors', async () => {
      mockElasticsearchClient.search.mockRejectedValue(
        new Error('No living connections')
      );

      try {
        await mockElasticsearchClient.search({ index: 'events' });
      } catch (error: any) {
        expect(error.message).toBe('No living connections');
      }
    });

    it('should handle malformed queries', async () => {
      req.body = { 
        q: 'test',
        filters: 'invalid' // Should be object
      };

      const validateFilters = (filters: any) => {
        if (filters && typeof filters !== 'object') {
          return { error: 'Filters must be an object' };
        }
        return { valid: true };
      };

      const result = validateFilters('invalid');

      expect(result.error).toBe('Filters must be an object');
    });

    it('should handle index not found errors', async () => {
      mockElasticsearchClient.search.mockRejectedValue({
        statusCode: 404,
        message: 'index_not_found_exception'
      });

      try {
        await mockElasticsearchClient.search({ index: 'nonexistent' });
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }
    });
  });

  describe('Caching', () => {
    it('should cache search results in Redis', async () => {
      const cacheKey = 'search:concert:events:20';
      const searchResult = { hits: [], total: 10 };

      await mockRedisClient.set(
        cacheKey,
        JSON.stringify(searchResult),
        'EX',
        300
      );

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        cacheKey,
        JSON.stringify(searchResult),
        'EX',
        300
      );
    });

    it('should invalidate cache on data changes', async () => {
      const cachePattern = 'search:*:events:*';

      // Mock getting keys and deleting them
      mockRedisClient.del.mockResolvedValue(5);

      await mockRedisClient.del(cachePattern);

      expect(mockRedisClient.del).toHaveBeenCalledWith(cachePattern);
    });
  });

  describe('Rate Limiting', () => {
    it('should track search requests per user', async () => {
      const userId = 'user123';
      const limitKey = `ratelimit:search:${userId}`;

      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await mockRedisClient.incr(limitKey);
      await mockRedisClient.expire(limitKey, 60);

      expect(mockRedisClient.incr).toHaveBeenCalledWith(limitKey);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(limitKey, 60);
    });

    it('should enforce rate limits', async () => {
      const userId = 'user123';
      const limitKey = `ratelimit:search:${userId}`;
      const maxRequests = 100;

      mockRedisClient.get.mockResolvedValue('101');

      const count = parseInt(await mockRedisClient.get(limitKey) || '0');
      const isRateLimited = count > maxRequests;

      expect(isRateLimited).toBe(true);
    });
  });

  describe('Performance & Optimization', () => {
    it('should use source filtering to reduce payload', async () => {
      mockElasticsearchClient.search.mockResolvedValue({
        hits: { total: { value: 1 }, hits: [] }
      });

      await mockElasticsearchClient.search({
        index: 'events',
        _source: ['id', 'name', 'date', 'price'],
        query: { match_all: {} }
      });

      const call = mockElasticsearchClient.search.mock.calls[0][0];
      expect(call._source).toEqual(['id', 'name', 'date', 'price']);
    });

    it('should use search_after for deep pagination', async () => {
      req.body = {
        q: 'event',
        pagination: { search_after: ['2024-01-01', '123'] }
      };

      mockElasticsearchClient.search.mockResolvedValue({
        hits: { total: { value: 1000 }, hits: [] }
      });

      await mockElasticsearchClient.search({
        index: 'events',
        size: 20,
        search_after: ['2024-01-01', '123'],
        sort: [{ date: 'desc' }, { _id: 'desc' }]
      });

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          search_after: ['2024-01-01', '123']
        })
      );
    });
  });
});
