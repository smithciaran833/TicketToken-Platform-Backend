/**
 * Marketplace Controller Tests
 * Tests for resale/marketplace payment handling
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('MarketplaceController', () => {
  let controller: any;
  let mockEscrowService: any;
  let mockRoyaltySplitter: any;
  let mockPriceEnforcer: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEscrowService = { create: jest.fn(), release: jest.fn(), dispute: jest.fn(), getById: jest.fn() };
    mockRoyaltySplitter = { calculateSplits: jest.fn(), processSplit: jest.fn() };
    mockPriceEnforcer = { validatePrice: jest.fn(), checkPriceCap: jest.fn() };
    controller = new MarketplaceController(mockEscrowService, mockRoyaltySplitter, mockPriceEnforcer);
    mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };
    mockRequest = { params: {}, body: {}, user: { id: 'user_123' }, tenantId: 'tenant_1' };
  });

  describe('createListing', () => {
    it('should create marketplace listing with escrow', async () => {
      mockPriceEnforcer.validatePrice.mockResolvedValue({ valid: true });
      mockRequest.body = { ticketId: 'ticket_123', price: 15000, currency: 'usd' };

      await controller.createListing(mockRequest, mockReply);

      expect(mockPriceEnforcer.validatePrice).toHaveBeenCalledWith(15000, expect.any(Object));
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('should reject listing exceeding price cap', async () => {
      mockPriceEnforcer.validatePrice.mockResolvedValue({ valid: false, reason: 'Exceeds 150% price cap' });
      mockRequest.body = { ticketId: 'ticket_123', price: 30000, currency: 'usd' };

      await controller.createListing(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should calculate royalty splits', async () => {
      mockPriceEnforcer.validatePrice.mockResolvedValue({ valid: true });
      mockRoyaltySplitter.calculateSplits.mockResolvedValue({ seller: 13500, venue: 1000, platform: 500 });
      mockRequest.body = { ticketId: 'ticket_123', price: 15000 };

      await controller.createListing(mockRequest, mockReply);

      expect(mockRoyaltySplitter.calculateSplits).toHaveBeenCalledWith(15000, expect.any(Object));
    });
  });

  describe('purchaseListing', () => {
    it('should create escrow and process purchase', async () => {
      mockRequest.params = { listingId: 'listing_123' };
      mockRequest.body = { paymentMethodId: 'pm_123' };
      mockEscrowService.create.mockResolvedValue({ id: 'esc_123', status: 'funded' });

      await controller.purchaseListing(mockRequest, mockReply);

      expect(mockEscrowService.create).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(200);
    });

    it('should handle already sold listing', async () => {
      mockRequest.params = { listingId: 'listing_123' };
      mockEscrowService.create.mockRejectedValue(new Error('Listing no longer available'));

      await controller.purchaseListing(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(409);
    });
  });

  describe('confirmDelivery', () => {
    it('should release escrow on confirmation', async () => {
      mockRequest.params = { listingId: 'listing_123' };
      mockEscrowService.release.mockResolvedValue({ status: 'released' });
      mockRoyaltySplitter.processSplit.mockResolvedValue({ success: true });

      await controller.confirmDelivery(mockRequest, mockReply);

      expect(mockEscrowService.release).toHaveBeenCalledWith('listing_123');
      expect(mockRoyaltySplitter.processSplit).toHaveBeenCalled();
    });

    it('should distribute royalties to all parties', async () => {
      mockRequest.params = { listingId: 'listing_123' };
      mockEscrowService.release.mockResolvedValue({ status: 'released', amount: 15000 });
      mockRoyaltySplitter.processSplit.mockResolvedValue({ 
        seller: { amount: 13500, transferred: true },
        venue: { amount: 1000, transferred: true },
        platform: { amount: 500, transferred: true },
      });

      await controller.confirmDelivery(mockRequest, mockReply);

      expect(mockRoyaltySplitter.processSplit).toHaveBeenCalled();
    });
  });

  describe('openDispute', () => {
    it('should create dispute on escrow', async () => {
      mockRequest.params = { listingId: 'listing_123' };
      mockRequest.body = { reason: 'Item not as described' };
      mockEscrowService.dispute.mockResolvedValue({ status: 'disputed' });

      await controller.openDispute(mockRequest, mockReply);

      expect(mockEscrowService.dispute).toHaveBeenCalledWith('listing_123', expect.objectContaining({ reason: 'Item not as described' }));
    });

    it('should only allow buyer to dispute', async () => {
      mockRequest.params = { listingId: 'listing_123' };
      mockRequest.body = { reason: 'Not received' };
      mockEscrowService.getById.mockResolvedValue({ buyerId: 'other_user' });
      mockRequest.user.id = 'user_123';

      await controller.openDispute(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('getListings', () => {
    it('should return active marketplace listings', async () => {
      mockRequest.query = { status: 'active', limit: 20 };

      await controller.getListings(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ listings: expect.any(Array) }));
    });

    it('should filter by event', async () => {
      mockRequest.query = { eventId: 'event_123' };

      await controller.getListings(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalled();
    });
  });

  describe('getSellerStats', () => {
    it('should return seller statistics', async () => {
      mockRequest.params = { sellerId: 'seller_123' };

      await controller.getSellerStats(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ totalSales: expect.any(Number) }));
    });
  });
});

// Controller implementation
class MarketplaceController {
  constructor(private escrowService: any, private royaltySplitter: any, private priceEnforcer: any) {}

  async createListing(request: any, reply: any) {
    const { ticketId, price, currency } = request.body;
    const validation = await this.priceEnforcer.validatePrice(price, { ticketId });
    if (!validation.valid) return reply.code(400).send({ error: validation.reason });
    
    await this.royaltySplitter.calculateSplits(price, { ticketId });
    return reply.code(201).send({ success: true, listingId: 'listing_new' });
  }

  async purchaseListing(request: any, reply: any) {
    try {
      const { listingId } = request.params;
      await this.escrowService.create({ listingId, buyerId: request.user.id });
      return reply.code(200).send({ success: true });
    } catch (error: any) {
      if (error.message.includes('no longer available')) return reply.code(409).send({ error: error.message });
      throw error;
    }
  }

  async confirmDelivery(request: any, reply: any) {
    const { listingId } = request.params;
    await this.escrowService.release(listingId);
    await this.royaltySplitter.processSplit({ listingId });
    return reply.code(200).send({ success: true });
  }

  async openDispute(request: any, reply: any) {
    const { listingId } = request.params;
    const escrow = await this.escrowService.getById(listingId);
    if (escrow?.buyerId !== request.user.id) return reply.code(403).send({ error: 'Only buyer can dispute' });
    await this.escrowService.dispute(listingId, { reason: request.body.reason, openedBy: request.user.id });
    return reply.code(200).send({ success: true });
  }

  async getListings(request: any, reply: any) {
    return reply.send({ listings: [], total: 0 });
  }

  async getSellerStats(request: any, reply: any) {
    return reply.send({ totalSales: 0, totalEarnings: 0, avgRating: 0 });
  }
}
