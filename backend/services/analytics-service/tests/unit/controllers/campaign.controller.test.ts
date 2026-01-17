/**
 * Campaign Controller Unit Tests
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

const mockAttributionService = {
  getChannelPerformance: jest.fn(),
  trackTouchpoint: jest.fn(),
  getCampaignROI: jest.fn(),
  getCustomerJourney: jest.fn(),
};

const mockCampaignSchema = {
  getCampaigns: jest.fn(),
  getCampaignPerformance: jest.fn(),
};

jest.mock('../../../src/services/attribution.service', () => ({
  attributionService: mockAttributionService,
}));

jest.mock('../../../src/models', () => ({
  CampaignSchema: mockCampaignSchema,
}));

import { campaignController } from '../../../src/controllers/campaign.controller';

describe('CampaignController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: { id: 'user-123', tenantId: 'tenant-123' },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Default mock responses
    mockCampaignSchema.getCampaigns.mockResolvedValue([
      { id: 'campaign-1', name: 'Summer Sale', status: 'active' },
      { id: 'campaign-2', name: 'Winter Promo', status: 'completed' },
    ]);

    mockCampaignSchema.getCampaignPerformance.mockResolvedValue([
      {
        _id: 'email',
        impressions: 1000,
        clicks: 100,
        conversions: 10,
        revenue: 500,
      },
      {
        _id: 'social',
        impressions: 2000,
        clicks: 150,
        conversions: 15,
        revenue: 750,
      },
    ]);

    mockAttributionService.getChannelPerformance.mockResolvedValue({
      channels: [
        { channel: 'email', conversions: 50, revenue: 1000 },
        { channel: 'social', conversions: 30, revenue: 600 },
      ],
    });

    mockAttributionService.trackTouchpoint.mockResolvedValue(undefined);

    mockAttributionService.getCampaignROI.mockResolvedValue({
      roi: 2.5,
      totalRevenue: 5000,
      totalCost: 2000,
      profit: 3000,
    });
  });

  describe('getCampaigns', () => {
    it('should get all campaigns for a venue', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {};

      await campaignController.getCampaigns(mockRequest, mockReply);

      expect(mockCampaignSchema.getCampaigns).toHaveBeenCalledWith('venue-123', {
        status: undefined,
        type: undefined,
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          campaigns: expect.any(Array),
        },
      });
    });

    it('should filter campaigns by status', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { status: 'active' };

      await campaignController.getCampaigns(mockRequest, mockReply);

      expect(mockCampaignSchema.getCampaigns).toHaveBeenCalledWith('venue-123', {
        status: 'active',
        type: undefined,
      });
    });

    it('should filter campaigns by type', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { type: 'email' };

      await campaignController.getCampaigns(mockRequest, mockReply);

      expect(mockCampaignSchema.getCampaigns).toHaveBeenCalledWith('venue-123', {
        status: undefined,
        type: 'email',
      });
    });
  });

  describe('getCampaign', () => {
    it('should get a specific campaign', async () => {
      mockRequest.params = { campaignId: 'campaign-1', venueId: 'venue-123' };

      await campaignController.getCampaign(mockRequest, mockReply);

      expect(mockCampaignSchema.getCampaigns).toHaveBeenCalledWith('venue-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          campaign: expect.objectContaining({
            id: 'campaign-1',
          }),
        },
      });
    });

    it('should return 404 if campaign not found', async () => {
      mockRequest.params = { campaignId: 'nonexistent', venueId: 'venue-123' };

      await campaignController.getCampaign(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Campaign not found',
          statusCode: 404,
        },
      });
    });

    it('should handle missing venueId', async () => {
      mockRequest.params = { campaignId: 'campaign-1' };

      await campaignController.getCampaign(mockRequest, mockReply);

      expect(mockCampaignSchema.getCampaigns).toHaveBeenCalledWith('');
    });
  });

  describe('getCampaignPerformance', () => {
    it('should get campaign performance metrics', async () => {
      mockRequest.params = { campaignId: 'campaign-1' };

      await campaignController.getCampaignPerformance(mockRequest, mockReply);

      expect(mockCampaignSchema.getCampaignPerformance).toHaveBeenCalledWith('campaign-1');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          performance: expect.any(Array),
        },
      });
    });
  });

  describe('getCampaignAttribution', () => {
    it('should get campaign attribution with default model', async () => {
      mockRequest.params = { campaignId: 'campaign-1', venueId: 'venue-123' };
      mockRequest.query = {};

      await campaignController.getCampaignAttribution(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          model: 'last_touch',
          attribution: expect.any(Array),
          totalConversions: expect.any(Number),
          totalRevenue: expect.any(Number),
        }),
      });
    });

    it('should calculate attribution metrics correctly', async () => {
      mockRequest.params = { campaignId: 'campaign-1', venueId: 'venue-123' };
      mockRequest.query = { model: 'first_touch' };

      await campaignController.getCampaignAttribution(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.totalRevenue).toBe(1250); // 500 + 750
      expect(sendCall.data.totalConversions).toBe(25); // 10 + 15
    });

    it('should return 400 if venueId is missing', async () => {
      mockRequest.params = { campaignId: 'campaign-1' };

      await campaignController.getCampaignAttribution(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Venue ID is required',
          statusCode: 400,
        },
      });
    });

    it('should calculate conversion rates correctly', async () => {
      mockRequest.params = { campaignId: 'campaign-1', venueId: 'venue-123' };

      await campaignController.getCampaignAttribution(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      const emailChannel = sendCall.data.attribution.find((a: any) => a.channel === 'email');
      expect(emailChannel.conversionRate).toBe(10); // (10 / 100) * 100
    });

    it('should handle zero clicks when calculating conversion rate', async () => {
      mockCampaignSchema.getCampaignPerformance.mockResolvedValue([
        {
          _id: 'email',
          impressions: 1000,
          clicks: 0,
          conversions: 0,
          revenue: 0,
        },
      ]);

      mockRequest.params = { campaignId: 'campaign-1', venueId: 'venue-123' };

      await campaignController.getCampaignAttribution(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.attribution[0].conversionRate).toBe(0);
    });
  });

  describe('getChannelPerformance', () => {
    it('should get channel performance for date range', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      await campaignController.getChannelPerformance(mockRequest, mockReply);

      expect(mockAttributionService.getChannelPerformance).toHaveBeenCalledWith(
        'venue-123',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          channels: expect.any(Array),
        },
      });
    });
  });

  describe('trackTouchpoint', () => {
    it('should track a customer touchpoint', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        customerId: 'customer-456',
        channel: 'email',
        action: 'click',
        value: 100,
        campaign: 'summer-sale',
        metadata: { source: 'newsletter' },
      };

      await campaignController.trackTouchpoint(mockRequest, mockReply);

      expect(mockAttributionService.trackTouchpoint).toHaveBeenCalledWith(
        'venue-123',
        'customer-456',
        expect.objectContaining({
          channel: 'email',
          action: 'click',
          value: 100,
          campaign: 'summer-sale',
          customerId: 'customer-456',
          source: 'newsletter',
        })
      );

      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('should use default values for optional fields', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        customerId: 'customer-456',
        channel: 'social',
        action: 'view',
      };

      await campaignController.trackTouchpoint(mockRequest, mockReply);

      expect(mockAttributionService.trackTouchpoint).toHaveBeenCalledWith(
        'venue-123',
        'customer-456',
        expect.objectContaining({
          value: 0,
          campaign: 'none',
        })
      );
    });
  });

  describe('getCampaignROI', () => {
    it('should get campaign ROI', async () => {
      mockRequest.params = { campaignId: 'campaign-1', venueId: 'venue-123' };

      await campaignController.getCampaignROI(mockRequest, mockReply);

      expect(mockAttributionService.getCampaignROI).toHaveBeenCalledWith(
        'venue-123',
        'campaign-1'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          roi: expect.objectContaining({
            roi: 2.5,
            totalRevenue: 5000,
          }),
        },
      });
    });

    it('should return 400 if venueId is missing', async () => {
      mockRequest.params = { campaignId: 'campaign-1' };

      await campaignController.getCampaignROI(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });
  });
});
