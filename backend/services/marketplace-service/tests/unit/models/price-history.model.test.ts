/**
 * Unit Tests for Price History Model
 * Tests marketplace price history tracking
 */

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-pricehistory')
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock database
const mockDbChain = {
  insert: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  join: jest.fn().mockReturnThis(),
  avg: jest.fn().mockReturnThis(),
  first: jest.fn(),
  raw: jest.fn((sql) => sql)
};

jest.mock('../../../src/config/database', () => ({
  db: Object.assign(jest.fn(() => mockDbChain), {
    raw: jest.fn((sql) => sql)
  })
}));

import { PriceHistoryModel, priceHistoryModel } from '../../../src/models/price-history.model';
import { logger } from '../../../src/utils/logger';

describe('PriceHistoryModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockDbChain).forEach(mock => {
      if (jest.isMockFunction(mock)) {
        mock.mockClear();
        mock.mockReturnThis();
      }
    });
  });

  describe('recordPriceChange', () => {
    it('should record price increase', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await priceHistoryModel.recordPriceChange(
        'listing-123',
        5000,  // $50.00
        6000,  // $60.00
        'user-456'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-pricehistory',
          listing_id: 'listing-123',
          old_price: 5000,
          new_price: 6000,
          price_change: 1000,  // $10.00
          percentage_change: 20,  // 20% increase
          changed_by: 'user-456',
          changed_at: expect.any(Date)
        })
      );
      expect(result.id).toBe('test-uuid-pricehistory');
      expect(result.price_change).toBe(1000);
      expect(result.percentage_change).toBe(20);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Price change recorded'));
    });

    it('should record price decrease', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await priceHistoryModel.recordPriceChange(
        'listing-123',
        10000,  // $100.00
        8000,   // $80.00
        'user-456'
      );
      
      expect(result.price_change).toBe(-2000);  // -$20.00
      expect(result.percentage_change).toBe(-20);  // -20%
    });

    it('should record with reason', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await priceHistoryModel.recordPriceChange(
        'listing-123',
        5000,
        5500,
        'user-456',
        'High demand'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'High demand'
        })
      );
      expect(result.reason).toBe('High demand');
    });

    it('should handle fractional percentage changes', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await priceHistoryModel.recordPriceChange(
        'listing-123',
        3000,  // $30.00
        3150,  // $31.50
        'user-456'
      );
      
      expect(result.percentage_change).toBe(5);  // 5%
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Insert failed');
      mockDbChain.insert.mockRejectedValue(dbError);
      
      await expect(priceHistoryModel.recordPriceChange(
        'listing-123',
        5000,
        6000,
        'user-456'
      )).rejects.toThrow('Insert failed');
      
      expect(logger.error).toHaveBeenCalledWith('Error recording price change:', dbError);
    });
  });

  describe('getPriceHistory', () => {
    it('should return price history for listing', async () => {
      const history = [
        { id: 'h1', listing_id: 'listing-123', old_price: 5000, new_price: 6000 },
        { id: 'h2', listing_id: 'listing-123', old_price: 6000, new_price: 5500 }
      ];
      mockDbChain.select.mockResolvedValue(history);
      
      const result = await priceHistoryModel.getPriceHistory('listing-123');
      
      expect(mockDbChain.where).toHaveBeenCalledWith('listing_id', 'listing-123');
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('changed_at', 'desc');
      expect(result).toHaveLength(2);
    });

    it('should return empty array for listing with no history', async () => {
      mockDbChain.select.mockResolvedValue([]);
      
      const result = await priceHistoryModel.getPriceHistory('listing-123');
      
      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockDbChain.select.mockRejectedValue(new Error('Query failed'));
      
      const result = await priceHistoryModel.getPriceHistory('listing-123');
      
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('Error getting price history:', expect.any(Error));
    });
  });

  describe('getAveragePrice', () => {
    it('should return average price for event', async () => {
      mockDbChain.avg.mockResolvedValue([{ average: '7500' }]);
      
      const result = await priceHistoryModel.getAveragePrice('event-123');
      
      expect(mockDbChain.join).toHaveBeenCalledWith(
        'marketplace_price_history as ph',
        'ml.id',
        'ph.listing_id'
      );
      expect(mockDbChain.where).toHaveBeenCalledWith('ml.event_id', 'event-123');
      expect(result).toBe(7500);  // Integer cents
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      mockDbChain.avg.mockResolvedValue([{ average: '6000' }]);
      
      const result = await priceHistoryModel.getAveragePrice('event-123', startDate, endDate);
      
      expect(mockDbChain.where).toHaveBeenCalledWith('ph.changed_at', '>=', startDate);
      expect(mockDbChain.where).toHaveBeenCalledWith('ph.changed_at', '<=', endDate);
      expect(result).toBe(6000);
    });

    it('should return 0 when no data', async () => {
      mockDbChain.avg.mockResolvedValue([{ average: null }]);
      
      const result = await priceHistoryModel.getAveragePrice('event-123');
      
      expect(result).toBe(0);
    });

    it('should round to integer cents', async () => {
      mockDbChain.avg.mockResolvedValue([{ average: '7533.33' }]);
      
      const result = await priceHistoryModel.getAveragePrice('event-123');
      
      expect(result).toBe(7533);  // Rounded to integer
    });

    it('should return 0 on error', async () => {
      mockDbChain.avg.mockRejectedValue(new Error('Query failed'));
      
      const result = await priceHistoryModel.getAveragePrice('event-123');
      
      expect(result).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('Error calculating average price:', expect.any(Error));
    });
  });

  describe('getPriceTrends', () => {
    it('should return price trends for week', async () => {
      mockDbChain.first.mockResolvedValue({
        average_price: '7500',
        min_price: '5000',
        max_price: '10000',
        total_changes: '25',
        avg_change: '5.5'
      });
      
      const result = await priceHistoryModel.getPriceTrends('event-123', 'week');
      
      expect(result.period).toBe('week');
      expect(result.average_price).toBe(7500);
      expect(result.min_price).toBe(5000);
      expect(result.max_price).toBe(10000);
      expect(result.total_changes).toBe(25);
      expect(result.trend_direction).toBe('up');  // avg_change > 1
    });

    it('should return down trend for negative change', async () => {
      mockDbChain.first.mockResolvedValue({
        average_price: '7500',
        min_price: '5000',
        max_price: '10000',
        total_changes: '15',
        avg_change: '-3.5'
      });
      
      const result = await priceHistoryModel.getPriceTrends('event-123', 'week');
      
      expect(result.trend_direction).toBe('down');  // avg_change < -1
    });

    it('should return stable trend for small change', async () => {
      mockDbChain.first.mockResolvedValue({
        average_price: '7500',
        min_price: '7000',
        max_price: '8000',
        total_changes: '10',
        avg_change: '0.5'
      });
      
      const result = await priceHistoryModel.getPriceTrends('event-123');
      
      expect(result.trend_direction).toBe('stable');  // -1 <= avg_change <= 1
    });

    it('should use day period', async () => {
      mockDbChain.first.mockResolvedValue({
        average_price: '5000',
        min_price: '5000',
        max_price: '5000',
        total_changes: '0',
        avg_change: '0'
      });
      
      const result = await priceHistoryModel.getPriceTrends('event-123', 'day');
      
      expect(result.period).toBe('day');
    });

    it('should use month period', async () => {
      mockDbChain.first.mockResolvedValue({
        average_price: '6000',
        min_price: '4000',
        max_price: '9000',
        total_changes: '100',
        avg_change: '2.5'
      });
      
      const result = await priceHistoryModel.getPriceTrends('event-123', 'month');
      
      expect(result.period).toBe('month');
    });

    it('should return defaults on error', async () => {
      mockDbChain.first.mockRejectedValue(new Error('Query failed'));
      
      const result = await priceHistoryModel.getPriceTrends('event-123');
      
      expect(result).toEqual({
        period: 'week',
        average_price: 0,
        min_price: 0,
        max_price: 0,
        total_changes: 0,
        trend_direction: 'stable'
      });
      expect(logger.error).toHaveBeenCalledWith('Error getting price trends:', expect.any(Error));
    });

    it('should handle null stats', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await priceHistoryModel.getPriceTrends('event-123');
      
      expect(result.average_price).toBe(0);
      expect(result.trend_direction).toBe('stable');
    });
  });

  describe('priceHistoryModel export', () => {
    it('should export singleton instance', () => {
      expect(priceHistoryModel).toBeInstanceOf(PriceHistoryModel);
    });
  });
});
