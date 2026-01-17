/**
 * Pricing Controller Unit Tests
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockDynamicPricingService = {
  getVenuePricingRules: jest.fn(),
  calculateOptimalPrice: jest.fn(),
  applyPriceChange: jest.fn(),
};

const mockDemandTrackerService = {
  calculateDemand: jest.fn(),
};

const mockDbRaw = jest.fn();
const mockGetDb = jest.fn(() => ({
  raw: mockDbRaw,
}));

jest.mock('../../../src/services/dynamic-pricing.service', () => ({
  dynamicPricingService: mockDynamicPricingService,
}));

jest.mock('../../../src/services/demand-tracker.service', () => ({
  demandTrackerService: mockDemandTrackerService,
}));

jest.mock('../../../src/config/database', () => ({
  getDb: mockGetDb,
}));

import { pricingController } from '../../../src/controllers/pricing.controller';

describe('PricingController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      params: {},
      body: {},
      user: { id: 'user-123', tenantId: 'tenant-123' },
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Default mock responses
    mockDynamicPricingService.getVenuePricingRules.mockResolvedValue([
      { id: 'rule-1', minPrice: 50, maxPrice: 150 },
    ]);

    mockDynamicPricingService.calculateOptimalPrice.mockResolvedValue({
      recommendedPrice: 85.50,
      currentPrice: 80.00,
      priceChange: 5.50,
      confidence: 0.87,
    });

    mockDemandTrackerService.calculateDemand.mockResolvedValue({
      currentDemand: 0.75,
      trend: 'increasing',
      velocityScore: 8.5,
    });

    mockDbRaw.mockResolvedValue({
      rows: [
        { price_cents: 8000, venue_id: 'venue-123' },
      ],
    });
  });

  describe('getPriceRecommendation', () => {
    it('should get price recommendation for event', async () => {
      mockRequest.params = { eventId: 'event-123' };

      await pricingController.getPriceRecommendation(mockRequest, mockReply);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('SELECT e.price_cents'),
        ['event-123']
      );

      expect(mockDynamicPricingService.getVenuePricingRules).toHaveBeenCalledWith('venue-123');
      expect(mockDynamicPricingService.calculateOptimalPrice).toHaveBeenCalledWith(
        'event-123',
        8000,
        expect.any(Array)
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          recommendedPrice: expect.any(Number),
        }),
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.user = undefined;

      await pricingController.getPriceRecommendation(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
      });
    });

    it('should return 404 if event not found', async () => {
      mockRequest.params = { eventId: 'nonexistent' };
      mockDbRaw.mockResolvedValue({ rows: [] });

      await pricingController.getPriceRecommendation(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Event not found',
      });
    });

    it('should handle errors', async () => {
      mockRequest.params = { eventId: 'event-123' };
      mockDbRaw.mockRejectedValue(new Error('Database error'));

      await pricingController.getPriceRecommendation(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to get price recommendation',
      });
    });
  });

  describe('getPendingPriceChanges', () => {
    it('should get pending price changes for venue', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockDbRaw.mockResolvedValue({
        rows: [
          {
            id: 'change-1',
            event_id: 'event-123',
            event_name: 'Summer Concert',
            recommended_price: 9000,
          },
        ],
      });

      await pricingController.getPendingPriceChanges(mockRequest, mockReply);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('FROM pending_price_changes'),
        ['venue-123']
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.any(Array),
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.user = undefined;

      await pricingController.getPendingPriceChanges(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('approvePriceChange', () => {
    beforeEach(() => {
      mockDbRaw.mockResolvedValue({
        rows: [
          {
            id: 'change-1',
            event_id: 'event-123',
            recommended_price: 9000,
          },
        ],
      });
    });

    it('should approve and apply price change', async () => {
      mockRequest.params = { changeId: 'change-1' };
      mockRequest.body = {
        approved: true,
        reason: 'Good recommendation',
      };

      await pricingController.approvePriceChange(mockRequest, mockReply);

      expect(mockDynamicPricingService.applyPriceChange).toHaveBeenCalledWith(
        'event-123',
        9000,
        'Good recommendation'
      );

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE pending_price_changes SET approved_at'),
        expect.arrayContaining(['user-123', 'Good recommendation', 'change-1'])
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Price change approved and applied',
      });
    });

    it('should reject price change', async () => {
      mockRequest.params = { changeId: 'change-1' };
      mockRequest.body = {
        approved: false,
        reason: 'Not suitable',
      };

      await pricingController.approvePriceChange(mockRequest, mockReply);

      expect(mockDynamicPricingService.applyPriceChange).not.toHaveBeenCalled();

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE pending_price_changes SET rejected_at'),
        expect.arrayContaining(['user-123', 'Not suitable', 'change-1'])
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Price change rejected',
      });
    });

    it('should approve without reason', async () => {
      mockRequest.params = { changeId: 'change-1' };
      mockRequest.body = { approved: true };

      await pricingController.approvePriceChange(mockRequest, mockReply);

      expect(mockDynamicPricingService.applyPriceChange).toHaveBeenCalledWith(
        'event-123',
        9000,
        'Manually approved'
      );
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.params = { changeId: 'change-1' };
      mockRequest.body = { approved: true };
      mockRequest.user = undefined;

      await pricingController.approvePriceChange(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 if price change not found', async () => {
      mockRequest.params = { changeId: 'nonexistent' };
      mockRequest.body = { approved: true };
      mockDbRaw.mockResolvedValue({ rows: [] });

      await pricingController.approvePriceChange(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getDemandMetrics', () => {
    it('should get demand metrics for event', async () => {
      mockRequest.params = { eventId: 'event-123' };

      await pricingController.getDemandMetrics(mockRequest, mockReply);

      expect(mockDemandTrackerService.calculateDemand).toHaveBeenCalledWith('event-123');

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          currentDemand: expect.any(Number),
          trend: expect.any(String),
        }),
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.user = undefined;

      await pricingController.getDemandMetrics(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should handle errors', async () => {
      mockRequest.params = { eventId: 'event-123' };
      mockDemandTrackerService.calculateDemand.mockRejectedValue(
        new Error('Calculation error')
      );

      await pricingController.getDemandMetrics(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });
});
