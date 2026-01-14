/**
 * Venue Analytics Controller Unit Tests
 * 
 * Tests the venue analytics controller handlers for:
 * - getVenueDashboard: Get venue dashboard with event stats
 * - getVenueAnalytics: Get venue analytics with revenue data
 */

import {
  getVenueDashboard,
  getVenueAnalytics
} from '../../../src/controllers/venue-analytics.controller';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn()
  }
}));

describe('Venue Analytics Controller', () => {
  let mockDb: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn()
    });

    mockRequest = {
      params: { venueId: 'venue-123' },
      container: { cradle: { db: mockDb } }
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('getVenueDashboard', () => {
    it('should return venue dashboard with stats', async () => {
      const events = [{ id: 'event-1' }, { id: 'event-2' }];
      const stats = {
        total_capacity: '600',
        total_sold: '100',
        total_reserved: '50',
        total_available: '450'
      };

      const mockChain = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(stats)
      };
      mockDb.mockReturnValue(mockChain);

      // First call returns events
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(events)
      });

      // Second call returns stats
      mockDb.mockReturnValueOnce(mockChain);

      await getVenueDashboard(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        venue: { id: 'venue-123', name: 'Venue Dashboard' },
        events: 2
      }));
    });

    it('should handle null stats', async () => {
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([])
      });

      mockDb.mockReturnValueOnce({
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      await getVenueDashboard(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        stats: {
          total_capacity: 0,
          total_sold: 0,
          total_reserved: 0,
          available: 0
        }
      }));
    });

    it('should handle database errors', async () => {
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      await getVenueDashboard(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get venue dashboard'
      });
    });
  });

  describe('getVenueAnalytics', () => {
    it('should return venue analytics', async () => {
      const analytics = {
        total_events: '5',
        total_revenue: '5000.00',
        total_tickets_sold: '100'
      };

      mockDb.mockReturnValueOnce({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(analytics)
      });

      await getVenueAnalytics(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        venueId: 'venue-123',
        analytics: {
          total_events: 5,
          total_revenue: 5000.00,
          total_tickets_sold: 100
        }
      });
    });

    it('should handle null analytics values', async () => {
      mockDb.mockReturnValueOnce({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      await getVenueAnalytics(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        venueId: 'venue-123',
        analytics: {
          total_events: 0,
          total_revenue: 0,
          total_tickets_sold: 0
        }
      });
    });

    it('should handle database errors', async () => {
      mockDb.mockReturnValueOnce({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      await getVenueAnalytics(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get analytics'
      });
    });
  });
});
