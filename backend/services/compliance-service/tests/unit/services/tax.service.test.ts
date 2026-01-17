/**
 * Unit Tests for Tax Service
 */
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: jest.fn()
  }
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TaxService, taxService } from '../../../src/services/tax.service';
import { db } from '../../../src/services/database.service';
import { logger } from '../../../src/utils/logger';

describe('TaxService', () => {
  const currentYear = new Date().getFullYear();
  const THRESHOLD = 600;

  beforeEach(() => {
    jest.clearAllMocks();
    (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('trackSale', () => {
    it('should query current year totals', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await taxService.trackSale('venue-123', 100, 'ticket-456', 'tenant-1');

      expect(db.query).toHaveBeenNthCalledWith(1,
        expect.stringContaining('SELECT COALESCE(SUM(amount), 0)'),
        ['venue-123', currentYear, 'tenant-1']
      );
    });

    it('should insert tax record', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await taxService.trackSale('venue-123', 100, 'ticket-456', 'tenant-1');

      expect(db.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('INSERT INTO tax_records'),
        ['venue-123', currentYear, 100, 'ticket-456', false, 'tenant-1']
      );
    });

    it('should return correct year-to-date total', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '400' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await taxService.trackSale('venue-123', 100, 'ticket-456', 'tenant-1');

      expect(result.yearToDate).toBe(500);
      expect(result.saleAmount).toBe(100);
    });

    it('should calculate percent to threshold', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '200' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await taxService.trackSale('venue-123', 100, 'ticket-456', 'tenant-1');

      expect(result.percentToThreshold).toBe(50); // 300/600 * 100
    });

    describe('threshold detection ($600)', () => {
      it('should not require 1099 below threshold', async () => {
        (db.query as jest.Mock<any>)
          .mockResolvedValueOnce({ rows: [{ total: '400' }] })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await taxService.trackSale('venue-123', 100, 'ticket-456', 'tenant-1');

        expect(result.thresholdReached).toBe(false);
        expect(result.requires1099).toBe(false);
      });

      it('should require 1099 at threshold', async () => {
        (db.query as jest.Mock<any>)
          .mockResolvedValueOnce({ rows: [{ total: '500' }] })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await taxService.trackSale('venue-123', 100, 'ticket-456', 'tenant-1');

        expect(result.thresholdReached).toBe(true);
        expect(result.requires1099).toBe(true);
      });

      it('should require 1099 above threshold', async () => {
        (db.query as jest.Mock<any>)
          .mockResolvedValueOnce({ rows: [{ total: '1000' }] })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await taxService.trackSale('venue-123', 500, 'ticket-456', 'tenant-1');

        expect(result.thresholdReached).toBe(true);
        expect(result.requires1099).toBe(true);
      });

      it('should log when threshold is crossed', async () => {
        // Previous total below threshold, new total at/above threshold
        (db.query as jest.Mock<any>)
          .mockResolvedValueOnce({ rows: [{ total: '550' }] })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await taxService.trackSale('venue-123', 100, 'ticket-456', 'tenant-1');

        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('has reached $600 threshold')
        );
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('1099-K required')
        );
      });
    });

    it('should handle null total from database', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: null }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await taxService.trackSale('venue-123', 100, 'ticket-456', 'tenant-1');

      expect(result.yearToDate).toBe(100);
    });

    it('should propagate database errors', async () => {
      (db.query as jest.Mock<any>).mockRejectedValue(new Error('DB error'));

      await expect(taxService.trackSale('venue-123', 100, 'ticket-456', 'tenant-1'))
        .rejects.toThrow('DB error');

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getVenueTaxSummary', () => {
    it('should use current year by default', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '0', total_sales: '0' }]
      });

      const result = await taxService.getVenueTaxSummary('venue-123', undefined, 'tenant-1');

      expect(result.year).toBe(currentYear);
      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        ['venue-123', currentYear, 'tenant-1']
      );
    });

    it('should use specified year', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '0', total_sales: '0' }]
      });

      const result = await taxService.getVenueTaxSummary('venue-123', 2023, 'tenant-1');

      expect(result.year).toBe(2023);
    });

    it('should return complete summary', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{
          transaction_count: '25',
          total_sales: '1500.50',
          largest_sale: '200',
          first_sale: new Date('2024-01-15'),
          last_sale: new Date('2024-06-20')
        }]
      });

      const result = await taxService.getVenueTaxSummary('venue-123', 2024, 'tenant-1');

      expect(result.venueId).toBe('venue-123');
      expect(result.totalSales).toBe(1500.50);
      expect(result.transactionCount).toBe('25');
      expect(result.requires1099).toBe(true);
      expect(result.largestSale).toBe('200');
    });

    it('should calculate threshold status correctly', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '5', total_sales: '450' }]
      });

      const result = await taxService.getVenueTaxSummary('venue-123', 2024, 'tenant-1');

      expect(result.thresholdStatus.reached).toBe(false);
      expect(result.thresholdStatus.amount).toBe(450);
      expect(result.thresholdStatus.threshold).toBe(600);
      expect(result.thresholdStatus.remaining).toBe(150);
    });

    it('should show zero remaining when threshold exceeded', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '20', total_sales: '800' }]
      });

      const result = await taxService.getVenueTaxSummary('venue-123', 2024, 'tenant-1');

      expect(result.thresholdStatus.remaining).toBe(0);
    });
  });

  describe('calculateTax', () => {
    it('should calculate tax with default rate', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await taxService.calculateTax({ amount: 100, venueId: 'venue-123' }, 'tenant-1');

      expect(result.originalAmount).toBe(100);
      expect(result.taxRate).toBe(0.08);
      expect(result.taxAmount).toBe(8);
      expect(result.totalWithTax).toBe(108);
    });

    it('should calculate tax with custom rate', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await taxService.calculateTax(
        { amount: 100, venueId: 'venue-123', taxRate: 0.10 },
        'tenant-1'
      );

      expect(result.taxRate).toBe(0.10);
      expect(result.taxAmount).toBe(10);
      expect(result.totalWithTax).toBe(110);
    });

    it('should insert calculation record', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 1 });

      await taxService.calculateTax({ amount: 100, venueId: 'venue-123' }, 'tenant-1');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tax_calculations'),
        ['venue-123', 100, 0.08, 8, 108, 'tenant-1']
      );
    });

    it('should include timestamp in response', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await taxService.calculateTax({ amount: 100, venueId: 'venue-123' }, 'tenant-1');

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('generateTaxReport', () => {
    it('should generate report for year', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [
          { venue_id: 'v1', transaction_count: '10', total_sales: '800', threshold_transactions: '5' },
          { venue_id: 'v2', transaction_count: '5', total_sales: '400', threshold_transactions: '0' }
        ]
      });

      const result = await taxService.generateTaxReport(2024, 'tenant-1');

      expect(result.year).toBe(2024);
      expect(result.summary.totalVenues).toBe(2);
      expect(result.summary.venues1099Required).toBe(1);
      expect(result.summary.totalTransactions).toBe(15);
      expect(result.summary.totalSales).toBe(1200);
    });

    it('should identify venues requiring 1099', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [
          { venue_id: 'v1', transaction_count: '10', total_sales: '800', threshold_transactions: '5' },
          { venue_id: 'v2', transaction_count: '5', total_sales: '600', threshold_transactions: '0' },
          { venue_id: 'v3', transaction_count: '3', total_sales: '500', threshold_transactions: '0' }
        ]
      });

      const result = await taxService.generateTaxReport(2024, 'tenant-1');

      expect(result.form1099Required).toHaveLength(2);
      expect(result.venueDetails[0].requires1099).toBe(true);
      expect(result.venueDetails[1].requires1099).toBe(true);
      expect(result.venueDetails[2].requires1099).toBe(false);
    });

    it('should include generated timestamp', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [] });

      const result = await taxService.generateTaxReport(2024, 'tenant-1');

      expect(result.generatedAt).toBeDefined();
    });

    it('should handle empty results', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [] });

      const result = await taxService.generateTaxReport(2024, 'tenant-1');

      expect(result.summary.totalVenues).toBe(0);
      expect(result.summary.totalTransactions).toBe(0);
      expect(result.summary.totalSales).toBe(0);
    });
  });

  describe('exported singleton', () => {
    it('should export taxService instance', () => {
      expect(taxService).toBeDefined();
      expect(taxService.trackSale).toBeInstanceOf(Function);
      expect(taxService.getVenueTaxSummary).toBeInstanceOf(Function);
      expect(taxService.calculateTax).toBeInstanceOf(Function);
      expect(taxService.generateTaxReport).toBeInstanceOf(Function);
    });
  });
});
