/**
 * Fee Calculator Service Integration Tests
 */

import { FeeCalculatorService } from '../../../../src/services/core/fee-calculator.service';
import { RedisService } from '../../../../src/services/redisService';
import { v4 as uuidv4 } from 'uuid';

// Mock all external dependencies before importing
jest.mock('../../../../src/services/core/venue-analytics.service', () => ({
  VenueAnalyticsService: jest.fn().mockImplementation(() => ({
    getMonthlyVolume: jest.fn().mockResolvedValue(0),
  })),
}));

jest.mock('../../../../src/services/core/tax-calculator.service', () => ({
  TaxCalculatorService: jest.fn().mockImplementation(() => ({
    calculateTax: jest.fn().mockResolvedValue({
      state: 700, county: 225, city: 0, special: 0, total: 925, rate: 9.25,
    }),
  })),
}));

jest.mock('../../../../src/services/core/gas-fee-estimator.service', () => ({
  GasFeeEstimatorService: jest.fn().mockImplementation(() => ({
    estimateGasFees: jest.fn().mockResolvedValue({
      network: 'solana',
      feePerTransactionCents: 5,
      totalFeeCents: 10,
      transactionCount: 2,
    }),
  })),
  BlockchainNetwork: {
    SOLANA: 'solana',
    POLYGON: 'polygon',
    ETHEREUM: 'ethereum',
  },
}));

describe('FeeCalculatorService Integration Tests', () => {
  let feeCalculatorService: FeeCalculatorService;

  beforeAll(async () => {
    await RedisService.initialize();
  });

  beforeEach(async () => {
    // Clear cache
    const redis = RedisService.getClient();
    const keys = await redis.keys('venue:*');
    if (keys.length > 0) await redis.del(...keys);
    const taxKeys = await redis.keys('tax:*');
    if (taxKeys.length > 0) await redis.del(...taxKeys);
    const gasKeys = await redis.keys('gas:*');
    if (gasKeys.length > 0) await redis.del(...gasKeys);

    jest.clearAllMocks();
    feeCalculatorService = new FeeCalculatorService();
  });

  describe('calculateDynamicFees', () => {
    it('should calculate fees for a transaction', async () => {
      const result = await feeCalculatorService.calculateDynamicFees(
        uuidv4(), 10000, 2
      );

      expect(result).toBeDefined();
      expect(result.platform).toBeGreaterThan(0);
      expect(result.platformPercentage).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(10000);
      expect(result.breakdown.ticketPrice).toBe(10000);
    });

    it('should return all fee components', async () => {
      const result = await feeCalculatorService.calculateDynamicFees(
        uuidv4(), 5000, 1
      );

      expect(result.breakdown.ticketPrice).toBe(5000);
      expect(result.breakdown.platformFee).toBe(result.platform);
      expect(result.breakdown.gasEstimate).toBe(result.gasEstimate);
      expect(result.breakdown.stateTax).toBeDefined();
      expect(result.breakdown.localTax).toBeDefined();
    });

    it('should calculate correct total', async () => {
      const result = await feeCalculatorService.calculateDynamicFees(
        uuidv4(), 10000, 2
      );

      const expectedTotal = 
        result.breakdown.ticketPrice +
        result.breakdown.platformFee +
        result.breakdown.gasEstimate +
        result.breakdown.stateTax +
        result.breakdown.localTax;

      expect(result.breakdown.total).toBe(expectedTotal);
    });

    it('should return integers for all amounts', async () => {
      const result = await feeCalculatorService.calculateDynamicFees(
        uuidv4(), 9999, 3
      );

      expect(Number.isInteger(result.platform)).toBe(true);
      expect(Number.isInteger(result.gasEstimate)).toBe(true);
      expect(Number.isInteger(result.tax)).toBe(true);
      expect(Number.isInteger(result.total)).toBe(true);
    });

    it('should handle small amounts', async () => {
      const result = await feeCalculatorService.calculateDynamicFees(
        uuidv4(), 100, 1
      );

      expect(result.platform).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeGreaterThanOrEqual(100);
    });

    it('should handle large amounts', async () => {
      const result = await feeCalculatorService.calculateDynamicFees(
        uuidv4(), 10000000, 100
      );

      expect(result.platform).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(10000000);
    });
  });

  describe('fee breakdown structure', () => {
    it('should include all breakdown fields', async () => {
      const result = await feeCalculatorService.calculateDynamicFees(
        uuidv4(), 10000, 1
      );

      expect(result.breakdown).toHaveProperty('ticketPrice');
      expect(result.breakdown).toHaveProperty('platformFee');
      expect(result.breakdown).toHaveProperty('gasEstimate');
      expect(result.breakdown).toHaveProperty('stateTax');
      expect(result.breakdown).toHaveProperty('localTax');
      expect(result.breakdown).toHaveProperty('total');
    });

    it('should include platform percentage', async () => {
      const result = await feeCalculatorService.calculateDynamicFees(
        uuidv4(), 10000, 1
      );

      expect(result.platformPercentage).toBeGreaterThan(0);
      expect(typeof result.platformPercentage).toBe('number');
    });
  });

  describe('tax calculation', () => {
    it('should include tax in total', async () => {
      const result = await feeCalculatorService.calculateDynamicFees(
        uuidv4(), 10000, 1
      );

      expect(result.tax).toBeGreaterThan(0);
    });

    it('should include state and local tax in breakdown', async () => {
      const result = await feeCalculatorService.calculateDynamicFees(
        uuidv4(), 10000, 1
      );

      expect(result.breakdown.stateTax).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.localTax).toBeGreaterThanOrEqual(0);
    });
  });

  describe('gas fee estimation', () => {
    it('should include gas fees', async () => {
      const result = await feeCalculatorService.calculateDynamicFees(
        uuidv4(), 10000, 2
      );

      expect(result.gasEstimate).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.gasEstimate).toBe(result.gasEstimate);
    });
  });
});
