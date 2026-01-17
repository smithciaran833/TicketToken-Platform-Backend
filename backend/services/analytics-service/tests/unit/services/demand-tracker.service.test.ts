/**
 * Demand Tracker Service Unit Tests
 */

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

const mockDb = { raw: jest.fn() };

jest.mock('../../../src/config/database', () => ({
  getDb: jest.fn(() => mockDb),
}));

const mockInfluxDBService = {
  writeMetric: jest.fn(),
};

jest.mock('../../../src/services/influxdb.service', () => ({
  influxDBService: mockInfluxDBService,
}));

import { DemandTrackerService, demandTrackerService } from '../../../src/services/demand-tracker.service';

describe('DemandTrackerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = DemandTrackerService.getInstance();
      const instance2 = DemandTrackerService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('calculateDemand', () => {
    it('should calculate demand metrics for an event', async () => {
      const eventData = { id: 'event-123', start_time: new Date(Date.now() + 48 * 60 * 60 * 1000), capacity: 1000, tickets_sold: 600 };
      const salesData = { count: '24' };
      const elasticityData = [
        { price_cents: 5000, sales_count: 50, created_at: '2024-01-01' },
        { price_cents: 5500, sales_count: 40, created_at: '2024-01-02' },
      ];

      mockDb.raw
        .mockResolvedValueOnce({ rows: [eventData] })
        .mockResolvedValueOnce({ rows: [salesData] })
        .mockResolvedValueOnce({ rows: elasticityData });

      const result = await demandTrackerService.calculateDemand('event-123');

      expect(result).toEqual(expect.objectContaining({
        eventId: 'event-123',
        sellThroughRate: 0.6,
        currentCapacity: 1000,
        ticketsSold: 600,
      }));
      expect(result.salesVelocity).toBeGreaterThanOrEqual(0);
      expect(result.timeUntilEvent).toBeGreaterThan(0);
    });

    it('should throw error when event not found', async () => {
      mockDb.raw.mockResolvedValue({ rows: [] });

      await expect(demandTrackerService.calculateDemand('nonexistent')).rejects.toThrow('Event not found');
    });

    it('should handle database errors', async () => {
      mockDb.raw.mockRejectedValue(new Error('Database connection failed'));

      await expect(demandTrackerService.calculateDemand('event-123')).rejects.toThrow('Database connection failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return default elasticity when insufficient data', async () => {
      const eventData = { id: 'event-123', start_time: new Date(Date.now() + 24 * 60 * 60 * 1000), capacity: 500, tickets_sold: 100 };
      mockDb.raw
        .mockResolvedValueOnce({ rows: [eventData] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ price_cents: 5000, sales_count: 50 }] });

      const result = await demandTrackerService.calculateDemand('event-123');

      expect(result.priceElasticity).toBe(1.0);
    });
  });

  describe('trackSalesVelocity', () => {
    it('should track and write sales velocity to InfluxDB', async () => {
      mockDb.raw
        .mockResolvedValueOnce({ rows: [{ count: '15' }] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-123' }] });

      const result = await demandTrackerService.trackSalesVelocity('event-123');

      expect(result).toBe(15);
      expect(mockInfluxDBService.writeMetric).toHaveBeenCalledWith(
        'venue-123',
        'sales_velocity',
        15,
        { event_id: 'event-123' }
      );
    });

    it('should handle errors during tracking', async () => {
      mockDb.raw.mockRejectedValue(new Error('Query failed'));

      await expect(demandTrackerService.trackSalesVelocity('event-123')).rejects.toThrow('Query failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
