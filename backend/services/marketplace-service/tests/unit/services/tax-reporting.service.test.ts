/**
 * Unit Tests for tax-reporting.service.ts
 * Tests tax transaction recording and 1099-K generation
 */

import { taxReportingService } from '../../../src/services/tax-reporting.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => {
  const mockDb = jest.fn(() => mockDb);
  Object.assign(mockDb, {
    where: jest.fn().mockReturnThis(),
    whereBetween: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn(),
    orderBy: jest.fn(),
  });
  return { db: mockDb };
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

import { db } from '../../../src/config/database';

describe('TaxReportingService', () => {
  const mockDb = db as jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordSale', () => {
    it('should record a taxable sale transaction', async () => {
      const insertMock = jest.fn().mockResolvedValue([1]);
      mockDb.mockReturnValue({
        insert: insertMock,
      });

      await taxReportingService.recordSale(
        'seller-123',
        'transfer-456',
        10000,
        500
      );

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          seller_id: 'seller-123',
          transfer_id: 'transfer-456',
          sale_amount: 10000,
          platform_fee: 500,
          net_amount: 9500,
          reported: false,
        })
      );
    });

    it('should calculate net amount correctly', async () => {
      const insertMock = jest.fn().mockResolvedValue([1]);
      mockDb.mockReturnValue({
        insert: insertMock,
      });

      await taxReportingService.recordSale(
        'seller-123',
        'transfer-456',
        50000,
        2500
      );

      const insertCall = insertMock.mock.calls[0][0];
      expect(insertCall.net_amount).toBe(47500); // 50000 - 2500
    });

    it('should throw on database error', async () => {
      mockDb.mockReturnValue({
        insert: jest.fn().mockRejectedValue(new Error('DB error')),
      });

      await expect(
        taxReportingService.recordSale('seller-123', 'transfer-456', 10000, 500)
      ).rejects.toThrow('DB error');
    });

    it('should generate unique transaction ID', async () => {
      const insertMock = jest.fn().mockResolvedValue([1]);
      mockDb.mockReturnValue({
        insert: insertMock,
      });

      await taxReportingService.recordSale(
        'seller-123',
        'transfer-456',
        10000,
        500
      );

      const insertCall = insertMock.mock.calls[0][0];
      expect(insertCall.id).toBe('mock-uuid-1234');
    });
  });

  describe('getYearlyReport', () => {
    it('should return yearly summary for seller', async () => {
      const mockTransactions = [
        { amount: 10000, platform_fee: 500 },
        { amount: 20000, platform_fee: 1000 },
        { amount: 15000, platform_fee: 750 },
      ];

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue(mockTransactions),
            }),
          }),
        }),
      });

      const result = await taxReportingService.getYearlyReport('seller-123', 2024);

      expect(result).toBeDefined();
      expect(result!.seller_id).toBe('seller-123');
      expect(result!.year).toBe(2024);
      expect(result!.total_transactions).toBe(3);
    });

    it('should calculate totals correctly', async () => {
      const mockTransactions = [
        { amount: 10000, platform_fee: 500 },
        { amount: 20000, platform_fee: 1000 },
      ];

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue(mockTransactions),
            }),
          }),
        }),
      });

      const result = await taxReportingService.getYearlyReport('seller-123', 2024);

      expect(result!.total_sales).toBe(30000);
      expect(result!.total_fees_paid).toBe(1500);
      expect(result!.net_proceeds).toBe(28500);
    });

    it('should return null when no transactions found', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await taxReportingService.getYearlyReport('seller-123', 2024);

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              select: jest.fn().mockRejectedValue(new Error('DB error')),
            }),
          }),
        }),
      });

      const result = await taxReportingService.getYearlyReport('seller-123', 2024);

      expect(result).toBeNull();
    });

    it('should filter by correct year date range', async () => {
      const whereBetweenMock = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: whereBetweenMock,
          }),
        }),
      });

      await taxReportingService.getYearlyReport('seller-123', 2024);

      expect(whereBetweenMock).toHaveBeenCalledWith(
        'transferred_at',
        expect.arrayContaining([
          expect.any(Date),
          expect.any(Date),
        ])
      );
    });
  });

  describe('generate1099K', () => {
    it('should indicate 1099-K required when over threshold', async () => {
      const mockTransactions = [
        { amount: 70000, platform_fee: 3500 },
      ];

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue(mockTransactions),
            }),
          }),
        }),
      });

      const result = await taxReportingService.generate1099K('seller-123', 2024);

      expect(result).toBeDefined();
      expect(result!.required).toBe(true);
      expect(result!.form_type).toBe('1099-K');
    });

    it('should indicate 1099-K not required when under threshold', async () => {
      const mockTransactions = [
        { amount: 40000, platform_fee: 2000 },
      ];

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue(mockTransactions),
            }),
          }),
        }),
      });

      const result = await taxReportingService.generate1099K('seller-123', 2024);

      expect(result).toBeDefined();
      expect(result!.required).toBe(false);
      expect(result!.reason).toContain('below');
    });

    it('should return null when no yearly report available', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await taxReportingService.generate1099K('seller-123', 2024);

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              select: jest.fn().mockRejectedValue(new Error('DB error')),
            }),
          }),
        }),
      });

      const result = await taxReportingService.generate1099K('seller-123', 2024);

      expect(result).toBeNull();
    });

    it('should include correct gross amount in 1099-K', async () => {
      const mockTransactions = [
        { amount: 100000, platform_fee: 5000 },
      ];

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue(mockTransactions),
            }),
          }),
        }),
      });

      const result = await taxReportingService.generate1099K('seller-123', 2024);

      expect(result!.required).toBe(true);
      expect(result!.gross_amount).toBe(100000);
      expect(result!.net_proceeds).toBe(95000);
    });
  });

  describe('getReportableTransactions', () => {
    it('should return transactions for a given year', async () => {
      const mockTransactions = [
        { id: 'tx-1', amount: 10000 },
        { id: 'tx-2', amount: 20000 },
      ];

      const orderByMock = jest.fn().mockResolvedValue(mockTransactions);

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              orderBy: orderByMock,
            }),
          }),
        }),
      });

      const result = await taxReportingService.getReportableTransactions('seller-123', 2024);

      expect(result).toEqual(mockTransactions);
      expect(orderByMock).toHaveBeenCalledWith('transferred_at', 'desc');
    });

    it('should return empty array when no transactions', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await taxReportingService.getReportableTransactions('seller-123', 2024);

      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereBetween: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockRejectedValue(new Error('DB error')),
            }),
          }),
        }),
      });

      const result = await taxReportingService.getReportableTransactions('seller-123', 2024);

      expect(result).toEqual([]);
    });

    it('should filter by completed status', async () => {
      const whereMock = jest.fn().mockReturnThis();
      
      mockDb.mockReturnValue({
        where: whereMock,
      });

      whereMock.mockReturnValue({
        where: jest.fn().mockReturnValue({
          whereBetween: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await taxReportingService.getReportableTransactions('seller-123', 2024);

      // First where should filter by seller_id
      expect(whereMock).toHaveBeenCalledWith('seller_id', 'seller-123');
    });
  });
});
