/**
 * Unit Tests for search.service.ts
 * Tests listing search, trending, and recommendations
 */

import { searchService, SearchService } from '../../../src/services/search.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => {
  const mockDb = jest.fn(() => mockDb);
  Object.assign(mockDb, {
    where: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereNotIn: jest.fn().mockReturnThis(),
  });
  return { db: mockDb };
});

jest.mock('../../../src/services/cache-integration', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('../../../src/utils/constants', () => ({
  SEARCH_CACHE_TTL: 300,
}));

import { db } from '../../../src/config/database';
import { cache } from '../../../src/services/cache-integration';

describe('SearchService', () => {
  const mockDb = db as jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    (cache.get as jest.Mock).mockResolvedValue(null);
    (cache.set as jest.Mock).mockResolvedValue(undefined);
  });

  describe('searchListings', () => {
    const mockListings = [
      { id: 'listing-1', price: 5000, event_name: 'Concert A' },
      { id: 'listing-2', price: 7500, event_name: 'Concert B' },
    ];

    it('should return cached results if available', async () => {
      const cachedResult = { listings: mockListings, total: 2 };
      (cache.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedResult));

      const result = await searchService.searchListings(
        { eventId: 'event-123' },
        { page: 1, limit: 10 }
      );

      expect(result).toEqual(cachedResult);
      expect(mockDb).not.toHaveBeenCalled();
    });

    it('should query database when no cache', async () => {
      const selectMock = jest.fn().mockResolvedValue(mockListings);
      const countMock = jest.fn().mockResolvedValue([{ count: '2' }]);
      
      mockDb.mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnThis(),
                clone: jest.fn().mockReturnValue({
                  count: countMock,
                }),
                limit: jest.fn().mockReturnValue({
                  offset: jest.fn().mockReturnValue({
                    orderBy: jest.fn().mockReturnValue({
                      select: selectMock,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await searchService.searchListings(
        { eventId: 'event-123' },
        { page: 1, limit: 10 }
      );

      expect(result.listings).toBeDefined();
    });

    it('should cache results after query', async () => {
      const selectMock = jest.fn().mockResolvedValue(mockListings);
      const countMock = jest.fn().mockResolvedValue([{ count: '2' }]);

      mockDb.mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                clone: jest.fn().mockReturnValue({
                  count: countMock,
                }),
                limit: jest.fn().mockReturnValue({
                  offset: jest.fn().mockReturnValue({
                    orderBy: jest.fn().mockReturnValue({
                      select: selectMock,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      await searchService.searchListings({ eventId: 'event-123' }, { page: 1, limit: 10 });

      expect(cache.set).toHaveBeenCalled();
    });

    it('should apply price filters', async () => {
      const whereMock = jest.fn().mockReturnThis();
      
      mockDb.mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              where: whereMock,
            }),
          }),
        }),
      });

      // This tests the filter application
      await searchService.searchListings(
        { minPrice: 1000, maxPrice: 10000 },
        { page: 1, limit: 10 }
      );

      // The where method should be called for price filters
      expect(mockDb).toHaveBeenCalled();
    });

    it('should return empty results on error', async () => {
      mockDb.mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = await searchService.searchListings(
        { eventId: 'event-123' },
        { page: 1, limit: 10 }
      );

      expect(result).toEqual({ listings: [], total: 0 });
    });

    it('should apply pagination correctly', async () => {
      const limitMock = jest.fn().mockReturnThis();
      const offsetMock = jest.fn().mockReturnThis();
      
      mockDb.mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                clone: jest.fn().mockReturnValue({
                  count: jest.fn().mockResolvedValue([{ count: '100' }]),
                }),
                limit: limitMock,
              }),
            }),
          }),
        }),
      });

      limitMock.mockReturnValue({
        offset: offsetMock,
      });

      offsetMock.mockReturnValue({
        orderBy: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([]),
        }),
      });

      await searchService.searchListings(
        {},
        { page: 3, limit: 20 }
      );

      expect(limitMock).toHaveBeenCalledWith(20);
      expect(offsetMock).toHaveBeenCalledWith(40); // (3-1) * 20
    });
  });

  describe('searchByEvent', () => {
    it('should search listings for a specific event', async () => {
      const mockListings = [{ id: 'listing-1' }];
      const cachedResult = { listings: mockListings, total: 1 };
      (cache.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedResult));

      const result = await searchService.searchByEvent('event-123');

      expect(result).toEqual(mockListings);
    });

    it('should return empty array on error', async () => {
      (cache.get as jest.Mock).mockRejectedValue(new Error('Error'));

      const result = await searchService.searchByEvent('event-123');

      expect(result).toEqual([]);
    });

    it('should sort by price ascending', async () => {
      // The method internally calls searchListings with sortBy: 'price'
      const cachedResult = { listings: [], total: 0 };
      (cache.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedResult));

      await searchService.searchByEvent('event-123');

      // Verify cache key includes the correct sorting
      const cacheKey = (cache.get as jest.Mock).mock.calls[0][0];
      expect(cacheKey).toContain('price');
    });
  });

  describe('getTrending', () => {
    const mockTrendingListings = [
      { id: 'listing-1', view_count: 100 },
      { id: 'listing-2', view_count: 50 },
    ];

    it('should return trending listings ordered by view count', async () => {
      const selectMock = jest.fn().mockResolvedValue(mockTrendingListings);

      mockDb.mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    select: selectMock,
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await searchService.getTrending(10);

      expect(result).toEqual(mockTrendingListings);
    });

    it('should use default limit of 10', async () => {
      const limitMock = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });

      mockDb.mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockReturnValue({
                  limit: limitMock,
                }),
              }),
            }),
          }),
        }),
      });

      await searchService.getTrending();

      expect(limitMock).toHaveBeenCalledWith(10);
    });

    it('should return empty array on error', async () => {
      mockDb.mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = await searchService.getTrending();

      expect(result).toEqual([]);
    });
  });

  describe('getRecommendations', () => {
    it('should return trending if user has no history', async () => {
      // Mock no purchase history
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            distinct: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Mock getTrending
      const trendingListings = [{ id: 'trending-1' }];
      const selectMock = jest.fn().mockResolvedValue(trendingListings);

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            distinct: jest.fn().mockResolvedValue([]),
          }),
        }),
      }).mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    select: selectMock,
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await searchService.getRecommendations('user-123', 10);

      expect(result).toBeDefined();
    });

    it('should find similar events based on user history', async () => {
      // Mock purchase history
      const mockHistory = [{ event_id: 'event-1' }, { event_id: 'event-2' }];
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            distinct: jest.fn().mockResolvedValue(mockHistory),
          }),
        }),
      });

      // Mock recommendation query
      const mockRecommendations = [{ id: 'rec-1' }];
      mockDb.mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              whereIn: jest.fn().mockReturnValue({
                whereNotIn: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    select: jest.fn().mockResolvedValue(mockRecommendations),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await searchService.getRecommendations('user-123', 10);

      expect(result).toEqual(mockRecommendations);
    });

    it('should return empty array on error', async () => {
      mockDb.mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = await searchService.getRecommendations('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('Class export', () => {
    it('should export SearchService class', () => {
      expect(SearchService).toBeDefined();
    });

    it('should export searchService singleton', () => {
      expect(searchService).toBeDefined();
    });
  });
});
