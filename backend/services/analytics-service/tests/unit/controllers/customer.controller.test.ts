/**
 * Customer Controller Unit Tests
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

const mockCustomerInsightsService = {
  segmentCustomers: jest.fn(),
  getCustomerProfile: jest.fn(),
  getCustomerCLV: jest.fn(),
  getVenueCustomers: jest.fn(),
  getRFMScores: jest.fn(),
};

const mockCustomerIntelligenceService = {
  generateCustomerInsights: jest.fn(),
  performRFMAnalysis: jest.fn(),
};

const mockAttributionService = {
  getCustomerJourney: jest.fn(),
};

jest.mock('../../../src/services/customer-insights.service', () => ({
  customerInsightsService: mockCustomerInsightsService,
}));

jest.mock('../../../src/services/customer-intelligence.service', () => ({
  customerIntelligenceService: mockCustomerIntelligenceService,
}));

jest.mock('../../../src/services/attribution.service', () => ({
  attributionService: mockAttributionService,
}));

import { customerController } from '../../../src/controllers/customer.controller';

describe('CustomerController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      params: {},
      query: {},
      user: { id: 'user-123', tenantId: 'tenant-123' },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Default mock responses
    mockCustomerInsightsService.segmentCustomers.mockResolvedValue([
      { segment: 'vip', count: 50 },
      { segment: 'regular', count: 200 },
    ]);

    mockCustomerInsightsService.getCustomerProfile.mockResolvedValue({
      id: 'customer-123',
      email: 'customer@test.com',
      lifetimeValue: 5000,
    });

    mockCustomerInsightsService.getCustomerCLV.mockResolvedValue({
      clv: 5000,
      predictedValue: 7000,
    });

    mockCustomerIntelligenceService.generateCustomerInsights.mockResolvedValue({
      insights: ['High value customer', 'Frequently purchases music events'],
    });

    mockCustomerIntelligenceService.performRFMAnalysis.mockResolvedValue({
      recency: 5,
      frequency: 4,
      monetary: 5,
      totalScore: 14,
    });

    mockAttributionService.getCustomerJourney.mockResolvedValue({
      touchpoints: [
        { timestamp: new Date(), channel: 'email', action: 'click' },
      ],
    });

    mockCustomerInsightsService.getVenueCustomers.mockResolvedValue([
      {
        id: 'customer-1',
        email: 'customer1@test.com',
        first_name: 'John',
        last_name: 'Doe',
        lifetime_value: 5000,
        average_order_value: 500,
        churn_risk: 'low',
      },
      {
        id: 'customer-2',
        email: 'customer2@test.com',
        first_name: 'Jane',
        last_name: 'Smith',
        lifetime_value: 3000,
        average_order_value: 300,
        churn_risk: 'medium',
      },
    ]);

    mockCustomerInsightsService.getRFMScores.mockResolvedValue([
      { customerId: 'customer-1', total_score: 14 },
      { customerId: 'customer-2', total_score: 10 },
    ]);
  });

  describe('getCustomerSegments', () => {
    it('should get customer segments for venue', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      await customerController.getCustomerSegments(mockRequest, mockReply);

      expect(mockCustomerInsightsService.segmentCustomers).toHaveBeenCalledWith(
        'venue-123',
        'tenant-123'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          segments: expect.any(Array),
        },
      });
    });

    it('should use venueId as fallback for tenantId', async () => {
      mockRequest.params = { venueId: 'venue-456' };
      mockRequest.user = undefined;

      await customerController.getCustomerSegments(mockRequest, mockReply);

      expect(mockCustomerInsightsService.segmentCustomers).toHaveBeenCalledWith(
        'venue-456',
        'venue-456'
      );
    });
  });

  describe('getCustomerProfile', () => {
    it('should get customer profile', async () => {
      mockRequest.params = { customerId: 'customer-123', venueId: 'venue-123' };

      await customerController.getCustomerProfile(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getCustomerProfile).toHaveBeenCalledWith(
        'customer-123',
        'tenant-123'
      );
    });

    it('should return 404 if profile not found', async () => {
      mockRequest.params = { customerId: 'nonexistent', venueId: 'venue-123' };
      mockCustomerInsightsService.getCustomerProfile.mockResolvedValue(null);

      await customerController.getCustomerProfile(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });
  });

  describe('getCustomerInsights', () => {
    it('should generate customer insights', async () => {
      mockRequest.params = { venueId: 'venue-123', customerId: 'customer-123' };

      await customerController.getCustomerInsights(mockRequest, mockReply);

      expect(mockCustomerIntelligenceService.generateCustomerInsights).toHaveBeenCalledWith(
        'venue-123',
        'customer-123'
      );
    });
  });

  describe('getCustomerJourney', () => {
    it('should get customer journey with default dates', async () => {
      mockRequest.params = { venueId: 'venue-123', customerId: 'customer-123' };
      mockRequest.query = {};

      await customerController.getCustomerJourney(mockRequest, mockReply);

      expect(mockAttributionService.getCustomerJourney).toHaveBeenCalledWith(
        'venue-123',
        'customer-123',
        undefined,
        undefined
      );
    });

    it('should get customer journey with custom dates', async () => {
      mockRequest.params = { venueId: 'venue-123', customerId: 'customer-123' };
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      await customerController.getCustomerJourney(mockRequest, mockReply);

      expect(mockAttributionService.getCustomerJourney).toHaveBeenCalledWith(
        'venue-123',
        'customer-123',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
    });
  });

  describe('getRFMAnalysis', () => {
    it('should perform RFM analysis', async () => {
      mockRequest.params = { venueId: 'venue-123', customerId: 'customer-123' };

      await customerController.getRFMAnalysis(mockRequest, mockReply);

      expect(mockCustomerIntelligenceService.performRFMAnalysis).toHaveBeenCalledWith(
        'venue-123',
        'customer-123'
      );
    });
  });

  describe('getCustomerLifetimeValue', () => {
    it('should get customer lifetime value', async () => {
      mockRequest.params = { customerId: 'customer-123', venueId: 'venue-123' };

      await customerController.getCustomerLifetimeValue(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getCustomerCLV).toHaveBeenCalledWith(
        'customer-123',
        'tenant-123'
      );
    });

    it('should return 404 if CLV not found', async () => {
      mockRequest.params = { customerId: 'nonexistent', venueId: 'venue-123' };
      mockCustomerInsightsService.getCustomerCLV.mockResolvedValue(null);

      await customerController.getCustomerLifetimeValue(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });
  });

  describe('searchCustomers', () => {
    it('should search customers with query', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { q: 'john' };

      await customerController.searchCustomers(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.customers).toHaveLength(1);
      expect(sendCall.data.customers[0].first_name).toBe('John');
    });

    it('should search by email', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { q: 'customer2@test.com' };

      await customerController.searchCustomers(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.customers[0].email).toBe('customer2@test.com');
    });

    it('should return all customers if no query provided', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {};

      await customerController.searchCustomers(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.customers).toHaveLength(2);
    });

    it('should filter by segment', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { segment: 'vip' };

      await customerController.searchCustomers(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getVenueCustomers).toHaveBeenCalledWith(
        'venue-123',
        expect.objectContaining({
          segment: 'vip',
        })
      );
    });

    it('should use default limit of 50', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {};

      await customerController.searchCustomers(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getVenueCustomers).toHaveBeenCalledWith(
        'venue-123',
        expect.objectContaining({
          limit: 50,
        })
      );
    });
  });

  describe('getSegmentAnalysis', () => {
    it('should analyze customer segment', async () => {
      mockRequest.params = { venueId: 'venue-123', segment: 'vip' };

      await customerController.getSegmentAnalysis(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getVenueCustomers).toHaveBeenCalledWith(
        'venue-123',
        {
          segment: 'vip',
          limit: 1000,
        }
      );

      expect(mockCustomerInsightsService.getRFMScores).toHaveBeenCalledWith(
        'venue-123',
        {
          segment: 'vip',
          limit: 1000,
        }
      );
    });

    it('should calculate segment metrics correctly', async () => {
      mockRequest.params = { venueId: 'venue-123', segment: 'vip' };

      await customerController.getSegmentAnalysis(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.analysis.totalCustomers).toBe(2);
      expect(sendCall.data.analysis.totalRevenue).toBe(8000); // 5000 + 3000
      expect(sendCall.data.analysis.avgOrderValue).toBe(400); // (500 + 300) / 2
    });

    it('should calculate churn risk distribution', async () => {
      mockRequest.params = { venueId: 'venue-123', segment: 'regular' };

      await customerController.getSegmentAnalysis(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.analysis.churnRiskDistribution).toEqual({
        low: 1,
        medium: 1,
        high: 0,
      });
    });

    it('should include top 10 customers', async () => {
      mockRequest.params = { venueId: 'venue-123', segment: 'vip' };

      await customerController.getSegmentAnalysis(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.analysis.topCustomers).toHaveLength(2);
    });

    it('should provide segment-specific recommendations', async () => {
      mockRequest.params = { venueId: 'venue-123', segment: 'vip' };

      await customerController.getSegmentAnalysis(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.analysis.recommendations).toContain(
        'Provide exclusive early access to events'
      );
    });

    it('should provide default recommendations for unknown segments', async () => {
      mockRequest.params = { venueId: 'venue-123', segment: 'unknown' };

      await customerController.getSegmentAnalysis(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.analysis.recommendations).toContain(
        'Analyze customer behavior patterns'
      );
    });

    it('should handle empty customer list', async () => {
      mockRequest.params = { venueId: 'venue-123', segment: 'dormant' };
      mockCustomerInsightsService.getVenueCustomers.mockResolvedValue([]);
      mockCustomerInsightsService.getRFMScores.mockResolvedValue([]);

      await customerController.getSegmentAnalysis(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.analysis.totalCustomers).toBe(0);
      expect(sendCall.data.analysis.avgOrderValue).toBe(0);
    });
  });
});
