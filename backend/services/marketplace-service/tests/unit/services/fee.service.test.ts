/**
 * Unit Tests for fee.service.ts
 * Tests fee calculation, royalty data, and fee reporting
 */

import { FeeService, feeService } from '../../../src/services/fee.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('../../../src/config/database', () => {
  const mockDb = jest.fn(() => mockDb);
  Object.assign(mockDb, {
    where: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    first: jest.fn(),
  });
  return { db: mockDb };
});

jest.mock('../../../src/models/fee.model', () => ({
  feeModel: {
    findByTransferId: jest.fn(),
    getTotalPlatformFees: jest.fn(),
    getTotalVenueFees: jest.fn(),
  },
}));

jest.mock('../../../src/models/transfer.model', () => ({
  transferModel: {
    getTotalVolumeByVenueId: jest.fn(),
  },
}));

jest.mock('../../../src/models/venue-settings.model', () => ({
  venueSettingsModel: {
    findByVenueId: jest.fn(),
  },
}));

jest.mock('../../../src/config', () => ({
  constants: {
    FEES: {
      PLATFORM_FEE_PERCENTAGE: 5.0,
      DEFAULT_VENUE_FEE_PERCENTAGE: 5.0,
    },
  },
}));

jest.mock('@tickettoken/shared', () => ({
  percentOfCents: jest.fn((amount, bps) => Math.floor(amount * bps / 10000)),
}));

import { db } from '../../../src/config/database';
import { feeModel } from '../../../src/models/fee.model';
import { transferModel } from '../../../src/models/transfer.model';
import { venueSettingsModel } from '../../../src/models/venue-settings.model';
import { percentOfCents } from '@tickettoken/shared';

