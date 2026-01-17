/**
 * Unit Tests for Customer Tax Service
 */
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: jest.fn()
  }
}));

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { CustomerTaxService, customerTaxService } from '../../../src/services/customer-tax.service';
import { db } from '../../../src/services/database.service';

describe('CustomerTaxService', () => {
  const currentYear = new Date().getFullYear();

  beforeEach(() => {
    jest.clearAllMocks();
    (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('trackNFTSale', () => {
    it('should insert sale record into database', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [{ total: '100' }] }); // SELECT SUM

      await customerTaxService.trackNFTSale('customer-123', 100, 'ticket-456');

      expect(db.query).toHaveBeenNthCalledWith(1,
        expect.stringContaining('INSERT INTO customer_tax_records'),
        ['customer-123', currentYear, 100, 'ticket-456']
      );
    });

    it('should query yearly total after insert', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total: '500' }] });

      await customerTaxService.trackNFTSale('customer-123', 100, 'ticket-456');

      expect(db.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('SELECT SUM(amount)'),
        ['customer-123', currentYear]
      );
    });

    it('should return yearly total and 1099-DA status', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total: '450' }] });

      const result = await customerTaxService.trackNFTSale('customer-123', 100, 'ticket-456');

      expect(result.yearlyTotal).toBe(450);
      expect(result.requires1099DA).toBe(false);
    });

    describe('1099-DA threshold ($600)', () => {
      it('should not require 1099-DA below threshold', async () => {
        (db.query as jest.Mock<any>)
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ total: '599.99' }] });

        const result = await customerTaxService.trackNFTSale('customer-123', 100, 'ticket-456');

        expect(result.requires1099DA).toBe(false);
        // Should not insert into tax_reporting_requirements
        expect(db.query).toHaveBeenCalledTimes(2);
      });

      it('should require 1099-DA at exactly threshold', async () => {
        (db.query as jest.Mock<any>)
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ total: '600' }] })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT into tax_reporting_requirements

        const result = await customerTaxService.trackNFTSale('customer-123', 100, 'ticket-456');

        expect(result.requires1099DA).toBe(true);
      });

      it('should require 1099-DA above threshold', async () => {
        (db.query as jest.Mock<any>)
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ total: '1500' }] })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await customerTaxService.trackNFTSale('customer-123', 500, 'ticket-456');

        expect(result.requires1099DA).toBe(true);
      });

      it('should insert into tax_reporting_requirements when threshold met', async () => {
        (db.query as jest.Mock<any>)
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ total: '750' }] })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await customerTaxService.trackNFTSale('customer-123', 200, 'ticket-456');

        expect(db.query).toHaveBeenNthCalledWith(3,
          expect.stringContaining('INSERT INTO tax_reporting_requirements'),
          ['customer-123', currentYear, 750]
        );
      });

      it('should use ON CONFLICT for upsert', async () => {
        (db.query as jest.Mock<any>)
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ total: '800' }] })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await customerTaxService.trackNFTSale('customer-123', 200, 'ticket-456');

        expect(db.query).toHaveBeenNthCalledWith(3,
          expect.stringContaining('ON CONFLICT'),
          expect.any(Array)
        );
      });
    });

    it('should use current year for transactions', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total: '100' }] });

      await customerTaxService.trackNFTSale('customer-123', 100, 'ticket-456');

      const insertCall = (db.query as jest.Mock<any>).mock.calls[0];
      expect(insertCall[1][1]).toBe(currentYear);
    });

    it('should track as nft_sale transaction type', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total: '100' }] });

      await customerTaxService.trackNFTSale('customer-123', 100, 'ticket-456');

      expect(db.query).toHaveBeenNthCalledWith(1,
        expect.stringContaining("'nft_sale'"),
        expect.any(Array)
      );
    });

    it('should track as ticket_nft asset type', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total: '100' }] });

      await customerTaxService.trackNFTSale('customer-123', 100, 'ticket-456');

      expect(db.query).toHaveBeenNthCalledWith(1,
        expect.stringContaining("'ticket_nft'"),
        expect.any(Array)
      );
    });

    it('should propagate database errors', async () => {
      (db.query as jest.Mock<any>).mockRejectedValue(new Error('DB connection lost'));

      await expect(customerTaxService.trackNFTSale('customer-123', 100, 'ticket-456'))
        .rejects.toThrow('DB connection lost');
    });
  });

  describe('getCustomerTaxSummary', () => {
    it('should return tax summary for current year by default', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '5', total_sales: '450.50' }]
      });

      const result = await customerTaxService.getCustomerTaxSummary('customer-123');

      expect(result.year).toBe(currentYear);
      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        ['customer-123', currentYear]
      );
    });

    it('should return tax summary for specific year', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '10', total_sales: '1200' }]
      });

      const result = await customerTaxService.getCustomerTaxSummary('customer-123', 2023);

      expect(result.year).toBe(2023);
      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        ['customer-123', 2023]
      );
    });

    it('should return correct total NFT sales', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '3', total_sales: '750.25' }]
      });

      const result = await customerTaxService.getCustomerTaxSummary('customer-123');

      expect(result.totalNFTSales).toBe(750.25);
    });

    it('should return transaction count', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '15', total_sales: '2000' }]
      });

      const result = await customerTaxService.getCustomerTaxSummary('customer-123');

      expect(result.transactionCount).toBe('15');
    });

    it('should calculate requires1099DA correctly - below threshold', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '2', total_sales: '500' }]
      });

      const result = await customerTaxService.getCustomerTaxSummary('customer-123');

      expect(result.requires1099DA).toBe(false);
    });

    it('should calculate requires1099DA correctly - at threshold', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '5', total_sales: '600' }]
      });

      const result = await customerTaxService.getCustomerTaxSummary('customer-123');

      expect(result.requires1099DA).toBe(true);
    });

    it('should calculate requires1099DA correctly - above threshold', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '20', total_sales: '5000' }]
      });

      const result = await customerTaxService.getCustomerTaxSummary('customer-123');

      expect(result.requires1099DA).toBe(true);
    });

    it('should handle null total_sales', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '0', total_sales: null }]
      });

      const result = await customerTaxService.getCustomerTaxSummary('customer-123');

      expect(result.totalNFTSales).toBe(0);
      expect(result.requires1099DA).toBe(false);
    });

    it('should handle empty result rows', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{}]
      });

      const result = await customerTaxService.getCustomerTaxSummary('customer-123');

      expect(result.totalNFTSales).toBe(0);
    });

    it('should include customerId in response', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [{ transaction_count: '1', total_sales: '100' }]
      });

      const result = await customerTaxService.getCustomerTaxSummary('customer-xyz');

      expect(result.customerId).toBe('customer-xyz');
    });

    it('should propagate database errors', async () => {
      (db.query as jest.Mock<any>).mockRejectedValue(new Error('Query failed'));

      await expect(customerTaxService.getCustomerTaxSummary('customer-123'))
        .rejects.toThrow('Query failed');
    });
  });

  describe('exported singleton', () => {
    it('should export customerTaxService instance', () => {
      expect(customerTaxService).toBeDefined();
      expect(customerTaxService.trackNFTSale).toBeInstanceOf(Function);
      expect(customerTaxService.getCustomerTaxSummary).toBeInstanceOf(Function);
    });
  });
});
