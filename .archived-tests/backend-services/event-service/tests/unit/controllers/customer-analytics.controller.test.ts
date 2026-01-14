// Mock dependencies BEFORE imports
jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock EventScheduleModel
jest.mock('../../../src/models', () => ({
  EventScheduleModel: jest.fn(),
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import * as customerAnalyticsController from '../../../src/controllers/customer-analytics.controller';
import { EventScheduleModel } from '../../../src/models';

describe('Customer Analytics Controller', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockDb: any;
  let mockScheduleModel: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockScheduleModel = {
      findByEventId: jest.fn(),
    };

    (EventScheduleModel as jest.MockedClass<typeof EventScheduleModel>).mockImplementation(() => mockScheduleModel);

    // Mock db with knex-like query builder
    const mockJoin = jest.fn().mockReturnThis();
    const mockSelect = jest.fn().mockReturnThis();
    const mockWhere = jest.fn().mockReturnThis();
    const mockLimit = jest.fn();

    mockDb = jest.fn(() => ({
      join: mockJoin,
      select: mockSelect,
      where: mockWhere,
      limit: mockLimit,
    }));

    mockDb.join = mockJoin;
    mockDb.select = mockSelect;
    mockDb.where = mockWhere;
    mockDb.limit = mockLimit;

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

  describe('getCustomerProfile', () => {
    it('should return customer profile with purchases', async () => {
      const mockPurchases = [
        {
          event_name: 'Concert 2024',
          event_id: 'event-1',
          tier_name: 'VIP',
          base_price: 100,
        },
        {
          event_name: 'Festival 2024',
          event_id: 'event-2',
          tier_name: 'General',
          base_price: 50,
        },
      ];

      const mockSchedules = [
        { id: 'schedule-1', starts_at: new Date('2024-12-01') },
      ];

      mockRequest.params = { customerId: 'customer-1' };
      mockDb().limit.mockResolvedValue(mockPurchases);
      mockScheduleModel.findByEventId.mockResolvedValue(mockSchedules);

      await customerAnalyticsController.getCustomerProfile(
        mockRequest as any,
        mockReply as any
      );

      expect(mockDb).toHaveBeenCalledWith('event_pricing');
      expect(mockDb().join).toHaveBeenCalledWith('events', 'event_pricing.event_id', 'events.id');
      expect(mockDb().where).toHaveBeenCalledWith('event_pricing.is_active', true);
      expect(mockDb().limit).toHaveBeenCalledWith(10);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        customerId: 'customer-1',
        profile: {
          total_purchases: 2,
          recent_purchases: expect.arrayContaining([
            expect.objectContaining({
              event_name: 'Concert 2024',
              tier_name: 'VIP',
              price: 100,
            }),
          ]),
          note: 'This is mock data - real purchase history comes from ticket-service',
        },
      });
    });

    it('should handle empty purchase history', async () => {
      mockRequest.params = { customerId: 'customer-2' };
      mockDb().limit.mockResolvedValue([]);

      await customerAnalyticsController.getCustomerProfile(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        customerId: 'customer-2',
        profile: {
          total_purchases: 0,
          recent_purchases: [],
          note: 'This is mock data - real purchase history comes from ticket-service',
        },
      });
    });

    it('should handle database errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockRequest.params = { customerId: 'customer-1' };
      mockDb().limit.mockRejectedValue(new Error('Database error'));

      await customerAnalyticsController.getCustomerProfile(
        mockRequest as any,
        mockReply as any
      );

      expect(consoleSpy).toHaveBeenCalledWith('Customer profile error:', expect.any(Error));
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get customer profile',
      });

      consoleSpy.mockRestore();
    });

    it('should handle schedule lookup errors gracefully', async () => {
      const mockPurchases = [
        {
          event_name: 'Concert 2024',
          event_id: 'event-1',
          tier_name: 'VIP',
          base_price: 100,
        },
      ];

      mockRequest.params = { customerId: 'customer-1' };
      mockDb().limit.mockResolvedValue(mockPurchases);
      mockScheduleModel.findByEventId.mockRejectedValue(new Error('Schedule error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await customerAnalyticsController.getCustomerProfile(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });
});
