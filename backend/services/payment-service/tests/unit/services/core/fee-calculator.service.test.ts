import { FeeCalculatorService } from '../../../../src/services/core/fee-calculator.service';
import { VenueTier } from '../../../../src/types';

// Mock fee config
jest.mock('../../../../src/config/fees', () => ({
  feeConfig: {
    tiers: {
      starter: {
        monthlyVolumeMax: 10000, // $10,000
        percentage: 3.5
      },
      pro: {
        monthlyVolumeMax: 100000, // $100,000
        percentage: 2.5
      },
      enterprise: {
        monthlyVolumeMax: Infinity,
        percentage: 1.5
      }
    }
  }
}));

describe('FeeCalculatorService', () => {
  let service: FeeCalculatorService;

  beforeEach(() => {
    service = new FeeCalculatorService();
    jest.clearAllMocks();
  });

  describe('calculateDynamicFees', () => {
    it('should calculate fees for STARTER tier venue', async () => {
      // Mock getVenueTier to return STARTER
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.STARTER);

      const result = await service.calculateDynamicFees('venue_1', 10000, 2);

      // Starter tier: 3.5% = 350 basis points
      const expectedPlatformFee = Math.round((10000 * 350) / 10000); // 350 cents
      
      expect(result.platform).toBe(expectedPlatformFee);
      expect(result.platformPercentage).toBe(3.5);
      expect(result.breakdown.platformFee).toBe(expectedPlatformFee);
    });

    it('should calculate fees for PRO tier venue', async () => {
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.PRO);

      const result = await service.calculateDynamicFees('venue_2', 10000, 2);

      // Pro tier: 2.5% = 250 basis points
      const expectedPlatformFee = Math.round((10000 * 250) / 10000); // 250 cents
      
      expect(result.platform).toBe(expectedPlatformFee);
      expect(result.platformPercentage).toBe(2.5);
    });

    it('should calculate fees for ENTERPRISE tier venue', async () => {
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.ENTERPRISE);

      const result = await service.calculateDynamicFees('venue_3', 10000, 2);

      // Enterprise tier: 1.5% = 150 basis points
      const expectedPlatformFee = Math.round((10000 * 150) / 10000); // 150 cents
      
      expect(result.platform).toBe(expectedPlatformFee);
      expect(result.platformPercentage).toBe(1.5);
    });

    it('should calculate gas estimates based on ticket count', async () => {
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.STARTER);

      const result1 = await service.calculateDynamicFees('venue_1', 10000, 1);
      const result2 = await service.calculateDynamicFees('venue_1', 10000, 5);

      // Base gas fee is 50 cents per ticket
      expect(result1.gasEstimate).toBe(50);
      expect(result2.gasEstimate).toBe(250); // 5 * 50
    });

    it('should calculate state and local taxes', async () => {
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.STARTER);

      const result = await service.calculateDynamicFees('venue_1', 10000, 2);

      // State tax: 7% = 700 basis points
      // Local tax: 2.25% = 225 basis points
      const expectedStateTax = Math.round((10000 * 700) / 10000); // 700 cents
      const expectedLocalTax = Math.round((10000 * 225) / 10000); // 225 cents

      expect(result.breakdown.stateTax).toBe(expectedStateTax);
      expect(result.breakdown.localTax).toBe(expectedLocalTax);
      expect(result.tax).toBe(expectedStateTax + expectedLocalTax);
    });

    it('should calculate correct total including all fees', async () => {
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.STARTER);

      const amount = 10000;
      const result = await service.calculateDynamicFees('venue_1', amount, 2);

      const expectedTotal = amount + 
        result.breakdown.platformFee + 
        result.breakdown.gasEstimate + 
        result.breakdown.stateTax + 
        result.breakdown.localTax;

      expect(result.total).toBe(expectedTotal);
      expect(result.breakdown.total).toBe(expectedTotal);
    });

    it('should handle zero amount correctly', async () => {
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.STARTER);

      const result = await service.calculateDynamicFees('venue_1', 0, 1);

      expect(result.breakdown.ticketPrice).toBe(0);
      expect(result.breakdown.platformFee).toBe(0);
      expect(result.breakdown.stateTax).toBe(0);
      expect(result.breakdown.localTax).toBe(0);
      // Only gas estimate should be non-zero
      expect(result.breakdown.gasEstimate).toBe(50);
    });

    it('should handle large amounts correctly', async () => {
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.STARTER);

      const largeAmount = 1000000; // $10,000
      const result = await service.calculateDynamicFees('venue_1', largeAmount, 10);

      expect(result.breakdown.ticketPrice).toBe(largeAmount);
      expect(result.total).toBeGreaterThan(largeAmount);
      expect(result.platform).toBeGreaterThan(0);
    });

    it('should handle single ticket purchase', async () => {
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.PRO);

      const result = await service.calculateDynamicFees('venue_1', 5000, 1);

      expect(result.gasEstimate).toBe(50); // 1 ticket * 50 cents
      expect(result.breakdown.ticketPrice).toBe(5000);
    });

    it('should handle bulk ticket purchase', async () => {
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.PRO);

      const result = await service.calculateDynamicFees('venue_1', 50000, 10);

      expect(result.gasEstimate).toBe(500); // 10 tickets * 50 cents
      expect(result.breakdown.ticketPrice).toBe(50000);
    });

    it('should return complete fee breakdown structure', async () => {
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.STARTER);

      const result = await service.calculateDynamicFees('venue_1', 10000, 2);

      expect(result.breakdown).toHaveProperty('ticketPrice');
      expect(result.breakdown).toHaveProperty('platformFee');
      expect(result.breakdown).toHaveProperty('gasEstimate');
      expect(result.breakdown).toHaveProperty('stateTax');
      expect(result.breakdown).toHaveProperty('localTax');
      expect(result.breakdown).toHaveProperty('total');
    });
  });

  describe('getVenueTier (private method)', () => {
    it('should return STARTER for low volume venues', async () => {
      const result = await (service as any).getVenueTier('venue_low');
      
      // Default mock returns $5,000 monthly volume (500,000 cents)
      // This is below $10,000 threshold, so should be STARTER
      expect(result).toBe(VenueTier.STARTER);
    });

    it('should return ENTERPRISE for high volume venues', async () => {
      // Mock high volume
      jest.spyOn(service as any, 'getMonthlyVolume').mockResolvedValue(15000000); // $150,000

      const result = await (service as any).getVenueTier('venue_high');
      
      expect(result).toBe(VenueTier.ENTERPRISE);
    });

    it('should return PRO for medium volume venues', async () => {
      // Mock medium volume between $10k and $100k
      jest.spyOn(service as any, 'getMonthlyVolume').mockResolvedValue(5000000); // $50,000

      const result = await (service as any).getVenueTier('venue_mid');
      
      expect(result).toBe(VenueTier.PRO);
    });
  });

  describe('Edge Cases', () => {
    it('should handle fractional cent calculations correctly', async () => {
      jest.spyOn(service as any, 'getVenueTier').mockResolvedValue(VenueTier.STARTER);

      // Amount that would result in fractional cents
      const result = await service.calculateDynamicFees('venue_1', 10001, 1);

      // All fee amounts should be integers (cents)
      expect(Number.isInteger(result.platform)).toBe(true);
      expect(Number.isInteger(result.gasEstimate)).toBe(true);
      expect(Number.isInteger(result.tax)).toBe(true);
      expect(Number.isInteger(result.total)).toBe(true);
    });

    it('should handle tier boundary conditions', async () => {
      // Mock exactly at tier boundary
      jest.spyOn(service as any, 'getMonthlyVolume').mockResolvedValue(1000000); // Exactly $10,000

      const result = await (service as any).getVenueTier('venue_boundary');
      
      // At exactly $10,000, should still be STARTER (< threshold)
      expect(result).toBe(VenueTier.STARTER);
    });
  });
});
