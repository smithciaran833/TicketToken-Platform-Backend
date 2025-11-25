// =============================================================================
// TEST SUITE: marketplace.types
// =============================================================================

import {
  ResaleListing,
  ListingStatus,
  EscrowTransaction,
  EscrowStatus,
  ReleaseCondition,
} from '../../../src/types/marketplace.types';

describe('marketplace.types', () => {
  // ===========================================================================
  // ResaleListing Interface - 5 test cases
  // ===========================================================================

  describe('ResaleListing Interface', () => {
    it('should allow valid ResaleListing object', () => {
      const listing: ResaleListing = {
        id: 'listing-123',
        ticketId: 'ticket-456',
        sellerId: 'user-789',
        price: 15000,
        originalPrice: 10000,
        venueRoyaltyPercentage: 10,
        status: ListingStatus.ACTIVE,
        createdAt: new Date(),
      };

      expect(listing.id).toBe('listing-123');
      expect(listing.ticketId).toBe('ticket-456');
      expect(listing.sellerId).toBe('user-789');
      expect(listing.price).toBe(15000);
      expect(listing.originalPrice).toBe(10000);
      expect(listing.venueRoyaltyPercentage).toBe(10);
      expect(listing.status).toBe(ListingStatus.ACTIVE);
      expect(listing.createdAt).toBeInstanceOf(Date);
    });

    it('should allow price higher than original price', () => {
      const listing: ResaleListing = {
        id: 'listing-1',
        ticketId: 'ticket-1',
        sellerId: 'user-1',
        price: 20000,
        originalPrice: 10000,
        venueRoyaltyPercentage: 10,
        status: ListingStatus.ACTIVE,
        createdAt: new Date(),
      };

      expect(listing.price).toBeGreaterThan(listing.originalPrice);
    });

    it('should allow price lower than original price', () => {
      const listing: ResaleListing = {
        id: 'listing-2',
        ticketId: 'ticket-2',
        sellerId: 'user-2',
        price: 5000,
        originalPrice: 10000,
        venueRoyaltyPercentage: 10,
        status: ListingStatus.ACTIVE,
        createdAt: new Date(),
      };

      expect(listing.price).toBeLessThan(listing.originalPrice);
    });

    it('should allow different listing statuses', () => {
      const statuses: ListingStatus[] = [
        ListingStatus.ACTIVE,
        ListingStatus.PENDING,
        ListingStatus.SOLD,
        ListingStatus.CANCELLED,
        ListingStatus.EXPIRED,
      ];

      statuses.forEach(status => {
        const listing: ResaleListing = {
          id: 'listing-1',
          ticketId: 'ticket-1',
          sellerId: 'user-1',
          price: 10000,
          originalPrice: 10000,
          venueRoyaltyPercentage: 10,
          status,
          createdAt: new Date(),
        };

        expect(listing.status).toBe(status);
      });
    });

    it('should allow different royalty percentages', () => {
      const listing: ResaleListing = {
        id: 'listing-1',
        ticketId: 'ticket-1',
        sellerId: 'user-1',
        price: 10000,
        originalPrice: 10000,
        venueRoyaltyPercentage: 15.5,
        status: ListingStatus.ACTIVE,
        createdAt: new Date(),
      };

      expect(listing.venueRoyaltyPercentage).toBe(15.5);
    });
  });

  // ===========================================================================
  // ListingStatus Enum - 5 test cases
  // ===========================================================================

  describe('ListingStatus Enum', () => {
    it('should have ACTIVE status', () => {
      expect(ListingStatus.ACTIVE).toBe('active');
    });

    it('should have PENDING status', () => {
      expect(ListingStatus.PENDING).toBe('pending');
    });

    it('should have SOLD status', () => {
      expect(ListingStatus.SOLD).toBe('sold');
    });

    it('should have CANCELLED status', () => {
      expect(ListingStatus.CANCELLED).toBe('cancelled');
    });

    it('should have EXPIRED status', () => {
      expect(ListingStatus.EXPIRED).toBe('expired');
    });
  });

  // ===========================================================================
  // EscrowTransaction Interface - 5 test cases
  // ===========================================================================

  describe('EscrowTransaction Interface', () => {
    it('should allow valid EscrowTransaction object', () => {
      const transaction: EscrowTransaction = {
        id: 'escrow-123',
        listingId: 'listing-456',
        buyerId: 'buyer-789',
        sellerId: 'seller-012',
        amount: 15000,
        sellerPayout: 13500,
        venueRoyalty: 1000,
        platformFee: 500,
        status: EscrowStatus.FUNDED,
        releaseConditions: [],
      };

      expect(transaction.id).toBe('escrow-123');
      expect(transaction.listingId).toBe('listing-456');
      expect(transaction.buyerId).toBe('buyer-789');
      expect(transaction.sellerId).toBe('seller-012');
      expect(transaction.amount).toBe(15000);
      expect(transaction.sellerPayout).toBe(13500);
      expect(transaction.venueRoyalty).toBe(1000);
      expect(transaction.platformFee).toBe(500);
      expect(transaction.status).toBe(EscrowStatus.FUNDED);
    });

    it('should allow EscrowTransaction with release conditions', () => {
      const conditions: ReleaseCondition[] = [
        {
          type: 'nft_transferred',
          satisfied: true,
          satisfiedAt: new Date(),
        },
        {
          type: 'event_completed',
          satisfied: false,
        },
      ];

      const transaction: EscrowTransaction = {
        id: 'escrow-123',
        listingId: 'listing-456',
        buyerId: 'buyer-789',
        sellerId: 'seller-012',
        amount: 15000,
        sellerPayout: 13500,
        venueRoyalty: 1000,
        platformFee: 500,
        status: EscrowStatus.CREATED,
        releaseConditions: conditions,
      };

      expect(transaction.releaseConditions).toHaveLength(2);
    });

    it('should allow different escrow statuses', () => {
      const statuses: EscrowStatus[] = [
        EscrowStatus.CREATED,
        EscrowStatus.FUNDED,
        EscrowStatus.RELEASED,
        EscrowStatus.REFUNDED,
        EscrowStatus.DISPUTED,
      ];

      statuses.forEach(status => {
        const transaction: EscrowTransaction = {
          id: 'escrow-1',
          listingId: 'listing-1',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
          amount: 10000,
          sellerPayout: 9000,
          venueRoyalty: 500,
          platformFee: 500,
          status,
          releaseConditions: [],
        };

        expect(transaction.status).toBe(status);
      });
    });

    it('should have amounts that sum correctly', () => {
      const transaction: EscrowTransaction = {
        id: 'escrow-1',
        listingId: 'listing-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        amount: 10000,
        sellerPayout: 8500,
        venueRoyalty: 1000,
        platformFee: 500,
        status: EscrowStatus.FUNDED,
        releaseConditions: [],
      };

      const total = transaction.sellerPayout + transaction.venueRoyalty + transaction.platformFee;
      expect(total).toBe(transaction.amount);
    });

    it('should allow empty release conditions array', () => {
      const transaction: EscrowTransaction = {
        id: 'escrow-1',
        listingId: 'listing-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        amount: 10000,
        sellerPayout: 9000,
        venueRoyalty: 500,
        platformFee: 500,
        status: EscrowStatus.CREATED,
        releaseConditions: [],
      };

      expect(transaction.releaseConditions).toEqual([]);
    });
  });

  // ===========================================================================
  // EscrowStatus Enum - 5 test cases
  // ===========================================================================

  describe('EscrowStatus Enum', () => {
    it('should have CREATED status', () => {
      expect(EscrowStatus.CREATED).toBe('created');
    });

    it('should have FUNDED status', () => {
      expect(EscrowStatus.FUNDED).toBe('funded');
    });

    it('should have RELEASED status', () => {
      expect(EscrowStatus.RELEASED).toBe('released');
    });

    it('should have REFUNDED status', () => {
      expect(EscrowStatus.REFUNDED).toBe('refunded');
    });

    it('should have DISPUTED status', () => {
      expect(EscrowStatus.DISPUTED).toBe('disputed');
    });
  });

  // ===========================================================================
  // ReleaseCondition Interface - 6 test cases
  // ===========================================================================

  describe('ReleaseCondition Interface', () => {
    it('should allow nft_transferred condition', () => {
      const condition: ReleaseCondition = {
        type: 'nft_transferred',
        satisfied: true,
        satisfiedAt: new Date(),
      };

      expect(condition.type).toBe('nft_transferred');
    });

    it('should allow event_completed condition', () => {
      const condition: ReleaseCondition = {
        type: 'event_completed',
        satisfied: false,
      };

      expect(condition.type).toBe('event_completed');
    });

    it('should allow manual_approval condition', () => {
      const condition: ReleaseCondition = {
        type: 'manual_approval',
        satisfied: true,
        satisfiedAt: new Date(),
      };

      expect(condition.type).toBe('manual_approval');
    });

    it('should track satisfaction status', () => {
      const satisfiedCondition: ReleaseCondition = {
        type: 'nft_transferred',
        satisfied: true,
        satisfiedAt: new Date(),
      };

      const unsatisfiedCondition: ReleaseCondition = {
        type: 'event_completed',
        satisfied: false,
      };

      expect(satisfiedCondition.satisfied).toBe(true);
      expect(unsatisfiedCondition.satisfied).toBe(false);
    });

    it('should allow optional satisfiedAt timestamp', () => {
      const withTimestamp: ReleaseCondition = {
        type: 'nft_transferred',
        satisfied: true,
        satisfiedAt: new Date(),
      };

      const withoutTimestamp: ReleaseCondition = {
        type: 'event_completed',
        satisfied: false,
      };

      expect(withTimestamp.satisfiedAt).toBeInstanceOf(Date);
      expect(withoutTimestamp.satisfiedAt).toBeUndefined();
    });

    it('should only have satisfiedAt when satisfied is true', () => {
      const condition: ReleaseCondition = {
        type: 'manual_approval',
        satisfied: true,
        satisfiedAt: new Date(),
      };

      expect(condition.satisfied).toBe(true);
      expect(condition.satisfiedAt).toBeDefined();
    });
  });
});
