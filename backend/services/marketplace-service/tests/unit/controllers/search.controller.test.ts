/**
 * Unit Tests for SearchController
 * Tests HTTP handlers for search operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { SearchController, searchController } from '../../../src/controllers/search.controller';
import { listingService } from '../../../src/services/listing.service';

// Mock dependencies
jest.mock('../../../src/services/listing.service');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('SearchController', () => {
  let controller: SearchController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SearchController();

    mockRequest = {
      params: {},
      query: {},
      body: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
    };
  });

  describe('searchListings', () => {
    it('should search listings with default parameters', async () => {
      const mockListings = [
        { id: 'listing-1', price: 10000, event_id: 'event-1' },
        { id: 'listing-2', price: 15000, event_id: 'event-1' },
      ];

      mockRequest.query = {};

      (listingService.searchListings as jest.Mock).mockResolvedValue(mockListings);

      await controller.searchListings(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(listingService.searchListings).toHaveBeenCalledWith({
        eventId: undefined,
        venueId: undefined,
        minPrice: undefined,
        maxPrice: undefined,
        sortBy: 'price',
        sortOrder: 'asc',
        limit: 20,
        offset: 0,
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockListings,
        pagination: {
          limit: 20,
          offset: 0,
        },
      });
    });

    it('should search listings with all filter parameters', async () => {
      const mockListings = [
        { id: 'listing-1', price: 12000, event_id: 'event-123' },
      ];

      mockRequest.query = {
        eventId: 'event-123',
        venueId: 'venue-456',
        minPrice: '10000',
        maxPrice: '20000',
        sortBy: 'createdAt',
        sortOrder: 'desc',
        limit: '50',
        offset: '25',
      };

      (listingService.searchListings as jest.Mock).mockResolvedValue(mockListings);

      await controller.searchListings(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(listingService.searchListings).toHaveBeenCalledWith({
        eventId: 'event-123',
        venueId: 'venue-456',
        minPrice: 10000,
        maxPrice: 20000,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        limit: 50,
        offset: 25,
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockListings,
        pagination: {
          limit: 50,
          offset: 25,
        },
      });
    });

    it('should return empty array when no listings found', async () => {
      mockRequest.query = { eventId: 'non-existent-event' };

      (listingService.searchListings as jest.Mock).mockResolvedValue([]);

      await controller.searchListings(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: [],
        pagination: {
          limit: 20,
          offset: 0,
        },
      });
    });

    it('should propagate service errors', async () => {
      const error = new Error('Database error');
      mockRequest.query = {};

      (listingService.searchListings as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.searchListings(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getPriceRange', () => {
    it('should return price range data', async () => {
      await controller.getPriceRange(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          min: 50,
          max: 500,
          average: 150,
          median: 125,
        },
      });
    });
  });

  describe('getCategories', () => {
    it('should return event categories', async () => {
      await controller.getCategories(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: 'concert', name: 'Concerts', count: 150 },
          { id: 'sports', name: 'Sports', count: 230 },
          { id: 'theater', name: 'Theater', count: 80 },
          { id: 'comedy', name: 'Comedy', count: 45 },
        ],
      });
    });
  });

  describe('getRecommended', () => {
    it('should return empty recommendations (stub)', async () => {
      await controller.getRecommended(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ recommendations: [] });
    });
  });

  describe('getWatchlist', () => {
    it('should return empty watchlist (stub)', async () => {
      await controller.getWatchlist(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ watchlist: [] });
    });
  });

  describe('exported instance', () => {
    it('should export controller instance', () => {
      expect(searchController).toBeInstanceOf(SearchController);
    });
  });
});
