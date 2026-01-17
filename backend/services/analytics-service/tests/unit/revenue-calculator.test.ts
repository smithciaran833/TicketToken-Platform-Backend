/**
 * Revenue Calculator Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockSelect = jest.fn().mockReturnThis();
const mockJoin = jest.fn().mockReturnThis();
const mockWhere = jest.fn().mockReturnThis();
const mockWhereBetween = jest.fn();
const mockRaw = jest.fn();

const mockDb = jest.fn(() => ({
  select: mockSelect,
  join: mockJoin,
  where: mockWhere,
  whereBetween: mockWhereBetween,
  raw: mockRaw,
}));

mockDb.raw = mockRaw;

jest.mock('../../src/config/database', () => ({
  getAnalyticsDb: jest.fn(() => mockDb),
}));

import { RevenueCalculator } from '../../src/analytics-engine/calculators/revenue-calculator';
import { logger } from '../../src/utils/logger';

describe('RevenueCalculator', () => {
  let calculator: RevenueCalculator;
  const validVenueId = '550e8400-e29b-41d4-a716-446655440000';
  const validStartDate = new Date('2024-01-01');
  const validEndDate = new Date('2024-01-31');

  beforeEach(() => {
    jest.clearAllMocks();
    calculator = new RevenueCalculator();

    // Reset mock chain - make everything chainable
    mockSelect.mockReturnThis();
    mockJoin.mockReturnThis();
    mockWhere.mockReturnThis();
    mockWhereBetween.mockResolvedValue([]);
  });

  describe('validateVenueId', () => {
    it('should throw for empty venue ID', () => {
      expect(() => (calculator as any).validateVenueId('')).toThrow('Invalid venue ID');
    });

    it('should throw for null venue ID', () => {
      expect(() => (calculator as any).validateVenueId(null)).toThrow('Invalid venue ID');
    });

    it('should throw for short venue ID', () => {
      expect(() => (calculator as any).validateVenueId('short')).toThrow('must be at least');
    });

    it('should accept valid venue ID', () => {
      expect(() => (calculator as any).validateVenueId(validVenueId)).not.toThrow();
    });
  });

  describe('validateDateRange', () => {
    it('should throw for invalid start date', () => {
      expect(() => (calculator as any).validateDateRange('invalid', validEndDate)).toThrow('Invalid start date');
    });

    it('should throw for invalid end date', () => {
      expect(() => (calculator as any).validateDateRange(validStartDate, 'invalid')).toThrow('Invalid end date');
    });

    it('should throw when start date is after end date', () => {
      expect(() => (calculator as any).validateDateRange(validEndDate, validStartDate)).toThrow('Start date must be before end date');
    });

    it('should throw for date range exceeding maximum', () => {
      const farFutureDate = new Date(validStartDate.getTime() + 800 * 24 * 60 * 60 * 1000);
      expect(() => (calculator as any).validateDateRange(validStartDate, farFutureDate)).toThrow('Date range too large');
    });

    it('should accept valid date range', () => {
      expect(() => (calculator as any).validateDateRange(validStartDate, validEndDate)).not.toThrow();
    });
  });

  describe('validateProjectionDays', () => {
    it('should throw for non-integer', () => {
      expect(() => (calculator as any).validateProjectionDays(30.5)).toThrow('must be an integer');
    });

    it('should throw for value below minimum', () => {
      expect(() => (calculator as any).validateProjectionDays(0)).toThrow('must be between');
    });

    it('should throw for value above maximum', () => {
      expect(() => (calculator as any).validateProjectionDays(400)).toThrow('must be between');
    });

    it('should accept valid projection days', () => {
      expect(() => (calculator as any).validateProjectionDays(90)).not.toThrow();
    });
  });

  describe('safeParseFloat', () => {
    it('should parse valid float', () => {
      expect((calculator as any).safeParseFloat('123.45')).toBe(123.45);
    });

    it('should return default for invalid value', () => {
      expect((calculator as any).safeParseFloat('invalid')).toBe(0);
    });

    it('should return custom default for invalid value', () => {
      expect((calculator as any).safeParseFloat('invalid', -1)).toBe(-1);
    });

    it('should handle null', () => {
      expect((calculator as any).safeParseFloat(null)).toBe(0);
    });
  });

  describe('safeParseInt', () => {
    it('should parse valid integer', () => {
      expect((calculator as any).safeParseInt('123')).toBe(123);
    });

    it('should return default for invalid value', () => {
      expect((calculator as any).safeParseInt('invalid')).toBe(0);
    });

    it('should return custom default for invalid value', () => {
      expect((calculator as any).safeParseInt('invalid', -1)).toBe(-1);
    });
  });

  describe('calculateRevenueByChannel', () => {
    it('should validate inputs', async () => {
      await expect(calculator.calculateRevenueByChannel('short', validStartDate, validEndDate))
        .rejects.toThrow('Invalid venue ID');
    });

    it('should return revenue data', async () => {
      mockWhereBetween.mockResolvedValueOnce([
        { total_revenue: '10000', total_tickets: '200', days_count: '30' },
      ]);

      const result = await calculator.calculateRevenueByChannel(validVenueId, validStartDate, validEndDate);

      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].channel).toBe('Direct Sales');
      expect(result.total).toBe(10000);
    });

    it('should handle null results', async () => {
      mockWhereBetween.mockResolvedValueOnce([{}]);

      const result = await calculator.calculateRevenueByChannel(validVenueId, validStartDate, validEndDate);

      expect(result.total).toBe(0);
    });

    it('should log calculation', async () => {
      mockWhereBetween.mockResolvedValueOnce([{ total_revenue: '5000', total_tickets: '100' }]);

      await calculator.calculateRevenueByChannel(validVenueId, validStartDate, validEndDate);

      expect(logger.info).toHaveBeenCalledWith('Calculating revenue by channel', expect.any(Object));
      expect(logger.info).toHaveBeenCalledWith('Revenue by channel calculated', expect.any(Object));
    });
  });

  describe('calculateRevenueByEventType', () => {
    it('should validate inputs', async () => {
      await expect(calculator.calculateRevenueByEventType('short', validStartDate, validEndDate))
        .rejects.toThrow('Invalid venue ID');
    });

    it('should return event type data', async () => {
      mockWhereBetween.mockResolvedValueOnce([
        { total_revenue: '15000', tickets_sold: '300', event_count: '5' },
      ]);

      const result = await calculator.calculateRevenueByEventType(validVenueId, validStartDate, validEndDate);

      expect(result).toHaveLength(1);
      expect(result[0].event_type).toBe('All Events');
      expect(result[0].revenue).toBe(15000);
      expect(result[0].tickets_sold).toBe(300);
      expect(result[0].event_count).toBe(5);
    });

    it('should handle empty results', async () => {
      mockWhereBetween.mockResolvedValueOnce([{}]);

      const result = await calculator.calculateRevenueByEventType(validVenueId, validStartDate, validEndDate);

      expect(result[0].revenue).toBe(0);
      expect(result[0].tickets_sold).toBe(0);
    });
  });

  describe('projectRevenue', () => {
    it('should validate venue ID', async () => {
      await expect(calculator.projectRevenue('short', 30)).rejects.toThrow('Invalid venue ID');
    });

    it('should validate projection days', async () => {
      await expect(calculator.projectRevenue(validVenueId, 0)).rejects.toThrow('must be between');
    });

    it('should calculate projection from average daily revenue', async () => {
      // Make where chainable and final where resolves
      mockWhere.mockReturnValueOnce({
        where: jest.fn().mockResolvedValueOnce([{ avg_daily_revenue: '1000' }]),
      });

      const result = await calculator.projectRevenue(validVenueId, 30);

      expect(result.projectedRevenue).toBe(30000); // 1000 * 30
      expect(result.avgDailyRevenue).toBe(1000);
      expect(result.daysProjected).toBe(30);
    });

    it('should handle zero average revenue', async () => {
      mockWhere.mockReturnValueOnce({
        where: jest.fn().mockResolvedValueOnce([{ avg_daily_revenue: null }]),
      });

      const result = await calculator.projectRevenue(validVenueId, 30);

      expect(result.projectedRevenue).toBe(0);
      expect(result.avgDailyRevenue).toBe(0);
    });

    it('should log projection calculation', async () => {
      mockWhere.mockReturnValueOnce({
        where: jest.fn().mockResolvedValueOnce([{ avg_daily_revenue: '500' }]),
      });

      await calculator.projectRevenue(validVenueId, 30);

      expect(logger.info).toHaveBeenCalledWith('Projecting revenue', expect.any(Object));
      expect(logger.info).toHaveBeenCalledWith('Revenue projection calculated', expect.any(Object));
    });
  });
});
