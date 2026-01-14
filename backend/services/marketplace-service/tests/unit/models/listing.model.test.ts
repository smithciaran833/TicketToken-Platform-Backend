/**
 * Unit Tests for Listing Model
 * Tests marketplace listing database operations
 */

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123')
}));

// Mock database
const mockDb = jest.fn();
const mockDbChain = {
  insert: jest.fn().mockReturnThis(),
  returning: jest.fn(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  increment: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis()
};

jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => mockDbChain)
}));

import { ListingModel, listingModel, CreateListingInput } from '../../../src/models/listing.model';

describe('ListingModel', () => {
  const mockListingRow = {
    id: 'listing-123',
    ticket_id: 'ticket-456',
    seller_id: 'seller-789',
    event_id: 'event-111',
    venue_id: 'venue-222',
    price: 5000,
    original_face_value: 4000,
    price_multiplier: 1.25,
    status: 'active',
    listed_at: new Date('2024-01-01'),
    sold_at: null,
    expires_at: new Date('2024-02-01'),
    cancelled_at: null,
    listing_signature: 'sig123',
    wallet_address: 'wallet123',
    program_address: 'program123',
    requires_approval: false,
    approved_at: null,
    approved_by: null,
    approval_notes: null,
    view_count: 10,
    favorite_count: 5,
    accepts_fiat_payment: true,
    accepts_crypto_payment: true,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01')
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock chain
    Object.values(mockDbChain).forEach(mock => {
      if (jest.isMockFunction(mock)) {
        mock.mockClear();
        mock.mockReturnThis();
      }
    });
  });

  describe('create', () => {
    const createInput: CreateListingInput = {
      ticketId: 'ticket-456',
      sellerId: 'seller-789',
      eventId: 'event-111',
      venueId: 'venue-222',
      price: 5000,
      originalFaceValue: 4000,
      walletAddress: 'wallet123'
    };

    it('should create a new listing', async () => {
      mockDbChain.returning.mockResolvedValue([mockListingRow]);
      
      const result = await listingModel.create(createInput);
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-123',
          ticket_id: 'ticket-456',
          seller_id: 'seller-789',
          event_id: 'event-111',
          venue_id: 'venue-222',
          price: 5000,
          original_face_value: 4000,
          wallet_address: 'wallet123',
          status: 'active'
        })
      );
      expect(result.id).toBe('listing-123');
      expect(result.ticketId).toBe('ticket-456');
    });

    it('should set status to pending_approval when requiresApproval is true', async () => {
      mockDbChain.returning.mockResolvedValue([{ ...mockListingRow, status: 'pending_approval' }]);
      
      const result = await listingModel.create({
        ...createInput,
        requiresApproval: true
      });
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requires_approval: true,
          status: 'pending_approval'
        })
      );
      expect(result.status).toBe('pending_approval');
    });

    it('should use default values for optional fields', async () => {
      mockDbChain.returning.mockResolvedValue([mockListingRow]);
      
      await listingModel.create(createInput);
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requires_approval: false,
          accepts_fiat_payment: false,
          accepts_crypto_payment: true
        })
      );
    });

    it('should accept custom payment options', async () => {
      mockDbChain.returning.mockResolvedValue([mockListingRow]);
      
      await listingModel.create({
        ...createInput,
        acceptsFiatPayment: true,
        acceptsCryptoPayment: false
      });
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          accepts_fiat_payment: true,
          accepts_crypto_payment: false
        })
      );
    });
  });

  describe('findById', () => {
    it('should find listing by ID', async () => {
      mockDbChain.first.mockResolvedValue(mockListingRow);
      
      const result = await listingModel.findById('listing-123');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ id: 'listing-123' });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('listing-123');
    });

    it('should return null when listing not found', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await listingModel.findById('nonexistent');
      
      expect(result).toBeNull();
    });
  });

  describe('findByTicketId', () => {
    it('should find active listing by ticket ID', async () => {
      mockDbChain.first.mockResolvedValue(mockListingRow);
      
      const result = await listingModel.findByTicketId('ticket-456');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({
        ticket_id: 'ticket-456',
        status: 'active'
      });
      expect(result).not.toBeNull();
      expect(result!.ticketId).toBe('ticket-456');
    });

    it('should return null when no active listing found', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await listingModel.findByTicketId('nonexistent');
      
      expect(result).toBeNull();
    });
  });

  describe('findByEventId', () => {
    it('should find listings by event ID', async () => {
      const mockListings = [mockListingRow, { ...mockListingRow, id: 'listing-124' }];
      mockDbChain.offset.mockResolvedValue(mockListings);
      
      const result = await listingModel.findByEventId('event-111');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ event_id: 'event-111' });
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('price', 'asc');
      expect(mockDbChain.limit).toHaveBeenCalledWith(20);
      expect(mockDbChain.offset).toHaveBeenCalledWith(0);
      expect(result).toHaveLength(2);
    });

    it('should filter by status when provided', async () => {
      mockDbChain.offset.mockResolvedValue([mockListingRow]);
      
      await listingModel.findByEventId('event-111', 'active');
      
      // where is called twice - once for event_id, once for status
      expect(mockDbChain.where).toHaveBeenCalledWith({ event_id: 'event-111' });
      expect(mockDbChain.where).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should apply pagination', async () => {
      mockDbChain.offset.mockResolvedValue([]);
      
      await listingModel.findByEventId('event-111', undefined, 10, 50);
      
      expect(mockDbChain.limit).toHaveBeenCalledWith(10);
      expect(mockDbChain.offset).toHaveBeenCalledWith(50);
    });
  });

  describe('findBySellerId', () => {
    it('should find listings by seller ID', async () => {
      mockDbChain.offset.mockResolvedValue([mockListingRow]);
      
      const result = await listingModel.findBySellerId('seller-789');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ seller_id: 'seller-789' });
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('listed_at', 'desc');
      expect(result).toHaveLength(1);
    });

    it('should filter by status when provided', async () => {
      mockDbChain.offset.mockResolvedValue([]);
      
      await listingModel.findBySellerId('seller-789', 'sold');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ status: 'sold' });
    });
  });

  describe('update', () => {
    it('should update listing price', async () => {
      mockDbChain.returning.mockResolvedValue([{ ...mockListingRow, price: 6000 }]);
      
      const result = await listingModel.update('listing-123', { price: 6000 });
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ id: 'listing-123' });
      expect(mockDbChain.update).toHaveBeenCalledWith({ price: 6000 });
      expect(result!.price).toBe(6000);
    });

    it('should update expiration date', async () => {
      const newExpiry = new Date('2024-03-01');
      mockDbChain.returning.mockResolvedValue([{ ...mockListingRow, expires_at: newExpiry }]);
      
      const result = await listingModel.update('listing-123', { expiresAt: newExpiry });
      
      expect(mockDbChain.update).toHaveBeenCalledWith({ expires_at: newExpiry });
      expect(result).not.toBeNull();
    });

    it('should return null when listing not found', async () => {
      mockDbChain.returning.mockResolvedValue([]);
      
      const result = await listingModel.update('nonexistent', { price: 6000 });
      
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status to sold with timestamp', async () => {
      mockDbChain.returning.mockResolvedValue([{ ...mockListingRow, status: 'sold' }]);
      
      const result = await listingModel.updateStatus('listing-123', 'sold');
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'sold',
          sold_at: expect.any(Date)
        })
      );
      expect(result!.status).toBe('sold');
    });

    it('should update status to cancelled with timestamp', async () => {
      mockDbChain.returning.mockResolvedValue([{ ...mockListingRow, status: 'cancelled' }]);
      
      const result = await listingModel.updateStatus('listing-123', 'cancelled');
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          cancelled_at: expect.any(Date)
        })
      );
      expect(result!.status).toBe('cancelled');
    });

    it('should include additional data', async () => {
      mockDbChain.returning.mockResolvedValue([{ ...mockListingRow, status: 'sold' }]);
      
      await listingModel.updateStatus('listing-123', 'sold', { buyer_id: 'buyer-999' });
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'sold',
          buyer_id: 'buyer-999'
        })
      );
    });

    it('should not override provided timestamp', async () => {
      const customDate = new Date('2024-01-15');
      mockDbChain.returning.mockResolvedValue([mockListingRow]);
      
      await listingModel.updateStatus('listing-123', 'sold', { sold_at: customDate });
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          sold_at: customDate
        })
      );
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count', async () => {
      mockDbChain.increment.mockResolvedValue(1);
      
      await listingModel.incrementViewCount('listing-123');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ id: 'listing-123' });
      expect(mockDbChain.increment).toHaveBeenCalledWith('view_count', 1);
    });
  });

  describe('countByEventId', () => {
    it('should count listings by event ID', async () => {
      mockDbChain.first.mockResolvedValue({ count: '15' });
      
      const result = await listingModel.countByEventId('event-111');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ event_id: 'event-111' });
      expect(mockDbChain.count).toHaveBeenCalledWith('* as count');
      expect(result).toBe(15);
    });

    it('should filter by status when provided', async () => {
      mockDbChain.first.mockResolvedValue({ count: '10' });
      
      const result = await listingModel.countByEventId('event-111', 'active');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ status: 'active' });
      expect(result).toBe(10);
    });

    it('should return 0 when no results', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await listingModel.countByEventId('nonexistent');
      
      expect(result).toBe(0);
    });
  });

  describe('countByUserId', () => {
    it('should count active listings by user ID', async () => {
      mockDbChain.first.mockResolvedValue({ count: '5' });
      
      const result = await listingModel.countByUserId('seller-789');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({
        seller_id: 'seller-789',
        status: 'active'
      });
      expect(result).toBe(5);
    });

    it('should filter by event ID when provided', async () => {
      mockDbChain.first.mockResolvedValue({ count: '2' });
      
      const result = await listingModel.countByUserId('seller-789', 'event-111');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ event_id: 'event-111' });
      expect(result).toBe(2);
    });
  });

  describe('expireListings', () => {
    it('should expire all active listings for an event', async () => {
      mockDbChain.update.mockResolvedValue(10);
      
      const result = await listingModel.expireListings('event-111');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({
        event_id: 'event-111',
        status: 'active'
      });
      expect(mockDbChain.update).toHaveBeenCalledWith({ status: 'expired' });
      expect(result).toBe(10);
    });
  });

  describe('mapToListing', () => {
    it('should correctly map database row to listing object', async () => {
      mockDbChain.first.mockResolvedValue(mockListingRow);
      
      const result = await listingModel.findById('listing-123');
      
      expect(result).toEqual({
        id: 'listing-123',
        ticketId: 'ticket-456',
        sellerId: 'seller-789',
        eventId: 'event-111',
        venueId: 'venue-222',
        price: 5000,
        originalFaceValue: 4000,
        priceMultiplier: 1.25,
        status: 'active',
        listedAt: expect.any(Date),
        soldAt: null,
        expiresAt: expect.any(Date),
        cancelledAt: null,
        listingSignature: 'sig123',
        walletAddress: 'wallet123',
        programAddress: 'program123',
        requiresApproval: false,
        approvedAt: null,
        approvedBy: null,
        approvalNotes: null,
        viewCount: 10,
        favoriteCount: 5,
        acceptsFiatPayment: true,
        acceptsCryptoPayment: true,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });

    it('should parse price as integer', async () => {
      mockDbChain.first.mockResolvedValue({
        ...mockListingRow,
        price: '5000'
      });
      
      const result = await listingModel.findById('listing-123');
      
      expect(typeof result!.price).toBe('number');
      expect(result!.price).toBe(5000);
    });

    it('should handle missing price_multiplier', async () => {
      mockDbChain.first.mockResolvedValue({
        ...mockListingRow,
        price_multiplier: null
      });
      
      const result = await listingModel.findById('listing-123');
      
      expect(result!.priceMultiplier).toBeUndefined();
    });
  });

  describe('listingModel export', () => {
    it('should export singleton instance', () => {
      expect(listingModel).toBeInstanceOf(ListingModel);
    });
  });
});
