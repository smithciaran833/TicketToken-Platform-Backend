import { logger } from '../utils/logger';
import { withLock, LockKeys, publishSearchSync } from '@tickettoken/shared';
import { listingModel } from '../models/listing.model';

class ListingServiceClass {
  private log = logger.child({ component: 'ListingService' });

  async updateListingPrice(params: {
    listingId: string;
    newPrice: number;
    userId: string;
  }) {
    const { listingId, newPrice, userId } = params;
    const lockKey = LockKeys.listing(listingId);

    return await withLock(lockKey, 5000, async () => {
      if (newPrice <= 0) {
        throw new Error('Price must be greater than zero');
      }

      const listing = await listingModel.findById(listingId);

      if (!listing) {
        throw new Error(`Listing not found: ${listingId}`);
      }

      if (listing.sellerId !== userId) {
        throw new Error('Unauthorized: Not the listing owner');
      }

      if (listing.status !== 'active') {
        throw new Error(`Cannot update price for listing with status: ${listing.status}`);
      }

      const originalPriceCents = listing.originalFaceValue;
      const maxMarkupPercent = 300;
      const maxAllowedPriceCents = Math.floor(originalPriceCents * (1 + maxMarkupPercent / 100));

      if (newPrice > maxAllowedPriceCents) {
        throw new Error(`Price cannot exceed ${maxMarkupPercent}% markup. Maximum allowed: $${maxAllowedPriceCents / 100}`);
      }

      const updated = await listingModel.update(listingId, { price: newPrice });
      const markupPercent = Math.floor(((newPrice - originalPriceCents) / originalPriceCents) * 10000) / 100;

      this.log.info('Listing price updated with distributed lock', {
        listingId,
        oldPriceCents: listing.price,
        newPriceCents: newPrice,
        markupPercent: `${markupPercent}%`
      });

      // SEARCH SYNC
      await publishSearchSync('listing.updated', {
        id: listingId,
        changes: { price: newPrice }
      });

      return updated;
    });
  }

  async createListing(data: any) {
    const { ticketId, sellerId, walletAddress, eventId, venueId, originalFaceValue } = data;
    const lockKey = LockKeys.ticket(ticketId);

    return await withLock(lockKey, 5000, async () => {
      if (data.price) {
        this.log.warn('Client attempted to set listing price directly', {
          ticketId,
          attemptedPrice: data.price,
          sellerId
        });
      }

      const existingListing = await listingModel.findByTicketId(ticketId);

      if (existingListing && existingListing.status === 'active') {
        throw new Error('Ticket already has an active listing');
      }

      const ticketValueCents = originalFaceValue || await this.getTicketMarketValue(ticketId);

      const listing = await listingModel.create({
        ticketId,
        sellerId,
        eventId,
        venueId,
        price: ticketValueCents,
        originalFaceValue: ticketValueCents,
        walletAddress,
        requiresApproval: false
      });

      this.log.info('Listing created with distributed lock', {
        listingId: listing.id,
        ticketId,
        sellerId,
        priceCents: ticketValueCents
      });

      // SEARCH SYNC
      await publishSearchSync('listing.created', {
        id: listing.id,
        ticketId: listing.ticketId,
        eventId: listing.eventId,
        venueId: listing.venueId,
        price: listing.price,
        status: 'active',
      });

      return listing;
    });
  }

  private async getTicketMarketValue(ticketId: string): Promise<number> {
    return 10000;
  }

  async cancelListing(listingId: string, userId: string) {
    const lockKey = LockKeys.listing(listingId);

    return await withLock(lockKey, 5000, async () => {
      const listing = await listingModel.findById(listingId);

      if (!listing) {
        throw new Error(`Listing not found: ${listingId}`);
      }

      if (listing.sellerId !== userId) {
        throw new Error('Unauthorized: Not the listing owner');
      }

      if (listing.status !== 'active') {
        throw new Error(`Cannot cancel listing with status: ${listing.status}`);
      }

      const updated = await listingModel.updateStatus(listingId, 'cancelled', {
        cancelled_at: new Date()
      });

      this.log.info('Listing cancelled with distributed lock', {
        listingId,
        sellerId: userId
      });

      // SEARCH SYNC
      await publishSearchSync('listing.deleted', {
        id: listingId,
      });

      return updated;
    });
  }

  async getListingById(listingId: string) {
    const listing = await listingModel.findById(listingId);
    if (!listing) {
      throw new Error(`Listing not found: ${listingId}`);
    }

    return listing;
  }

  async searchListings(params: {
    eventId?: string;
    sellerId?: string;
    venueId?: string;
    minPrice?: number;
    maxPrice?: number;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
  }) {
    if (params.sellerId) {
      return await listingModel.findBySellerId(
        params.sellerId,
        params.status || 'active',
        params.limit || 20,
        params.offset || 0
      );
    }

    if (params.eventId) {
      return await listingModel.findByEventId(
        params.eventId,
        params.status || 'active',
        params.limit || 20,
        params.offset || 0
      );
    }

    return [];
  }

  async markListingAsSold(listingId: string, buyerId?: string) {
    const lockKey = LockKeys.listing(listingId);

    return await withLock(lockKey, 5000, async () => {
      const listing = await listingModel.findById(listingId);

      if (!listing) {
        throw new Error(`Listing not found: ${listingId}`);
      }

      if (listing.status !== 'active' && listing.status !== 'pending_approval') {
        throw new Error(`Cannot mark listing as sold. Current status: ${listing.status}`);
      }

      const updated = await listingModel.updateStatus(listingId, 'sold', {
        sold_at: new Date(),
        buyer_id: buyerId || 'unknown'
      });

      if (!updated) {
        throw new Error(`Failed to mark listing as sold: ${listingId}`);
      }

      this.log.info('Listing marked as sold with distributed lock', {
        listingId,
        sellerId: listing.sellerId,
        buyerId: buyerId || 'unknown',
        priceCents: listing.price
      });

      // SEARCH SYNC
      await publishSearchSync('listing.deleted', {
        id: listingId,
      });

      return updated;
    });
  }
}

export const ListingService = ListingServiceClass;
export const listingService = new ListingServiceClass();
