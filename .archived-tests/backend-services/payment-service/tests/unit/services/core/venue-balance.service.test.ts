import { VenueBalanceService } from '../../../../src/services/core/venue-balance.service';

// Mock the models
jest.mock('../../../../src/models', () => ({
  VenueBalanceModel: {
    getBalance: jest.fn(),
    updateBalance: jest.fn()
  }
}));

// Mock config
jest.mock('../../../../src/config/fees', () => ({
  chargebackReserves: {
    low: 5,
    medium: 10,
    high: 20
  },
  payoutThresholds: {
    minimum: 10000, // $100 minimum
    maximumDaily: 5000000 // $50,000 daily max
  }
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

import { VenueBalanceModel } from '../../../../src/models';

describe('VenueBalanceService', () => {
  let service: VenueBalanceService;
  let mockGetBalance: jest.Mock;
  let mockUpdateBalance: jest.Mock;

  beforeEach(() => {
    service = new VenueBalanceService();
    jest.clearAllMocks();

    mockGetBalance = VenueBalanceModel.getBalance as jest.Mock;
    mockUpdateBalance = VenueBalanceModel.updateBalance as jest.Mock;
  });

  describe('getBalance', () => {
    it('should return venue balance', async () => {
      const mockBalance = {
        venueId: 'venue_1',
        available: 100000,
        reserved: 10000,
        pending: 5000
      };

      mockGetBalance.mockResolvedValue(mockBalance);

      const result = await service.getBalance('venue_1');

      expect(result).toEqual(mockBalance);
      expect(mockGetBalance).toHaveBeenCalledWith('venue_1');
    });

    it('should handle venue not found', async () => {
      mockGetBalance.mockResolvedValue(null);

      const result = await service.getBalance('venue_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('calculatePayoutAmount', () => {
    it('should calculate payout for low risk venue', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_1',
        available: 100000, // $1,000
        reserved: 0,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('low');

      const result = await service.calculatePayoutAmount('venue_1');

      // Low risk: 5% reserve
      const expectedReserve = 100000 * 0.05; // 5000
      const expectedPayable = 100000 - expectedReserve - 10000; // Available - reserve - minimum
      
      expect(result.available).toBe(100000);
      expect(result.reserved).toBe(expectedReserve);
      expect(result.payable).toBe(expectedPayable);
    });

    it('should calculate payout for medium risk venue', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_2',
        available: 200000, // $2,000
        reserved: 10000,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('medium');

      const result = await service.calculatePayoutAmount('venue_2');

      // Medium risk: 10% reserve
      const expectedReserve = 200000 * 0.10; // 20000
      const additionalReserve = Math.max(0, expectedReserve - 10000); // 10000
      const expectedPayable = 200000 - additionalReserve - 10000; // 180000
      
      expect(result.reserved).toBe(expectedReserve);
      expect(result.payable).toBe(expectedPayable);
    });

    it('should calculate payout for high risk venue', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_3',
        available: 300000, // $3,000
        reserved: 0,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('high');

      const result = await service.calculatePayoutAmount('venue_3');

      // High risk: 20% reserve
      const expectedReserve = 300000 * 0.20; // 60000
      const expectedPayable = 300000 - expectedReserve - 10000; // 230000
      
      expect(result.reserved).toBe(expectedReserve);
      expect(result.payable).toBe(expectedPayable);
    });

    it('should return zero payable if below minimum threshold', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_4',
        available: 15000, // $150 - below $100 minimum after reserve
        reserved: 0,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('medium');

      const result = await service.calculatePayoutAmount('venue_4');

      // Would leave less than $100 after reserve, so payable should be 0
      expect(result.payable).toBe(0);
    });

    it('should handle existing reserves correctly', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_5',
        available: 200000,
        reserved: 30000, // Already has significant reserve
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('medium');

      const result = await service.calculatePayoutAmount('venue_5');

      // Medium risk needs 10% = 20000, but already has 30000 reserved
      // So no additional reserve needed, more available for payout
      expect(result.reserved).toBe(20000); // Required reserve
      expect(result.payable).toBeGreaterThan(0);
    });

    it('should handle zero available balance', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_6',
        available: 0,
        reserved: 5000,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('low');

      const result = await service.calculatePayoutAmount('venue_6');

      expect(result.available).toBe(0);
      expect(result.payable).toBe(0);
    });

    it('should handle large balances correctly', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_7',
        available: 10000000, // $100,000
        reserved: 0,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('low');

      const result = await service.calculatePayoutAmount('venue_7');

      expect(result.available).toBe(10000000);
      expect(result.reserved).toBe(500000); // 5% of $100k
      expect(result.payable).toBeGreaterThan(0);
    });
  });

  describe('processPayout', () => {
    it('should process valid payout request', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_1',
        available: 200000,
        reserved: 10000,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('low');
      mockUpdateBalance.mockResolvedValue(true);

      // Request payout of $500 (50000 cents)
      await service.processPayout('venue_1', 50000);

      expect(mockUpdateBalance).toHaveBeenCalledWith('venue_1', -50000, 'available');
    });

    it('should throw error if insufficient funds', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_2',
        available: 50000,
        reserved: 0,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('medium');

      // Try to payout more than available after reserve
      await expect(service.processPayout('venue_2', 100000))
        .rejects
        .toThrow('Insufficient funds for payout');
    });

    it('should throw error if exceeds daily maximum', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_3',
        available: 10000000, // $100,000
        reserved: 0,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('low');

      // Try to payout more than daily max ($50,000)
      await expect(service.processPayout('venue_3', 6000000))
        .rejects
        .toThrow('Exceeds daily payout limit');
    });

    it('should allow payout at daily maximum', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_4',
        available: 10000000,
        reserved: 0,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('low');
      mockUpdateBalance.mockResolvedValue(true);

      // Payout exactly the daily max ($50,000 = 5000000 cents)
      await service.processPayout('venue_4', 5000000);

      expect(mockUpdateBalance).toHaveBeenCalledWith('venue_4', -5000000, 'available');
    });

    it('should update balance correctly', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_5',
        available: 300000,
        reserved: 10000,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('low');
      mockUpdateBalance.mockResolvedValue(true);

      await service.processPayout('venue_5', 100000);

      // Should deduct from available
      expect(mockUpdateBalance).toHaveBeenCalledWith('venue_5', -100000, 'available');
    });
  });

  describe('getVenueRiskLevel', () => {
    it('should return medium risk by default', async () => {
      const result = await (service as any).getVenueRiskLevel('venue_1');
      
      // Default implementation returns 'medium'
      expect(result).toBe('medium');
    });
  });

  describe('Edge Cases', () => {
    it('should handle fractional calculations correctly', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_1',
        available: 100001, // Odd number
        reserved: 0,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('medium');

      const result = await service.calculatePayoutAmount('venue_1');

      // All amounts should be integers
      expect(Number.isInteger(result.available)).toBe(true);
      expect(Number.isInteger(result.reserved)).toBe(true);
      expect(Number.isInteger(result.payable)).toBe(true);
    });

    it('should handle negative balance gracefully', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_negative',
        available: -10000, // Edge case: negative balance
        reserved: 0,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('low');

      const result = await service.calculatePayoutAmount('venue_negative');

      // Should not allow negative payout
      expect(result.payable).toBe(0);
    });

    it('should handle exactly minimum threshold', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_min',
        available: 20000, // Exactly at minimum after reserve
        reserved: 0,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('low');

      const result = await service.calculatePayoutAmount('venue_min');

      // 20000 - 5% (1000) - 10000 threshold = 9000 (below threshold)
      expect(result.payable).toBe(0);
    });

    it('should handle database errors during payout', async () => {
      mockGetBalance.mockResolvedValue({
        venueId: 'venue_error',
        available: 200000,
        reserved: 0,
        pending: 0
      });

      jest.spyOn(service as any, 'getVenueRiskLevel').mockResolvedValue('low');
      mockUpdateBalance.mockRejectedValue(new Error('Database error'));

      await expect(service.processPayout('venue_error', 50000))
        .rejects
        .toThrow('Database error');
    });
  });
});
