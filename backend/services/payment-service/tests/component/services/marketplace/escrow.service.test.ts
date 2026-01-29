/**
 * COMPONENT TEST: EscrowService
 *
 * Tests escrow management for marketplace resales
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  query: mockQuery,
  getClient: jest.fn().mockResolvedValue({
    client: { query: mockClientQuery },
    release: mockClientRelease,
  }),
}));

// Mock Stripe
const mockStripePaymentIntentsCreate = jest.fn();
const mockStripePaymentIntentsConfirm = jest.fn();
const mockStripePaymentIntentsCapture = jest.fn();
const mockStripePaymentIntentsCancel = jest.fn();
const mockStripeRefundsCreate = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: mockStripePaymentIntentsCreate,
      confirm: mockStripePaymentIntentsConfirm,
      capture: mockStripePaymentIntentsCapture,
      cancel: mockStripePaymentIntentsCancel,
    },
    refunds: {
      create: mockStripeRefundsCreate,
    },
  }));
});

jest.mock('../../../../src/config', () => ({
  config: { stripe: { secretKey: 'sk_test_fake' } },
}));

jest.mock('../../../../src/models', () => ({
  TransactionModel: { create: jest.fn().mockResolvedValue({ id: 'tx_123' }) },
  VenueBalanceModel: { updateBalance: jest.fn().mockResolvedValue({}) },
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), child: () => ({ info: jest.fn(), error: jest.fn() }) },
}));

import { EscrowService } from '../../../../src/services/marketplace/escrow.service';
import { EscrowStatus } from '../../../../src/types';

describe('EscrowService Component Tests', () => {
  let service: EscrowService;
  let listingId: string;
  let buyerId: string;
  let sellerId: string;
  let escrowId: string;
  let tenantId: string;

  beforeEach(() => {
    listingId = uuidv4();
    buyerId = uuidv4();
    sellerId = uuidv4();
    escrowId = uuidv4();
    tenantId = uuidv4();

    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockStripePaymentIntentsCreate.mockReset();
    mockStripePaymentIntentsConfirm.mockReset();
    mockStripePaymentIntentsCapture.mockReset();
    mockStripeRefundsCreate.mockReset();

    mockStripePaymentIntentsCreate.mockResolvedValue({ id: 'pi_test_123' });
    mockStripePaymentIntentsConfirm.mockResolvedValue({ status: 'requires_capture' });
    mockStripePaymentIntentsCapture.mockResolvedValue({ status: 'succeeded' });

    service = new EscrowService();
  });

  // ===========================================================================
  // CREATE ESCROW
  // ===========================================================================
  describe('createEscrow()', () => {
    beforeEach(() => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: escrowId,
            tenant_id: tenantId,
            listing_id: listingId,
            buyer_id: buyerId,
            seller_id: sellerId,
            amount: 10000,
            seller_payout: 8500,
            venue_royalty: 1000,
            platform_fee: 500,
            stripe_payment_intent_id: 'pi_test_123',
            status: 'created',
            created_at: new Date(),
            released_at: null,
            updated_at: new Date(),
          }]
        }) // INSERT escrow
        .mockResolvedValueOnce({ rows: [] }) // INSERT condition 1
        .mockResolvedValueOnce({ rows: [] }) // INSERT condition 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
    });

    it('should create escrow with Stripe payment intent', async () => {
      const listing = {
        id: listingId,
        ticketId: uuidv4(),
        sellerId,
        price: 10000,
        venueRoyaltyPercentage: 10,
      };

      const result = await service.createEscrow(listing as any, buyerId, 'pm_test');

      expect(mockStripePaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 10000,
          currency: 'usd',
          capture_method: 'manual',
        })
      );
      expect(result.id).toBe(escrowId);
    });

    it('should calculate payment splits correctly', async () => {
      const listing = {
        id: listingId,
        ticketId: uuidv4(),
        sellerId,
        price: 10000,
        venueRoyaltyPercentage: 10,
      };

      await service.createEscrow(listing as any, buyerId, 'pm_test');

      const insertCall = mockClientQuery.mock.calls.find(
        c => c[0].includes && c[0].includes('INSERT INTO payment_escrows')
      );
      expect(insertCall).toBeDefined();
      const values = insertCall[1];
      expect(values[3]).toBe(10000); // amount
      expect(values[4]).toBe(8500);  // seller_payout (100 - 10% - 5%)
      expect(values[5]).toBe(1000);  // venue_royalty (10%)
      expect(values[6]).toBe(500);   // platform_fee (5%)
    });

    it('should set release conditions', async () => {
      const listing = {
        id: listingId,
        ticketId: uuidv4(),
        sellerId,
        price: 10000,
        venueRoyaltyPercentage: 10,
      };

      await service.createEscrow(listing as any, buyerId, 'pm_test');

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO escrow_release_conditions'),
        expect.arrayContaining(['nft_transferred'])
      );
    });

    it('should rollback on error', async () => {
      mockClientQuery.mockReset();
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const listing = {
        id: listingId,
        ticketId: uuidv4(),
        sellerId,
        price: 10000,
        venueRoyaltyPercentage: 10,
      };

      await expect(service.createEscrow(listing as any, buyerId, 'pm_test'))
        .rejects.toThrow('DB error');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  // ===========================================================================
  // FUND ESCROW
  // ===========================================================================
  describe('fundEscrow()', () => {
    it('should confirm payment and update status', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: escrowId,
            tenant_id: tenantId,
            listing_id: listingId,
            buyer_id: buyerId,
            seller_id: sellerId,
            amount: 10000,
            seller_payout: 8500,
            venue_royalty: 1000,
            platform_fee: 500,
            stripe_payment_intent_id: 'pi_test',
            status: 'created',
            created_at: new Date(),
            released_at: null,
            updated_at: new Date(),
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE status
        .mockResolvedValueOnce({
          rows: [{
            id: escrowId,
            tenant_id: tenantId,
            listing_id: listingId,
            buyer_id: buyerId,
            seller_id: sellerId,
            amount: 10000,
            seller_payout: 8500,
            venue_royalty: 1000,
            platform_fee: 500,
            stripe_payment_intent_id: 'pi_test',
            status: 'funded',
            created_at: new Date(),
            released_at: null,
            updated_at: new Date(),
          }]
        });

      const result = await service.fundEscrow(escrowId);

      expect(mockStripePaymentIntentsConfirm).toHaveBeenCalledWith('pi_test');
      expect(result.status).toBe('funded');
    });

    it('should reject if already funded', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: escrowId,
          status: 'funded',
          stripe_payment_intent_id: 'pi_test',
        }]
      });

      await expect(service.fundEscrow(escrowId))
        .rejects.toThrow('Escrow already funded or cancelled');
    });
  });

  // ===========================================================================
  // RELEASE ESCROW
  // ===========================================================================
  describe('releaseEscrow()', () => {
    beforeEach(() => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE status
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
    });

    it('should capture payment and distribute funds', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: escrowId,
            tenant_id: tenantId,
            listing_id: listingId,
            buyer_id: buyerId,
            seller_id: sellerId,
            amount: 10000,
            seller_payout: 8500,
            venue_royalty: 1000,
            platform_fee: 500,
            stripe_payment_intent_id: 'pi_test',
            status: 'funded',
            created_at: new Date(),
            released_at: null,
            updated_at: new Date(),
          }]
        })
        .mockResolvedValueOnce({ rows: [{ satisfied: true }] }) // conditions check
        .mockResolvedValueOnce({ rows: [{ venue_id: 'v1', tenant_id: tenantId }] }) // getListing
        .mockResolvedValueOnce({ rows: [] }); // UPDATE status

      await service.releaseEscrow(escrowId);

      expect(mockStripePaymentIntentsCapture).toHaveBeenCalledWith('pi_test');
    });

    it('should reject if not funded', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: escrowId,
          status: 'created',
          stripe_payment_intent_id: 'pi_test',
        }]
      });

      await expect(service.releaseEscrow(escrowId))
        .rejects.toThrow('Escrow not in funded state');
    });

    it('should reject if conditions not met', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: escrowId,
            tenant_id: tenantId,
            listing_id: listingId,
            buyer_id: buyerId,
            seller_id: sellerId,
            amount: 10000,
            seller_payout: 8500,
            venue_royalty: 1000,
            platform_fee: 500,
            stripe_payment_intent_id: 'pi_test',
            status: 'funded',
            created_at: new Date(),
            released_at: null,
            updated_at: new Date(),
          }]
        })
        .mockResolvedValueOnce({ rows: [{ satisfied: false }] }); // conditions NOT met

      await expect(service.releaseEscrow(escrowId))
        .rejects.toThrow('Release conditions not met');
    });
  });

  // ===========================================================================
  // REFUND ESCROW
  // ===========================================================================
  describe('refundEscrow()', () => {
    it('should refund funded escrow', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: escrowId,
            status: 'funded',
            stripe_payment_intent_id: 'pi_test',
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE status

      await service.refundEscrow(escrowId, 'buyer_request');

      expect(mockStripeRefundsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: 'pi_test' })
      );
    });

    it('should cancel unfunded escrow', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: escrowId,
            status: 'created',
            stripe_payment_intent_id: 'pi_test',
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      await service.refundEscrow(escrowId, 'buyer_cancelled');

      expect(mockStripePaymentIntentsCancel).toHaveBeenCalledWith('pi_test');
    });

    it('should reject if already released', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: escrowId, status: 'released' }]
      });

      await expect(service.refundEscrow(escrowId, 'test'))
        .rejects.toThrow('Escrow already released');
    });

    it('should reject if already refunded', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: escrowId, status: 'refunded' }]
      });

      await expect(service.refundEscrow(escrowId, 'test'))
        .rejects.toThrow('Escrow already refunded');
    });
  });
});
