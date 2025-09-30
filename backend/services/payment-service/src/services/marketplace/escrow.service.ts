import { getClient, query } from '../../config/database';
import { EscrowTransaction, EscrowStatus, ResaleListing, TransactionStatus } from '../../types';
import { TransactionModel, VenueBalanceModel } from '../../models';
import { percentOfCents } from '../../utils/money';
import Stripe from 'stripe';
import { config } from '../../config';

interface ExtendedEscrowTransaction extends EscrowTransaction {
  stripePaymentIntentId: string;
  sellerId: string;
  sellerPayout: number;
  venueRoyalty: number;
  listingId: string;
}

export class EscrowService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16'
    });
  }

  async createEscrow(
    listing: ResaleListing,
    buyerId: string,
    paymentMethodId: string
  ): Promise<ExtendedEscrowTransaction> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      // Calculate splits (all in cents)
      const splits = this.calculatePaymentSplits(
        listing.price, // Already in cents
        listing.venueRoyaltyPercentage
      );

      // Create Stripe payment intent (Stripe expects cents)
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: listing.price, // Already in cents
        currency: 'usd',
        payment_method: paymentMethodId,
        capture_method: 'manual',
        metadata: {
          listingId: listing.id,
          sellerId: listing.sellerId,
          buyerId: buyerId,
          ticketId: listing.ticketId
        }
      });

      // Create escrow record (amounts in cents)
      const escrowQuery = `
        INSERT INTO payment_escrows (
          listing_id, buyer_id, seller_id, amount,
          seller_payout, venue_royalty, platform_fee,
          stripe_payment_intent_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const escrowValues = [
        listing.id,
        buyerId,
        listing.sellerId,
        listing.price,
        splits.sellerPayout,
        splits.venueRoyalty,
        splits.platformFee,
        paymentIntent.id,
        EscrowStatus.CREATED
      ];

      const escrowResult = await client.query(escrowQuery, escrowValues);
      const escrow = escrowResult.rows[0];

      await this.setReleaseConditions(client, escrow.id);
      await client.query('COMMIT');

      return escrow;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  async fundEscrow(escrowId: string): Promise<ExtendedEscrowTransaction> {
    const escrow = await this.getEscrow(escrowId);

    if (escrow.status !== EscrowStatus.CREATED) {
      throw new Error('Escrow already funded or cancelled');
    }

    const paymentIntent = await this.stripe.paymentIntents.confirm(
      escrow.stripePaymentIntentId
    );

    if (paymentIntent.status === 'requires_capture') {
      await this.updateEscrowStatus(escrowId, EscrowStatus.FUNDED);
      await this.startReleaseMonitoring(escrowId);
      return this.getEscrow(escrowId);
    } else {
      throw new Error('Payment confirmation failed');
    }
  }

  async releaseEscrow(escrowId: string): Promise<void> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      const escrow = await this.getEscrow(escrowId);

      if (escrow.status !== EscrowStatus.FUNDED) {
        throw new Error('Escrow not in funded state');
      }

      const conditionsMet = await this.checkReleaseConditions(escrow.id);
      if (!conditionsMet) {
        throw new Error('Release conditions not met');
      }

      const paymentIntent = await this.stripe.paymentIntents.capture(
        escrow.stripePaymentIntentId
      );

      if (paymentIntent.status !== 'succeeded') {
        throw new Error('Payment capture failed');
      }

      // Create payout records (amounts in cents)
      await TransactionModel.create({
        userId: escrow.sellerId,
        amount: escrow.sellerPayout,
        status: TransactionStatus.COMPLETED,
        metadata: { escrowId, role: 'seller' }
      });

      const listing = await this.getListing(escrow.listingId);
      await VenueBalanceModel.updateBalance(
        listing.venueId,
        escrow.venueRoyalty,
        'available'
      );

      await this.updateEscrowStatus(escrowId, EscrowStatus.RELEASED);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  async refundEscrow(escrowId: string, reason: string): Promise<void> {
    const escrow = await this.getEscrow(escrowId);

    if (escrow.status === EscrowStatus.RELEASED) {
      throw new Error('Escrow already released');
    }

    if (escrow.status === EscrowStatus.REFUNDED) {
      throw new Error('Escrow already refunded');
    }

    if (escrow.status === EscrowStatus.FUNDED) {
      await this.stripe.refunds.create({
        payment_intent: escrow.stripePaymentIntentId,
        reason: 'requested_by_customer',
        metadata: { escrowId, refundReason: reason }
      });
    } else {
      await this.stripe.paymentIntents.cancel(escrow.stripePaymentIntentId);
    }

    await this.updateEscrowStatus(escrowId, EscrowStatus.REFUNDED);
  }

  private calculatePaymentSplits(
    priceCents: number,
    venueRoyaltyPercentage: number
  ): {
    sellerPayout: number;
    venueRoyalty: number;
    platformFee: number;
  } {
    // Convert percentages to basis points
    const venueRoyaltyBps = Math.round(venueRoyaltyPercentage * 100);
    const platformFeeBps = 500; // 5%

    const venueRoyaltyCents = percentOfCents(priceCents, venueRoyaltyBps);
    const platformFeeCents = percentOfCents(priceCents, platformFeeBps);
    const sellerPayoutCents = priceCents - venueRoyaltyCents - platformFeeCents;

    return {
      sellerPayout: sellerPayoutCents,
      venueRoyalty: venueRoyaltyCents,
      platformFee: platformFeeCents
    };
  }

  private async setReleaseConditions(client: any, escrowId: string): Promise<void> {
    const conditions = [
      { type: 'nft_transferred', required: true },
      { type: 'cooling_period', required: true, duration: 600 }
    ];

    for (const condition of conditions) {
      await client.query(
        `INSERT INTO escrow_release_conditions
         (escrow_id, condition_type, required, metadata)
         VALUES ($1, $2, $3, $4)`,
        [escrowId, condition.type, condition.required, JSON.stringify(condition)]
      );
    }
  }

  private async checkReleaseConditions(escrowId: string): Promise<boolean> {
    const result = await query(
      `SELECT * FROM escrow_release_conditions
       WHERE escrow_id = $1 AND required = true`,
      [escrowId]
    );

    return result.rows.every((condition: any) => condition.satisfied);
  }

  private async startReleaseMonitoring(escrowId: string): Promise<void> {
    console.log(`Started monitoring release conditions for escrow ${escrowId}`);
  }

  private async getEscrow(escrowId: string): Promise<ExtendedEscrowTransaction> {
    const result = await query(
      'SELECT * FROM payment_escrows WHERE id = $1',
      [escrowId]
    );

    if (result.rows.length === 0) {
      throw new Error('Escrow not found');
    }

    return result.rows[0];
  }

  private async getListing(listingId: string): Promise<any> {
    return { venueId: 'mock-venue-id' };
  }

  private async updateEscrowStatus(
    escrowId: string,
    status: EscrowStatus
  ): Promise<void> {
    await query(
      'UPDATE payment_escrows SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [escrowId, status]
    );
  }
}
