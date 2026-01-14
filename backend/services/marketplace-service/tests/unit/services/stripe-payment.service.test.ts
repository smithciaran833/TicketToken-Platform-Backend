/**
 * Unit Tests for Stripe Payment Service
 * Tests Stripe payment processing for marketplace transactions
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    })),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock database
const mockDbChain = {
  where: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  first: jest.fn()
};

jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => mockDbChain)
}));

// Mock config/constants
jest.mock('../../../src/config', () => ({
  constants: {
    FEES: {
      PLATFORM_FEE_PERCENTAGE: 0.025,
      DEFAULT_VENUE_FEE_PERCENTAGE: 0.05
    }
  }
}));

// Mock Stripe
const mockStripe = {
  paymentIntents: {
    create: jest.fn(),
    retrieve: jest.fn(),
    cancel: jest.fn()
  },
  refunds: {
    create: jest.fn()
  },
  transfers: {
    create: jest.fn()
  },
  webhooks: {
    constructEvent: jest.fn()
  }
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripe);
});

// Set env before import
process.env.STRIPE_SECRET_KEY = 'sk_test_123';

import { StripePaymentService, stripePaymentService } from '../../../src/services/stripe-payment.service';

describe('StripePaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize Stripe client', () => {
      const service = new StripePaymentService();
      expect(service).toBeDefined();
    });

    it('should throw if STRIPE_SECRET_KEY not configured', () => {
      const originalKey = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_SECRET_KEY;
      
      expect(() => new StripePaymentService()).toThrow('STRIPE_SECRET_KEY not configured');
      
      process.env.STRIPE_SECRET_KEY = originalKey;
    });
  });

  describe('createPaymentIntent', () => {
    const createParams = {
      listingId: 'listing-123',
      sellerId: 'seller-456',
      sellerStripeAccountId: 'acct_seller123',
      buyerId: 'buyer-789',
      amountCents: 10000  // $100.00
    };

    it('should create PaymentIntent with destination charges', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        client_secret: 'pi_123_secret',
        status: 'requires_payment_method'
      });

      const result = await stripePaymentService.createPaymentIntent(createParams);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 10000,
          currency: 'usd',
          transfer_data: {
            destination: 'acct_seller123'
          },
          automatic_payment_methods: { enabled: true }
        })
      );
      expect(result.paymentIntentId).toBe('pi_123');
      expect(result.clientSecret).toBe('pi_123_secret');
    });

    it('should calculate platform fee correctly', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        client_secret: 'pi_123_secret',
        status: 'requires_payment_method'
      });

      const result = await stripePaymentService.createPaymentIntent(createParams);

      // 2.5% platform + 5% venue = 7.5% total = 750 cents
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          application_fee_amount: 750
        })
      );
      expect(result.applicationFeeAmountCents).toBe(750);
    });

    it('should calculate seller receives correctly', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        client_secret: 'pi_123_secret',
        status: 'requires_payment_method'
      });

      const result = await stripePaymentService.createPaymentIntent(createParams);

      // $100 - $7.50 fees = $92.50 = 9250 cents
      expect(result.sellerReceivesCents).toBe(9250);
    });

    it('should include metadata', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        client_secret: 'pi_123_secret',
        status: 'requires_payment_method'
      });

      await stripePaymentService.createPaymentIntent(createParams);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            listing_id: 'listing-123',
            seller_id: 'seller-456',
            buyer_id: 'buyer-789'
          })
        })
      );
    });

    it('should throw on Stripe error', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(new Error('Card declined'));

      await expect(stripePaymentService.createPaymentIntent(createParams))
        .rejects.toThrow('Payment failed: Card declined');
    });
  });

  describe('createPaymentIntentWithSeparateCharges', () => {
    const separateParams = {
      listingId: 'listing-123',
      sellerId: 'seller-456',
      sellerStripeAccountId: 'acct_seller123',
      buyerId: 'buyer-789',
      venueId: 'venue-111',
      venueStripeAccountId: 'acct_venue123',
      amountCents: 10000,
      platformFeeCents: 250,
      venueFeeCents: 500,
      sellerReceivesCents: 9250
    };

    it('should create PaymentIntent without transfer_data', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_456',
        client_secret: 'pi_456_secret',
        status: 'requires_payment_method'
      });

      const result = await stripePaymentService.createPaymentIntentWithSeparateCharges(separateParams);

      // Should NOT have transfer_data or application_fee_amount
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          transfer_data: expect.anything(),
          application_fee_amount: expect.anything()
        })
      );
      expect(result.paymentIntentId).toBe('pi_456');
    });

    it('should store split amounts in metadata', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_456',
        client_secret: 'pi_456_secret',
        status: 'requires_payment_method'
      });

      await stripePaymentService.createPaymentIntentWithSeparateCharges(separateParams);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            seller_amount_cents: '9250',
            venue_amount_cents: '500',
            platform_fee_cents: '250',
            seller_stripe_account_id: 'acct_seller123',
            venue_stripe_account_id: 'acct_venue123'
          })
        })
      );
    });

    it('should handle venue without Stripe Connect', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_456',
        client_secret: 'pi_456_secret',
        status: 'requires_payment_method'
      });

      await stripePaymentService.createPaymentIntentWithSeparateCharges({
        ...separateParams,
        venueStripeAccountId: null
      });

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            venue_stripe_account_id: ''
          })
        })
      );
    });
  });

  describe('createTransferToSeller', () => {
    it('should create transfer with source_transaction', async () => {
      mockStripe.transfers.create.mockResolvedValue({
        id: 'tr_seller123',
        object: 'transfer'
      });

      const result = await stripePaymentService.createTransferToSeller(
        'ch_charge123',
        'acct_seller123',
        9250,
        { listingId: 'listing-123', sellerId: 'seller-456', buyerId: 'buyer-789' }
      );

      expect(mockStripe.transfers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 9250,
          currency: 'usd',
          destination: 'acct_seller123',
          source_transaction: 'ch_charge123',
          transfer_group: 'ch_charge123'
        })
      );
      expect(result.transferId).toBe('tr_seller123');
    });

    it('should include metadata', async () => {
      mockStripe.transfers.create.mockResolvedValue({
        id: 'tr_seller123',
        object: 'transfer'
      });

      await stripePaymentService.createTransferToSeller(
        'ch_charge123',
        'acct_seller123',
        9250,
        { listingId: 'listing-123', sellerId: 'seller-456', buyerId: 'buyer-789' }
      );

      expect(mockStripe.transfers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            transfer_type: 'seller_payout',
            listing_id: 'listing-123'
          })
        })
      );
    });
  });

  describe('createTransferToVenue', () => {
    it('should create transfer to venue', async () => {
      mockStripe.transfers.create.mockResolvedValue({
        id: 'tr_venue123',
        object: 'transfer'
      });

      const result = await stripePaymentService.createTransferToVenue(
        'ch_charge123',
        'acct_venue123',
        500,
        { listingId: 'listing-123', venueId: 'venue-111' }
      );

      expect(mockStripe.transfers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          destination: 'acct_venue123',
          source_transaction: 'ch_charge123'
        })
      );
      expect(result?.transferId).toBe('tr_venue123');
    });

    it('should skip if venue has no Stripe account', async () => {
      const result = await stripePaymentService.createTransferToVenue(
        'ch_charge123',
        null,
        500,
        { listingId: 'listing-123', venueId: 'venue-111' }
      );

      expect(mockStripe.transfers.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should skip if amount is zero', async () => {
      const result = await stripePaymentService.createTransferToVenue(
        'ch_charge123',
        'acct_venue123',
        0,
        { listingId: 'listing-123', venueId: 'venue-111' }
      );

      expect(mockStripe.transfers.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should not throw on venue transfer failure', async () => {
      mockStripe.transfers.create.mockRejectedValue(new Error('Transfer failed'));

      const result = await stripePaymentService.createTransferToVenue(
        'ch_charge123',
        'acct_venue123',
        500,
        { listingId: 'listing-123', venueId: 'venue-111' }
      );

      expect(result).toBeNull();
    });
  });

  describe('getPaymentIntent', () => {
    it('should retrieve PaymentIntent', async () => {
      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_123',
        status: 'succeeded'
      });

      const result = await stripePaymentService.getPaymentIntent('pi_123');

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_123');
      expect(result.id).toBe('pi_123');
    });

    it('should throw on not found', async () => {
      mockStripe.paymentIntents.retrieve.mockRejectedValue(new Error('Not found'));

      await expect(stripePaymentService.getPaymentIntent('pi_invalid'))
        .rejects.toThrow('Failed to retrieve payment');
    });
  });

  describe('cancelPaymentIntent', () => {
    it('should cancel PaymentIntent', async () => {
      mockStripe.paymentIntents.cancel.mockResolvedValue({
        id: 'pi_123',
        status: 'canceled'
      });

      await stripePaymentService.cancelPaymentIntent('pi_123');

      expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_123');
    });

    it('should throw on cancel error', async () => {
      mockStripe.paymentIntents.cancel.mockRejectedValue(new Error('Already captured'));

      await expect(stripePaymentService.cancelPaymentIntent('pi_123'))
        .rejects.toThrow('Failed to cancel payment');
    });
  });

  describe('createRefund', () => {
    it('should create full refund', async () => {
      mockStripe.refunds.create.mockResolvedValue({
        id: 're_123',
        amount: 10000
      });

      const result = await stripePaymentService.createRefund('pi_123');

      expect(mockStripe.refunds.create).toHaveBeenCalledWith({
        payment_intent: 'pi_123',
        reason: undefined
      });
      expect(result.id).toBe('re_123');
    });

    it('should create partial refund', async () => {
      mockStripe.refunds.create.mockResolvedValue({
        id: 're_123',
        amount: 5000
      });

      const result = await stripePaymentService.createRefund('pi_123', 5000);

      expect(mockStripe.refunds.create).toHaveBeenCalledWith({
        payment_intent: 'pi_123',
        amount: 5000,
        reason: undefined
      });
      expect(result.amount).toBe(5000);
    });

    it('should include reason', async () => {
      mockStripe.refunds.create.mockResolvedValue({
        id: 're_123',
        amount: 10000
      });

      await stripePaymentService.createRefund('pi_123', undefined, 'requested_by_customer');

      expect(mockStripe.refunds.create).toHaveBeenCalledWith({
        payment_intent: 'pi_123',
        reason: 'requested_by_customer'
      });
    });
  });

  describe('getSellerStripeAccountId', () => {
    it('should return account ID for fully onboarded seller', async () => {
      mockDbChain.first.mockResolvedValue({
        stripe_connect_account_id: 'acct_seller123',
        stripe_connect_charges_enabled: true,
        stripe_connect_payouts_enabled: true
      });

      const result = await stripePaymentService.getSellerStripeAccountId('seller-123');

      expect(result).toBe('acct_seller123');
    });

    it('should return null if seller not found', async () => {
      mockDbChain.first.mockResolvedValue(null);

      const result = await stripePaymentService.getSellerStripeAccountId('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw if account not connected', async () => {
      mockDbChain.first.mockResolvedValue({
        stripe_connect_account_id: null,
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: false
      });

      await expect(stripePaymentService.getSellerStripeAccountId('seller-123'))
        .rejects.toThrow('Seller has not connected their Stripe account');
    });

    it('should throw if charges not enabled', async () => {
      mockDbChain.first.mockResolvedValue({
        stripe_connect_account_id: 'acct_seller123',
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: true
      });

      await expect(stripePaymentService.getSellerStripeAccountId('seller-123'))
        .rejects.toThrow('Seller Stripe account is not fully enabled');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      const mockEvent = { id: 'evt_123', type: 'payment_intent.succeeded' };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = stripePaymentService.verifyWebhookSignature(
        'payload',
        'sig_header',
        'whsec_secret'
      );

      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        'payload',
        'sig_header',
        'whsec_secret'
      );
      expect(result).toEqual(mockEvent);
    });

    it('should throw on invalid signature', () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      expect(() => stripePaymentService.verifyWebhookSignature(
        'payload',
        'bad_sig',
        'whsec_secret'
      )).toThrow('Invalid webhook signature');
    });
  });

  describe('calculateFees', () => {
    it('should calculate all fee components', () => {
      const result = stripePaymentService.calculateFees(10000);

      expect(result.platformFeeCents).toBe(250);  // 2.5%
      expect(result.venueFeeCents).toBe(500);     // 5%
      expect(result.totalFeeCents).toBe(750);
    });

    it('should calculate seller receives', () => {
      const result = stripePaymentService.calculateFees(10000);

      expect(result.sellerReceivesCents).toBe(9250);  // $100 - $7.50
    });

    it('should calculate buyer pays', () => {
      const result = stripePaymentService.calculateFees(10000);

      expect(result.buyerPaysCents).toBe(10000);  // Full listing price
    });
  });

  describe('stripePaymentService export', () => {
    it('should export singleton instance', () => {
      expect(stripePaymentService).toBeDefined();
      expect(stripePaymentService).toBeInstanceOf(StripePaymentService);
    });
  });
});