describe('FeeService', () => {
  let service: FeeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeeService();
  });

  describe('calculateFees', () => {
    beforeEach(() => {
      // Setup percentOfCents to do proper calculation
      (percentOfCents as jest.Mock).mockImplementation((amount, bps) => 
        Math.floor(amount * bps / 10000)
      );
    });

    it('should calculate fees correctly for valid sale price', () => {
      const result = service.calculateFees(10000); // $100.00

      expect(result.salePrice).toBe(10000);
      expect(result.platformFee).toBe(500); // 5%
      expect(result.venueFee).toBe(500); // 5%
      expect(result.totalFees).toBe(1000); // 10%
      expect(result.sellerPayout).toBe(9000); // 90%
    });

    it('should calculate fees with custom venue royalty', () => {
      const result = service.calculateFees(10000, 10.0); // 10% venue fee

      expect(result.venueFee).toBe(1000); // 10%
      expect(result.sellerPayout).toBe(8500); // 85%
    });

    it('should throw error for non-integer sale price', () => {
      expect(() => service.calculateFees(100.50)).toThrow('Invalid sale price');
    });

    it('should throw error for negative sale price', () => {
      expect(() => service.calculateFees(-100)).toThrow('Invalid sale price');
    });

    it('should handle zero sale price', () => {
      const result = service.calculateFees(0);

      expect(result.salePrice).toBe(0);
      expect(result.platformFee).toBe(0);
      expect(result.venueFee).toBe(0);
      expect(result.sellerPayout).toBe(0);
    });

    it('should ensure payment splits sum correctly', () => {
      const result = service.calculateFees(9999); // Odd amount

      const sum = result.platformFee + result.venueFee + result.sellerPayout;
      expect(sum).toBe(result.salePrice);
    });
  });

  describe('getEventRoyaltyData', () => {
    const mockDb = db as jest.MockedFunction<any>;

    it('should return royalty data from database', async () => {
      const mockResult = {
        venue_id: 'venue-123',
        venue_percentage: '7.5',
        stripe_connect_account_id: 'acct_123',
        stripe_connect_charges_enabled: true,
        stripe_connect_payouts_enabled: true,
      };

      mockDb.mockReturnValue({
        join: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue(mockResult),
            }),
          }),
        }),
      });

      const result = await service.getEventRoyaltyData('event-123');

      expect(result.venueId).toBe('venue-123');
      expect(result.venuePercentage).toBe(7.5);
      expect(result.venueStripeAccountId).toBe('acct_123');
      expect(result.venueCanReceivePayments).toBe(true);
    });

    it('should throw NotFoundError when event not found', async () => {
      mockDb.mockReturnValue({
        join: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue(null),
            }),
          }),
        }),
      });

      await expect(service.getEventRoyaltyData('non-existent')).rejects.toThrow('Event not found');
    });

    it('should return cached data on second call', async () => {
      const mockResult = {
        venue_id: 'venue-123',
        venue_percentage: '5.0',
        stripe_connect_account_id: 'acct_123',
        stripe_connect_charges_enabled: true,
        stripe_connect_payouts_enabled: true,
      };

      const firstMock = jest.fn().mockResolvedValue(mockResult);
      mockDb.mockReturnValue({
        join: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              first: firstMock,
            }),
          }),
        }),
      });

      // First call
      await service.getEventRoyaltyData('event-123');
      // Second call - should use cache
      await service.getEventRoyaltyData('event-123');

      // Database should only be called once
      expect(firstMock).toHaveBeenCalledTimes(1);
    });

    it('should handle venue without Stripe account', async () => {
      const mockResult = {
        venue_id: 'venue-123',
        venue_percentage: '5.0',
        stripe_connect_account_id: null,
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: false,
      };

      mockDb.mockReturnValue({
        join: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue(mockResult),
            }),
          }),
        }),
      });

      const result = await service.getEventRoyaltyData('event-456');

      expect(result.venueStripeAccountId).toBeNull();
      expect(result.venueCanReceivePayments).toBe(false);
    });
  });

  describe('getTransferFees', () => {
    it('should return fee breakdown for transfer', async () => {
      const mockFee = {
        salePrice: 10000,
        platformFeeAmount: 500,
        platformFeePercentage: 5,
        platformFeeCollected: true,
        platformFeeSignature: 'sig123',
        venueFeeAmount: 500,
        venueFeePercentage: 5,
        venueFeeCollected: true,
        venueFeeSignature: 'sig456',
        sellerPayout: 9000,
        createdAt: new Date(),
      };

      (feeModel.findByTransferId as jest.Mock).mockResolvedValue(mockFee);

      const result = await service.getTransferFees('transfer-123');

      expect(result.transferId).toBe('transfer-123');
      expect(result.salePrice).toBe(10000);
      expect(result.platformFee.amount).toBe(500);
      expect(result.venueFee.amount).toBe(500);
    });

    it('should throw NotFoundError when fee record not found', async () => {
      (feeModel.findByTransferId as jest.Mock).mockResolvedValue(null);

      await expect(service.getTransferFees('non-existent')).rejects.toThrow('Fee record');
    });
  });

  describe('getPlatformFeeReport', () => {
    it('should return platform fee report', async () => {
      (feeModel.getTotalPlatformFees as jest.Mock).mockResolvedValue(50000);

      const result = await service.getPlatformFeeReport();

      expect(result.totalPlatformFees).toBe(50000);
      expect(result.totalVolume).toBe(1000000); // 50000 * 20 (5% inverse)
    });

    it('should accept date range parameters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      (feeModel.getTotalPlatformFees as jest.Mock).mockResolvedValue(100000);

      await service.getPlatformFeeReport(startDate, endDate);

      expect(feeModel.getTotalPlatformFees).toHaveBeenCalledWith(startDate, endDate);
    });
  });

  describe('getVenueFeeReport', () => {
    it('should return venue fee report', async () => {
      (feeModel.getTotalVenueFees as jest.Mock).mockResolvedValue(25000);
      (transferModel.getTotalVolumeByVenueId as jest.Mock).mockResolvedValue(500000);

      const result = await service.getVenueFeeReport('venue-123');

      expect(result.totalVenueFees).toBe(25000);
      expect(result.totalVolume).toBe(500000);
    });
  });

  describe('getVenueStatistics', () => {
    it('should return venue statistics', async () => {
      const mockSettings = {
        royaltyPercentage: 5,
        minimumRoyaltyPayout: 1000,
        royaltyWalletAddress: 'wallet123',
      };

      (venueSettingsModel.findByVenueId as jest.Mock).mockResolvedValue(mockSettings);
      (transferModel.getTotalVolumeByVenueId as jest.Mock).mockResolvedValue(1000000);
      (feeModel.getTotalVenueFees as jest.Mock).mockResolvedValue(50000);

      const result = await service.getVenueStatistics('venue-123');

      expect(result.venueId).toBe('venue-123');
      expect(result.royaltyPercentage).toBe(5);
      expect(result.totalVolume).toBe(1000000);
      expect(result.totalFeesEarned).toBe(50000);
    });

    it('should throw NotFoundError when venue settings not found', async () => {
      (venueSettingsModel.findByVenueId as jest.Mock).mockResolvedValue(null);

      await expect(service.getVenueStatistics('non-existent')).rejects.toThrow('Venue settings');
    });
  });

  describe('processFeeDistributions', () => {
    it('should log fee distribution processing', async () => {
      await service.processFeeDistributions();
      // Method currently just logs, verify no errors thrown
    });
  });

  describe('Singleton export', () => {
    it('should export feeService instance', () => {
      expect(feeService).toBeDefined();
      expect(feeService).toBeInstanceOf(FeeService);
    });
  });
});
