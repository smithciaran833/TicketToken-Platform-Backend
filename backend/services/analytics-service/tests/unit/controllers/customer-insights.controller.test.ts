/**
 * Customer Insights Controller Unit Tests
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
  getCustomerProfile: jest.fn(),
  segmentCustomers: jest.fn(),
  getEventPreferences: jest.fn(),
  getVenueCustomers: jest.fn(),
  getCohortAnalysis: jest.fn(),
};

jest.mock('../../../src/services/customer-insights.service', () => ({
  customerInsightsService: mockCustomerInsightsService,
}));

import { customerInsightsController } from '../../../src/controllers/customer-insights.controller';

describe('CustomerInsightsController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      params: {},
      query: {},
      user: { id: 'user-123', tenantId: 'tenant-123', role: 'user' },
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Default mock responses
    mockCustomerInsightsService.getCustomerProfile.mockResolvedValue({
      id: 'user-123',
      email: 'customer@test.com',
      lifetimeValue: 5000,
    });

    mockCustomerInsightsService.segmentCustomers.mockResolvedValue([
      { segment: 'vip', count: 50, avgValue: 10000 },
      { segment: 'regular', count: 200, avgValue: 2000 },
    ]);

    mockCustomerInsightsService.getEventPreferences.mockResolvedValue({
      preferredCategories: ['music', 'sports'],
      preferredDays: ['friday', 'saturday'],
    });

    mockCustomerInsightsService.getVenueCustomers.mockResolvedValue([
      { id: 'customer-1', segment: 'vip' },
      { id: 'customer-2', segment: 'regular' },
    ]);

    mockCustomerInsightsService.getCohortAnalysis.mockResolvedValue([
      { cohort: '2024-01', retention: 0.8, revenue: 10000 },
    ]);
  });

  describe('getCustomerProfile', () => {
    it('should get customer profile for authorized user', async () => {
      mockRequest.params = { userId: 'user-123' };

      await customerInsightsController.getCustomerProfile(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getCustomerProfile).toHaveBeenCalledWith(
        'user-123',
        'tenant-123'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'user-123',
        }),
      });
    });

    it('should allow admin to view any profile', async () => {
      mockRequest.params = { userId: 'other-user' };
      mockRequest.user.role = 'admin';

      await customerInsightsController.getCustomerProfile(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getCustomerProfile).toHaveBeenCalledWith(
        'other-user',
        'tenant-123'
      );
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.params = { userId: 'user-123' };
      mockRequest.user = undefined;

      await customerInsightsController.getCustomerProfile(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
      });
    });

    it('should return 403 if user tries to access another profile', async () => {
      mockRequest.params = { userId: 'other-user' };

      await customerInsightsController.getCustomerProfile(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Forbidden',
      });
    });

    it('should return 404 if profile not found', async () => {
      mockRequest.params = { userId: 'user-123' };
      mockCustomerInsightsService.getCustomerProfile.mockResolvedValue(null);

      await customerInsightsController.getCustomerProfile(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Customer profile not found',
      });
    });

    it('should handle errors', async () => {
      mockRequest.params = { userId: 'user-123' };
      mockCustomerInsightsService.getCustomerProfile.mockRejectedValue(
        new Error('Database error')
      );

      await customerInsightsController.getCustomerProfile(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to get customer profile',
      });
    });
  });

  describe('getVenueCustomerSegments', () => {
    it('should get customer segments for venue', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      await customerInsightsController.getVenueCustomerSegments(mockRequest, mockReply);

      expect(mockCustomerInsightsService.segmentCustomers).toHaveBeenCalledWith(
        'venue-123',
        'tenant-123'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.any(Array),
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.user = undefined;

      await customerInsightsController.getVenueCustomerSegments(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should use venueId as fallback for tenantId', async () => {
      mockRequest.params = { venueId: 'venue-456' };
      mockRequest.user.tenantId = undefined;

      await customerInsightsController.getVenueCustomerSegments(mockRequest, mockReply);

      expect(mockCustomerInsightsService.segmentCustomers).toHaveBeenCalledWith(
        'venue-456',
        'venue-456'
      );
    });
  });

  describe('getCustomerPreferences', () => {
    it('should get customer preferences for authorized user', async () => {
      mockRequest.params = { userId: 'user-123' };

      await customerInsightsController.getCustomerPreferences(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getEventPreferences).toHaveBeenCalledWith(
        'user-123',
        'tenant-123'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.any(Object),
      });
    });

    it('should allow admin to view any preferences', async () => {
      mockRequest.params = { userId: 'other-user' };
      mockRequest.user.role = 'admin';

      await customerInsightsController.getCustomerPreferences(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getEventPreferences).toHaveBeenCalledWith(
        'other-user',
        'tenant-123'
      );
    });

    it('should return 403 if user tries to access another user preferences', async () => {
      mockRequest.params = { userId: 'other-user' };

      await customerInsightsController.getCustomerPreferences(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('getVenueCustomerList', () => {
    it('should get venue customers with default filters', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {};

      await customerInsightsController.getVenueCustomerList(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getVenueCustomers).toHaveBeenCalledWith(
        'venue-123',
        {
          segment: undefined,
          minSpent: undefined,
          daysSinceLastPurchase: undefined,
          eventCategory: undefined,
        }
      );
    });

    it('should apply filters from query', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {
        segment: 'vip',
        minSpent: '5000',
        daysSinceLastPurchase: '30',
        eventCategory: 'music',
      };

      await customerInsightsController.getVenueCustomerList(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getVenueCustomers).toHaveBeenCalledWith(
        'venue-123',
        {
          segment: 'vip',
          minSpent: 5000,
          daysSinceLastPurchase: 30,
          eventCategory: 'music',
        }
      );
    });

    it('should return customer count', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      await customerInsightsController.getVenueCustomerList(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.any(Array),
        count: 2,
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.user = undefined;

      await customerInsightsController.getVenueCustomerList(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('getCohortAnalysis', () => {
    it('should get cohort analysis with default date range', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {};

      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

      await customerInsightsController.getCohortAnalysis(mockRequest, mockReply);

      const call = mockCustomerInsightsService.getCohortAnalysis.mock.calls[0];
      expect(call[0]).toBe('venue-123');
      expect(call[1].getTime()).toBeGreaterThanOrEqual(oneYearAgo.getTime() - 1000);
      expect(call[2].getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
    });

    it('should use custom date range from query', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      await customerInsightsController.getCohortAnalysis(mockRequest, mockReply);

      expect(mockCustomerInsightsService.getCohortAnalysis).toHaveBeenCalledWith(
        'venue-123',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.user = undefined;

      await customerInsightsController.getCohortAnalysis(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });
});
