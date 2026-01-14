/**
 * Unit Tests for ListingsController
 * Tests HTTP handlers for listing creation and management with policy validation
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ListingsController, listingsController } from '../../../src/controllers/listings.controller';
import { db } from '../../../src/config/database';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('ListingsController', () => {
  let controller: ListingsController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockTransaction: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ListingsController();

    mockRequest = {
      user: { id: 'user-123', email: 'seller@example.com' },
      params: {},
      query: {},
      body: {},
    } as any;

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
    };

    // Setup mock transaction
    mockTransaction = jest.fn((table: string) => {
      const chain: any = {
        where: jest.fn().mockReturnValue(chain),
        first: jest.fn(),
        insert: jest.fn().mockReturnValue({ returning: jest.fn() }),
        update: jest.fn().mockReturnValue({ returning: jest.fn() }),
        returning: jest.fn(),
      };
      return chain;
    });
    mockTransaction.commit = jest.fn();
    mockTransaction.rollback = jest.fn();

    (db.transaction as jest.Mock).mockResolvedValue(mockTransaction);
  });

  describe('createListing', () => {
    it('should create listing successfully', async () => {
      const mockTicket = {
        id: 'ticket-123',
        owner_id: 'user-123',
        venue_id: 'venue-456',
        event_id: 'event-789',
        original_price: 10000,
      };

      const mockPolicy = {
        maxResalePrice: 30000,
        minResalePrice: 5000,
        saleWindowStart: new Date(Date.now() - 86400000), // yesterday
      };

      const mockListing = {
        id: 'listing-new',
        ticket_id: 'ticket-123',
        price: 15000,
        expires_at: new Date(),
      };

      mockRequest.body = {
        ticketId: 'ticket-123',
        price: 15000,
      };

      // Setup complex transaction mock
      const mockTrxTicketFirst = jest.fn().mockResolvedValue(mockTicket);
      const mockTrxTicketWhere = jest.fn().mockReturnValue({ first: mockTrxTicketFirst });
      
      const mockTrxListingFirst = jest.fn().mockResolvedValue(null); // No existing listing
      const mockTrxListingWhere = jest.fn().mockReturnValue({ first: mockTrxListingFirst });
      
      const mockTrxPolicyFirst = jest.fn().mockResolvedValue(mockPolicy);
      const mockTrxPolicyWhere = jest.fn().mockReturnValue({ first: mockTrxPolicyFirst });
      
      const mockTrxInsertReturning = jest.fn().mockResolvedValue([mockListing]);
      const mockTrxInsert = jest.fn().mockReturnValue({ returning: mockTrxInsertReturning });

      const mockTrxOutboxInsert = jest.fn().mockResolvedValue([1]);

      let tableCallCount = 0;
      mockTransaction.mockImplementation((table: string) => {
        tableCallCount++;
        if (table === 'tickets') {
          return { where: mockTrxTicketWhere };
        }
        if (table === 'marketplace_listings') {
          return {
            where: mockTrxListingWhere,
            insert: mockTrxInsert,
          };
        }
        if (table === 'venue_marketplace_policies') {
          return { where: mockTrxPolicyWhere };
        }
        if (table === 'outbox') {
          return { insert: mockTrxOutboxInsert };
        }
        return {};
      });

      await controller.createListing(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        listing: expect.objectContaining({
          id: 'listing-new',
          ticketId: 'ticket-123',
          price: 15000,
        }),
      });
    });

    it('should return 403 if user does not own ticket', async () => {
      mockRequest.body = {
        ticketId: 'ticket-123',
        price: 15000,
      };

      const mockTrxTicketFirst = jest.fn().mockResolvedValue(null); // No ticket found
      const mockTrxTicketWhere = jest.fn().mockReturnValue({ first: mockTrxTicketFirst });

      mockTransaction.mockImplementation((table: string) => {
        if (table === 'tickets') {
          return { where: mockTrxTicketWhere };
        }
        return {};
      });

      await controller.createListing(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'You do not own this ticket' });
    });

    it('should return 409 if ticket is already listed', async () => {
      const mockTicket = {
        id: 'ticket-123',
        owner_id: 'user-123',
        venue_id: 'venue-456',
        event_id: 'event-789',
      };

      const existingListing = {
        id: 'existing-listing',
        status: 'active',
      };

      mockRequest.body = {
        ticketId: 'ticket-123',
        price: 15000,
      };

      const mockTrxTicketFirst = jest.fn().mockResolvedValue(mockTicket);
      const mockTrxTicketWhere = jest.fn().mockReturnValue({ first: mockTrxTicketFirst });

      const mockTrxListingFirst = jest.fn().mockResolvedValue(existingListing);
      const mockTrxListingWhere = jest.fn().mockReturnValue({ first: mockTrxListingFirst });

      mockTransaction.mockImplementation((table: string) => {
        if (table === 'tickets') {
          return { where: mockTrxTicketWhere };
        }
        if (table === 'marketplace_listings') {
          return { where: mockTrxListingWhere };
        }
        return {};
      });

      await controller.createListing(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Ticket is already listed' });
    });

    it('should return 400 if listing violates venue policy (price too high)', async () => {
      const mockTicket = {
        id: 'ticket-123',
        owner_id: 'user-123',
        venue_id: 'venue-456',
        event_id: 'event-789',
      };

      const mockPolicy = {
        maxResalePrice: 20000,
        minResalePrice: 5000,
        saleWindowStart: new Date(Date.now() - 86400000),
      };

      mockRequest.body = {
        ticketId: 'ticket-123',
        price: 50000, // Exceeds max
      };

      const mockTrxTicketFirst = jest.fn().mockResolvedValue(mockTicket);
      const mockTrxTicketWhere = jest.fn().mockReturnValue({ first: mockTrxTicketFirst });

      const mockTrxListingFirst = jest.fn().mockResolvedValue(null);
      const mockTrxListingWhere = jest.fn().mockReturnValue({ first: mockTrxListingFirst });

      const mockTrxPolicyFirst = jest.fn().mockResolvedValue(mockPolicy);
      const mockTrxPolicyWhere = jest.fn().mockReturnValue({ first: mockTrxPolicyFirst });

      mockTransaction.mockImplementation((table: string) => {
        if (table === 'tickets') {
          return { where: mockTrxTicketWhere };
        }
        if (table === 'marketplace_listings') {
          return { where: mockTrxListingWhere };
        }
        if (table === 'venue_marketplace_policies') {
          return { where: mockTrxPolicyWhere };
        }
        return {};
      });

      await controller.createListing(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Listing violates venue policy',
        policy: expect.objectContaining({
          maxPrice: 20000,
        }),
      });
    });

    it('should return 500 on database error', async () => {
      mockRequest.body = {
        ticketId: 'ticket-123',
        price: 15000,
      };

      mockTransaction.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      await controller.createListing(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to create listing' });
    });
  });

  describe('cancelListing', () => {
    it('should cancel listing successfully', async () => {
      const cancelledListing = {
        id: 'listing-123',
        status: 'cancelled',
        cancelled_at: new Date(),
      };

      mockRequest.params = { listingId: 'listing-123' };

      const mockTrxUpdateReturning = jest.fn().mockResolvedValue([cancelledListing]);
      const mockTrxUpdate = jest.fn().mockReturnValue({ returning: mockTrxUpdateReturning });
      const mockTrxWhere = jest.fn().mockReturnValue({ update: mockTrxUpdate });

      const mockTrxOutboxInsert = jest.fn().mockResolvedValue([1]);

      mockTransaction.mockImplementation((table: string) => {
        if (table === 'marketplace_listings') {
          return { where: mockTrxWhere };
        }
        if (table === 'outbox') {
          return { insert: mockTrxOutboxInsert };
        }
        return {};
      });

      await controller.cancelListing(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Listing cancelled',
      });
    });

    it('should return 404 if listing not found or already sold', async () => {
      mockRequest.params = { listingId: 'non-existent' };

      const mockTrxUpdateReturning = jest.fn().mockResolvedValue([]);
      const mockTrxUpdate = jest.fn().mockReturnValue({ returning: mockTrxUpdateReturning });
      const mockTrxWhere = jest.fn().mockReturnValue({ update: mockTrxUpdate });

      mockTransaction.mockImplementation((table: string) => {
        if (table === 'marketplace_listings') {
          return { where: mockTrxWhere };
        }
        return {};
      });

      await controller.cancelListing(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Listing not found or already sold',
      });
    });

    it('should return 500 on database error', async () => {
      mockRequest.params = { listingId: 'listing-123' };

      mockTransaction.mockImplementation(() => {
        throw new Error('Database error');
      });

      await controller.cancelListing(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to cancel listing' });
    });
  });

  describe('validateListing (private method)', () => {
    it('should return true when no policy exists', () => {
      const result = (controller as any).validateListing(10000, null);
      expect(result).toBe(true);
    });

    it('should return true when price is within bounds', () => {
      const policy = {
        maxResalePrice: 20000,
        minResalePrice: 5000,
        saleWindowStart: new Date(Date.now() - 86400000), // yesterday
      };
      const result = (controller as any).validateListing(15000, policy);
      expect(result).toBe(true);
    });

    it('should return false when price exceeds max', () => {
      const policy = {
        maxResalePrice: 20000,
        minResalePrice: 5000,
        saleWindowStart: new Date(Date.now() - 86400000),
      };
      const result = (controller as any).validateListing(25000, policy);
      expect(result).toBe(false);
    });

    it('should return false when price is below min', () => {
      const policy = {
        maxResalePrice: 20000,
        minResalePrice: 5000,
        saleWindowStart: new Date(Date.now() - 86400000),
      };
      const result = (controller as any).validateListing(3000, policy);
      expect(result).toBe(false);
    });

    it('should return false when before sale window', () => {
      const policy = {
        maxResalePrice: 20000,
        minResalePrice: 5000,
        saleWindowStart: new Date(Date.now() + 86400000), // tomorrow
      };
      const result = (controller as any).validateListing(15000, policy);
      expect(result).toBe(false);
    });

    it('should return true when policy has no max price', () => {
      const policy = {
        minResalePrice: 5000,
        saleWindowStart: new Date(Date.now() - 86400000),
      };
      const result = (controller as any).validateListing(100000, policy);
      expect(result).toBe(true);
    });

    it('should return true when policy has no min price', () => {
      const policy = {
        maxResalePrice: 20000,
        saleWindowStart: new Date(Date.now() - 86400000),
      };
      const result = (controller as any).validateListing(1000, policy);
      expect(result).toBe(true);
    });

    it('should return true when policy has no sale window', () => {
      const policy = {
        maxResalePrice: 20000,
        minResalePrice: 5000,
      };
      const result = (controller as any).validateListing(15000, policy);
      expect(result).toBe(true);
    });
  });

  describe('exported instance', () => {
    it('should export controller instance', () => {
      expect(listingsController).toBeInstanceOf(ListingsController);
    });
  });
});
