/**
 * Unit Tests for Multi-Jurisdiction Tax Service
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
import { MultiJurisdictionTaxService, multiJurisdictionTaxService } from '../../../src/services/multi-jurisdiction-tax.service';
import { db } from '../../../src/services/database.service';
import { logger } from '../../../src/utils/logger';

describe('MultiJurisdictionTaxService', () => {
  const currentYear = new Date().getFullYear();

  beforeEach(() => {
    jest.clearAllMocks();
    (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should load jurisdictions on initialization', () => {
      const service = new MultiJurisdictionTaxService();
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Loaded')
      );
    });
  });

  describe('calculateTax', () => {
    it('should calculate tax for California', () => {
      const result = multiJurisdictionTaxService.calculateTax('CA', 100);

      expect(result.jurisdiction).toBe('CA');
      expect(result.grossAmount).toBe(100);
      expect(result.taxRate).toBe(0.0725);
      expect(result.taxAmount).toBeCloseTo(7.25, 2);
      expect(result.netAmount).toBeCloseTo(92.75, 2);
    });

    it('should calculate tax for New York', () => {
      const result = multiJurisdictionTaxService.calculateTax('NY', 100);

      expect(result.taxRate).toBe(0.08875);
      expect(result.taxAmount).toBe(8.875);
    });

    it('should calculate tax for Texas', () => {
      const result = multiJurisdictionTaxService.calculateTax('TX', 100);

      expect(result.taxRate).toBe(0.0625);
      expect(result.taxAmount).toBe(6.25);
    });

    it('should handle tax exempt transactions', () => {
      const result = multiJurisdictionTaxService.calculateTax('CA', 100, true);

      expect(result.taxableAmount).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.netAmount).toBe(100);
    });

    it('should throw for unknown jurisdiction', () => {
      expect(() => multiJurisdictionTaxService.calculateTax('XX', 100))
        .toThrow('Unknown jurisdiction: XX');
    });

    it('should handle decimal amounts', () => {
      const result = multiJurisdictionTaxService.calculateTax('CA', 99.99);

      expect(result.grossAmount).toBe(99.99);
      expect(result.taxAmount).toBeCloseTo(7.249, 2);
    });

    it('should handle zero amount', () => {
      const result = multiJurisdictionTaxService.calculateTax('CA', 0);

      expect(result.taxAmount).toBe(0);
      expect(result.netAmount).toBe(0);
    });
  });

  describe('calculateMultiJurisdictionTax', () => {
    it('should calculate tax for multiple jurisdictions', () => {
      const results = multiJurisdictionTaxService.calculateMultiJurisdictionTax(
        ['CA', 'NY', 'TX'],
        100
      );

      expect(results).toHaveLength(3);
      expect(results[0].jurisdiction).toBe('CA');
      expect(results[1].jurisdiction).toBe('NY');
      expect(results[2].jurisdiction).toBe('TX');
    });

    it('should handle empty jurisdictions array', () => {
      const results = multiJurisdictionTaxService.calculateMultiJurisdictionTax([], 100);

      expect(results).toHaveLength(0);
    });

    it('should throw if any jurisdiction is unknown', () => {
      expect(() => multiJurisdictionTaxService.calculateMultiJurisdictionTax(
        ['CA', 'INVALID'],
        100
      )).toThrow('Unknown jurisdiction: INVALID');
    });
  });

  describe('getJurisdiction', () => {
    it('should return jurisdiction data', () => {
      const result = multiJurisdictionTaxService.getJurisdiction('CA');

      expect(result).not.toBeNull();
      expect(result!.code).toBe('CA');
      expect(result!.name).toBe('California');
      expect(result!.type).toBe('state');
      expect(result!.taxRate).toBe(0.0725);
      expect(result!.threshold1099).toBe(600);
      expect(result!.requiresRegistration).toBe(true);
      expect(result!.filingFrequency).toBe('quarterly');
    });

    it('should return null for unknown jurisdiction', () => {
      const result = multiJurisdictionTaxService.getJurisdiction('XX');

      expect(result).toBeNull();
    });
  });

  describe('getAllJurisdictions', () => {
    it('should return all jurisdictions', () => {
      const results = multiJurisdictionTaxService.getAllJurisdictions();

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(j => j.code === 'CA')).toBe(true);
      expect(results.some(j => j.code === 'NY')).toBe(true);
      expect(results.some(j => j.code === 'TX')).toBe(true);
    });

    it('should return array of TaxJurisdiction objects', () => {
      const results = multiJurisdictionTaxService.getAllJurisdictions();

      results.forEach(j => {
        expect(j).toHaveProperty('code');
        expect(j).toHaveProperty('name');
        expect(j).toHaveProperty('taxRate');
        expect(j).toHaveProperty('threshold1099');
      });
    });
  });

  describe('checkThreshold1099', () => {
    it('should return meets threshold when above', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ total: '750' }]
      });

      const result = await multiJurisdictionTaxService.checkThreshold1099(
        'venue-123', 'tenant-1', 'CA', 2024
      );

      expect(result.meetsThreshold).toBe(true);
      expect(result.totalAmount).toBe(750);
      expect(result.threshold).toBe(600);
    });

    it('should return does not meet threshold when below', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ total: '500' }]
      });

      const result = await multiJurisdictionTaxService.checkThreshold1099(
        'venue-123', 'tenant-1', 'CA', 2024
      );

      expect(result.meetsThreshold).toBe(false);
    });

    it('should query with correct parameters', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [{ total: '0' }] });

      await multiJurisdictionTaxService.checkThreshold1099(
        'venue-123', 'tenant-1', 'CA', 2024
      );

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COALESCE(SUM(amount), 0)'),
        ['venue-123', 'tenant-1', 'CA', 2024]
      );
    });

    it('should throw for unknown jurisdiction', async () => {
      await expect(multiJurisdictionTaxService.checkThreshold1099(
        'venue-123', 'tenant-1', 'XX', 2024
      )).rejects.toThrow('Unknown jurisdiction: XX');
    });
  });

  describe('getVenuesRequiring1099', () => {
    it('should return venues above threshold', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [
          { venue_id: 'v1', total_amount: '800' },
          { venue_id: 'v2', total_amount: '650' }
        ]
      });

      const results = await multiJurisdictionTaxService.getVenuesRequiring1099(
        'tenant-1', 'CA', 2024
      );

      expect(results).toHaveLength(2);
      expect(results[0].venueId).toBe('v1');
      expect(results[0].totalAmount).toBe(800);
    });

    it('should query with HAVING clause for threshold', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [] });

      await multiJurisdictionTaxService.getVenuesRequiring1099('tenant-1', 'CA', 2024);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('HAVING SUM(amount) >= $4'),
        ['tenant-1', 'CA', 2024, 600]
      );
    });

    it('should throw for unknown jurisdiction', async () => {
      await expect(multiJurisdictionTaxService.getVenuesRequiring1099(
        'tenant-1', 'XX', 2024
      )).rejects.toThrow('Unknown jurisdiction: XX');
    });
  });

  describe('recordTaxableTransaction', () => {
    it('should insert transaction record', async () => {
      await multiJurisdictionTaxService.recordTaxableTransaction(
        'venue-123', 'tenant-1', 'CA', 100, 'txn-456', { note: 'test' }
      );

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tax_records'),
        expect.arrayContaining([
          'venue-123', 'tenant-1', 'CA', 100, expect.closeTo(7.25, 2), 'txn-456', currentYear
        ])
      );
    });

    it('should calculate and store tax amount', async () => {
      await multiJurisdictionTaxService.recordTaxableTransaction(
        'venue-123', 'tenant-1', 'NY', 100, 'txn-456'
      );

      const insertCall = (db.query as jest.Mock<any>).mock.calls[0][1];
      expect(insertCall[4]).toBe(8.875); // NY tax amount
    });

    it('should store metadata as JSON', async () => {
      const metadata = { customField: 'value' };

      await multiJurisdictionTaxService.recordTaxableTransaction(
        'venue-123', 'tenant-1', 'CA', 100, 'txn-456', metadata
      );

      const insertCall = (db.query as jest.Mock<any>).mock.calls[0][1];
      expect(insertCall[7]).toBe(JSON.stringify(metadata));
    });

    it('should log transaction', async () => {
      await multiJurisdictionTaxService.recordTaxableTransaction(
        'venue-123', 'tenant-1', 'CA', 100, 'txn-456'
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Recorded tax transaction: txn-456')
      );
    });
  });

  describe('getTaxSummary', () => {
    it('should return summary by jurisdiction', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [
          { jurisdiction: 'CA', total_amount: '1000', tax_amount: '72.50', transaction_count: '10' },
          { jurisdiction: 'NY', total_amount: '500', tax_amount: '44.38', transaction_count: '5' }
        ]
      });

      const results = await multiJurisdictionTaxService.getTaxSummary('tenant-1');

      expect(results).toHaveLength(2);
      expect(results[0].jurisdiction).toBe('CA');
      expect(results[0].totalAmount).toBe(1000);
      expect(results[0].taxAmount).toBe(72.50);
      expect(results[0].transactionCount).toBe(10);
    });

    it('should use current year by default', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [] });

      await multiJurisdictionTaxService.getTaxSummary('tenant-1');

      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        ['tenant-1', currentYear]
      );
    });

    it('should use specified year', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [] });

      await multiJurisdictionTaxService.getTaxSummary('tenant-1', 2023);

      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        ['tenant-1', 2023]
      );
    });
  });

  describe('getJurisdictionsRequiringRegistration', () => {
    it('should return only jurisdictions requiring registration', () => {
      const results = multiJurisdictionTaxService.getJurisdictionsRequiringRegistration();

      results.forEach(j => {
        expect(j.requiresRegistration).toBe(true);
      });
    });

    it('should not include TX (no registration required)', () => {
      const results = multiJurisdictionTaxService.getJurisdictionsRequiringRegistration();

      expect(results.some(j => j.code === 'TX')).toBe(false);
    });

    it('should include CA (registration required)', () => {
      const results = multiJurisdictionTaxService.getJurisdictionsRequiringRegistration();

      expect(results.some(j => j.code === 'CA')).toBe(true);
    });
  });

  describe('getFilingCalendar', () => {
    it('should return quarterly calendar for CA', () => {
      const calendar = multiJurisdictionTaxService.getFilingCalendar('CA', 2024);

      expect(calendar).toHaveLength(4);
      expect(calendar[0].quarter).toBe(1);
      expect(calendar[1].quarter).toBe(2);
      expect(calendar[2].quarter).toBe(3);
      expect(calendar[3].quarter).toBe(4);
    });

    it('should return monthly calendar for FL', () => {
      const calendar = multiJurisdictionTaxService.getFilingCalendar('FL', 2024);

      expect(calendar).toHaveLength(12);
      expect(calendar[0].month).toBe(1);
      expect(calendar[11].month).toBe(12);
    });

    it('should set correct due dates for quarterly', () => {
      const calendar = multiJurisdictionTaxService.getFilingCalendar('CA', 2024);

      // Q1 due end of April
      expect(calendar[0].dueDate.getMonth()).toBe(3); // April (0-indexed)
    });

    it('should throw for unknown jurisdiction', () => {
      expect(() => multiJurisdictionTaxService.getFilingCalendar('XX', 2024))
        .toThrow('Unknown jurisdiction: XX');
    });
  });

  describe('checkMultiJurisdictionCompliance', () => {
    it('should check compliance for all registered jurisdictions', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], count: '0' });

      const results = await multiJurisdictionTaxService.checkMultiJurisdictionCompliance(
        'tenant-1', 2024
      );

      expect(results.length).toBeGreaterThan(0);
      results.forEach(r => {
        expect(r).toHaveProperty('jurisdiction');
        expect(r).toHaveProperty('registered');
        expect(r).toHaveProperty('filingRequired');
        expect(r).toHaveProperty('filingComplete');
        expect(r).toHaveProperty('venueCount');
      });
    });

    it('should mark filing required when venues exist', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ venue_id: 'v1', total_amount: '700' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValue({ rows: [] });

      const results = await multiJurisdictionTaxService.checkMultiJurisdictionCompliance(
        'tenant-1', 2024
      );

      const firstResult = results[0];
      expect(firstResult.filingRequired).toBe(true);
      expect(firstResult.venueCount).toBe(1);
    });
  });

  describe('exported singleton', () => {
    it('should export multiJurisdictionTaxService instance', () => {
      expect(multiJurisdictionTaxService).toBeDefined();
      expect(multiJurisdictionTaxService.calculateTax).toBeInstanceOf(Function);
      expect(multiJurisdictionTaxService.getJurisdiction).toBeInstanceOf(Function);
      expect(multiJurisdictionTaxService.checkThreshold1099).toBeInstanceOf(Function);
    });
  });
});
