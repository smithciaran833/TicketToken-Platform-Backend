/**
 * Unit tests for src/services/analytics.service.ts
 * Tests venue analytics: fetching analytics, tracking events
 * MEDIUM PRIORITY
 */

import { AnalyticsService } from '../../../src/services/analytics.service';

// Mock HttpClient
jest.mock('../../../src/utils/httpClient', () => ({
  HttpClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    post: jest.fn(),
  })),
}));

// Mock config
jest.mock('../../../src/config/index', () => ({
  getConfig: jest.fn().mockReturnValue({
    services: {
      analyticsService: 'http://analytics-service:3000',
    },
  }),
}));

describe('services/analytics.service', () => {
  let analyticsService: AnalyticsService;
  let mockLogger: any;
  let mockHttpClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    analyticsService = new AnalyticsService({ logger: mockLogger });
    
    // Get the mocked HttpClient instance
    const { HttpClient } = require('../../../src/utils/httpClient');
    mockHttpClient = HttpClient.mock.results[0]?.value || {
      get: jest.fn(),
      post: jest.fn(),
    };
  });

  describe('getVenueAnalytics()', () => {
    const venueId = 'venue-123';

    it('should call httpClient.get with correct URL', async () => {
      const mockResponse = { data: { visitors: 100, revenue: 5000 } };
      mockHttpClient.get = jest.fn().mockResolvedValue(mockResponse);
      
      // Re-create service with updated mock
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      await analyticsService.getVenueAnalytics(venueId);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `/venues/${venueId}/analytics`,
        expect.any(Object)
      );
    });

    it('should return analytics data', async () => {
      const analyticsData = { visitors: 100, revenue: 5000, events: 10 };
      const mockResponse = { data: analyticsData };
      mockHttpClient.get = jest.fn().mockResolvedValue(mockResponse);
      
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      const result = await analyticsService.getVenueAnalytics(venueId);

      expect(result).toEqual(analyticsData);
    });

    it('should pass options as query params', async () => {
      const mockResponse = { data: { visitors: 50 } };
      mockHttpClient.get = jest.fn().mockResolvedValue(mockResponse);
      
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      const options = { startDate: '2024-01-01', endDate: '2024-12-31' };
      await analyticsService.getVenueAnalytics(venueId, options);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `/venues/${venueId}/analytics`,
        { params: options }
      );
    });

    it('should log error on failure', async () => {
      const error = new Error('Network error');
      mockHttpClient.get = jest.fn().mockRejectedValue(error);
      
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      await expect(analyticsService.getVenueAnalytics(venueId))
        .rejects.toThrow('Network error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error, venueId }),
        'Failed to fetch venue analytics'
      );
    });

    it('should throw error on API failure', async () => {
      const error = new Error('API error');
      mockHttpClient.get = jest.fn().mockRejectedValue(error);
      
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      await expect(analyticsService.getVenueAnalytics(venueId))
        .rejects.toThrow(error);
    });
  });

  describe('trackEvent()', () => {
    it('should call httpClient.post with event data', async () => {
      const mockResponse = { data: { success: true } };
      mockHttpClient.post = jest.fn().mockResolvedValue(mockResponse);
      
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      const eventData = {
        venueId: 'venue-123',
        eventType: 'page_view',
        data: { page: '/events' },
      };

      await analyticsService.trackEvent(eventData);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/events', eventData);
    });

    it('should return response data on success', async () => {
      const responseData = { eventId: 'event-456', tracked: true };
      const mockResponse = { data: responseData };
      mockHttpClient.post = jest.fn().mockResolvedValue(mockResponse);
      
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      const eventData = {
        venueId: 'venue-123',
        eventType: 'ticket_purchase',
      };

      const result = await analyticsService.trackEvent(eventData);

      expect(result).toEqual(responseData);
    });

    it('should log error on failure', async () => {
      const error = new Error('Tracking failed');
      mockHttpClient.post = jest.fn().mockRejectedValue(error);
      
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      const eventData = {
        venueId: 'venue-123',
        eventType: 'click',
      };

      await expect(analyticsService.trackEvent(eventData))
        .rejects.toThrow('Tracking failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error, eventData }),
        'Failed to track event'
      );
    });

    it('should throw error on API failure', async () => {
      const error = new Error('Service unavailable');
      mockHttpClient.post = jest.fn().mockRejectedValue(error);
      
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      await expect(analyticsService.trackEvent({ type: 'test' }))
        .rejects.toThrow(error);
    });
  });

  describe('Event Types', () => {
    it('should track page_view events', async () => {
      const mockResponse = { data: { success: true } };
      mockHttpClient.post = jest.fn().mockResolvedValue(mockResponse);
      
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      await analyticsService.trackEvent({
        eventType: 'page_view',
        venueId: 'venue-123',
        page: '/home',
      });

      expect(mockHttpClient.post).toHaveBeenCalled();
    });

    it('should track ticket_purchase events', async () => {
      const mockResponse = { data: { success: true } };
      mockHttpClient.post = jest.fn().mockResolvedValue(mockResponse);
      
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      await analyticsService.trackEvent({
        eventType: 'ticket_purchase',
        venueId: 'venue-123',
        ticketId: 'ticket-456',
        amount: 50.00,
      });

      expect(mockHttpClient.post).toHaveBeenCalled();
    });

    it('should track venue_view events', async () => {
      const mockResponse = { data: { success: true } };
      mockHttpClient.post = jest.fn().mockResolvedValue(mockResponse);
      
      const { HttpClient } = require('../../../src/utils/httpClient');
      HttpClient.mockImplementation(() => mockHttpClient);
      analyticsService = new AnalyticsService({ logger: mockLogger });

      await analyticsService.trackEvent({
        eventType: 'venue_view',
        venueId: 'venue-123',
        userId: 'user-789',
      });

      expect(mockHttpClient.post).toHaveBeenCalled();
    });
  });
});
