// Mock dependencies BEFORE imports
jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  })),
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import * as venueAnalyticsController from '../../../src/controllers/venue-analytics.controller';

describe('Venue Analytics Controller', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock db with knex-like query builder
    const mockWhere = jest.fn().mockReturnThis();
    const mockWhereNull = jest.fn().mockReturnThis();
    const mockJoin = jest.fn().mockReturnThis();
    const mockLeftJoin = jest.fn().mockReturnThis();
    const mockSelect = jest.fn().mockReturnThis();
    const mockFirst = jest.fn();
    const mockRaw = jest.fn();

    mockDb = jest.fn(() => ({
      where: mockWhere,
      whereNull: mockWhereNull,
      join: mockJoin,
      leftJoin: mockLeftJoin,
      select: mockSelect,
      first: mockFirst,
      raw: mockRaw,
    }));

    mockDb.where = mockWhere;
    mockDb.whereNull = mockWhereNull;
    mockDb.join = mockJoin;
    mockDb.leftJoin = mockLeftJoin;
    mockDb.select = mockSelect;
    mockDb.first = mockFirst;
    mockDb.raw = mockRaw;

    mockRequest = {
      params: {},
      body: {},
      headers: {},
      log: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      } as any,
      container: {
        cradle: {
          db: mockDb,
        },
      } as any,
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('getVenueDashboard', () => {
    it('should return venue dashboard with stats', async () => {
      const mockEvents = [
        { id: 'event-1', name: 'Concert 2024', venue_id: 'venue-1' },
        { id: 'event-2', name: 'Festival 2024', venue_id: 'venue-1' },
      ];

      const mockStats = {
        total_capacity: '2000',
        total_sold: '1500',
        total_reserved: '300',
        total_available: '200',
      };

      mockRequest.params = { venueId: 'venue-1' };

      // Mock for events query
      mockDb().select.mockResolvedValueOnce(mockEvents);

      // Mock for stats query  
      mockDb().first.mockResolvedValueOnce(mockStats);

      await venueAnalyticsController.getVenueDashboard(
        mockRequest as any,
        mockReply as any
      );

      expect(mockDb).toHaveBeenCalledWith('events');
      expect(mockDb().where).toHaveBeenCalledWith({ venue_id: 'venue-1' });
      expect(mockDb().whereNull).toHaveBeenCalledWith('deleted_at');

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        venue: {
          id: 'venue-1',
          name: 'Venue Dashboard',
        },
        events: 2,
        stats: {
          total_capacity: 2000,
          total_sold: 1500,
          total_reserved: 300,
          available: 200,
        },
      });
    });

    it('should handle venue with no events', async () => {
      mockRequest.params = { venueId: 'venue-2' };

      mockDb().select.mockResolvedValueOnce([]);
      mockDb().first.mockResolvedValueOnce(null);

      await venueAnalyticsController.getVenueDashboard(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        venue: {
          id: 'venue-2',
          name: 'Venue Dashboard',
        },
        events: 0,
        stats: {
          total_capacity: 0,
          total_sold: 0,
          total_reserved: 0,
          available: 0,
        },
      });
    });

    it('should handle database errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockRequest.params = { venueId: 'venue-1' };
      mockDb().select.mockRejectedValue(new Error('Database error'));

      await venueAnalyticsController.getVenueDashboard(
        mockRequest as any,
        mockReply as any
      );

      expect(consoleSpy).toHaveBeenCalledWith('Dashboard error:', expect.any(Error));
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get venue dashboard',
      });

      consoleSpy.mockRestore();
    });
  });

  describe('getVenueAnalytics', () => {
    it('should return venue analytics', async () => {
      const mockAnalytics = {
        total_events: '5',
        total_revenue: '75000.50',
        total_tickets_sold: '1500',
      };

      mockRequest.params = { venueId: 'venue-1' };
      mockDb().first.mockResolvedValue(mockAnalytics);

      await venueAnalyticsController.getVenueAnalytics(
        mockRequest as any,
        mockReply as any
      );

      expect(mockDb).toHaveBeenCalledWith('events');
      expect(mockDb().leftJoin).toHaveBeenCalledWith('event_capacity', 'events.id', 'event_capacity.event_id');
      expect(mockDb().leftJoin).toHaveBeenCalledWith('event_pricing', 'event_capacity.id', 'event_pricing.capacity_id');
      expect(mockDb().where).toHaveBeenCalledWith('events.venue_id', 'venue-1');

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        venueId: 'venue-1',
        analytics: {
          total_events: 5,
          total_revenue: 75000.50,
          total_tickets_sold: 1500,
        },
      });
    });

    it('should handle venue with no data', async () => {
      mockRequest.params = { venueId: 'venue-2' };
      mockDb().first.mockResolvedValue(null);

      await venueAnalyticsController.getVenueAnalytics(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        venueId: 'venue-2',
        analytics: {
          total_events: 0,
          total_revenue: 0,
          total_tickets_sold: 0,
        },
      });
    });

    it('should handle database errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockRequest.params = { venueId: 'venue-1' };
      mockDb().first.mockRejectedValue(new Error('Database error'));

      await venueAnalyticsController.getVenueAnalytics(
        mockRequest as any,
        mockReply as any
      );

      expect(consoleSpy).toHaveBeenCalledWith('Analytics error:', expect.any(Error));
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get analytics',
      });

      consoleSpy.mockRestore();
    });
  });
});
