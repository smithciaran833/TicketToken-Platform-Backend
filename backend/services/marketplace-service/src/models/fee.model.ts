import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { percentOfCents } from '@tickettoken/shared';

export interface PlatformFee {
  id: string;
  transferId: string;
  salePrice: number;              // INTEGER CENTS
  platformFeeAmount: number;      // INTEGER CENTS
  platformFeePercentage: number;  // DECIMAL (5.00 = 5%)
  venueFeeAmount: number;         // INTEGER CENTS
  venueFeePercentage: number;     // DECIMAL (5.00 = 5%)
  sellerPayout: number;           // INTEGER CENTS
  platformFeeWallet?: string;
  platformFeeSignature?: string;
  venueFeeWallet?: string;
  venueFeeSignature?: string;
  platformFeeCollected: boolean;
  venueFeeCollected: boolean;
  sellerTransferId?: string;      // Stripe transfer ID for seller
  venueTransferId?: string;       // Stripe transfer ID for venue
  venueReceivedCents?: number;    // Actual amount venue received
  createdAt: Date;
}

export interface CreateFeeInput {
  transferId: string;
  salePrice: number;              // INTEGER CENTS
  platformFeePercentage?: number; // DECIMAL (5.00 = 5%)
  venueFeePercentage?: number;    // DECIMAL (5.00 = 5%)
}

export class FeeModel {
  private tableName = 'platform_fees';

  async create(input: CreateFeeInput): Promise<PlatformFee> {
    const id = uuidv4();

    // Calculate fees using basis points
    const platformFeePercentage = input.platformFeePercentage || 5.00;
    const venueFeePercentage = input.venueFeePercentage || 5.00;
    
    const platformFeeBps = Math.round(platformFeePercentage * 100);
    const venueFeeBps = Math.round(venueFeePercentage * 100);
    
    const platformFeeAmountCents = percentOfCents(input.salePrice, platformFeeBps);
    const venueFeeAmountCents = percentOfCents(input.salePrice, venueFeeBps);
    const sellerPayoutCents = input.salePrice - platformFeeAmountCents - venueFeeAmountCents;

    const [fee] = await db(this.tableName)
      .insert({
        id,
        transfer_id: input.transferId,
        sale_price: input.salePrice,
        platform_fee_amount: platformFeeAmountCents,
        platform_fee_percentage: platformFeePercentage,
        venue_fee_amount: venueFeeAmountCents,
        venue_fee_percentage: venueFeePercentage,
        seller_payout: sellerPayoutCents,
        platform_fee_collected: false,
        venue_fee_paid: false,
      })
      .returning('*');

    return this.mapToFee(fee);
  }

  async findById(id: string): Promise<PlatformFee | null> {
    const fee = await db(this.tableName)
      .where({ id })
      .first();

    return fee ? this.mapToFee(fee) : null;
  }

  async findByTransferId(transferId: string): Promise<PlatformFee | null> {
    const fee = await db(this.tableName)
      .where({ transfer_id: transferId })
      .first();

    return fee ? this.mapToFee(fee) : null;
  }

  async updateFeeCollection(
    id: string,
    platformCollected?: boolean,
    venueCollected?: boolean,
    platformSignature?: string,
    venueSignature?: string,
    sellerTransferId?: string,
    venueTransferId?: string,
    venueReceivedCents?: number
  ): Promise<PlatformFee | null> {
    const updateData: any = {};

    if (platformCollected !== undefined) {
      updateData.platform_fee_collected = platformCollected;
    }
    if (venueCollected !== undefined) {
      updateData.venue_fee_paid = venueCollected;
    }
    if (platformSignature) {
      updateData.platform_fee_signature = platformSignature;
    }
    if (venueSignature) {
      updateData.venue_fee_signature = venueSignature;
    }
    if (sellerTransferId) {
      updateData.seller_transfer_id = sellerTransferId;
    }
    if (venueTransferId) {
      updateData.venue_transfer_id = venueTransferId;
    }
    if (venueReceivedCents !== undefined) {
      updateData.venue_received_cents = venueReceivedCents;
    }

    const [fee] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return fee ? this.mapToFee(fee) : null;
  }

  /**
   * Record Stripe transfer IDs for reconciliation
   */
  async recordTransferIds(
    feeId: string,
    sellerTransferId: string,
    venueTransferId: string | null,
    venueAmount: number
  ): Promise<PlatformFee | null> {
    const updateData: any = {
      seller_transfer_id: sellerTransferId,
      platform_fee_collected: true, // Seller transfer succeeded
    };

    if (venueTransferId) {
      updateData.venue_transfer_id = venueTransferId;
      updateData.venue_received_cents = venueAmount;
      updateData.venue_fee_paid = true; // Venue transfer succeeded
    }

    const [fee] = await db(this.tableName)
      .where({ id: feeId })
      .update(updateData)
      .returning('*');

    return fee ? this.mapToFee(fee) : null;
  }

  async getTotalPlatformFees(startDate?: Date, endDate?: Date): Promise<number> {
    let query = db(this.tableName)
      .where({ platform_fee_collected: true })
      .sum('platform_fee_amount as total');

    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const result = await query.first();
    if (!result || !result.total) return 0;
    return parseInt(String(result.total));  // Return integer cents
  }

  async getTotalVenueFees(venueId: string, startDate?: Date, endDate?: Date): Promise<number> {
    let query = db(this.tableName)
      .join('marketplace_transfers', 'platform_fees.transfer_id', 'marketplace_transfers.id')
      .where({
        'marketplace_transfers.venue_id': venueId,
        'platform_fees.venue_fee_paid': true
      })
      .sum('platform_fees.venue_fee_amount as total');

    if (startDate) {
      query = query.where('platform_fees.created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('platform_fees.created_at', '<=', endDate);
    }

    const result = await query.first();
    if (!result || !result.total) return 0;
    return parseInt(String(result.total));  // Return integer cents
  }

  private mapToFee(row: any): PlatformFee {
    return {
      id: row.id,
      transferId: row.transfer_id,
      salePrice: parseInt(row.sale_price),                       // INTEGER CENTS
      platformFeeAmount: parseInt(row.platform_fee_amount),      // INTEGER CENTS
      platformFeePercentage: parseFloat(row.platform_fee_percentage), // DECIMAL %
      venueFeeAmount: parseInt(row.venue_fee_amount),            // INTEGER CENTS
      venueFeePercentage: parseFloat(row.venue_fee_percentage),  // DECIMAL %
      sellerPayout: parseInt(row.seller_payout),                 // INTEGER CENTS
      platformFeeWallet: row.platform_fee_wallet,
      platformFeeSignature: row.platform_fee_signature,
      venueFeeWallet: row.venue_fee_wallet,
      venueFeeSignature: row.venue_fee_signature,
      platformFeeCollected: row.platform_fee_collected,
      venueFeeCollected: row.venue_fee_paid,
      sellerTransferId: row.seller_transfer_id,
      venueTransferId: row.venue_transfer_id,
      venueReceivedCents: row.venue_received_cents ? parseInt(row.venue_received_cents) : undefined,
      createdAt: row.created_at,
    };
  }
}

export const feeModel = new FeeModel();
