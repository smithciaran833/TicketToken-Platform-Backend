/**
 * Unit Tests for Event Types
 * Tests marketplace event type definitions
 */

import { MarketplaceEvents, MarketplaceEvent } from '../../../src/events/event-types';

describe('MarketplaceEvents Enum', () => {
  it('should have all listing events', () => {
    expect(MarketplaceEvents.LISTING_CREATED).toBe('marketplace.listing.created');
    expect(MarketplaceEvents.LISTING_UPDATED).toBe('marketplace.listing.updated');
    expect(MarketplaceEvents.LISTING_SOLD).toBe('marketplace.listing.sold');
    expect(MarketplaceEvents.LISTING_CANCELLED).toBe('marketplace.listing.cancelled');
    expect(MarketplaceEvents.LISTING_EXPIRED).toBe('marketplace.listing.expired');
  });

  it('should have all transfer events', () => {
    expect(MarketplaceEvents.TRANSFER_INITIATED).toBe('marketplace.transfer.initiated');
    expect(MarketplaceEvents.TRANSFER_COMPLETED).toBe('marketplace.transfer.completed');
    expect(MarketplaceEvents.TRANSFER_FAILED).toBe('marketplace.transfer.failed');
  });

  it('should have all dispute events', () => {
    expect(MarketplaceEvents.DISPUTE_CREATED).toBe('marketplace.dispute.created');
    expect(MarketplaceEvents.DISPUTE_RESOLVED).toBe('marketplace.dispute.resolved');
  });

  it('should have price change event', () => {
    expect(MarketplaceEvents.PRICE_CHANGED).toBe('marketplace.price.changed');
  });

  it('should have unique values for all events', () => {
    const values = Object.values(MarketplaceEvents);
    const uniqueValues = new Set(values);
    expect(values.length).toBe(uniqueValues.size);
  });

  it('should follow naming convention', () => {
    Object.values(MarketplaceEvents).forEach(value => {
      expect(value).toMatch(/^marketplace\.[a-z]+\.[a-z]+$/);
    });
  });
});

describe('MarketplaceEvent Interface', () => {
  it('should be constructable with required fields', () => {
    const event: MarketplaceEvent<{ listingId: string }> = {
      type: MarketplaceEvents.LISTING_CREATED,
      timestamp: new Date(),
      payload: { listingId: 'test-123' },
    };

    expect(event.type).toBe(MarketplaceEvents.LISTING_CREATED);
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.payload.listingId).toBe('test-123');
  });

  it('should support optional metadata', () => {
    const event: MarketplaceEvent = {
      type: MarketplaceEvents.LISTING_SOLD,
      timestamp: new Date(),
      payload: { listingId: 'test-123', buyerId: 'buyer-456' },
      metadata: {
        correlationId: 'corr-789',
        source: 'marketplace-service',
      },
    };

    expect(event.metadata).toBeDefined();
    expect(event.metadata?.correlationId).toBe('corr-789');
  });

  it('should support generic payload types', () => {
    interface TransferPayload {
      transferId: string;
      sellerId: string;
      buyerId: string;
      amount: number;
    }

    const event: MarketplaceEvent<TransferPayload> = {
      type: MarketplaceEvents.TRANSFER_COMPLETED,
      timestamp: new Date(),
      payload: {
        transferId: 'transfer-123',
        sellerId: 'seller-456',
        buyerId: 'buyer-789',
        amount: 10000,
      },
    };

    expect(event.payload.transferId).toBe('transfer-123');
    expect(event.payload.amount).toBe(10000);
  });

  it('should work with empty payload', () => {
    const event: MarketplaceEvent<Record<string, never>> = {
      type: MarketplaceEvents.LISTING_EXPIRED,
      timestamp: new Date(),
      payload: {},
    };

    expect(event.payload).toEqual({});
  });
});
