/**
 * Unit tests for ListingController
 * Tests HTTP handlers for listing CRUD operations
 */

// Mock dependencies before imports
jest.mock('../../../src/services/listing.service', () => ({
  listingService: {
    createListing: jest.fn(),
    updateListingPrice: jest.fn(),
    cancelListing: jest.fn(),
    getListingById: jest.fn(),
    searchListings: jest.fn()
  }
}));

jest.mock('@tickettoken/shared', () => ({
  auditService: {
    logAction: jest.fn().mockResolvedValue(undefined)
  }
}));

import { ListingController, listingController } from '../../../src/controllers/listing.controller';
import { listingService } from '../../../src/services/listing.service';
import { auditService } from '@tickettoken/shared';

describe('ListingController', () => {
  let controller: ListingController;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ListingController();

    mockRequest = {
      body: {},
      params: {},
      query: {},
      user: { id: 'user-123' },
      wallet: { address: 'wallet-abc123' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' }
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('createListing', () => {
    const mockListingData = {
      ticketId: 'ticket-456',
      eventId: 'event-789',
      price: 10000
    };

    const mockCreatedListing = {
      id: 'listing-001',
      ...mockListingData,
      sellerId: 'user-123',
      walletAddress: 'wallet-abc123',
      status: 'active'
    };

    beforeEach(() => {
      mockRequest.body = mockListingData;
      (listingService.createListing as jest.Mock).mockResolvedValue(mockCreatedListing);
    });

    it('should create listing with user and wallet info', async () => {
      await controller.createListing(mockRequest, mockReply);

      expect(listingService.createListing).toHaveBeenCalledWith({
        ...mockListingData,
        sellerId: 'user-123',
        walletAddress: 'wallet-abc123'
      });
    });

    it('should return 201 status with created listing', async () => {
      await controller.createListing(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockCreatedListing
      });
    });

    it('should log audit action on creation', async () => {
      await controller.createListing(mockRequest, mockReply);

      expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
        service: 'marketplace-service',
        action: 'create_listing',
        actionType: 'CREATE',
        userId: 'user-123',
        resourceType: 'listing',
        resourceId: 'listing-001',
        success: true
      }));
    });

    it('should include metadata in audit log', async () => {
      await controller.createListing(mockRequest, mockReply);

      expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
        metadata: { walletAddress: 'wallet-abc123' },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      }));
    });

    it('should throw error if service fails', async () => {
      (listingService.createListing as jest.Mock).mockRejectedValue(new Error('Service error'));

      await expect(controller.createListing(mockRequest, mockReply)).rejects.toThrow('Service error');
    });
  });

  describe('updateListingPrice', () => {
    const existingListing = {
      id: 'listing-001',
      price: 10000,
      eventId: 'event-789',
      sellerId: 'user-123'
    };

    const updatedListing = {
      ...existingListing,
      price: 12000
    };

    beforeEach(() => {
      mockRequest.params = { id: 'listing-001' };
      mockRequest.body = { price: 12000 };
      (listingService.getListingById as jest.Mock).mockResolvedValue(existingListing);
      (listingService.updateListingPrice as jest.Mock).mockResolvedValue(updatedListing);
    });

    it('should get current listing for audit', async () => {
      await controller.updateListingPrice(mockRequest, mockReply);

      expect(listingService.getListingById).toHaveBeenCalledWith('listing-001');
    });

    it('should return 404 if listing not found', async () => {
      (listingService.getListingById as jest.Mock).mockResolvedValue(null);

      await controller.updateListingPrice(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Listing not found'
      });
    });

    it('should call service with correct params', async () => {
      await controller.updateListingPrice(mockRequest, mockReply);

      expect(listingService.updateListingPrice).toHaveBeenCalledWith({
        listingId: 'listing-001',
        newPrice: 12000,
        userId: 'user-123'
      });
    });

    it('should return 500 if update returns null', async () => {
      (listingService.updateListingPrice as jest.Mock).mockResolvedValue(null);

      await controller.updateListingPrice(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to update listing'
      });
    });

    it('should return updated listing on success', async () => {
      await controller.updateListingPrice(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: updatedListing
      });
    });

    it('should log audit action with price change details', async () => {
      await controller.updateListingPrice(mockRequest, mockReply);

      expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
        action: 'update_listing_price',
        actionType: 'UPDATE',
        previousValue: { price: 10000 },
        newValue: { price: 12000 },
        metadata: expect.objectContaining({
          priceChange: 2000,
          priceChangePercentage: 20
        })
      }));
    });

    it('should log failed audit on error', async () => {
      const error = new Error('Update failed');
      (listingService.updateListingPrice as jest.Mock).mockRejectedValue(error);

      await expect(controller.updateListingPrice(mockRequest, mockReply)).rejects.toThrow();

      expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        errorMessage: 'Update failed'
      }));
    });
  });

  describe('cancelListing', () => {
    const cancelledListing = {
      id: 'listing-001',
      price: 10000,
      status: 'cancelled'
    };

    beforeEach(() => {
      mockRequest.params = { id: 'listing-001' };
      (listingService.cancelListing as jest.Mock).mockResolvedValue(cancelledListing);
    });

    it('should call service with listing ID and user ID', async () => {
      await controller.cancelListing(mockRequest, mockReply);

      expect(listingService.cancelListing).toHaveBeenCalledWith('listing-001', 'user-123');
    });

    it('should return 404 if listing not found', async () => {
      (listingService.cancelListing as jest.Mock).mockResolvedValue(null);

      await controller.cancelListing(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Listing not found'
      });
    });

    it('should return cancelled listing on success', async () => {
      await controller.cancelListing(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: cancelledListing
      });
    });

    it('should log audit action for cancellation', async () => {
      await controller.cancelListing(mockRequest, mockReply);

      expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
        action: 'cancel_listing',
        actionType: 'DELETE',
        previousValue: { status: 'active', price: 10000 },
        newValue: { status: 'cancelled' },
        success: true
      }));
    });
  });

  describe('getListing', () => {
    const mockListing = {
      id: 'listing-001',
      price: 10000,
      status: 'active'
    };

    beforeEach(() => {
      mockRequest.params = { id: 'listing-001' };
      (listingService.getListingById as jest.Mock).mockResolvedValue(mockListing);
    });

    it('should get listing by ID', async () => {
      await controller.getListing(mockRequest, mockReply);

      expect(listingService.getListingById).toHaveBeenCalledWith('listing-001');
    });

    it('should return listing data', async () => {
      await controller.getListing(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockListing
      });
    });
  });

  describe('getMyListings', () => {
    const mockListings = [
      { id: 'listing-001', price: 10000 },
      { id: 'listing-002', price: 15000 }
    ];

    beforeEach(() => {
      (listingService.searchListings as jest.Mock).mockResolvedValue(mockListings);
    });

    it('should search listings for current user', async () => {
      await controller.getMyListings(mockRequest, mockReply);

      expect(listingService.searchListings).toHaveBeenCalledWith({
        sellerId: 'user-123',
        status: 'active',
        limit: 20,
        offset: 0
      });
    });

    it('should use query params for status', async () => {
      mockRequest.query = { status: 'sold' };

      await controller.getMyListings(mockRequest, mockReply);

      expect(listingService.searchListings).toHaveBeenCalledWith(expect.objectContaining({
        status: 'sold'
      }));
    });

    it('should use query params for pagination', async () => {
      mockRequest.query = { limit: 50, offset: 10 };

      await controller.getMyListings(mockRequest, mockReply);

      expect(listingService.searchListings).toHaveBeenCalledWith(expect.objectContaining({
        limit: 50,
        offset: 10
      }));
    });

    it('should return listings with pagination', async () => {
      mockRequest.query = { limit: 50, offset: 10 };

      await controller.getMyListings(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockListings,
        pagination: { limit: 50, offset: 10 }
      });
    });
  });

  describe('getEventListings', () => {
    const mockListings = [
      { id: 'listing-001', eventId: 'event-123', price: 10000 }
    ];

    beforeEach(() => {
      mockRequest.params = { eventId: 'event-123' };
      (listingService.searchListings as jest.Mock).mockResolvedValue(mockListings);
    });

    it('should search listings by event ID', async () => {
      await controller.getEventListings(mockRequest, mockReply);

      expect(listingService.searchListings).toHaveBeenCalledWith({
        eventId: 'event-123',
        status: 'active',
        limit: 20,
        offset: 0
      });
    });

    it('should only return active listings', async () => {
      await controller.getEventListings(mockRequest, mockReply);

      expect(listingService.searchListings).toHaveBeenCalledWith(expect.objectContaining({
        status: 'active'
      }));
    });

    it('should return listings with pagination', async () => {
      await controller.getEventListings(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockListings,
        pagination: { limit: 20, offset: 0 }
      });
    });
  });

  describe('Singleton export', () => {
    it('should export singleton instance', () => {
      expect(listingController).toBeInstanceOf(ListingController);
    });
  });
});
