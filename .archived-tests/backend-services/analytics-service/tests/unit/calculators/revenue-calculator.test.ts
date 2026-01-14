import { RevenueCalculator } from '../../../src/analytics-engine/calculators/revenue-calculator';

// Mock the database functions
const mockAnalyticsDb = {
  select: jest.fn().mockReturnThis(),
  raw: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  whereBetween: jest.fn().mockReturnThis(),
  join: jest.fn().mockReturnThis(),
};

jest.mock('../../../src/config/database', () => ({
  getDb: jest.fn(() => mockAnalyticsDb),
  getAnalyticsDb: jest.fn(() => mockAnalyticsDb),
}));

describe('RevenueCalculator', () => {
  let calculator: RevenueCalculator;
  const validVenueId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  beforeEach(() => {
    calculator = new RevenueCalculator();
    jest.clearAllMocks();
  });

  describe('calculateRevenueByChannel', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-12-31');

    it('should calculate total revenue correctly with valid data', async () => {
      // Mock database response
      mockAnalyticsDb.whereBetween.mockResolvedValueOnce([
        {
          total_revenue: '50000.00',
          total_tickets: '250',
          days_count: '365'
        }
      ]);

      const result = await calculator.calculateRevenueByChannel(
        validVenueId,
        startDate,
        endDate
      );

      expect(result).toEqual({
        channels: [{
          channel: 'Direct Sales',
          ticket_count: 250,
          revenue: 50000,
          percentage: '100.00'
        }],
        total: 50000
      });

      expect(mockAnalyticsDb.where).toHaveBeenCalledWith('venue_id', validVenueId);
    });

    it('should handle empty data gracefully', async () => {
      mockAnalyticsDb.whereBetween.mockResolvedValueOnce([
        {
          total_revenue: null,
          total_tickets: null,
          days_count: '0'
        }
      ]);

      const result = await calculator.calculateRevenueByChannel(
        validVenueId,
        startDate,
        endDate
      );

      expect(result.total).toBe(0);
      expect(result.channels[0].ticket_count).toBe(0);
    });

    it('should throw error for invalid venue ID', async () => {
      await expect(
        calculator.calculateRevenueByChannel('invalid', startDate, endDate)
      ).rejects.toThrow('Invalid venue ID');
    });

    it('should throw error when start date is after end date', async () => {
      await expect(
        calculator.calculateRevenueByChannel(
          validVenueId,
          new Date('2024-12-31'),
          new Date('2024-01-01')
        )
      ).rejects.toThrow('Start date must be before end date');
    });

    it('should throw error for date range over 730 days', async () => {
      const farFutureDate = new Date('2026-01-01');
      
      await expect(
        calculator.calculateRevenueByChannel(validVenueId, startDate, farFutureDate)
      ).rejects.toThrow('Date range too large');
    });

    it('should throw error for invalid start date', async () => {
      await expect(
        calculator.calculateRevenueByChannel(
          validVenueId,
          new Date('invalid'),
          endDate
        )
      ).rejects.toThrow('Invalid start date');
    });
  });

  describe('calculateRevenueByEventType', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-12-31');

    it('should calculate revenue by event type correctly', async () => {
      mockAnalyticsDb.whereBetween.mockResolvedValueOnce([
        {
          total_revenue: '25000.00',
          tickets_sold: '125',
          event_count: '10'
        }
      ]);

      const result = await calculator.calculateRevenueByEventType(
        validVenueId,
        startDate,
        endDate
      );

      expect(result).toEqual([{
        event_type: 'All Events',
        event_count: 10,
        revenue: 25000,
        tickets_sold: 125
      }]);
    });

    it('should handle NaN values gracefully', async () => {
      mockAnalyticsDb.whereBetween.mockResolvedValueOnce([
        {
          total_revenue: 'invalid',
          tickets_sold: 'NaN',
          event_count: null
        }
      ]);

      const result = await calculator.calculateRevenueByEventType(
        validVenueId,
        startDate,
        endDate
      );

      expect(result[0].revenue).toBe(0);
      expect(result[0].tickets_sold).toBe(0);
      expect(result[0].event_count).toBe(0);
    });
  });

  describe('projectRevenue', () => {
    it('should project revenue for valid days', async () => {
      mockAnalyticsDb.where.mockResolvedValueOnce([
        {
          avg_daily_revenue: '500.00'
        }
      ]);

      const result = await calculator.projectRevenue(validVenueId, 30);

      expect(result).toEqual({
        projectedRevenue: 15000, // 500 * 30
        avgDailyRevenue: 500,
        daysProjected: 30
      });
    });

    it('should throw error for projection days less than 1', async () => {
      await expect(
        calculator.projectRevenue(validVenueId, 0)
      ).rejects.toThrow('Invalid projection days');
    });

    it('should throw error for projection days over 365', async () => {
      await expect(
        calculator.projectRevenue(validVenueId, 366)
      ).rejects.toThrow('Invalid projection days');
    });

    it('should throw error for non-integer projection days', async () => {
      await expect(
        calculator.projectRevenue(validVenueId, 30.5)
      ).rejects.toThrow('Invalid projection days: must be an integer');
    });

    it('should handle zero average revenue', async () => {
      mockAnalyticsDb.where.mockResolvedValueOnce([
        {
          avg_daily_revenue: null
        }
      ]);

      const result = await calculator.projectRevenue(validVenueId, 30);

      expect(result.projectedRevenue).toBe(0);
      expect(result.avgDailyRevenue).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle very large revenue values', async () => {
      mockAnalyticsDb.whereBetween.mockResolvedValueOnce([
        {
          total_revenue: '9999999999.99',
          total_tickets: '1000000',
          days_count: '365'
        }
      ]);

      const result = await calculator.calculateRevenueByChannel(
        validVenueId,
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(result.total).toBe(9999999999.99);
      expect(result.channels[0].ticket_count).toBe(1000000);
    });

    it('should handle single day date range', async () => {
      mockAnalyticsDb.whereBetween.mockResolvedValueOnce([
        {
          total_revenue: '1000.00',
          total_tickets: '5',
          days_count: '1'
        }
      ]);

      const singleDay = new Date('2024-06-15');
      const nextDay = new Date('2024-06-16');

      const result = await calculator.calculateRevenueByChannel(
        validVenueId,
        singleDay,
        nextDay
      );

      expect(result.total).toBe(1000);
    });
  });
});
