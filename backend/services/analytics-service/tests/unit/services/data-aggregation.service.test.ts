/**
 * Data Aggregation Service Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockMainDbWhere = jest.fn().mockReturnThis();
const mockMainDbWhereRaw = jest.fn().mockReturnThis();
const mockMainDbCount = jest.fn().mockReturnThis();
const mockMainDbSum = jest.fn().mockReturnThis();
const mockMainDbFirst = jest.fn();

const mockMainDb = jest.fn(() => ({
  where: mockMainDbWhere,
  whereRaw: mockMainDbWhereRaw,
  count: mockMainDbCount,
  sum: mockMainDbSum,
  first: mockMainDbFirst,
}));

const mockAnalyticsDbInsert = jest.fn().mockReturnThis();
const mockAnalyticsDbOnConflict = jest.fn().mockReturnThis();
const mockAnalyticsDbMerge = jest.fn().mockResolvedValue(1);

const mockAnalyticsDb = jest.fn(() => ({
  insert: mockAnalyticsDbInsert,
  onConflict: mockAnalyticsDbOnConflict,
  merge: mockAnalyticsDbMerge,
}));

jest.mock('../../../src/config/database', () => ({
  getDb: jest.fn(() => mockMainDb),
  getAnalyticsDb: jest.fn(() => mockAnalyticsDb),
}));

import { DataAggregationService } from '../../../src/services/data-aggregation.service';
import { logger } from '../../../src/utils/logger';

describe('DataAggregationService', () => {
  let service: DataAggregationService;
  const testVenueId = 'venue-123';
  const testDate = new Date('2024-01-15');

  beforeEach(() => {
    jest.clearAllMocks();
    mockMainDbFirst.mockResolvedValue({ count: 0 });
    service = new DataAggregationService();
  });

  describe('aggregateVenueMetrics', () => {
    it('should query tickets from main database', async () => {
      mockMainDbFirst
        .mockResolvedValueOnce({ count: 100 })
        .mockResolvedValueOnce({ total: 5000 });

      await service.aggregateVenueMetrics(testVenueId, testDate);

      expect(mockMainDb).toHaveBeenCalledWith('tickets');
      expect(mockMainDbWhere).toHaveBeenCalledWith('venue_id', testVenueId);
    });

    it('should query revenue from main database', async () => {
      mockMainDbFirst
        .mockResolvedValueOnce({ count: 50 })
        .mockResolvedValueOnce({ total: 2500 });

      await service.aggregateVenueMetrics(testVenueId, testDate);

      expect(mockMainDbSum).toHaveBeenCalledWith('price as total');
    });

    it('should write aggregated data to analytics database', async () => {
      mockMainDbFirst
        .mockResolvedValueOnce({ count: 75 })
        .mockResolvedValueOnce({ total: 3750 });

      await service.aggregateVenueMetrics(testVenueId, testDate);

      expect(mockAnalyticsDb).toHaveBeenCalledWith('venue_analytics');
      expect(mockAnalyticsDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: testVenueId,
          date: testDate,
          tickets_sold: 75,
          revenue: 3750,
        })
      );
    });

    it('should handle upsert with onConflict', async () => {
      mockMainDbFirst
        .mockResolvedValueOnce({ count: 10 })
        .mockResolvedValueOnce({ total: 500 });

      await service.aggregateVenueMetrics(testVenueId, testDate);

      expect(mockAnalyticsDbOnConflict).toHaveBeenCalledWith(['venue_id', 'date', 'hour']);
      expect(mockAnalyticsDbMerge).toHaveBeenCalled();
    });

    it('should handle null ticket count', async () => {
      mockMainDbFirst
        .mockResolvedValueOnce({ count: null })
        .mockResolvedValueOnce({ total: 0 });

      await service.aggregateVenueMetrics(testVenueId, testDate);

      expect(mockAnalyticsDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tickets_sold: 0,
        })
      );
    });

    it('should handle null revenue', async () => {
      mockMainDbFirst
        .mockResolvedValueOnce({ count: 10 })
        .mockResolvedValueOnce({ total: null });

      await service.aggregateVenueMetrics(testVenueId, testDate);

      expect(mockAnalyticsDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          revenue: 0,
        })
      );
    });

    it('should handle undefined results', async () => {
      mockMainDbFirst
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await service.aggregateVenueMetrics(testVenueId, testDate);

      expect(mockAnalyticsDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tickets_sold: 0,
          revenue: 0,
        })
      );
    });

    it('should log success message', async () => {
      mockMainDbFirst
        .mockResolvedValueOnce({ count: 25 })
        .mockResolvedValueOnce({ total: 1250 });

      await service.aggregateVenueMetrics(testVenueId, testDate);

      expect(logger.info).toHaveBeenCalledWith('Aggregated venue metrics', {
        venueId: testVenueId,
        date: testDate,
      });
    });

    it('should throw and log error on main db failure', async () => {
      const error = new Error('Database connection failed');
      mockMainDbFirst.mockRejectedValueOnce(error);

      await expect(
        service.aggregateVenueMetrics(testVenueId, testDate)
      ).rejects.toThrow('Database connection failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to aggregate venue metrics',
        error
      );
    });

    it('should throw and log error on analytics db failure', async () => {
      mockMainDbFirst
        .mockResolvedValueOnce({ count: 10 })
        .mockResolvedValueOnce({ total: 500 });

      const error = new Error('Analytics write failed');
      mockAnalyticsDbMerge.mockRejectedValueOnce(error);

      await expect(
        service.aggregateVenueMetrics(testVenueId, testDate)
      ).rejects.toThrow('Analytics write failed');

      expect(logger.error).toHaveBeenCalled();
    });

    it('should include updated_at timestamp', async () => {
      mockMainDbFirst
        .mockResolvedValueOnce({ count: 5 })
        .mockResolvedValueOnce({ total: 250 });

      await service.aggregateVenueMetrics(testVenueId, testDate);

      expect(mockAnalyticsDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: expect.any(Date),
        })
      );
    });
  });
});
