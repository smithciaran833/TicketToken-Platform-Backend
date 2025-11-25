import { AnalyticsService } from '../../../src/services/analytics.service';
import { HttpClient } from '../../../src/utils/httpClient';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('../../../src/utils/httpClient');

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  let mockLogger: any;
  let mockHttpClient: jest.Mocked<HttpClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup logger mock
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Setup HttpClient mock
    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
    } as any;

    // Mock HttpClient constructor
    (HttpClient as jest.MockedClass<typeof HttpClient>).mockImplementation(() => mockHttpClient);

    // Create service instance
    analyticsService = new AnalyticsService({ logger: mockLogger });
  });

  // =============================================================================
  // constructor() - 3 test cases
  // =============================================================================

  describe('constructor()', () => {
    it('should initialize with logger', () => {
      expect(analyticsService).toBeDefined();
      expect((analyticsService as any).logger).toBe(mockLogger);
    });

    it('should create HttpClient with default URL', () => {
      delete process.env.ANALYTICS_API_URL;
      const service = new AnalyticsService({ logger: mockLogger });

      expect(HttpClient).toHaveBeenCalledWith(
        'http://analytics-service:3000',
        mockLogger
      );
    });

    it('should create HttpClient with environment URL', () => {
      process.env.ANALYTICS_API_URL = 'http://custom-analytics:4000';
      const service = new AnalyticsService({ logger: mockLogger });

      expect(HttpClient).toHaveBeenCalledWith(
        'http://custom-analytics:4000',
        mockLogger
      );

      delete process.env.ANALYTICS_API_URL;
    });
  });

  // =============================================================================
  // getVenueAnalytics() - 10 test cases
  // =============================================================================

  describe('getVenueAnalytics()', () => {
    const venueId = 'venue-123';
    const mockAnalyticsData = {
      totalEvents: 50,
      totalRevenue: 100000,
      averageAttendance: 15000,
      topEvents: [
        { name: 'Concert A', revenue: 50000 },
        { name: 'Concert B', revenue: 30000 },
      ],
    };

    it('should fetch venue analytics successfully', async () => {
      mockHttpClient.get.mockResolvedValue({ data: mockAnalyticsData });

      const result = await analyticsService.getVenueAnalytics(venueId);

      expect(result).toEqual(mockAnalyticsData);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `/venues/${venueId}/analytics`,
        { params: {} }
      );
    });

    it('should pass options as query parameters', async () => {
      const options = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        groupBy: 'month',
      };
      mockHttpClient.get.mockResolvedValue({ data: mockAnalyticsData });

      await analyticsService.getVenueAnalytics(venueId, options);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `/venues/${venueId}/analytics`,
        { params: options }
      );
    });

    it('should use empty options object by default', async () => {
      mockHttpClient.get.mockResolvedValue({ data: mockAnalyticsData });

      await analyticsService.getVenueAnalytics(venueId);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `/venues/${venueId}/analytics`,
        { params: {} }
      );
    });

    it('should return data from response', async () => {
      const customData = { custom: 'analytics' };
      mockHttpClient.get.mockResolvedValue({ data: customData });

      const result = await analyticsService.getVenueAnalytics(venueId);

      expect(result).toEqual(customData);
    });

    it('should handle empty analytics data', async () => {
      mockHttpClient.get.mockResolvedValue({ data: {} });

      const result = await analyticsService.getVenueAnalytics(venueId);

      expect(result).toEqual({});
    });

    it('should handle null analytics data', async () => {
      mockHttpClient.get.mockResolvedValue({ data: null });

      const result = await analyticsService.getVenueAnalytics(venueId);

      expect(result).toBeNull();
    });

    it('should log error and throw on failure', async () => {
      const error = new Error('Network error');
      mockHttpClient.get.mockRejectedValue(error);

      await expect(analyticsService.getVenueAnalytics(venueId)).rejects.toThrow(
        'Network error'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error, venueId },
        'Failed to fetch venue analytics'
      );
    });

    it('should throw error on HTTP error response', async () => {
      const error = new Error('404 Not Found');
      mockHttpClient.get.mockRejectedValue(error);

      await expect(analyticsService.getVenueAnalytics(venueId)).rejects.toThrow(
        '404 Not Found'
      );
    });

    it('should handle different venue IDs', async () => {
      const venueId1 = 'venue-111';
      const venueId2 = 'venue-222';
      mockHttpClient.get.mockResolvedValue({ data: mockAnalyticsData });

      await analyticsService.getVenueAnalytics(venueId1);
      await analyticsService.getVenueAnalytics(venueId2);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `/venues/${venueId1}/analytics`,
        expect.any(Object)
      );
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `/venues/${venueId2}/analytics`,
        expect.any(Object)
      );
    });

    it('should handle complex options object', async () => {
      const options = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        metrics: ['revenue', 'attendance', 'sales'],
        groupBy: 'week',
        timezone: 'America/New_York',
        includePredictions: true,
      };
      mockHttpClient.get.mockResolvedValue({ data: mockAnalyticsData });

      await analyticsService.getVenueAnalytics(venueId, options);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `/venues/${venueId}/analytics`,
        { params: options }
      );
    });
  });

  // =============================================================================
  // trackEvent() - 8 test cases
  // =============================================================================

  describe('trackEvent()', () => {
    const mockEventData = {
      eventType: 'venue_viewed',
      venueId: 'venue-123',
      userId: 'user-456',
      timestamp: new Date().toISOString(),
      metadata: {
        source: 'web',
        browser: 'Chrome',
      },
    };

    it('should track event successfully', async () => {
      const mockResponse = { id: 'event-789', status: 'tracked' };
      mockHttpClient.post.mockResolvedValue({ data: mockResponse });

      const result = await analyticsService.trackEvent(mockEventData);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/events', mockEventData);
    });

    it('should return data from response', async () => {
      const customResponse = { custom: 'response' };
      mockHttpClient.post.mockResolvedValue({ data: customResponse });

      const result = await analyticsService.trackEvent(mockEventData);

      expect(result).toEqual(customResponse);
    });

    it('should handle different event types', async () => {
      const events = [
        { eventType: 'venue_created', venueId: 'venue-1' },
        { eventType: 'venue_updated', venueId: 'venue-2' },
        { eventType: 'venue_deleted', venueId: 'venue-3' },
      ];
      mockHttpClient.post.mockResolvedValue({ data: { status: 'ok' } });

      for (const event of events) {
        await analyticsService.trackEvent(event);
      }

      expect(mockHttpClient.post).toHaveBeenCalledTimes(3);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/events', events[0]);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/events', events[1]);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/events', events[2]);
    });

    it('should handle minimal event data', async () => {
      const minimalEvent = { eventType: 'test_event' };
      mockHttpClient.post.mockResolvedValue({ data: { status: 'ok' } });

      await analyticsService.trackEvent(minimalEvent);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/events', minimalEvent);
    });

    it('should handle event data with nested objects', async () => {
      const complexEvent = {
        eventType: 'purchase',
        user: { id: 'user-1', email: 'test@example.com' },
        venue: { id: 'venue-1', name: 'Test Arena' },
        items: [
          { ticketId: 'ticket-1', price: 50 },
          { ticketId: 'ticket-2', price: 75 },
        ],
      };
      mockHttpClient.post.mockResolvedValue({ data: { status: 'ok' } });

      await analyticsService.trackEvent(complexEvent);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/events', complexEvent);
    });

    it('should log error and throw on failure', async () => {
      const error = new Error('Tracking failed');
      mockHttpClient.post.mockRejectedValue(error);

      await expect(analyticsService.trackEvent(mockEventData)).rejects.toThrow(
        'Tracking failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error, eventData: mockEventData },
        'Failed to track event'
      );
    });

    it('should throw error on HTTP error response', async () => {
      const error = new Error('500 Internal Server Error');
      mockHttpClient.post.mockRejectedValue(error);

      await expect(analyticsService.trackEvent(mockEventData)).rejects.toThrow(
        '500 Internal Server Error'
      );
    });

    it('should handle empty event data', async () => {
      const emptyEvent = {};
      mockHttpClient.post.mockResolvedValue({ data: { status: 'ok' } });

      await analyticsService.trackEvent(emptyEvent);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/events', emptyEvent);
    });
  });

  // =============================================================================
  // Error Handling - 4 test cases
  // =============================================================================

  describe('Error Handling', () => {
    it('should preserve error message from HttpClient', async () => {
      const customError = new Error('Custom error message');
      mockHttpClient.get.mockRejectedValue(customError);

      await expect(
        analyticsService.getVenueAnalytics('venue-123')
      ).rejects.toThrow('Custom error message');
    });

    it('should log complete error context for analytics fetch', async () => {
      const error = new Error('Fetch failed');
      const venueId = 'venue-789';
      mockHttpClient.get.mockRejectedValue(error);

      await expect(analyticsService.getVenueAnalytics(venueId)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error, venueId },
        'Failed to fetch venue analytics'
      );
    });

    it('should log complete error context for event tracking', async () => {
      const error = new Error('Track failed');
      const eventData = { eventType: 'test' };
      mockHttpClient.post.mockRejectedValue(error);

      await expect(analyticsService.trackEvent(eventData)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error, eventData },
        'Failed to track event'
      );
    });

    it('should not swallow errors', async () => {
      const error = new Error('Network timeout');
      mockHttpClient.get.mockRejectedValue(error);

      let caughtError;
      try {
        await analyticsService.getVenueAnalytics('venue-123');
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBe(error);
    });
  });

  // =============================================================================
  // Integration - 3 test cases
  // =============================================================================

  describe('Integration', () => {
    it('should use same HttpClient instance for multiple calls', async () => {
      mockHttpClient.get.mockResolvedValue({ data: {} });
      mockHttpClient.post.mockResolvedValue({ data: {} });

      await analyticsService.getVenueAnalytics('venue-1');
      await analyticsService.trackEvent({ eventType: 'test' });
      await analyticsService.getVenueAnalytics('venue-2');

      expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it('should maintain logger reference across calls', async () => {
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');
      
      mockHttpClient.get.mockRejectedValue(error1);
      await expect(analyticsService.getVenueAnalytics('venue-1')).rejects.toThrow();

      mockHttpClient.post.mockRejectedValue(error2);
      await expect(analyticsService.trackEvent({})).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent requests', async () => {
      mockHttpClient.get.mockResolvedValue({ data: { metric: 1 } });
      mockHttpClient.post.mockResolvedValue({ data: { status: 'ok' } });

      const promises = [
        analyticsService.getVenueAnalytics('venue-1'),
        analyticsService.getVenueAnalytics('venue-2'),
        analyticsService.trackEvent({ eventType: 'test1' }),
        analyticsService.trackEvent({ eventType: 'test2' }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(4);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
      expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
    });
  });
});
