export enum MarketplaceEvents {
  LISTING_CREATED = 'marketplace.listing.created',
  LISTING_UPDATED = 'marketplace.listing.updated',
  LISTING_SOLD = 'marketplace.listing.sold',
  LISTING_CANCELLED = 'marketplace.listing.cancelled',
  LISTING_EXPIRED = 'marketplace.listing.expired',
  TRANSFER_INITIATED = 'marketplace.transfer.initiated',
  TRANSFER_COMPLETED = 'marketplace.transfer.completed',
  TRANSFER_FAILED = 'marketplace.transfer.failed',
  DISPUTE_CREATED = 'marketplace.dispute.created',
  DISPUTE_RESOLVED = 'marketplace.dispute.resolved',
  PRICE_CHANGED = 'marketplace.price.changed'
}

export interface MarketplaceEvent<T = any> {
  type: MarketplaceEvents;
  timestamp: Date;
  payload: T;
  metadata?: Record<string, any>;
}
