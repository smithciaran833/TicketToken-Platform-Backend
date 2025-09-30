import { logger } from '../utils/logger';

class ListingServiceClass {
  private log = logger.child({ component: 'ListingService' });

  async updateListingPrice(params: {
    listingId: string;
    newPrice: number;  // INTEGER CENTS
    userId: string;
  }) {
    const { listingId, newPrice, userId } = params;

    if (newPrice <= 0) {
      throw new Error('Price must be greater than zero');
    }

    const originalPriceQuery = `
      SELECT l.*, t.ticket_type_id, tt.price_cents as original_price
      FROM listings l
      JOIN tickets t ON l.ticket_id = t.id
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE l.id = $1 AND l.seller_id = $2
    `;

    const maxMarkupPercent = 300;
    const originalPriceCents = 10000; // $100 in cents
    const maxAllowedPriceCents = Math.floor(originalPriceCents * (1 + maxMarkupPercent / 100));

    if (newPrice > maxAllowedPriceCents) {
      throw new Error(`Price cannot exceed ${maxMarkupPercent}% markup. Maximum allowed: $${maxAllowedPriceCents / 100}`);
    }

    // Calculate markup percentage (no decimals needed for logging)
    const markupPercent = Math.floor(((newPrice - originalPriceCents) / originalPriceCents) * 10000) / 100;

    this.log.info('Listing price updated', {
      listingId,
      oldPriceCents: originalPriceCents,
      newPriceCents: newPrice,
      markupPercent: `${markupPercent}%`
    });

    return {
      id: listingId,
      price: newPrice,
      status: 'active'
    };
  }

  async createListing(data: any) {
    const { ticketId, sellerId, walletAddress } = data;

    if (data.price) {
      this.log.warn('Client attempted to set listing price directly', {
        ticketId,
        attemptedPrice: data.price,
        sellerId
      });
    }

    const ticketValueCents = await this.getTicketMarketValue(ticketId);

    return {
      id: `listing_${Date.now()}`,
      ticketId,
      sellerId,
      price: ticketValueCents,
      walletAddress,
      status: 'active',
      createdAt: new Date()
    };
  }

  private async getTicketMarketValue(ticketId: string): Promise<number> {
    return 10000; // $100 in cents
  }

  async cancelListing(listingId: string, userId: string) {
    return {
      id: listingId,
      status: 'cancelled'
    };
  }

  async getListingById(listingId: string) {
    const { listingModel } = await import('../models/listing.model');

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
    const { listingModel } = await import('../models/listing.model');

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
    const { listingModel } = await import('../models/listing.model');

    const listing = await listingModel.updateStatus(listingId, 'sold', {
      sold_at: new Date(),
      buyer_id: buyerId || 'unknown'
    });

    if (!listing) {
      throw new Error(`Failed to mark listing as sold: ${listingId}`);
    }

    this.log.info('Listing marked as sold', {
      listingId,
      sellerId: listing.sellerId,
      buyerId: buyerId || 'unknown',
      priceCents: listing.price
    });

    return listing;
  }
}

export const ListingService = ListingServiceClass;
export const listingService = new ListingServiceClass();
