/**
 * Unit Tests for Tax Reporting Model
 * Tests tax report generation and transaction tracking
 */

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-tax')
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
  whereBetween: jest.fn().mockReturnThis(),
  whereIn: jest.fn().mockReturnThis(),
  first: jest.fn(),
  update: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis()
};

jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => mockDbChain)
}));

import { TaxReportingModel, taxReportingModel } from '../../../src/models/tax-reporting.model';
import { logger } from '../../../src/utils/logger';

describe('TaxReportingModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockDbChain).forEach(mock => {
      if (jest.isMockFunction(mock)) {
        mock.mockClear();
        mock.mockReturnThis();
      }
    });
  });

  describe('recordSale', () => {
    it('should record a taxable sale', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      await taxReportingModel.recordSale(
        'seller-123',
        'transfer-456',
        10000,  // $100.00
        1000,   // $10.00 fee
        'buyer-wallet-789',
        'ticket-111'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-tax',
          seller_id: 'seller-123',
          transfer_id: 'transfer-456',
          sale_amount: 10000,
          platform_fee: 1000,
          net_amount: 9000,  // sale_amount - platform_fee
          buyer_wallet: 'buyer-wallet-789',
          ticket_id: 'ticket-111',
          reported: false,
          transaction_date: expect.any(Date)
        })
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Taxable transaction recorded'));
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Insert failed');
      mockDbChain.insert.mockRejectedValue(dbError);
      
      await expect(taxReportingModel.recordSale(
        'seller-123',
        'transfer-456',
        10000,
        1000,
        'buyer-wallet',
        'ticket-111'
      )).rejects.toThrow('Insert failed');
      
      expect(logger.error).toHaveBeenCalledWith('Error recording taxable transaction:', dbError);
    });
  });

  describe('getYearlyReport', () => {
    const mockTransactions = [
      { id: 't1', sale_amount: 5000, platform_fee: 500, net_amount: 4500, transaction_date: new Date('2024-03-15') },
      { id: 't2', sale_amount: 7500, platform_fee: 750, net_amount: 6750, transaction_date: new Date('2024-06-20') },
      { id: 't3', sale_amount: 10000, platform_fee: 1000, net_amount: 9000, transaction_date: new Date('2024-09-10') }
    ];

    it('should return existing report if available', async () => {
      const existingReport = {
        id: 'report-123',
        seller_id: 'seller-123',
        year: 2024,
        total_sales: 22500,
        total_transactions: 3,
        total_fees_paid: 2250,
        net_proceeds: 20250,
        generated_at: new Date(),
        report_data: JSON.stringify({ test: 'data' })
      };
      mockDbChain.first.mockResolvedValue(existingReport);
      
      const result = await taxReportingModel.getYearlyReport('seller-123', 2024);
      
      expect(mockDbChain.where).toHaveBeenCalledWith('seller_id', 'seller-123');
      expect(mockDbChain.where).toHaveBeenCalledWith('year', 2024);
      expect(result).toBeDefined();
      expect(result?.report_data).toEqual({ test: 'data' });
    });

    it('should generate new report when none exists', async () => {
      mockDbChain.first.mockResolvedValue(null);
      mockDbChain.select.mockResolvedValue(mockTransactions);
      mockDbChain.insert.mockResolvedValue([1]);
      mockDbChain.update.mockResolvedValue(3);
      
      const result = await taxReportingModel.getYearlyReport('seller-123', 2024);
      
      expect(result).toBeDefined();
      expect(result?.seller_id).toBe('seller-123');
      expect(result?.year).toBe(2024);
      expect(result?.total_sales).toBe(22500);
      expect(result?.total_transactions).toBe(3);
      expect(result?.total_fees_paid).toBe(2250);
      expect(result?.net_proceeds).toBe(20250);
      expect(mockDbChain.insert).toHaveBeenCalled();
    });

    it('should mark transactions as reported', async () => {
      mockDbChain.first.mockResolvedValue(null);
      mockDbChain.select.mockResolvedValue(mockTransactions);
      mockDbChain.insert.mockResolvedValue([1]);
      mockDbChain.update.mockResolvedValue(3);
      
      await taxReportingModel.getYearlyReport('seller-123', 2024);
      
      expect(mockDbChain.whereIn).toHaveBeenCalledWith('id', ['t1', 't2', 't3']);
      expect(mockDbChain.update).toHaveBeenCalledWith({ reported: true });
    });

    it('should return null when no transactions exist', async () => {
      mockDbChain.first.mockResolvedValue(null);
      mockDbChain.select.mockResolvedValue([]);
      
      const result = await taxReportingModel.getYearlyReport('seller-123', 2024);
      
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockDbChain.first.mockRejectedValue(new Error('Query failed'));
      
      const result = await taxReportingModel.getYearlyReport('seller-123', 2024);
      
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error generating yearly report:', expect.any(Error));
    });

    it('should calculate report_data with transactions_by_month', async () => {
      mockDbChain.first.mockResolvedValue(null);
      mockDbChain.select.mockResolvedValue(mockTransactions);
      mockDbChain.insert.mockResolvedValue([1]);
      mockDbChain.update.mockResolvedValue(3);
      
      const result = await taxReportingModel.getYearlyReport('seller-123', 2024);
      
      expect(result?.report_data?.transactions_by_month).toBeDefined();
      expect(result?.report_data?.largest_sale).toBe(10000);
      expect(result?.report_data?.average_sale).toBe(7500);  // 22500 / 3
    });
  });

  describe('generate1099K', () => {
    it('should return form data when above threshold', async () => {
      const mockReport = {
        id: 'report-123',
        seller_id: 'seller-123',
        year: 2024,
        total_sales: 100000,
        total_transactions: 50,
        total_fees_paid: 10000,
        net_proceeds: 90000,  // Above $600 threshold
        generated_at: new Date()
      };
      mockDbChain.first.mockResolvedValue(mockReport);
      
      const result = await taxReportingModel.generate1099K('seller-123', 2024);
      
      expect(result).toBeDefined();
      expect(result.required).toBe(true);
      expect(result.form_type).toBe('1099-K');
      expect(result.tax_year).toBe(2024);
      expect(result.gross_amount).toBe(100000);
      expect(result.transactions_count).toBe(50);
      expect(result.fees_deducted).toBe(10000);
      expect(result.net_proceeds).toBe(90000);
    });

    it('should return not required when below threshold', async () => {
      const mockReport = {
        id: 'report-123',
        seller_id: 'seller-123',
        year: 2024,
        total_sales: 500,
        total_transactions: 2,
        total_fees_paid: 50,
        net_proceeds: 450,  // Below $600 threshold
        generated_at: new Date()
      };
      mockDbChain.first.mockResolvedValue(mockReport);
      
      const result = await taxReportingModel.generate1099K('seller-123', 2024);
      
      expect(result.required).toBe(false);
      expect(result.reason).toContain('below IRS threshold');
    });

    it('should return null when no report data', async () => {
      mockDbChain.first.mockResolvedValue(null);
      mockDbChain.select.mockResolvedValue([]);
      
      const result = await taxReportingModel.generate1099K('seller-123', 2024);
      
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockDbChain.first.mockRejectedValue(new Error('Query failed'));
      
      const result = await taxReportingModel.generate1099K('seller-123', 2024);
      
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error generating 1099-K:', expect.any(Error));
    });

    it('should include payer information', async () => {
      const mockReport = {
        seller_id: 'seller-123',
        year: 2024,
        total_sales: 1000,
        total_transactions: 5,
        total_fees_paid: 100,
        net_proceeds: 900,
        generated_at: new Date()
      };
      mockDbChain.first.mockResolvedValue(mockReport);
      
      const result = await taxReportingModel.generate1099K('seller-123', 2024);
      
      expect(result.payer.name).toBe('TicketToken Platform');
    });
  });

  describe('getReportableTransactions', () => {
    it('should return transactions for year', async () => {
      const transactions = [
        { id: 't1', sale_amount: 5000, transaction_date: new Date('2024-03-15') },
        { id: 't2', sale_amount: 7500, transaction_date: new Date('2024-06-20') }
      ];
      mockDbChain.select.mockResolvedValue(transactions);
      
      const result = await taxReportingModel.getReportableTransactions('seller-123', 2024);
      
      expect(mockDbChain.where).toHaveBeenCalledWith('seller_id', 'seller-123');
      expect(mockDbChain.whereBetween).toHaveBeenCalledWith('transaction_date', [
        expect.any(Date),
        expect.any(Date)
      ]);
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('transaction_date', 'desc');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no transactions', async () => {
      mockDbChain.select.mockResolvedValue([]);
      
      const result = await taxReportingModel.getReportableTransactions('seller-123', 2024);
      
      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockDbChain.select.mockRejectedValue(new Error('Query failed'));
      
      const result = await taxReportingModel.getReportableTransactions('seller-123', 2024);
      
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('Error getting reportable transactions:', expect.any(Error));
    });
  });

  describe('taxReportingModel export', () => {
    it('should export singleton instance', () => {
      expect(taxReportingModel).toBeInstanceOf(TaxReportingModel);
    });
  });
});
