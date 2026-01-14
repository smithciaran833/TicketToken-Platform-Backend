/**
 * Unit Tests for Listing Service
 * Tests marketplace listing creation, update, and cancellation
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    })),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock shared library
const mockWithLock = jest.fn();
const mockPublishSearchSync = jest.fn();
jest.mock('@tickettoken/shared', () => ({
  withLock: mockWithLock,
  LockKeys: {
    listing: (id: string) => `lock:listing:${id}`,
    ticket: (id: string) => `lock:ticket:${id}`
  },
  publishSearchSync: mockPublishSearchSync
}));

// Mock listing model
const mockListingModel = {
  findById: jest.fn(),
  findByTicketId: jest.fn(),
  findBySellerId: jest.fn(),
  findByEventId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn()
};

jest.mock('../../../src/models/listing.model', () => ({
  listingModel: mockListingModel
}));

import { listingService, ListingService } from '../../../src/services/listing.service';

describe('ListingService', () => {
  const mockListing = {
    id: 'listing-123',
    ticketId: 'ticket-456',
    sellerId: 'user-789',
    eventId: 'event-111',
    venueId: 'venue-222',
    price: 10000,  // $100.00
    originalFaceValue: 5000,  // $50.00
    status: 'active',
    walletAddress: 'wallet123abc'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Make withLock execute the callback function
    mockWithLock.mockImplementation(async (key, timeout, callback) => {
      return await callback();
    });
  });

  describe('createListing', () => {
    it('should create listing with distributed lock', async () => {
      mockListingModel.findByTicketId.mockResolvedValue(null);
      mockListingModel.create.mockResolvedValue(mockListing);
      mockPublishSearchSync.mockResolvedValue(undefined);

      const result = await listingService.createListing({
        ticketId: 'ticket-456',
        sellerId: 'user-789',
        eventId: 'event-111',
        venueId: 'venue-222',
        walletAddress: 'wallet123abc',
        originalFaceValue: 5000
      });

      expect(mockWithLock).toHaveBeenCalledWith(
        'lock:ticket:ticket-456',
        5000,
        expect.any(Function)
      );
      expect(mockListingModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'ticket-456',
          sellerId: 'user-789',
          price: 5000,
          originalFaceValue: 5000
        })
      );
      expect(result.id).toBe('listing-123');
    });

    it('should reject if ticket already has active listing', async () => {
      mockListingModel.findByTicketId.mockResolvedValue({
        ...mockListing,
        status: 'active'
      });

      await expect(listingService.createListing({
        ticketId: 'ticket-456',
        sellerId: 'user-789',
        eventId: 'event-111',
        venueId: 'venue-222',
        walletAddress: 'wallet123abc',
        originalFaceValue: 5000
      })).rejects.toThrow('Ticket already has an active listing');
    });

    it('should set price from original face value', async () => {
      mockListingModel.findByTicketId.mockResolvedValue(null);
      mockListingModel.create.mockResolvedValue(mockListing);

      await listingService.createListing({
        ticketId: 'ticket-456',
        sellerId: 'user-789',
        eventId: 'event-111',
        venueId: 'venue-222',
        walletAddress: 'wallet123abc',
        originalFaceValue: 7500
      });

      expect(mockListingModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 7500,
          originalFaceValue: 7500
        })
      );
    });

    it('should warn if client attempts to set price directly', async () => {
      mockListingModel.findByTicketId.mockResolvedValue(null);
      mockListingModel.create.mockResolvedValue(mockListing);

      await listingService.createListing({
        ticketId: 'ticket-456',
        sellerId: 'user-789',
        eventId: 'event-111',
        venueId: 'venue-222',
        walletAddress: 'wallet123abc',
        originalFaceValue: 5000,
        price: 15000  // Attempting to set price directly
      });

      // The price should still come from originalFaceValue
      expect(mockListingModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 5000
        })
      );
    });

    it('should publish search sync event on creation', async () => {
      mockListingModel.findByTicketId.mockResolvedValue(null);
      mockListingModel.create.mockResolvedValue(mockListing);

      await listingService.createListing({
        ticketId: 'ticket-456',
        sellerId: 'user-789',
        eventId: 'event-111',
        venueId: 'venue-222',
        walletAddress: 'wallet123abc',
        originalFaceValue: 5000
      });

      expect(mockPublishSearchSync).toHaveBeenCalledWith('listing.created', expect.objectContaining({
        id: 'listing-123',
        ticketId: 'ticket-456'
      }));
    });

    it('should allow creation when existing listing is not active', async () => {
      mockListingModel.findByTicketId.mockResolvedValue({
        ...mockListing,
        status: 'cancelled'
      });
      mockListingModel.create.mockResolvedValue(mockListing);

      const result = await listingService.createListing({
        ticketId: 'ticket-456',
        sellerId: 'user-789',
        eventId: 'event-111',
        venueId: 'venue-222',
        walletAddress: 'wallet123abc',
        originalFaceValue: 5000
      });

      expect(result).toBeDefined();
    });
  });

  describe('updateListingPrice', () => {
    it('should update price with distributed lock', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockListingModel.update.mockResolvedValue({ ...mockListing, price: 7500 });

      const result = await listingService.updateListingPrice({
        listingId: 'listing-123',
        newPrice: 7500,
        userId: 'user-789'
      });

      expect(mockWithLock).toHaveBeenCalledWith(
        'lock:listing:listing-123',
        5000,
        expect.any(Function)
      );
      expect(mockListingModel.update).toHaveBeenCalledWith('listing-123', { price: 7500 });
      expect(result.price).toBe(7500);
    });

    it('should reject price <= 0', async () => {
      await expect(listingService.updateListingPrice({
        listingId: 'listing-123',
        newPrice: 0,
        userId: 'user-789'
      })).rejects.toThrow('Price must be greater than zero');

      await expect(listingService.updateListingPrice({
        listingId: 'listing-123',
        newPrice: -100,
        userId: 'user-789'
      })).rejects.toThrow('Price must be greater than zero');
    });

    it('should reject if listing not found', async () => {
      mockListingModel.findById.mockResolvedValue(null);

      await expect(listingService.updateListingPrice({
        listingId: 'nonexistent',
        newPrice: 7500,
        userId: 'user-789'
      })).rejects.toThrow('Listing not found: nonexistent');
    });

    it('should reject if user is not the owner', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);

      await expect(listingService.updateListingPrice({
        listingId: 'listing-123',
        newPrice: 7500,
        userId: 'other-user'
      })).rejects.toThrow('Unauthorized: Not the listing owner');
    });

    it('should reject if listing status is not active', async () => {
      mockListingModel.findById.mockResolvedValue({
        ...mockListing,
        status: 'sold'
      });

      await expect(listingService.updateListingPrice({
        listingId: 'listing-123',
        newPrice: 7500,
        userId: 'user-789'
      })).rejects.toThrow('Cannot update price for listing with status: sold');
    });

    it('should enforce max 300% markup limit', async () => {
      mockListingModel.findById.mockResolvedValue({
        ...mockListing,
        originalFaceValue: 5000  // $50.00
      });

      // 300% markup on $50 = $50 * 4 = $200 = 20000 cents max
      await expect(listingService.updateListingPrice({
        listingId: 'listing-123',
        newPrice: 25000,  // $250.00 - exceeds 300% markup
        userId: 'user-789'
      })).rejects.toThrow(/Price cannot exceed 300% markup/);
    });

    it('should allow price at max markup limit', async () => {
      mockListingModel.findById.mockResolvedValue({
        ...mockListing,
        originalFaceValue: 5000  // $50.00
      });
      mockListingModel.update.mockResolvedValue({ ...mockListing, price: 20000 });

      // 300% markup on $50 = $50 * 4 = $200 = 20000 cents exactly
      const result = await listingService.updateListingPrice({
        listingId: 'listing-123',
        newPrice: 20000,  // $200.00 - exactly at 300% markup
        userId: 'user-789'
      });

      expect(result).toBeDefined();
    });

    it('should publish search sync event on update', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockListingModel.update.mockResolvedValue({ ...mockListing, price: 7500 });

      await listingService.updateListingPrice({
        listingId: 'listing-123',
        newPrice: 7500,
        userId: 'user-789'
      });

      expect(mockPublishSearchSync).toHaveBeenCalledWith('listing.updated', {
        id: 'listing-123',
        changes: { price: 7500 }
      });
    });
  });

  describe('cancelListing', () => {
    it('should cancel listing with distributed lock', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockListingModel.updateStatus.mockResolvedValue({ ...mockListing, status: 'cancelled' });

      const result = await listingService.cancelListing('listing-123', 'user-789');

      expect(mockWithLock).toHaveBeenCalledWith(
        'lock:listing:listing-123',
        5000,
        expect.any(Function)
      );
      expect(mockListingModel.updateStatus).toHaveBeenCalledWith('listing-123', 'cancelled', expect.objectContaining({
        cancelled_at: expect.any(Date)
      }));
      expect(result.status).toBe('cancelled');
    });

    it('should reject if listing not found', async () => {
      mockListingModel.findById.mockResolvedValue(null);

      await expect(listingService.cancelListing('nonexistent', 'user-789'))
        .rejects.toThrow('Listing not found: nonexistent');
    });

    it('should reject if user is not the owner', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);

      await expect(listingService.cancelListing('listing-123', 'other-user'))
        .rejects.toThrow('Unauthorized: Not the listing owner');
    });

    it('should reject if listing status is not active', async () => {
      mockListingModel.findById.mockResolvedValue({
        ...mockListing,
        status: 'sold'
      });

      await expect(listingService.cancelListing('listing-123', 'user-789'))
        .rejects.toThrow('Cannot cancel listing with status: sold');
    });

    it('should publish search sync deletion event', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockListingModel.updateStatus.mockResolvedValue({ ...mockListing, status: 'cancelled' });

      await listingService.cancelListing('listing-123', 'user-789');

      expect(mockPublishSearchSync).toHaveBeenCalledWith('listing.deleted', {
        id: 'listing-123'
      });
    });
  });

  describe('getListingById', () => {
    it('should return listing by ID', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);

      const result = await listingService.getListingById('listing-123');

      expect(mockListingModel.findById).toHaveBeenCalledWith('listing-123');
      expect(result).toEqual(mockListing);
    });

    it('should throw error if not found', async () => {
      mockListingModel.findById.mockResolvedValue(null);

      await expect(listingService.getListingById('nonexistent'))
        .rejects.toThrow('Listing not found: nonexistent');
    });
  });

  describe('searchListings', () => {
    it('should search by seller ID', async () => {
      const listings = [mockListing, { ...mockListing, id: 'listing-124' }];
      mockListingModel.findBySellerId.mockResolvedValue(listings);

      const result = await listingService.searchListings({ sellerId: 'user-789' });

      expect(mockListingModel.findBySellerId).toHaveBeenCalledWith(
        'user-789',
        'active',
        20,
        0
      );
      expect(result).toHaveLength(2);
    });

    it('should search by event ID', async () => {
      const listings = [mockListing];
      mockListingModel.findByEventId.mockResolvedValue(listings);

      const result = await listingService.searchListings({ eventId: 'event-111' });

      expect(mockListingModel.findByEventId).toHaveBeenCalledWith(
        'event-111',
        'active',
        20,
        0
      );
      expect(result).toHaveLength(1);
    });

    it('should apply pagination', async () => {
      mockListingModel.findBySellerId.mockResolvedValue([]);

      await listingService.searchListings({
        sellerId: 'user-789',
        limit: 50,
        offset: 100
      });

      expect(mockListingModel.findBySellerId).toHaveBeenCalledWith(
        'user-789',
        'active',
        50,
        100
      );
    });

    it('should filter by status', async () => {
      mockListingModel.findBySellerId.mockResolvedValue([]);

      await listingService.searchListings({
        sellerId: 'user-789',
        status: 'sold'
      });

      expect(mockListingModel.findBySellerId).toHaveBeenCalledWith(
        'user-789',
        'sold',
        20,
        0
      );
    });

    it('should return empty array when no filter provided', async () => {
      const result = await listingService.searchListings({});

      expect(result).toEqual([]);
    });
  });

  describe('markListingAsSold', () => {
    it('should mark listing as sold with distributed lock', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockListingModel.updateStatus.mockResolvedValue({ ...mockListing, status: 'sold' });

      const result = await listingService.markListingAsSold('listing-123', 'buyer-999');

      expect(mockWithLock).toHaveBeenCalledWith(
        'lock:listing:listing-123',
        5000,
        expect.any(Function)
      );
      expect(mockListingModel.updateStatus).toHaveBeenCalledWith('listing-123', 'sold', expect.objectContaining({
        sold_at: expect.any(Date),
        buyer_id: 'buyer-999'
      }));
      expect(result.status).toBe('sold');
    });

    it('should reject if listing not found', async () => {
      mockListingModel.findById.mockResolvedValue(null);

      await expect(listingService.markListingAsSold('nonexistent', 'buyer-999'))
        .rejects.toThrow('Listing not found: nonexistent');
    });

    it('should reject if status is not active or pending_approval', async () => {
      mockListingModel.findById.mockResolvedValue({
        ...mockListing,
        status: 'cancelled'
      });

      await expect(listingService.markListingAsSold('listing-123', 'buyer-999'))
        .rejects.toThrow('Cannot mark listing as sold. Current status: cancelled');
    });

    it('should allow marking pending_approval as sold', async () => {
      mockListingModel.findById.mockResolvedValue({
        ...mockListing,
        status: 'pending_approval'
      });
      mockListingModel.updateStatus.mockResolvedValue({ ...mockListing, status: 'sold' });

      const result = await listingService.markListingAsSold('listing-123', 'buyer-999');

      expect(result.status).toBe('sold');
    });

    it('should record buyer ID', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockListingModel.updateStatus.mockResolvedValue({ ...mockListing, status: 'sold' });

      await listingService.markListingAsSold('listing-123', 'buyer-999');

      expect(mockListingModel.updateStatus).toHaveBeenCalledWith('listing-123', 'sold', expect.objectContaining({
        buyer_id: 'buyer-999'
      }));
    });

    it('should use unknown if no buyer ID provided', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockListingModel.updateStatus.mockResolvedValue({ ...mockListing, status: 'sold' });

      await listingService.markListingAsSold('listing-123');

      expect(mockListingModel.updateStatus).toHaveBeenCalledWith('listing-123', 'sold', expect.objectContaining({
        buyer_id: 'unknown'
      }));
    });

    it('should publish search sync deletion event', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockListingModel.updateStatus.mockResolvedValue({ ...mockListing, status: 'sold' });

      await listingService.markListingAsSold('listing-123', 'buyer-999');

      expect(mockPublishSearchSync).toHaveBeenCalledWith('listing.deleted', {
        id: 'listing-123'
      });
    });

    it('should throw if update fails', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockListingModel.updateStatus.mockResolvedValue(null);

      await expect(listingService.markListingAsSold('listing-123', 'buyer-999'))
        .rejects.toThrow('Failed to mark listing as sold: listing-123');
    });
  });

  describe('ListingService class export', () => {
    it('should export singleton instance', () => {
      expect(listingService).toBeDefined();
    });

    it('should export class constructor', () => {
      expect(ListingService).toBeDefined();
      const instance = new ListingService();
      expect(instance).toBeDefined();
    });
  });
});
