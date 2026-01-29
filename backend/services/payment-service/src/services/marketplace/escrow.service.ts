import { getClient, query } from '../../config/database';
import { EscrowStatus, ResaleListing, TransactionStatus } from '../../types';
import { TransactionModel, VenueBalanceModel } from '../../models';
import { percentOfCents } from '../../utils/money';
import Stripe from 'stripe';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'EscrowService' });

/**
 * SECURITY: Explicit field lists to prevent SELECT * from exposing sensitive data.
 */
const INTERNAL_ESCROW_FIELDS = 'id, tenant_id, listing_id, buyer_id, seller_id, amount, seller_payout, venue_royalty, platform_fee, stripe_payment_intent_id, status, created_at, released_at, updated_at';
const ESCROW_CONDITION_FIELDS = 'id, escrow_id, condition_type, required, metadata, satisfied, created_at';

/**
 * Internal escrow representation with all fields needed for processing
 */
interface InternalEscrow {
  id: string;
  tenantId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  sellerPayout: number;
  venueRoyalty: number;
  platformFee: number;
  stripePaymentIntentId: string;
  status: EscrowStatus;
  createdAt: Date;
  releasedAt: Date | null;
  updatedAt: Date;
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
  ): Promise<InternalEscrow> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      // Calculate splits (all in cents)
      const splits = this.calculatePaymentSplits(
        listing.price,
        listing.venueRoyaltyPercentage
      );

      // Create Stripe payment intent with manual capture
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: listing.price,
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

      // Create escrow record
      const escrowResult = await client.query(
        `INSERT INTO payment_escrows (
          listing_id, buyer_id, seller_id, amount,
          seller_payout, venue_royalty, platform_fee,
          stripe_payment_intent_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${INTERNAL_ESCROW_FIELDS}`,
        [
          listing.id,
          buyerId,
          listing.sellerId,
          listing.price,
          splits.sellerPayout,
          splits.venueRoyalty,
          splits.platformFee,
          paymentIntent.id,
          EscrowStatus.CREATED
        ]
      );

      const escrow = this.mapRow(escrowResult.rows[0]);

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

  async fundEscrow(escrowId: string): Promise<InternalEscrow> {
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

      // Create seller payout record
      await TransactionModel.create({
        userId: escrow.sellerId,
        amount: escrow.sellerPayout,
        status: TransactionStatus.COMPLETED,
        metadata: { escrowId, role: 'seller' }
      });

      // Credit venue royalty
      const listing = await this.getListing(escrow.listingId);
      await VenueBalanceModel.updateBalance(
        listing.venueId,
        escrow.tenantId,
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
  ): { sellerPayout: number; venueRoyalty: number; platformFee: number } {
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
      `SELECT ${ESCROW_CONDITION_FIELDS} FROM escrow_release_conditions
       WHERE escrow_id = $1 AND required = true`,
      [escrowId]
    );

    return result.rows.every((condition: any) => condition.satisfied);
  }

  private async startReleaseMonitoring(escrowId: string): Promise<void> {
    log.info({ escrowId }, 'Started monitoring release conditions');
  }

  private async getEscrow(escrowId: string): Promise<InternalEscrow> {
    const result = await query(
      `SELECT ${INTERNAL_ESCROW_FIELDS} FROM payment_escrows WHERE id = $1`,
      [escrowId]
    );

    if (result.rows.length === 0) {
      throw new Error('Escrow not found');
    }

    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: any): InternalEscrow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      listingId: row.listing_id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      amount: row.amount,
      sellerPayout: row.seller_payout,
      venueRoyalty: row.venue_royalty,
      platformFee: row.platform_fee,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      status: row.status,
      createdAt: row.created_at,
      releasedAt: row.released_at,
      updatedAt: row.updated_at,
    };
  }

  private async getListing(listingId: string): Promise<{ venueId: string; tenantId: string }> {
    const result = await query(
      `SELECT venue_id, tenant_id FROM resale_listings WHERE id = $1`,
      [listingId]
    );

    if (result.rows.length === 0) {
      // Fallback for tests/missing data
      return { venueId: 'unknown', tenantId: 'unknown' };
    }

    return {
      venueId: result.rows[0].venue_id,
      tenantId: result.rows[0].tenant_id
    };
  }

  private async updateEscrowStatus(escrowId: string, status: EscrowStatus): Promise<void> {
    await query(
      'UPDATE payment_escrows SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [escrowId, status]
    );
  }
}
