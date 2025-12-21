import Stripe from 'stripe';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { constants } from '../config';

interface CreatePaymentIntentParams {
  listingId: string;
  sellerId: string;
  sellerStripeAccountId: string;
  buyerId: string;
  amountCents: number; // Price in cents
  currency?: string;
  metadata?: Record<string, string>;
}

interface PaymentResult {
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
  applicationFeeAmountCents: number;
  sellerReceivesCents: number;
  status: string;
}

export class StripePaymentService {
  private stripe: Stripe;
  private log = logger.child({ component: 'StripePaymentService' });

  // Fee configuration
  private readonly PLATFORM_FEE_PERCENTAGE = constants.FEES.PLATFORM_FEE_PERCENTAGE || 0.025; // 2.5%
  private readonly VENUE_FEE_PERCENTAGE = constants.FEES.DEFAULT_VENUE_FEE_PERCENTAGE || 0.05; // 5%

  constructor() {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2025-11-17.clover',
    });
  }

  /**
   * Create PaymentIntent for marketplace purchase with destination charges
   * Money goes directly to seller, platform takes fee via application_fee_amount
   */
  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentResult> {
    try {
      const {
        listingId,
        sellerId,
        sellerStripeAccountId,
        buyerId,
        amountCents,
        currency = 'usd',
        metadata = {},
      } = params;

      // Calculate fees
      const platformFeeCents = Math.round(amountCents * this.PLATFORM_FEE_PERCENTAGE);
      const venueFeeCents = Math.round(amountCents * this.VENUE_FEE_PERCENTAGE);
      const totalApplicationFeeCents = platformFeeCents + venueFeeCents;
      const sellerReceivesCents = amountCents - totalApplicationFeeCents;

      this.log.info('Creating PaymentIntent for marketplace purchase', {
        listingId,
        amountCents,
        platformFeeCents,
        venueFeeCents,
        totalApplicationFeeCents,
        sellerReceivesCents,
      });

      // Create PaymentIntent with destination charges pattern
      // Money goes to connected account, we collect application_fee_amount
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountCents,
        currency: currency.toLowerCase(),
        application_fee_amount: totalApplicationFeeCents,
        transfer_data: {
          destination: sellerStripeAccountId,
        },
        metadata: {
          listing_id: listingId,
          seller_id: sellerId,
          buyer_id: buyerId,
          platform_fee_cents: platformFeeCents.toString(),
          venue_fee_cents: venueFeeCents.toString(),
          ...metadata,
        },
        description: `Marketplace purchase - Listing ${listingId}`,
        // Recommended: automatic payment methods
        automatic_payment_methods: {
          enabled: true,
        },
      });

      this.log.info('PaymentIntent created successfully', {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      });

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret!,
        amountCents,
        applicationFeeAmountCents: totalApplicationFeeCents,
        sellerReceivesCents,
        status: paymentIntent.status,
      };
    } catch (error: any) {
      this.log.error('Failed to create PaymentIntent', {
        error: error.message,
        listingId: params.listingId,
      });
      throw new Error(`Payment failed: ${error.message}`);
    }
  }

  /**
   * Retrieve PaymentIntent status
   */
  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error: any) {
      this.log.error('Failed to retrieve PaymentIntent', {
        paymentIntentId,
        error: error.message,
      });
      throw new Error(`Failed to retrieve payment: ${error.message}`);
    }
  }

  /**
   * Cancel PaymentIntent (if not yet captured)
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<void> {
    try {
      await this.stripe.paymentIntents.cancel(paymentIntentId);
      this.log.info('PaymentIntent cancelled', { paymentIntentId });
    } catch (error: any) {
      this.log.error('Failed to cancel PaymentIntent', {
        paymentIntentId,
        error: error.message,
      });
      throw new Error(`Failed to cancel payment: ${error.message}`);
    }
  }

  /**
   * Create refund for marketplace purchase
   * This reverses both the payment and the application fee
   */
  async createRefund(
    paymentIntentId: string,
    amountCents?: number,
    reason?: string
  ): Promise<Stripe.Refund> {
    try {
      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId,
        reason: reason as Stripe.RefundCreateParams.Reason | undefined,
      };

      if (amountCents) {
        refundParams.amount = amountCents;
      }

      // Refund automatically reverses the application fee proportionally
      const refund = await this.stripe.refunds.create(refundParams);

      this.log.info('Refund created successfully', {
        refundId: refund.id,
        paymentIntentId,
        amountCents: refund.amount,
      });

      return refund;
    } catch (error: any) {
      this.log.error('Failed to create refund', {
        paymentIntentId,
        error: error.message,
      });
      throw new Error(`Refund failed: ${error.message}`);
    }
  }

  /**
   * Get seller's Stripe Connect account ID from database
   */
  async getSellerStripeAccountId(sellerId: string): Promise<string | null> {
    try {
      const user = await db('users')
        .where('id', sellerId)
        .select('stripe_connect_account_id', 'stripe_connect_charges_enabled', 'stripe_connect_payouts_enabled')
        .first();

      if (!user) {
        return null;
      }

      // Verify seller is fully onboarded
      if (!user.stripe_connect_account_id) {
        throw new Error('Seller has not connected their Stripe account');
      }

      if (!user.stripe_connect_charges_enabled || !user.stripe_connect_payouts_enabled) {
        throw new Error('Seller Stripe account is not fully enabled');
      }

      return user.stripe_connect_account_id;
    } catch (error: any) {
      this.log.error('Failed to get seller Stripe account', {
        sellerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Verify webhook signature from Stripe
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (error: any) {
      this.log.error('Webhook signature verification failed', { error: error.message });
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * Calculate fees for display purposes
   */
  calculateFees(amountCents: number): {
    platformFeeCents: number;
    venueFeeCents: number;
    totalFeeCents: number;
    sellerReceivesCents: number;
    buyerPaysCents: number;
  } {
    const platformFeeCents = Math.round(amountCents * this.PLATFORM_FEE_PERCENTAGE);
    const venueFeeCents = Math.round(amountCents * this.VENUE_FEE_PERCENTAGE);
    const totalFeeCents = platformFeeCents + venueFeeCents;
    const sellerReceivesCents = amountCents - totalFeeCents;

    return {
      platformFeeCents,
      venueFeeCents,
      totalFeeCents,
      sellerReceivesCents,
      buyerPaysCents: amountCents, // Buyer pays full listing price
    };
  }

  /**
   * Create PaymentIntent with separate charges and transfers pattern
   * Money goes to platform account first, then transferred to seller and venue
   * NO transfer_data, NO application_fee_amount
   */
  async createPaymentIntentWithSeparateCharges(params: {
    listingId: string;
    sellerId: string;
    sellerStripeAccountId: string;
    buyerId: string;
    venueId: string;
    venueStripeAccountId: string | null;
    amountCents: number;
    platformFeeCents: number;
    venueFeeCents: number;
    sellerReceivesCents: number;
    currency?: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentResult> {
    try {
      const { currency = 'usd', metadata = {} } = params;

      this.log.info('Creating PaymentIntent with separate charges pattern', {
        listingId: params.listingId,
        amountCents: params.amountCents,
        platformFeeCents: params.platformFeeCents,
        venueFeeCents: params.venueFeeCents,
        sellerReceivesCents: params.sellerReceivesCents,
        venueHasStripeConnect: !!params.venueStripeAccountId,
      });

      // Create PaymentIntent WITHOUT transfer_data or application_fee_amount
      // Charge goes to platform's Stripe account
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: params.amountCents,
        currency: currency.toLowerCase(),
        // NO transfer_data - money stays on platform account initially
        // NO application_fee_amount - we'll transfer separately
        metadata: {
          listing_id: params.listingId,
          seller_id: params.sellerId,
          buyer_id: params.buyerId,
          venue_id: params.venueId,
          // Store split amounts for later transfer
          seller_amount_cents: params.sellerReceivesCents.toString(),
          venue_amount_cents: params.venueFeeCents.toString(),
          platform_fee_cents: params.platformFeeCents.toString(),
          seller_stripe_account_id: params.sellerStripeAccountId,
          venue_stripe_account_id: params.venueStripeAccountId || '',
          ...metadata,
        },
        description: `Marketplace purchase - Listing ${params.listingId}`,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      this.log.info('PaymentIntent created with separate charges pattern', {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      });

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret!,
        amountCents: params.amountCents,
        applicationFeeAmountCents: params.platformFeeCents + params.venueFeeCents,
        sellerReceivesCents: params.sellerReceivesCents,
        status: paymentIntent.status,
      };
    } catch (error: any) {
      this.log.error('Failed to create PaymentIntent with separate charges', {
        error: error.message,
        listingId: params.listingId,
      });
      throw new Error(`Payment failed: ${error.message}`);
    }
  }

  /**
   * Create transfer to seller using source_transaction
   * This ties the transfer to the original charge, making it atomic
   */
  async createTransferToSeller(
    chargeId: string,
    sellerStripeAccountId: string,
    amountCents: number,
    metadata: {
      listingId: string;
      sellerId: string;
      buyerId: string;
    }
  ): Promise<{ transferId: string; status: string }> {
    try {
      this.log.info('Creating transfer to seller', {
        chargeId,
        sellerStripeAccountId,
        amountCents,
        listingId: metadata.listingId,
      });

      const transfer = await this.stripe.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: sellerStripeAccountId,
        source_transaction: chargeId, // KEY: ties transfer to charge
        transfer_group: chargeId, // Groups related transfers
        metadata: {
          transfer_type: 'seller_payout',
          listing_id: metadata.listingId,
          seller_id: metadata.sellerId,
          buyer_id: metadata.buyerId,
        },
        description: `Seller payout for listing ${metadata.listingId}`,
      });

      this.log.info('Transfer to seller created successfully', {
        transferId: transfer.id,
        amount: transfer.amount,
        destination: transfer.destination,
      });

      return {
        transferId: transfer.id,
        status: transfer.object, // 'transfer'
      };
    } catch (error: any) {
      this.log.error('Failed to create transfer to seller', {
        error: error.message,
        chargeId,
        sellerStripeAccountId,
      });
      throw new Error(`Seller transfer failed: ${error.message}`);
    }
  }

  /**
   * Create transfer to venue using source_transaction
   * Returns null if venue has no Stripe Connect account
   * This ties the transfer to the original charge, making it atomic
   */
  async createTransferToVenue(
    chargeId: string,
    venueStripeAccountId: string | null,
    amountCents: number,
    metadata: {
      listingId: string;
      venueId: string;
    }
  ): Promise<{ transferId: string; status: string } | null> {
    // If venue has no Stripe Connect, skip transfer
    if (!venueStripeAccountId) {
      this.log.info('Skipping venue transfer - no Stripe Connect account', {
        venueId: metadata.venueId,
        listingId: metadata.listingId,
      });
      return null;
    }

    // If venue royalty is 0, skip transfer
    if (amountCents === 0) {
      this.log.info('Skipping venue transfer - zero amount', {
        venueId: metadata.venueId,
        listingId: metadata.listingId,
      });
      return null;
    }

    try {
      this.log.info('Creating transfer to venue', {
        chargeId,
        venueStripeAccountId,
        amountCents,
        venueId: metadata.venueId,
      });

      const transfer = await this.stripe.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: venueStripeAccountId,
        source_transaction: chargeId, // KEY: ties transfer to same charge as seller transfer
        transfer_group: chargeId, // Same group as seller transfer
        metadata: {
          transfer_type: 'venue_royalty',
          listing_id: metadata.listingId,
          venue_id: metadata.venueId,
        },
        description: `Venue royalty for listing ${metadata.listingId}`,
      });

      this.log.info('Transfer to venue created successfully', {
        transferId: transfer.id,
        amount: transfer.amount,
        destination: transfer.destination,
      });

      return {
        transferId: transfer.id,
        status: transfer.object, // 'transfer'
      };
    } catch (error: any) {
      // Don't fail the transaction if venue transfer fails
      // Seller has already been paid
      this.log.error('Failed to create transfer to venue (non-fatal)', {
        error: error.message,
        chargeId,
        venueStripeAccountId,
        venueId: metadata.venueId,
      });
      // Return null instead of throwing - caller should handle gracefully
      return null;
    }
  }
}

export const stripePaymentService = new StripePaymentService();
