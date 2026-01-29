/**
 * COMPONENT TEST: MarketplaceController
 *
 * Tests marketplace/resale operations
 */

import { v4 as uuidv4 } from 'uuid';
import { FastifyRequest, FastifyReply } from 'fastify';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock services
const mockCreateEscrow = jest.fn();
const mockFundEscrow = jest.fn();
const mockReleaseEscrow = jest.fn();
const mockGetRoyaltyReport = jest.fn();
const mockValidateListingPrice = jest.fn();
const mockGetPricingAnalytics = jest.fn();

jest.mock('../../../src/services/marketplace', () => ({
  EscrowService: jest.fn().mockImplementation(() => ({
    createEscrow: mockCreateEscrow,
    fundEscrow: mockFundEscrow,
    releaseEscrow: mockReleaseEscrow,
  })),
  RoyaltySplitterService: jest.fn().mockImplementation(() => ({
    getRoyaltyReport: mockGetRoyaltyReport,
  })),
  PriceEnforcerService: jest.fn().mockImplementation(() => ({
    validateListingPrice: mockValidateListingPrice,
    getPricingAnalytics: mockGetPricingAnalytics,
  })),
}));

// Mock cache
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: { get: jest.fn(), set: jest.fn() },
}));

import { MarketplaceController } from '../../../src/controllers/marketplace.controller';

// Helpers
function createMockRequest(overrides: any = {}): FastifyRequest {
  return { body: {}, headers: {}, params: {}, query: {}, ...overrides } as unknown as FastifyRequest;
}

function createMockReply(): { reply: FastifyReply; getResponse: () => any; getStatus: () => number } {
  let response: any = null;
  let status = 200;
  const reply = {
    send: jest.fn().mockImplementation((data) => { response = data; return reply; }),
    status: jest.fn().mockImplementation((code) => { status = code; return reply; }),
  } as unknown as FastifyReply;
  return { reply, getResponse: () => response, getStatus: () => status };
}

