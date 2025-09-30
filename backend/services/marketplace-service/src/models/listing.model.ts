import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface MarketplaceListing {
  id: string;
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;              // INTEGER CENTS
  originalFaceValue: number;  // INTEGER CENTS
  priceMultiplier?: number;   // DECIMAL (e.g., 1.5 = 150%)
  status: 'active' | 'sold' | 'cancelled' | 'expired' | 'pending_approval';
  listedAt: Date;
  soldAt?: Date;
  expiresAt?: Date;
  cancelledAt?: Date;
  listingSignature?: string;
  walletAddress: string;
  programAddress?: string;
  requiresApproval: boolean;
  approvedAt?: Date;
  approvedBy?: string;
  approvalNotes?: string;
  viewCount: number;
  favoriteCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateListingInput {
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;              // INTEGER CENTS
  originalFaceValue: number;  // INTEGER CENTS
  walletAddress: string;
  expiresAt?: Date;
  requiresApproval?: boolean;
}

export interface UpdateListingInput {
  price?: number;  // INTEGER CENTS
  expiresAt?: Date;
}

export class ListingModel {
  private tableName = 'marketplace_listings';

  async create(input: CreateListingInput): Promise<MarketplaceListing> {
    const id = uuidv4();
    const [listing] = await db(this.tableName)
      .insert({
        id,
        ticket_id: input.ticketId,
        seller_id: input.sellerId,
        event_id: input.eventId,
        venue_id: input.venueId,
        price: input.price,
        original_face_value: input.originalFaceValue,
        wallet_address: input.walletAddress,
        expires_at: input.expiresAt,
        requires_approval: input.requiresApproval || false,
        status: input.requiresApproval ? 'pending_approval' : 'active',
      })
      .returning('*');

    return this.mapToListing(listing);
  }

  async findById(id: string): Promise<MarketplaceListing | null> {
    const listing = await db(this.tableName)
      .where({ id })
      .first();

    return listing ? this.mapToListing(listing) : null;
  }

  async findByTicketId(ticketId: string): Promise<MarketplaceListing | null> {
    const listing = await db(this.tableName)
      .where({ ticket_id: ticketId, status: 'active' })
      .first();

    return listing ? this.mapToListing(listing) : null;
  }

  async findByEventId(
    eventId: string,
    status?: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceListing[]> {
    let query = db(this.tableName)
      .where({ event_id: eventId })
      .orderBy('price', 'asc')
      .limit(limit)
      .offset(offset);

    if (status) {
      query = query.where({ status });
    }

    const listings = await query;
    return listings.map(this.mapToListing);
  }

  async findBySellerId(
    sellerId: string,
    status?: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceListing[]> {
    let query = db(this.tableName)
      .where({ seller_id: sellerId })
      .orderBy('listed_at', 'desc')
      .limit(limit)
      .offset(offset);

    if (status) {
      query = query.where({ status });
    }

    const listings = await query;
    return listings.map(this.mapToListing);
  }

  async update(
    id: string,
    input: UpdateListingInput
  ): Promise<MarketplaceListing | null> {
    const updateData: any = {};

    if (input.price !== undefined) {
      updateData.price = input.price;
    }
    if (input.expiresAt !== undefined) {
      updateData.expires_at = input.expiresAt;
    }

    const [listing] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return listing ? this.mapToListing(listing) : null;
  }

  async updateStatus(
    id: string,
    status: MarketplaceListing['status'],
    additionalData?: any
  ): Promise<MarketplaceListing | null> {
    const updateData: any = { status };

    if (status === 'sold' && !additionalData?.sold_at) {
      updateData.sold_at = new Date();
    }
    if (status === 'cancelled' && !additionalData?.cancelled_at) {
      updateData.cancelled_at = new Date();
    }

    Object.assign(updateData, additionalData);

    const [listing] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return listing ? this.mapToListing(listing) : null;
  }

  async incrementViewCount(id: string): Promise<void> {
    await db(this.tableName)
      .where({ id })
      .increment('view_count', 1);
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

  async countByUserId(userId: string, eventId?: string): Promise<number> {
    let query = db(this.tableName)
      .where({ seller_id: userId, status: 'active' })
      .count('* as count');

    if (eventId) {
      query = query.where({ event_id: eventId });
    }

    const result = await query.first();
    if (!result) return 0;
    return parseInt(String(result.count), 10);
  }

  async expireListings(eventId: string): Promise<number> {
    const result = await db(this.tableName)
      .where({ event_id: eventId, status: 'active' })
      .update({ status: 'expired' });

    return result;
  }

  private mapToListing(row: any): MarketplaceListing {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      sellerId: row.seller_id,
      eventId: row.event_id,
      venueId: row.venue_id,
      price: parseInt(row.price),  // Ensure integer cents
      originalFaceValue: parseInt(row.original_face_value),  // Ensure integer cents
      priceMultiplier: row.price_multiplier ? parseFloat(row.price_multiplier) : undefined,  // Keep as decimal
      status: row.status,
      listedAt: row.listed_at,
      soldAt: row.sold_at,
      expiresAt: row.expires_at,
      cancelledAt: row.cancelled_at,
      listingSignature: row.listing_signature,
      walletAddress: row.wallet_address,
      programAddress: row.program_address,
      requiresApproval: row.requires_approval,
      approvedAt: row.approved_at,
      approvedBy: row.approved_by,
      approvalNotes: row.approval_notes,
      viewCount: row.view_count,
      favoriteCount: row.favorite_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const listingModel = new ListingModel();
