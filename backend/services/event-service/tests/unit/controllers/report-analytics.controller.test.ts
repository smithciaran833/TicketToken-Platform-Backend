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
import * as reportAnalyticsController from '../../../src/controllers/report-analytics.controller';

describe('Report Analytics Controller', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock db with knex-like query builder
    const mockJoin = jest.fn().mockReturnThis();
    const mockLeftJoin = jest.fn().mockReturnThis();
    const mockSelect = jest.fn().mockReturnThis();
    const mockGroupBy = jest.fn().mockReturnThis();
    const mockOrderBy = jest.fn();
    const mockRaw = jest.fn();

    mockDb = jest.fn(() => ({
      join: mockJoin,
      leftJoin: mockLeftJoin,
      select: mockSelect,
      groupBy: mockGroupBy,
      orderBy: mockOrderBy,
      raw: mockRaw,
    }));

    mockDb.join = mockJoin;
    mockDb.leftJoin = mockLeftJoin;
    mockDb.select = mockSelect;
    mockDb.groupBy = mockGroupBy;
    mockDb.orderBy = mockOrderBy;
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

  describe('getSalesReport', () => {
    it('should return sales report', async () => {
      const mockSalesData = [
        {
          id: 'event-1',
          event_name: 'Concert 2024',
          tickets_sold: 150,
          revenue: 7500,
        },
        {
          id: 'event-2',
          event_name: 'Festival 2024',
          tickets_sold: 300,
          revenue: 15000,
        },
      ];

      mockDb().orderBy.mockResolvedValue(mockSalesData);

      await reportAnalyticsController.getSalesReport(
        mockRequest as any,
        mockReply as any
      );

      expect(mockDb).toHaveBeenCalledWith('event_capacity');
      expect(mockDb().join).toHaveBeenCalledWith('events', 'event_capacity.event_id', 'events.id');
      expect(mockDb().join).toHaveBeenCalledWith('event_pricing', 'event_capacity.id', 'event_pricing.capacity_id');
      expect(mockDb().groupBy).toHaveBeenCalledWith('events.id', 'events.name');
      expect(mockDb().orderBy).toHaveBeenCalledWith('revenue', 'desc');

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        report: {
          type: 'sales',
          data: mockSalesData,
          generated_at: expect.any(Date),
          note: 'Revenue calculated from event_capacity.sold_count * event_pricing.base_price',
        },
      });
    });

    it('should handle empty sales data', async () => {
      mockDb().orderBy.mockResolvedValue([]);

      await reportAnalyticsController.getSalesReport(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        report: {
          type: 'sales',
          data: [],
          generated_at: expect.any(Date),
          note: 'Revenue calculated from event_capacity.sold_count * event_pricing.base_price',
        },
      });
    });

    it('should handle database errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockDb().orderBy.mockRejectedValue(new Error('Database error'));

      await reportAnalyticsController.getSalesReport(
        mockRequest as any,
        mockReply as any
      );

      expect(consoleSpy).toHaveBeenCalledWith('Sales report error:', expect.any(Error));
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to generate sales report',
      });

      consoleSpy.mockRestore();
    });
  });

  describe('getVenueComparisonReport', () => {
    it('should return venue comparison report', async () => {
      const mockComparisonData = [
        {
          venue_id: 'venue-1',
          event_count: 5,
          total_sold: 500,
          total_capacity: 1000,
        },
        {
          venue_id: 'venue-2',
          event_count: 3,
          total_sold: 300,
          total_capacity: 600,
        },
      ];

      mockDb().orderBy.mockResolvedValue(mockComparisonData);

      await reportAnalyticsController.getVenueComparisonReport(
        mockRequest as any,
        mockReply as any
      );

      expect(mockDb).toHaveBeenCalledWith('events');
      expect(mockDb().leftJoin).toHaveBeenCalledWith('event_capacity', 'events.id', 'event_capacity.event_id');
      expect(mockDb().groupBy).toHaveBeenCalledWith('events.venue_id');
      expect(mockDb().orderBy).toHaveBeenCalledWith('total_sold', 'desc');

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        report: {
          type: 'venue_comparison',
          data: mockComparisonData,
          generated_at: expect.any(Date),
        },
      });
    });

    it('should handle database errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockDb().orderBy.mockRejectedValue(new Error('Database error'));

      await reportAnalyticsController.getVenueComparisonReport(
        mockRequest as any,
        mockReply as any
      );

      expect(consoleSpy).toHaveBeenCalledWith('Venue comparison error:', expect.any(Error));
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to generate venue comparison',
      });

      consoleSpy.mockRestore();
    });
  });

  describe('getCustomerInsightsReport', () => {
    it('should return customer insights report', async () => {
      const mockInsightsData = [
        {
          category: 'Music',
          tickets_sold: 800,
          avg_ticket_price: 75.5,
        },
        {
          category: 'Sports',
          tickets_sold: 600,
          avg_ticket_price: 125.0,
        },
      ];

      mockDb().orderBy.mockResolvedValue(mockInsightsData);

      await reportAnalyticsController.getCustomerInsightsReport(
        mockRequest as any,
        mockReply as any
      );

      expect(mockDb).toHaveBeenCalledWith('events');
      expect(mockDb().join).toHaveBeenCalledWith('event_categories', 'events.primary_category_id', 'event_categories.id');
      expect(mockDb().leftJoin).toHaveBeenCalledWith('event_capacity', 'events.id', 'event_capacity.event_id');
      expect(mockDb().leftJoin).toHaveBeenCalledWith('event_pricing', 'event_capacity.id', 'event_pricing.capacity_id');
      expect(mockDb().groupBy).toHaveBeenCalledWith('event_categories.id', 'event_categories.name');
      expect(mockDb().orderBy).toHaveBeenCalledWith('tickets_sold', 'desc');

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        report: {
          type: 'customer_insights',
          data: mockInsightsData,
          generated_at: expect.any(Date),
        },
      });
    });

    it('should handle database errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockDb().orderBy.mockRejectedValue(new Error('Database error'));

      await reportAnalyticsController.getCustomerInsightsReport(
        mockRequest as any,
        mockReply as any
      );

      expect(consoleSpy).toHaveBeenCalledWith('Customer insights error:', expect.any(Error));
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to generate customer insights',
      });

      consoleSpy.mockRestore();
    });
  });
});
