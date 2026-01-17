/**
 * Unit Tests for PricingService
 * 
 * Tests:
 * - Transfer fee calculation
 * - Transfer type multipliers
 * - Promotional discount application
 * - Fee payment recording
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import { PricingService } from '../../../src/services/pricing.service';

jest.mock('../../../src/utils/logger');

describe('PricingService', () => {
  let pricingService: PricingService;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    } as any;

    pricingService = new PricingService(mockPool);
    jest.clearAllMocks();
  });

  describe('calculateTransferFee()', () => {
    it('should calculate fees for a basic transfer', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '5.00',
          platform_fee_percentage: '2.5',
          service_fee_flat: '1.00',
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'SALE'
      });

      expect(result.baseFee).toBe(5.00);
      expect(result.serviceFee).toBe(1.00);
      expect(result.platformFee).toBe(0);
      expect(result.totalFee).toBe(6.00);
      expect(result.currency).toBe('USD');
    });

    it('should return zero fees for free transfers', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '5.00',
          platform_fee_percentage: '2.5',
          service_fee_flat: '1.00',
          is_free_transfer: true,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'GIFT'
      });

      expect(result.baseFee).toBe(0);
      expect(result.platformFee).toBe(0);
      expect(result.serviceFee).toBe(0);
      expect(result.totalFee).toBe(0);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].description).toBe('Transfer Fee (Promotional)');
    });

    it('should calculate platform fee for SALE transfers', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '5.00',
          platform_fee_percentage: '2.5',
          service_fee_flat: '1.00',
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'SALE',
        salePrice: 100
      });

      expect(result.platformFee).toBe(2.5); // 2.5% of 100
      expect(result.totalFee).toBe(8.5); // 5 + 2.5 + 1
    });

    it('should apply GIFT multiplier (0.5)', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '10.00',
          platform_fee_percentage: '0',
          service_fee_flat: '0',
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'GIFT'
      });

      expect(result.baseFee).toBe(5.00); // 10 * 0.5
    });

    it('should apply SALE multiplier (1.0)', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '10.00',
          platform_fee_percentage: '0',
          service_fee_flat: '0',
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'SALE'
      });

      expect(result.baseFee).toBe(10.00); // 10 * 1.0
    });

    it('should apply TRADE multiplier (0.75)', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '10.00',
          platform_fee_percentage: '0',
          service_fee_flat: '0',
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'TRADE'
      });

      expect(result.baseFee).toBe(7.50); // 10 * 0.75
    });

    it('should default to USD currency if not specified', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '5.00',
          platform_fee_percentage: '0',
          service_fee_flat: '0',
          is_free_transfer: false,
          currency: null
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'GIFT'
      });

      expect(result.currency).toBe('USD');
    });

    it('should throw error when ticket type not found', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: []
      } as any);

      await expect(
        pricingService.calculateTransferFee({
          ticketId: 'ticket-1',
          ticketTypeId: 'invalid',
          fromUserId: 'user-1',
          transferType: 'GIFT'
        })
      ).rejects.toThrow('Ticket type not found');
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        pricingService.calculateTransferFee({
          ticketId: 'ticket-1',
          ticketTypeId: 'type-1',
          fromUserId: 'user-1',
          transferType: 'GIFT'
        })
      ).rejects.toThrow('Database error');
    });

    it('should include breakdown of all fees', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '5.00',
          platform_fee_percentage: '2.5',
          service_fee_flat: '1.00',
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'SALE',
        salePrice: 100
      });

      expect(result.breakdown).toHaveLength(3);
      expect(result.breakdown[0]).toEqual({ description: 'Base Transfer Fee', amount: 5.00 });
      expect(result.breakdown[1]).toEqual({ description: 'Platform Fee', amount: 2.5 });
      expect(result.breakdown[2]).toEqual({ description: 'Service Fee', amount: 1.00 });
    });

    it('should exclude zero fees from breakdown', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '5.00',
          platform_fee_percentage: '0',
          service_fee_flat: '0',
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'GIFT'
      });

      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].description).toBe('Base Transfer Fee');
    });

    it('should handle null fee values as zero', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: null,
          platform_fee_percentage: null,
          service_fee_flat: null,
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'SALE'
      });

      expect(result.baseFee).toBe(0);
      expect(result.platformFee).toBe(0);
      expect(result.serviceFee).toBe(0);
      expect(result.totalFee).toBe(0);
    });

    it('should handle large sale prices', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '5.00',
          platform_fee_percentage: '2.5',
          service_fee_flat: '1.00',
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'SALE',
        salePrice: 10000
      });

      expect(result.platformFee).toBe(250); // 2.5% of 10000
      expect(result.totalFee).toBe(256); // 5 + 250 + 1
    });
  });

  describe('applyPromotionalDiscount()', () => {
    const baseFee = {
      baseFee: 5.00,
      platformFee: 2.50,
      serviceFee: 1.00,
      totalFee: 8.50,
      currency: 'USD',
      breakdown: [
        { description: 'Base Transfer Fee', amount: 5.00 },
        { description: 'Platform Fee', amount: 2.50 },
        { description: 'Service Fee', amount: 1.00 }
      ]
    };

    it('should return original fee when no promo code provided', async () => {
      const result = await pricingService.applyPromotionalDiscount(baseFee);

      expect(result).toEqual(baseFee);
    });

    it('should apply percentage discount', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          discount_percentage: '10',
          discount_flat: null,
          is_active: true,
          expires_at: null
        }]
      } as any);

      const result = await pricingService.applyPromotionalDiscount(baseFee, 'SAVE10');

      expect(result.totalFee).toBe(7.65); // 8.50 - (8.50 * 0.10)
      expect(result.breakdown).toHaveLength(4);
      expect(result.breakdown[3]).toEqual({
        description: 'Promo Code (SAVE10)',
        amount: -0.85
      });
    });

    it('should apply flat discount', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          discount_percentage: null,
          discount_flat: '2.00',
          is_active: true,
          expires_at: null
        }]
      } as any);

      const result = await pricingService.applyPromotionalDiscount(baseFee, 'FLAT2');

      expect(result.totalFee).toBe(6.50); // 8.50 - 2.00
      expect(result.breakdown[3].amount).toBe(-2.00);
    });

    it('should not reduce fee below zero', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          discount_percentage: null,
          discount_flat: '20.00',
          is_active: true,
          expires_at: null
        }]
      } as any);

      const result = await pricingService.applyPromotionalDiscount(baseFee, 'BIGDISCOUNT');

      expect(result.totalFee).toBe(0);
    });

    it('should return original fee for invalid promo code', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: []
      } as any);

      const result = await pricingService.applyPromotionalDiscount(baseFee, 'INVALID');

      expect(result.totalFee).toBe(8.50);
      expect(result.breakdown).toHaveLength(3);
    });

    it('should return original fee for expired promo code', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: []
      } as any);

      const result = await pricingService.applyPromotionalDiscount(baseFee, 'EXPIRED');

      expect(result.totalFee).toBe(8.50);
    });

    it('should return original fee for inactive promo code', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: []
      } as any);

      const result = await pricingService.applyPromotionalDiscount(baseFee, 'INACTIVE');

      expect(result.totalFee).toBe(8.50);
    });

    it('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const result = await pricingService.applyPromotionalDiscount(baseFee, 'PROMO');

      expect(result).toEqual(baseFee);
    });

    it('should prioritize percentage over flat discount', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          discount_percentage: '20',
          discount_flat: '1.00',
          is_active: true,
          expires_at: null
        }]
      } as any);

      const result = await pricingService.applyPromotionalDiscount(baseFee, 'BOTH');

      expect(result.totalFee).toBe(6.80); // 8.50 - (8.50 * 0.20), flat ignored
    });
  });

  describe('recordFeePayment()', () => {
    const fee = {
      baseFee: 5.00,
      platformFee: 2.50,
      serviceFee: 1.00,
      totalFee: 8.50,
      currency: 'USD',
      breakdown: []
    };

    it('should record fee payment to database', async () => {
      mockPool.query.mockResolvedValueOnce({} as any);

      await pricingService.recordFeePayment('transfer-123', fee, 'credit_card');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transfer_fees'),
        [
          'transfer-123',
          5.00,
          2.50,
          1.00,
          8.50,
          'USD',
          'credit_card'
        ]
      );
    });

    it('should include all fee components', async () => {
      mockPool.query.mockResolvedValueOnce({} as any);

      await pricingService.recordFeePayment('transfer-123', fee, 'paypal');

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('base_fee');
      expect(query).toContain('platform_fee');
      expect(query).toContain('service_fee');
      expect(query).toContain('total_fee');
      expect(query).toContain('currency');
      expect(query).toContain('payment_method');
      expect(query).toContain('paid_at');
    });

    it('should throw error on database failure', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        pricingService.recordFeePayment('transfer-123', fee, 'credit_card')
      ).rejects.toThrow('Database error');
    });

    it('should handle different payment methods', async () => {
      const paymentMethods = ['credit_card', 'debit_card', 'paypal', 'crypto', 'bank_transfer'];

      for (const method of paymentMethods) {
        mockPool.query.mockResolvedValueOnce({} as any);
        await pricingService.recordFeePayment('transfer-123', fee, method);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([method])
        );
      }
    });

    it('should handle zero fees', async () => {
      const zeroFee = {
        baseFee: 0,
        platformFee: 0,
        serviceFee: 0,
        totalFee: 0,
        currency: 'USD',
        breakdown: []
      };

      mockPool.query.mockResolvedValueOnce({} as any);

      await pricingService.recordFeePayment('transfer-123', zeroFee, 'free');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([0, 0, 0, 0])
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle decimal precision in calculations', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '1.99',
          platform_fee_percentage: '2.5',
          service_fee_flat: '0.50',
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'SALE',
        salePrice: 99.99
      });

      expect(result.platformFee).toBeCloseTo(2.50, 2);
      expect(result.totalFee).toBeCloseTo(4.49, 2);
    });

    it('should handle very small fees', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '0.01',
          platform_fee_percentage: '0.1',
          service_fee_flat: '0.01',
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'SALE',
        salePrice: 10
      });

      expect(result.totalFee).toBeGreaterThan(0);
    });

    it('should handle missing optional fields', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_transfer_fee: '5.00',
          platform_fee_percentage: '2.5',
          service_fee_flat: '1.00',
          is_free_transfer: false,
          currency: 'USD'
        }]
      } as any);

      const result = await pricingService.calculateTransferFee({
        ticketId: 'ticket-1',
        ticketTypeId: 'type-1',
        fromUserId: 'user-1',
        transferType: 'GIFT'
        // toUserId and salePrice are optional
      });

      expect(result.totalFee).toBeGreaterThan(0);
    });
  });
});
