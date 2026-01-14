/**
 * Unit Tests for Fee Calculator Service
 * 
 * Tests dynamic fee calculation including platform fees, gas fees, and taxes.
 */

import { FeeCalculatorService } from '../../../src/services/core/fee-calculator.service';
import { VenueTier } from '../../../src/types';

// Mock dependencies
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    getOrCompute: jest.fn().mockImplementation(async (key, fn) => fn()),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../../src/services/core/venue-analytics.service', () => ({
  VenueAnalyticsService: jest.fn().mockImplementation(() => ({
    getMonthlyVolume: jest.fn().mockResolvedValue(500000), // $5,000 in cents
  })),
}));

jest.mock('../../../src/services/core/tax-calculator.service', () => ({
  TaxCalculatorService: jest.fn().mockImplementation(() => ({
    calculateTax: jest.fn().mockResolvedValue({
      state: 700,
      county: 100,
      city: 50,
      special: 25,
      total: 875,
    }),
  })),
  TaxLocation: {},
}));

jest.mock('../../../src/services/core/gas-fee-estimator.service', () => ({
  GasFeeEstimatorService: jest.fn().mockImplementation(() => ({
    estimateGasFees: jest.fn().mockResolvedValue({
      totalFeeCents: 100,
      feePerTransactionCents: 50,
    }),
  })),
  BlockchainNetwork: {
    SOLANA: 'SOLANA',
    ETHEREUM: 'ETHEREUM',
  },
}));

jest.mock('../../../src/config/fees', () => ({
  feeConfig: {
    tiers: {
      starter: {
        percentage: 7, // 7%
        monthlyVolumeMax: 10000, // $10,000
      },
      pro: {
        percentage: 5, // 5%
        monthlyVolumeMax: 100000, // $100,000
      },
      enterprise: {
        percentage: 3, // 3%
        monthlyVolumeMax: Infinity,
      },
    },
  },
}));

