/**
 * Unit Tests for Event Publishers
 * Tests marketplace event publishing with EventEmitter
 */

import { eventPublisher } from '../../../src/events/publishers';
import { MarketplaceEvents } from '../../../src/events/event-types';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('EventPublisher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Remove all listeners to prevent test interference
    eventPublisher.removeAllListeners();
  });

  describe('publishEvent', () => {
    it('should emit event with correct type and payload', async () => {
      const listener = jest.fn();
      eventPublisher.on(MarketplaceEvents.LISTING_CREATED, listener);

      await eventPublisher.publishEvent(MarketplaceEvents.LISTING_CREATED, {
        listingId: 'listing-123',
        sellerId: 'seller-456',
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.type).toBe(MarketplaceEvents.LISTING_CREATED);
      expect(event.payload.listingId).toBe('listing-123');
      expect(event.payload.sellerId).toBe('seller-456');
    });

    it('should include timestamp in event', async () => {
      const listener = jest.fn();
      eventPublisher.on(MarketplaceEvents.LISTING_UPDATED, listener);

      await eventPublisher.publishEvent(MarketplaceEvents.LISTING_UPDATED, {});

      const event = listener.mock.calls[0][0];
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should include optional metadata', async () => {
      const listener = jest.fn();
      eventPublisher.on(MarketplaceEvents.LISTING_SOLD, listener);

      await eventPublisher.publishEvent(
        MarketplaceEvents.LISTING_SOLD,
        { listingId: 'listing-123' },
        { correlationId: 'corr-789', source: 'test' }
      );

      const event = listener.mock.calls[0][0];
      expect(event.metadata).toEqual({
        correlationId: 'corr-789',
        source: 'test',
      });
    });

    it('should log successful publish', async () => {
      const { logger } = require('../../../src/utils/logger');

      await eventPublisher.publishEvent(MarketplaceEvents.TRANSFER_COMPLETED, {});

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Event published')
      );
    });

    it('should handle errors gracefully', async () => {
      const { logger } = require('../../../src/utils/logger');
      
      // Add a listener that throws
      eventPublisher.on(MarketplaceEvents.TRANSFER_FAILED, () => {
        throw new Error('Listener error');
      });

      // Should not throw
      await eventPublisher.publishEvent(MarketplaceEvents.TRANSFER_FAILED, {});

      expect(logger.error).toHaveBeenCalled();
    });

    it('should work with no listeners', async () => {
      // No listeners attached
      await expect(
        eventPublisher.publishEvent(MarketplaceEvents.DISPUTE_CREATED, {})
      ).resolves.not.toThrow();
    });
  });

  describe('publishListingCreated', () => {
    it('should publish LISTING_CREATED event', async () => {
      const listener = jest.fn();
      eventPublisher.on(MarketplaceEvents.LISTING_CREATED, listener);

      const listing = {
        id: 'listing-123',
        ticket_id: 'ticket-456',
        seller_id: 'seller-789',
        price: 5000,
      };

      await eventPublisher.publishListingCreated(listing);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.type).toBe(MarketplaceEvents.LISTING_CREATED);
      expect(event.payload).toEqual(listing);
    });
  });

  describe('publishListingSold', () => {
    it('should publish LISTING_SOLD event with buyer ID', async () => {
      const listener = jest.fn();
      eventPublisher.on(MarketplaceEvents.LISTING_SOLD, listener);

      const listing = {
        id: 'listing-123',
        ticket_id: 'ticket-456',
        seller_id: 'seller-789',
        price: 5000,
      };

      await eventPublisher.publishListingSold(listing, 'buyer-abc');

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.type).toBe(MarketplaceEvents.LISTING_SOLD);
      expect(event.payload.id).toBe('listing-123');
      expect(event.payload.buyer_id).toBe('buyer-abc');
    });

    it('should merge buyer_id with existing listing data', async () => {
      const listener = jest.fn();
      eventPublisher.on(MarketplaceEvents.LISTING_SOLD, listener);

      const listing = {
        id: 'listing-123',
        price: 10000,
        seller_id: 'seller-456',
      };

      await eventPublisher.publishListingSold(listing, 'buyer-789');

      const event = listener.mock.calls[0][0];
      expect(event.payload).toEqual({
        id: 'listing-123',
        price: 10000,
        seller_id: 'seller-456',
        buyer_id: 'buyer-789',
      });
    });
  });

  describe('EventEmitter behavior', () => {
    it('should support multiple listeners for same event', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventPublisher.on(MarketplaceEvents.PRICE_CHANGED, listener1);
      eventPublisher.on(MarketplaceEvents.PRICE_CHANGED, listener2);

      await eventPublisher.publishEvent(MarketplaceEvents.PRICE_CHANGED, {
        oldPrice: 100,
        newPrice: 150,
      });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should support removing listeners', async () => {
      const listener = jest.fn();

      eventPublisher.on(MarketplaceEvents.LISTING_CANCELLED, listener);
      eventPublisher.off(MarketplaceEvents.LISTING_CANCELLED, listener);

      await eventPublisher.publishEvent(MarketplaceEvents.LISTING_CANCELLED, {});

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support once listeners', async () => {
      const listener = jest.fn();

      eventPublisher.once(MarketplaceEvents.LISTING_EXPIRED, listener);

      await eventPublisher.publishEvent(MarketplaceEvents.LISTING_EXPIRED, {});
      await eventPublisher.publishEvent(MarketplaceEvents.LISTING_EXPIRED, {});

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});

describe('eventPublisher singleton', () => {
  it('should be exported as singleton', () => {
    expect(eventPublisher).toBeDefined();
  });

  it('should have publishEvent method', () => {
    expect(typeof eventPublisher.publishEvent).toBe('function');
  });

  it('should have publishListingCreated method', () => {
    expect(typeof eventPublisher.publishListingCreated).toBe('function');
  });

  it('should have publishListingSold method', () => {
    expect(typeof eventPublisher.publishListingSold).toBe('function');
  });

  it('should extend EventEmitter', () => {
    expect(typeof eventPublisher.on).toBe('function');
    expect(typeof eventPublisher.emit).toBe('function');
    expect(typeof eventPublisher.off).toBe('function');
    expect(typeof eventPublisher.removeAllListeners).toBe('function');
  });
});
