import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface MarketplaceTransfer {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  buyerWallet: string;
  sellerWallet: string;
  transferSignature: string;
  blockHeight?: number;
  paymentCurrency: 'USDC' | 'SOL';
  paymentAmount?: number;
  usdValue: number;
  status: 'initiated' | 'pending' | 'completed' | 'failed' | 'disputed';
  initiatedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  networkFee?: number;
  networkFeeUsd?: number;
  paymentMethod: 'crypto' | 'fiat';
  fiatCurrency?: string;
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  stripeApplicationFeeAmount?: number;
  createdAt: Date;
}

export interface CreateTransferInput {
  listingId: string;
  buyerId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  buyerWallet: string;
  sellerWallet: string;
  paymentCurrency: 'USDC' | 'SOL';
  paymentAmount: number;
  usdValue: number;
  paymentMethod?: 'crypto' | 'fiat';
  fiatCurrency?: string;
  stripePaymentIntentId?: string;
  stripeApplicationFeeAmount?: number;
}

export class TransferModel {
  private tableName = 'marketplace_transfers';

  async create(input: CreateTransferInput): Promise<MarketplaceTransfer> {
    const id = uuidv4();
    const [transfer] = await db(this.tableName)
      .insert({
        id,
        listing_id: input.listingId,
        buyer_id: input.buyerId,
        seller_id: input.sellerId,
        event_id: input.eventId,
        venue_id: input.venueId,
        buyer_wallet: input.buyerWallet,
        seller_wallet: input.sellerWallet,
        payment_currency: input.paymentCurrency,
        payment_amount: input.paymentAmount,
        usd_value: input.usdValue,
        payment_method: input.paymentMethod || 'crypto',
        fiat_currency: input.fiatCurrency,
        stripe_payment_intent_id: input.stripePaymentIntentId,
        stripe_application_fee_amount: input.stripeApplicationFeeAmount,
        status: 'initiated',
        transfer_signature: '',
      })
      .returning('*');

    return this.mapToTransfer(transfer);
  }

  async findById(id: string): Promise<MarketplaceTransfer | null> {
    const transfer = await db(this.tableName)
      .where({ id })
      .first();

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async findByListingId(listingId: string): Promise<MarketplaceTransfer | null> {
    const transfer = await db(this.tableName)
      .where({ listing_id: listingId })
      .orderBy('created_at', 'desc')
      .first();

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async findByStripePaymentIntentId(paymentIntentId: string): Promise<MarketplaceTransfer | null> {
    const transfer = await db(this.tableName)
      .where({ stripe_payment_intent_id: paymentIntentId })
      .first();

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async findByBuyerId(
    buyerId: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceTransfer[]> {
    const transfers = await db(this.tableName)
      .where({ buyer_id: buyerId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return transfers.map(this.mapToTransfer);
  }

  async findBySellerId(
    sellerId: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceTransfer[]> {
    const transfers = await db(this.tableName)
      .where({ seller_id: sellerId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return transfers.map(this.mapToTransfer);
  }

  async updateStatus(
    id: string,
    status: MarketplaceTransfer['status'],
    additionalData?: any
  ): Promise<MarketplaceTransfer | null> {
    const updateData: any = { status };

    if (status === 'completed') {
      updateData.completed_at = new Date();
    } else if (status === 'failed') {
      updateData.failed_at = new Date();
      if (additionalData?.failureReason) {
        updateData.failure_reason = additionalData.failureReason;
      }
    }

    Object.assign(updateData, additionalData);

    const [transfer] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async updateBlockchainData(
    id: string,
    transferSignature: string,
    blockHeight: number,
    networkFee?: number,
    networkFeeUsd?: number
  ): Promise<MarketplaceTransfer | null> {
    const [transfer] = await db(this.tableName)
      .where({ id })
      .update({
        transfer_signature: transferSignature,
        block_height: blockHeight,
        network_fee: networkFee,
        network_fee_usd: networkFeeUsd,
      })
      .returning('*');

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async countByEventId(eventId: string, status?: string): Promise<number> {
    let query = db(this.tableName)
      .where({ event_id: eventId })
      .count('* as count');

    if (status) {
      query = query.where({ status });
    }

    const result = await query.first();
    if (!result) return 0;
    return parseInt(String(result.count), 10);
  }

  async getTotalVolumeByVenueId(venueId: string): Promise<number> {
    const result = await db(this.tableName)
      .where({ venue_id: venueId, status: 'completed' })
      .sum('usd_value as total')
      .first();

    if (!result || !result.total) return 0;
    return parseInt(String(result.total));
  }

  private mapToTransfer(row: any): MarketplaceTransfer {
    return {
      id: row.id,
      listingId: row.listing_id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      eventId: row.event_id,
      venueId: row.venue_id,
      buyerWallet: row.buyer_wallet,
      sellerWallet: row.seller_wallet,
      transferSignature: row.transfer_signature,
      blockHeight: row.block_height,
      paymentCurrency: row.payment_currency,
      paymentAmount: row.payment_amount ? parseInt(row.payment_amount) : undefined,
      usdValue: parseInt(row.usd_value),
      status: row.status,
      initiatedAt: row.initiated_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
      failureReason: row.failure_reason,
      networkFee: row.network_fee ? parseInt(row.network_fee) : undefined,
      networkFeeUsd: row.network_fee_usd ? parseInt(row.network_fee_usd) : undefined,
      paymentMethod: row.payment_method || 'crypto',
      fiatCurrency: row.fiat_currency,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      stripeTransferId: row.stripe_transfer_id,
      stripeApplicationFeeAmount: row.stripe_application_fee_amount ? parseInt(row.stripe_application_fee_amount) : undefined,
      createdAt: row.created_at,
    };
  }
}

export const transferModel = new TransferModel();