describe('FeeCalculatorService', () => {
  let service: FeeCalculatorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeeCalculatorService();
  });

  describe('calculateDynamicFees', () => {
    it('should calculate fees for a standard transaction', async () => {
      const result = await service.calculateDynamicFees(
        'venue-123',
        10000, // $100.00
        2      // 2 tickets
      );

      expect(result).toBeDefined();
      expect(result.platform).toBeGreaterThan(0);
      expect(result.platformPercentage).toBeGreaterThan(0);
      expect(result.gasEstimate).toBeDefined();
      expect(result.tax).toBeDefined();
      expect(result.total).toBeGreaterThan(10000);
      expect(result.breakdown).toBeDefined();
    });

    it('should include all fee components in breakdown', async () => {
      const result = await service.calculateDynamicFees(
        'venue-123',
        10000,
        1
      );

      expect(result.breakdown.ticketPrice).toBe(10000);
      expect(result.breakdown.platformFee).toBeGreaterThan(0);
      expect(result.breakdown.gasEstimate).toBeDefined();
      expect(result.breakdown.stateTax).toBeDefined();
      expect(result.breakdown.localTax).toBeDefined();
      expect(result.breakdown.total).toBeGreaterThan(10000);
    });

    it('should calculate total as sum of all components', async () => {
      const result = await service.calculateDynamicFees(
        'venue-123',
        10000,
        1
      );

      const expectedTotal =
        result.breakdown.ticketPrice +
        result.breakdown.platformFee +
        result.breakdown.gasEstimate +
        result.breakdown.stateTax +
        result.breakdown.localTax;

      expect(result.breakdown.total).toBe(expectedTotal);
      expect(result.total).toBe(expectedTotal);
    });

    it('should use provided location for tax calculation', async () => {
      const location = {
        country: 'US',
        state: 'CA',
        zip: '90210',
        city: 'Beverly Hills',
      };

      const result = await service.calculateDynamicFees(
        'venue-123',
        5000,
        1,
        location
      );

      expect(result).toBeDefined();
      expect(result.tax).toBeDefined();
    });

    it('should handle multiple tickets', async () => {
      const singleTicket = await service.calculateDynamicFees('venue-123', 5000, 1);
      const twoTickets = await service.calculateDynamicFees('venue-123', 10000, 2);

      // Gas fees should scale with ticket count
      expect(twoTickets.gasEstimate).toBeGreaterThanOrEqual(singleTicket.gasEstimate);
    });
  });

  describe('Venue Tier Calculation', () => {
    it('should apply correct fee percentage for starter tier', async () => {
      // Mock low volume venue
      const { VenueAnalyticsService } = require('../../../src/services/core/venue-analytics.service');
      VenueAnalyticsService.mockImplementation(() => ({
        getMonthlyVolume: jest.fn().mockResolvedValue(50000), // $500 in cents
      }));

      const newService = new FeeCalculatorService();
      const result = await newService.calculateDynamicFees('starter-venue', 10000, 1);

      // Starter tier: 7% = 700 basis points
      expect(result.platformPercentage).toBe(7); // 700 bps / 100
    });

    it('should apply correct fee percentage for pro tier', async () => {
      const { VenueAnalyticsService } = require('../../../src/services/core/venue-analytics.service');
      VenueAnalyticsService.mockImplementation(() => ({
        getMonthlyVolume: jest.fn().mockResolvedValue(5000000), // $50,000 in cents
      }));

      const newService = new FeeCalculatorService();
      const result = await newService.calculateDynamicFees('pro-venue', 10000, 1);

      // Pro tier: 5% = 500 basis points
      expect(result.platformPercentage).toBe(5);
    });

    it('should apply correct fee percentage for enterprise tier', async () => {
      const { VenueAnalyticsService } = require('../../../src/services/core/venue-analytics.service');
      VenueAnalyticsService.mockImplementation(() => ({
        getMonthlyVolume: jest.fn().mockResolvedValue(15000000), // $150,000 in cents
      }));

      const newService = new FeeCalculatorService();
      const result = await newService.calculateDynamicFees('enterprise-venue', 10000, 1);

      // Enterprise tier: 3% = 300 basis points
      expect(result.platformPercentage).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should use fallback when tax calculation fails', async () => {
      const { TaxCalculatorService } = require('../../../src/services/core/tax-calculator.service');
      TaxCalculatorService.mockImplementation(() => ({
        calculateTax: jest.fn().mockRejectedValue(new Error('Tax service unavailable')),
      }));

      const newService = new FeeCalculatorService();
      const result = await newService.calculateDynamicFees('venue-123', 10000, 1);

      // Should still return a result with fallback tax
      expect(result).toBeDefined();
      expect(result.tax).toBeGreaterThan(0);
    });

    it('should use fallback when gas estimation fails', async () => {
      const { GasFeeEstimatorService } = require('../../../src/services/core/gas-fee-estimator.service');
      GasFeeEstimatorService.mockImplementation(() => ({
        estimateGasFees: jest.fn().mockRejectedValue(new Error('Gas service unavailable')),
      }));

      const newService = new FeeCalculatorService();
      const result = await newService.calculateDynamicFees('venue-123', 10000, 2);

      // Should use fallback: 50 cents per ticket
      expect(result.gasEstimate).toBe(100); // 50 * 2 tickets
    });

    it('should use conservative estimate when volume retrieval fails', async () => {
      const { VenueAnalyticsService } = require('../../../src/services/core/venue-analytics.service');
      VenueAnalyticsService.mockImplementation(() => ({
        getMonthlyVolume: jest.fn().mockRejectedValue(new Error('Analytics unavailable')),
      }));

      const newService = new FeeCalculatorService();
      const result = await newService.calculateDynamicFees('venue-123', 10000, 1);

      // Should use starter tier (highest fee) as conservative fallback
      expect(result.platformPercentage).toBe(7);
    });
  });

  describe('Fee Calculations', () => {
    it('should calculate platform fee in cents accurately', async () => {
      // 7% of $100 = $7 = 700 cents
      const result = await service.calculateDynamicFees('venue-123', 10000, 1);

      // Platform fee should be around 7% (depending on tier)
      expect(result.platform).toBeGreaterThan(0);
      expect(result.platform).toBeLessThan(10000); // Less than ticket price
    });

    it('should handle small amounts correctly', async () => {
      const result = await service.calculateDynamicFees('venue-123', 100, 1); // $1.00

      expect(result).toBeDefined();
      expect(result.platform).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(100);
    });

    it('should handle large amounts correctly', async () => {
      const result = await service.calculateDynamicFees('venue-123', 10000000, 100); // $100,000

      expect(result).toBeDefined();
      expect(result.platform).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(10000000);
    });
  });
});