describe('MarketplaceController Component Tests', () => {
  let controller: MarketplaceController;
  let userId: string;
  let venueId: string;

  beforeEach(() => {
    userId = uuidv4();
    venueId = uuidv4();

    mockCreateEscrow.mockReset();
    mockFundEscrow.mockReset();
    mockReleaseEscrow.mockReset();
    mockGetRoyaltyReport.mockReset();
    mockValidateListingPrice.mockReset();
    mockGetPricingAnalytics.mockReset();

    // Defaults
    mockValidateListingPrice.mockResolvedValue({
      valid: true,
      originalPrice: 100,
      maxAllowedPrice: 150,
      minAllowedPrice: 50,
    });
    mockCreateEscrow.mockResolvedValue({ id: uuidv4(), status: 'pending' });
    mockFundEscrow.mockResolvedValue({ success: true });

    controller = new MarketplaceController();
  });

  // ===========================================================================
  // CREATE LISTING
  // ===========================================================================
  describe('createListing()', () => {
    it('should create listing with valid price', async () => {
      const request = createMockRequest({
        body: { ticketId: uuidv4(), price: 120, venueId },
        user: { id: userId },
      });
      const { reply, getResponse, getStatus } = createMockReply();

      await controller.createListing(request, reply);

      expect(mockValidateListingPrice).toHaveBeenCalled();
      expect(getStatus()).toBe(201);
      expect(getResponse().success).toBe(true);
      expect(getResponse().listing.sellerId).toBe(userId);
    });

    it('should reject invalid price', async () => {
      mockValidateListingPrice.mockResolvedValueOnce({
        valid: false,
        reason: 'Price exceeds maximum allowed',
        originalPrice: 100,
        maxAllowedPrice: 150,
      });

      const request = createMockRequest({
        body: { ticketId: uuidv4(), price: 200, venueId },
        user: { id: userId },
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.createListing(request, reply);

      expect(getStatus()).toBe(400);
      expect(getResponse().error).toContain('exceeds');
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({ body: { ticketId: uuidv4(), price: 100 } });
      const { reply, getStatus } = createMockReply();

      await controller.createListing(request, reply);

      expect(getStatus()).toBe(401);
    });
  });

  // ===========================================================================
  // PURCHASE RESALE TICKET
  // ===========================================================================
  describe('purchaseResaleTicket()', () => {
    it('should create and fund escrow', async () => {
      const request = createMockRequest({
        body: { listingId: uuidv4(), paymentMethodId: 'pm_test' },
        user: { id: userId },
      });
      const { reply, getResponse } = createMockReply();

      await controller.purchaseResaleTicket(request, reply);

      expect(mockCreateEscrow).toHaveBeenCalled();
      expect(mockFundEscrow).toHaveBeenCalled();
      expect(getResponse().success).toBe(true);
      expect(getResponse().message).toContain('escrow');
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({ body: { listingId: uuidv4() } });
      const { reply, getStatus } = createMockReply();

      await controller.purchaseResaleTicket(request, reply);

      expect(getStatus()).toBe(401);
    });
  });

  // ===========================================================================
  // CONFIRM TRANSFER
  // ===========================================================================
  describe('confirmTransfer()', () => {
    it('should release escrow on confirmation', async () => {
      const escrowId = uuidv4();
      mockReleaseEscrow.mockResolvedValueOnce({ success: true });

      const request = createMockRequest({ params: { escrowId } });
      const { reply, getResponse } = createMockReply();

      await controller.confirmTransfer(request, reply);

      expect(mockReleaseEscrow).toHaveBeenCalledWith(escrowId);
      expect(getResponse().success).toBe(true);
    });
  });

  // ===========================================================================
  // GET ROYALTY REPORT
  // ===========================================================================
  describe('getRoyaltyReport()', () => {
    it('should return report for authorized venue', async () => {
      mockGetRoyaltyReport.mockResolvedValueOnce({
        totalRoyalties: 5000,
        transactions: [],
      });

      const request = createMockRequest({
        params: { venueId },
        query: { startDate: '2024-01-01', endDate: '2024-12-31' },
        user: { id: userId, venues: [venueId] },
      });
      const { reply, getResponse } = createMockReply();

      await controller.getRoyaltyReport(request, reply);

      expect(mockGetRoyaltyReport).toHaveBeenCalledWith(
        venueId,
        expect.any(Date),
        expect.any(Date)
      );
      expect(getResponse().totalRoyalties).toBe(5000);
    });

    it('should allow admin access', async () => {
      mockGetRoyaltyReport.mockResolvedValueOnce({ totalRoyalties: 0 });

      const request = createMockRequest({
        params: { venueId },
        query: { startDate: '2024-01-01', endDate: '2024-12-31' },
        user: { id: userId, isAdmin: true, venues: [] },
      });
      const { reply, getResponse } = createMockReply();

      await controller.getRoyaltyReport(request, reply);

      expect(getResponse()).toBeDefined();
    });

    it('should reject unauthorized access', async () => {
      const request = createMockRequest({
        params: { venueId },
        query: { startDate: '2024-01-01', endDate: '2024-12-31' },
        user: { id: userId, venues: [] },
      });
      const { reply, getStatus } = createMockReply();

      await controller.getRoyaltyReport(request, reply);

      expect(getStatus()).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({
        params: { venueId },
        query: {},
      });
      const { reply, getStatus } = createMockReply();

      await controller.getRoyaltyReport(request, reply);

      expect(getStatus()).toBe(401);
    });
  });

  // ===========================================================================
  // GET PRICING ANALYTICS
  // ===========================================================================
  describe('getPricingAnalytics()', () => {
    it('should return analytics for venue', async () => {
      mockGetPricingAnalytics.mockResolvedValueOnce({
        averageMarkup: 15,
        totalListings: 100,
      });

      const request = createMockRequest({ params: { venueId } });
      const { reply, getResponse } = createMockReply();

      await controller.getPricingAnalytics(request, reply);

      expect(mockGetPricingAnalytics).toHaveBeenCalledWith(venueId);
      expect(getResponse().averageMarkup).toBe(15);
    });
  });
});
