/**
 * COMPONENT TEST: FeeCalculatorService
 *
 * Tests FeeCalculatorService - pure calculation logic with mocked HTTP calls
 */

import axios from 'axios';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.VENUE_SERVICE_URL = 'http://venue-service:3002';
process.env.LOG_LEVEL = 'silent';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { FeeCalculatorService } from '../../../src/services/fee-calculator.service';

describe('FeeCalculatorService Component Tests', () => {
  let service: FeeCalculatorService;

  beforeEach(() => {
    service = new FeeCalculatorService();
    jest.clearAllMocks();
  });

  // ===========================================================================
  // CALCULATE FEES - DEFAULT TIER
  // ===========================================================================
  describe('calculateFees() with default tier', () => {
    it('should calculate fees correctly for single ticket', async () => {
      const result = await service.calculateFees(100, 1);

      // Default: 10% service fee, $2 per ticket, 2.9% processing
      // Service fee: $10
      // Per ticket: $2
      // Processing: (100 + 10 + 2) * 0.029 = $3.25
      // Total fees: $15.25
      // Total: $115.25

      expect(result.subtotal).toBe(100);
      expect(result.serviceFeePercentage).toBe(10);
      expect(result.serviceFee).toBe(10);
      expect(result.perTicketFee).toBe(2);
      expect(result.processingFee).toBeCloseTo(3.25, 2);
      expect(result.totalFees).toBeCloseTo(15.25, 2);
      expect(result.total).toBeCloseTo(115.25, 2);
      expect(result.venuePayout).toBe(100);
      expect(result.platformRevenue).toBeCloseTo(13.25, 2); // service + processing
    });

    it('should calculate fees correctly for multiple tickets', async () => {
      const result = await service.calculateFees(200, 4);

      // Service fee: $20
      // Per ticket: $8 (4 * $2)
      // Processing: (200 + 20 + 8) * 0.029 = $6.61
      expect(result.serviceFee).toBe(20);
      expect(result.perTicketFee).toBe(8);
      expect(result.processingFee).toBeCloseTo(6.61, 2);
    });

    it('should handle zero subtotal', async () => {
      const result = await service.calculateFees(0, 1);

      expect(result.subtotal).toBe(0);
      expect(result.serviceFee).toBe(0);
      expect(result.perTicketFee).toBe(2);
      expect(result.total).toBeCloseTo(2.06, 2); // Just per ticket + processing on it
    });

    it('should handle large amounts', async () => {
      const result = await service.calculateFees(10000, 100);

      // Service fee: $1000
      // Per ticket: $200
      // Processing: (10000 + 1000 + 200) * 0.029 = $324.80
      expect(result.serviceFee).toBe(1000);
      expect(result.perTicketFee).toBe(200);
      expect(result.processingFee).toBeCloseTo(324.8, 2);
      expect(result.total).toBeCloseTo(11524.8, 2);
    });

    it('should round to 2 decimal places', async () => {
      const result = await service.calculateFees(33.33, 3);

      // All values should be rounded to 2 decimal places
      expect(Number.isInteger(result.serviceFee * 100)).toBe(true);
      expect(Number.isInteger(result.processingFee * 100)).toBe(true);
      expect(Number.isInteger(result.totalFees * 100)).toBe(true);
      expect(Number.isInteger(result.total * 100)).toBe(true);
    });
  });

  // ===========================================================================
  // CALCULATE FEES - CUSTOM VENUE TIER
  // ===========================================================================
  describe('calculateFees() with venue tier', () => {
    const venueId = 'venue-123';

    it('should use venue pricing tier when available', async () => {
      // Mock venue service responses
      mockedAxios.get
        .mockResolvedValueOnce({
          data: { venue: { pricing_tier: 'premium' } }
        })
        .mockResolvedValueOnce({
          data: {
            tiers: [
              { tier_name: 'premium', service_fee_percentage: '5.00', per_ticket_fee: '1.00' },
              { tier_name: 'standard', service_fee_percentage: '10.00', per_ticket_fee: '2.00' },
            ]
          }
        });

      const result = await service.calculateFees(100, 1, venueId);

      // Premium tier: 5% service fee, $1 per ticket
      expect(result.serviceFeePercentage).toBe(5);
      expect(result.serviceFee).toBe(5);
      expect(result.perTicketFee).toBe(1);
    });

    it('should fall back to default tier on venue service error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Service unavailable'));

      const result = await service.calculateFees(100, 1, venueId);

      // Should use default tier
      expect(result.serviceFeePercentage).toBe(10);
      expect(result.serviceFee).toBe(10);
      expect(result.perTicketFee).toBe(2);
    });

    it('should fall back to default tier when venue not found', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { venue: null }
      });

      const result = await service.calculateFees(100, 1, venueId);

      expect(result.serviceFeePercentage).toBe(10);
    });

    it('should fall back to default tier when pricing tier not in list', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: { venue: { pricing_tier: 'nonexistent' } }
        })
        .mockResolvedValueOnce({
          data: {
            tiers: [
              { tier_name: 'standard', service_fee_percentage: '10.00', per_ticket_fee: '2.00' },
            ]
          }
        });

      const result = await service.calculateFees(100, 1, venueId);

      expect(result.serviceFeePercentage).toBe(10);
    });
  });

  // ===========================================================================
  // GET FEE BREAKDOWN
  // ===========================================================================
  describe('getFeeBreakdown()', () => {
    it('should return formatted fee breakdown', async () => {
      const result = await service.getFeeBreakdown(100, 2);

      expect(result.subtotal).toBe('$100.00');
      expect(result.fees.serviceFee.label).toContain('10%');
      expect(result.fees.serviceFee.amount).toBe('$10.00');
      expect(result.fees.perTicketFee.label).toContain('2 ×');
      expect(result.fees.perTicketFee.amount).toBe('$4.00');
      expect(result.fees.processingFee.label).toBe('Processing Fee');
      expect(result.totalFees).toMatch(/^\$\d+\.\d{2}$/);
      expect(result.total).toMatch(/^\$\d+\.\d{2}$/);
    });

    it('should show correct per-ticket calculation in label', async () => {
      const result = await service.getFeeBreakdown(100, 5);

      expect(result.fees.perTicketFee.label).toContain('5 ×');
      expect(result.fees.perTicketFee.label).toContain('$2.00');
      expect(result.fees.perTicketFee.amount).toBe('$10.00');
    });
  });

  // ===========================================================================
  // CURRENCY CONVERSION UTILITIES
  // ===========================================================================
  describe('toCents()', () => {
    it('should convert dollars to cents', () => {
      expect(service.toCents(1)).toBe(100);
      expect(service.toCents(10.50)).toBe(1050);
      expect(service.toCents(0.01)).toBe(1);
      expect(service.toCents(99.99)).toBe(9999);
    });

    it('should handle rounding correctly', () => {
      // JavaScript floating point: 19.99 * 100 = 1998.9999999999998
      expect(service.toCents(19.99)).toBe(1999);
      expect(service.toCents(0.015)).toBe(2); // Rounds to nearest
    });

    it('should handle zero', () => {
      expect(service.toCents(0)).toBe(0);
    });
  });

  describe('toDollars()', () => {
    it('should convert cents to dollars', () => {
      expect(service.toDollars(100)).toBe(1);
      expect(service.toDollars(1050)).toBe(10.50);
      expect(service.toDollars(1)).toBe(0.01);
      expect(service.toDollars(9999)).toBe(99.99);
    });

    it('should handle zero', () => {
      expect(service.toDollars(0)).toBe(0);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle fractional ticket prices', async () => {
      const result = await service.calculateFees(49.99, 1);

      expect(result.subtotal).toBe(49.99);
      expect(typeof result.serviceFee).toBe('number');
      expect(typeof result.total).toBe('number');
    });

    it('should handle very small amounts', async () => {
      const result = await service.calculateFees(0.01, 1);

      expect(result.subtotal).toBe(0.01);
      expect(result.serviceFee).toBe(0); // 10% of $0.01 rounds to $0.00
      expect(result.perTicketFee).toBe(2);
    });

    it('should handle many tickets', async () => {
      const result = await service.calculateFees(5000, 500);

      expect(result.perTicketFee).toBe(1000); // 500 * $2
      expect(result.total).toBeGreaterThan(6000);
    });

    it('should maintain mathematical consistency', async () => {
      const result = await service.calculateFees(100, 2);

      // Total should equal subtotal + all fees
      const calculatedTotal = result.subtotal + result.serviceFee + result.perTicketFee + result.processingFee;
      expect(Math.abs(result.total - calculatedTotal)).toBeLessThan(0.02); // Allow for rounding

      // Platform revenue should be service fee + processing fee
      const calculatedRevenue = result.serviceFee + result.processingFee;
      expect(Math.abs(result.platformRevenue - calculatedRevenue)).toBeLessThan(0.02);
    });
  });

  // ===========================================================================
  // VENUE TIERS
  // ===========================================================================
  describe('venue pricing tiers', () => {
    it('should handle enterprise tier with lower fees', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: { venue: { pricing_tier: 'enterprise' } }
        })
        .mockResolvedValueOnce({
          data: {
            tiers: [
              { tier_name: 'enterprise', service_fee_percentage: '3.00', per_ticket_fee: '0.50' },
            ]
          }
        });

      const result = await service.calculateFees(100, 1, 'venue-enterprise');

      expect(result.serviceFeePercentage).toBe(3);
      expect(result.serviceFee).toBe(3);
      expect(result.perTicketFee).toBe(0.5);
    });

    it('should handle basic tier with higher fees', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: { venue: { pricing_tier: 'basic' } }
        })
        .mockResolvedValueOnce({
          data: {
            tiers: [
              { tier_name: 'basic', service_fee_percentage: '15.00', per_ticket_fee: '3.00' },
            ]
          }
        });

      const result = await service.calculateFees(100, 1, 'venue-basic');

      expect(result.serviceFeePercentage).toBe(15);
      expect(result.serviceFee).toBe(15);
      expect(result.perTicketFee).toBe(3);
    });
  });
});
