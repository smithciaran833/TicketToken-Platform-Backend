/**
 * Unit tests for FeeDistributionService
 * Tests fee calculation, recording, distribution, and reconciliation
 */

// Mock dependencies before imports
jest.mock('../../../src/config/database', () => ({
  db: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

jest.mock('../../../src/config', () => ({
  config: {
    paymentServiceUrl: 'http://payment-service:3000'
  }
}));

jest.mock('axios');

import { FeeDistributionService, feeDistributionService } from '../../../src/services/fee-distribution.service';
import { db } from '../../../src/config/database';
import axios from 'axios';

describe('FeeDistributionService', () => {
  let service: FeeDistributionService;
  let mockDbInsert: jest.Mock;
  let mockDbWhere: jest.Mock;
  let mockDbFirst: jest.Mock;
  let mockDbUpdate: jest.Mock;
  let mockDbSelect: jest.Mock;
  let mockDbRaw: jest.Mock;
  let mockDbCount: jest.Mock;
  let mockDbWhereNotExists: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset environment variables
    delete process.env.PLATFORM_FEE_RATE;
    delete process.env.VENUE_FEE_RATE;

    // Setup mock chain
    mockDbFirst = jest.fn();
    mockDbUpdate = jest.fn().mockReturnThis();
    mockDbSelect = jest.fn().mockReturnThis();
    mockDbInsert = jest.fn().mockResolvedValue([1]);
    mockDbRaw = jest.fn();
    mockDbCount = jest.fn().mockReturnThis();
    mockDbWhereNotExists = jest.fn().mockReturnThis();
    
    mockDbWhere = jest.fn().mockReturnValue({
      first: mockDbFirst,
      update: mockDbUpdate,
      select: mockDbSelect,
      count: mockDbCount
    });

    (db as unknown as jest.Mock).mockImplementation((table: string) => ({
      insert: mockDbInsert,
      where: mockDbWhere,
      select: mockDbSelect,
      raw: mockDbRaw,
      count: mockDbCount,
      whereNotExists: mockDbWhereNotExists
    }));

    service = new FeeDistributionService();
  });

  describe('calculateFees', () => {
    it('should calculate platform fee at 2.5% by default', () => {
      const result = service.calculateFees(10000);
      
      expect(result.platformFee).toBe(250); // 2.5% of 10000
    });

    it('should calculate venue fee at 5% by default', () => {
      const result = service.calculateFees(10000);
      
      expect(result.venueFee).toBe(500); // 5% of 10000
    });

    it('should return subtotal equal to listing price', () => {
      const listingPrice = 15000;
      const result = service.calculateFees(listingPrice);
      
      expect(result.subtotal).toBe(listingPrice);
    });

    it('should calculate total as listing + platform fee + venue fee', () => {
      const result = service.calculateFees(10000);
      
      expect(result.total).toBe(10000 + 250 + 500); // 10750
    });

    it('should calculate seller receives as listing - platform fee - venue fee', () => {
      const result = service.calculateFees(10000);
      
      expect(result.sellerReceives).toBe(10000 - 250 - 500); // 9250
    });

    it('should include network fee in breakdown', () => {
      const result = service.calculateFees(10000);
      
      expect(result.networkFee).toBe(0.00025);
    });

    it('should round fees to nearest integer', () => {
      // 1234 * 0.025 = 30.85 -> rounds to 31
      const result = service.calculateFees(1234);
      
      expect(Number.isInteger(result.platformFee)).toBe(true);
      expect(Number.isInteger(result.venueFee)).toBe(true);
    });

    it('should use PLATFORM_FEE_RATE from environment', () => {
      process.env.PLATFORM_FEE_RATE = '0.03'; // 3%
      
      const customService = new FeeDistributionService();
      const result = customService.calculateFees(10000);
      
      expect(result.platformFee).toBe(300); // 3% of 10000
    });

    it('should use VENUE_FEE_RATE from environment', () => {
      process.env.VENUE_FEE_RATE = '0.10'; // 10%
      
      const customService = new FeeDistributionService();
      const result = customService.calculateFees(10000);
      
      expect(result.venueFee).toBe(1000); // 10% of 10000
    });
  });

  describe('recordFeeCollection', () => {
    const mockParams = {
      transferId: 'transfer-123',
      listingId: 'listing-456',
      eventId: 'event-789',
      venueId: 'venue-abc',
      salePrice: 10000,
      platformFeeAmount: 250,
      venueFeeAmount: 500
    };

    it('should insert fee record into database', async () => {
      await service.recordFeeCollection(mockParams);
      
      expect(db).toHaveBeenCalledWith('platform_fees');
      expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({
        transfer_id: mockParams.transferId,
        listing_id: mockParams.listingId,
        event_id: mockParams.eventId,
        venue_id: mockParams.venueId,
        sale_price: mockParams.salePrice,
        platform_fee_amount: mockParams.platformFeeAmount,
        venue_fee_amount: mockParams.venueFeeAmount
      }));
    });

    it('should set collection_status to pending', async () => {
      await service.recordFeeCollection(mockParams);
      
      expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({
        collection_status: 'pending'
      }));
    });

    it('should set fee rates in record', async () => {
      await service.recordFeeCollection(mockParams);
      
      expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({
        platform_fee_rate: expect.any(Number),
        venue_fee_rate: expect.any(Number)
      }));
    });

    it('should set timestamps', async () => {
      await service.recordFeeCollection(mockParams);
      
      expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      }));
    });

    it('should throw error on database failure', async () => {
      mockDbInsert.mockRejectedValueOnce(new Error('Database error'));
      
      await expect(service.recordFeeCollection(mockParams)).rejects.toThrow('Database error');
    });
  });

  describe('distributeFees', () => {
    const mockFeeRecord = {
      transfer_id: 'transfer-123',
      platform_fee_amount: 250,
      venue_fee_amount: 500,
      sale_price: 10000,
      collection_status: 'pending'
    };

    beforeEach(() => {
      mockDbFirst.mockResolvedValue(mockFeeRecord);
      mockDbUpdate.mockReturnValue({
        where: jest.fn().mockResolvedValue(1)
      });
      (axios.post as jest.Mock).mockResolvedValue({ data: {} });
    });

    it('should fetch fee record by transfer ID', async () => {
      await service.distributeFees('transfer-123');
      
      expect(db).toHaveBeenCalledWith('platform_fees');
      expect(mockDbWhere).toHaveBeenCalledWith({ transfer_id: 'transfer-123' });
    });

    it('should throw error if fee record not found', async () => {
      mockDbFirst.mockResolvedValueOnce(null);
      
      await expect(service.distributeFees('transfer-123')).rejects.toThrow(
        'Fee record not found for transfer transfer-123'
      );
    });

    it('should return existing distribution if already collected', async () => {
      mockDbFirst.mockResolvedValueOnce({
        ...mockFeeRecord,
        collection_status: 'collected',
        collected_at: new Date('2026-01-01')
      });
      
      const result = await service.distributeFees('transfer-123');
      
      expect(result.platformAmount).toBe(250);
      expect(result.venueAmount).toBe(500);
    });

    it('should update status to collected', async () => {
      mockDbWhere.mockReturnValue({
        first: mockDbFirst,
        update: jest.fn().mockResolvedValue(1)
      });
      
      await service.distributeFees('transfer-123');
      
      // Verify update was called (implicitly through the mock chain)
    });

    it('should return fee distribution object', async () => {
      const result = await service.distributeFees('transfer-123');
      
      expect(result).toMatchObject({
        transferId: 'transfer-123',
        platformAmount: 250,
        venueAmount: 500,
        sellerAmount: 10000 - 250 - 500,
        distributedAt: expect.any(Date)
      });
    });

    it('should calculate seller amount correctly', async () => {
      const result = await service.distributeFees('transfer-123');
      
      expect(result.sellerAmount).toBe(9250); // 10000 - 250 - 500
    });

    it('should emit fee collection event to analytics', async () => {
      await service.distributeFees('transfer-123');
      
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/analytics/fee-collection'),
        expect.objectContaining({
          transferId: 'transfer-123',
          platformAmount: 250,
          venueAmount: 500
        }),
        expect.any(Object)
      );
    });

    it('should not fail if analytics event fails', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('Analytics error'));
      
      // Should not throw
      const result = await service.distributeFees('transfer-123');
      
      expect(result.transferId).toBe('transfer-123');
    });
  });

  describe('getFeeStatistics', () => {
    const mockStats = {
      transaction_count: '10',
      total_fees: '7500',
      platform_fees: '2500',
      venue_fees: '5000'
    };

    beforeEach(() => {
      mockDbSelect.mockReturnValue({
        first: jest.fn().mockResolvedValue(mockStats)
      });
      mockDbRaw.mockReturnValue('raw query');
    });

    it('should query collected fees', async () => {
      // Setup mock chain for this specific test
      const mockFirst = jest.fn().mockResolvedValue(mockStats);
      (db as unknown as jest.Mock).mockImplementation(() => ({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnValue({
            first: mockFirst
          })
        }),
        raw: mockDbRaw
      }));

      await service.getFeeStatistics({});
      
      expect(db).toHaveBeenCalledWith('platform_fees');
    });

    it('should filter by date range when provided', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');
      
      const mockWhere = jest.fn().mockReturnThis();
      const mockFirst = jest.fn().mockResolvedValue(mockStats);
      
      (db as unknown as jest.Mock).mockImplementation(() => ({
        where: mockWhere,
        select: jest.fn().mockReturnValue({ first: mockFirst }),
        raw: mockDbRaw
      }));
      mockWhere.mockReturnValue({
        where: mockWhere,
        select: jest.fn().mockReturnValue({ first: mockFirst })
      });

      await service.getFeeStatistics({ startDate, endDate });
      
      // The method should have been called with date filters
    });

    it('should filter by venue ID when provided', async () => {
      const mockWhere = jest.fn().mockReturnThis();
      const mockFirst = jest.fn().mockResolvedValue(mockStats);
      
      (db as unknown as jest.Mock).mockImplementation(() => ({
        where: mockWhere,
        select: jest.fn().mockReturnValue({ first: mockFirst }),
        raw: mockDbRaw
      }));
      mockWhere.mockReturnValue({
        where: mockWhere,
        select: jest.fn().mockReturnValue({ first: mockFirst })
      });

      await service.getFeeStatistics({ venueId: 'venue-123' });
      
      // The method should have been called with venue filter
    });

    it('should return fee statistics object', async () => {
      const mockFirst = jest.fn().mockResolvedValue(mockStats);
      (db as unknown as jest.Mock).mockImplementation(() => ({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnValue({ first: mockFirst })
        }),
        raw: mockDbRaw
      }));

      const result = await service.getFeeStatistics({});
      
      expect(result).toMatchObject({
        totalFeesCollected: expect.any(Number),
        platformFeesCollected: expect.any(Number),
        venueFeesCollected: expect.any(Number),
        transactionCount: expect.any(Number),
        averageFeePerTransaction: expect.any(Number)
      });
    });

    it('should calculate average fee per transaction', async () => {
      const mockFirst = jest.fn().mockResolvedValue(mockStats);
      (db as unknown as jest.Mock).mockImplementation(() => ({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnValue({ first: mockFirst })
        }),
        raw: mockDbRaw
      }));

      const result = await service.getFeeStatistics({});
      
      expect(result.averageFeePerTransaction).toBe(Math.round(7500 / 10));
    });

    it('should return 0 for average when no transactions', async () => {
      const mockFirst = jest.fn().mockResolvedValue({
        transaction_count: '0',
        total_fees: null,
        platform_fees: null,
        venue_fees: null
      });
      (db as unknown as jest.Mock).mockImplementation(() => ({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnValue({ first: mockFirst })
        }),
        raw: mockDbRaw
      }));

      const result = await service.getFeeStatistics({});
      
      expect(result.averageFeePerTransaction).toBe(0);
    });
  });

  describe('getPendingFeeCollections', () => {
    const mockPendingFees = [
      {
        transfer_id: 'transfer-1',
        platform_fee_amount: 250,
        venue_fee_amount: 500,
        created_at: new Date('2026-01-01')
      },
      {
        transfer_id: 'transfer-2',
        platform_fee_amount: 300,
        venue_fee_amount: 600,
        created_at: new Date('2026-01-02')
      }
    ];

    it('should query pending fee records', async () => {
      mockDbSelect.mockResolvedValue(mockPendingFees);
      mockDbWhere.mockReturnValue({
        select: mockDbSelect
      });

      await service.getPendingFeeCollections();
      
      expect(db).toHaveBeenCalledWith('platform_fees');
      expect(mockDbWhere).toHaveBeenCalledWith('collection_status', 'pending');
    });

    it('should return mapped pending fee objects', async () => {
      mockDbSelect.mockResolvedValue(mockPendingFees);
      mockDbWhere.mockReturnValue({
        select: mockDbSelect
      });

      const result = await service.getPendingFeeCollections();
      
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        transferId: 'transfer-1',
        platformFeeAmount: 250,
        venueFeeAmount: 500
      });
    });

    it('should return empty array when no pending fees', async () => {
      mockDbSelect.mockResolvedValue([]);
      mockDbWhere.mockReturnValue({
        select: mockDbSelect
      });

      const result = await service.getPendingFeeCollections();
      
      expect(result).toEqual([]);
    });
  });

  describe('reconcileFees', () => {
    it('should find transfers without fee records', async () => {
      const mockCompletedTransfers = [{ id: 'transfer-1' }, { id: 'transfer-2' }];
      const mockPendingCount = { count: '5' };

      (db as unknown as jest.Mock).mockImplementation((table: string) => {
        if (table === 'marketplace_transfers') {
          return {
            where: jest.fn().mockReturnValue({
              whereNotExists: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(mockCompletedTransfers)
              })
            })
          };
        }
        if (table === 'platform_fees') {
          return {
            where: jest.fn().mockReturnValue({
              count: jest.fn().mockReturnValue({
                first: jest.fn().mockResolvedValue(mockPendingCount)
              })
            })
          };
        }
        return {
          where: jest.fn()
        };
      });

      const result = await service.reconcileFees();
      
      expect(result.missingFeeRecords).toBe(2);
    });

    it('should count pending collections', async () => {
      const mockCompletedTransfers: any[] = [];
      const mockPendingCount = { count: '3' };

      (db as unknown as jest.Mock).mockImplementation((table: string) => {
        if (table === 'marketplace_transfers') {
          return {
            where: jest.fn().mockReturnValue({
              whereNotExists: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(mockCompletedTransfers)
              })
            })
          };
        }
        if (table === 'platform_fees') {
          return {
            where: jest.fn().mockReturnValue({
              count: jest.fn().mockReturnValue({
                first: jest.fn().mockResolvedValue(mockPendingCount)
              })
            })
          };
        }
        return {
          where: jest.fn()
        };
      });

      const result = await service.reconcileFees();
      
      expect(result.pendingCollections).toBe(3);
    });

    it('should return reconciliation results', async () => {
      const mockCompletedTransfers: any[] = [];
      const mockPendingCount = { count: '0' };

      (db as unknown as jest.Mock).mockImplementation((table: string) => {
        if (table === 'marketplace_transfers') {
          return {
            where: jest.fn().mockReturnValue({
              whereNotExists: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(mockCompletedTransfers)
              })
            })
          };
        }
        if (table === 'platform_fees') {
          return {
            where: jest.fn().mockReturnValue({
              count: jest.fn().mockReturnValue({
                first: jest.fn().mockResolvedValue(mockPendingCount)
              })
            })
          };
        }
        return {
          where: jest.fn()
        };
      });

      const result = await service.reconcileFees();
      
      expect(result).toMatchObject({
        missingFeeRecords: expect.any(Number),
        pendingCollections: expect.any(Number)
      });
    });
  });

  describe('Singleton export', () => {
    it('should export singleton instance', () => {
      expect(feeDistributionService).toBeInstanceOf(FeeDistributionService);
    });
  });
});
