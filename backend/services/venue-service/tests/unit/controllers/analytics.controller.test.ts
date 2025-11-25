import { analyticsRoutes } from '../../../src/controllers/analytics.controller';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe('Analytics Controller', () => {
  let mockFastify: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Mock Fastify instance
    mockFastify = {
      all: jest.fn(),
      container: {
        cradle: {
          logger: mockLogger,
        },
      },
    };
  });

  // Helper to create mock reply
  const createMockReply = () => ({
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    code: jest.fn().mockReturnThis(),
  });

  // =============================================================================
  // ALL /* - Proxy Analytics Requests - 4 test cases
  // =============================================================================

  describe('ALL /* - Proxy Analytics Requests', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await analyticsRoutes(mockFastify as any);
      handler = mockFastify.all.mock.calls.find(
        (call: any) => call[0] === '/*'
      )[1];

      mockRequest = {
        method: 'GET',
        params: { venueId: 'venue-1', '*': 'events' },
        headers: { 'authorization': 'Bearer token123' },
        body: {},
        query: { limit: 10 },
        ip: '192.168.1.1',
      };

      mockReply = createMockReply();
    });

    it('should proxy GET request successfully', async () => {
      const mockResponse = {
        status: 200,
        data: { events: [], total: 0 },
      };
      mockedAxios.mockResolvedValue(mockResponse);

      await handler(mockRequest, mockReply);

      expect(mockedAxios).toHaveBeenCalledWith({
        method: 'GET',
        url: 'http://analytics-service:3010/venues/venue-1/events',
        headers: expect.objectContaining({
          'authorization': 'Bearer token123',
          'x-venue-id': 'venue-1',
          'x-forwarded-for': '192.168.1.1',
        }),
        data: {},
        params: { limit: 10 },
      });
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({ events: [], total: 0 });
    });

    it('should proxy POST request with body', async () => {
      mockRequest.method = 'POST';
      mockRequest.body = { eventName: 'test-event', data: { visits: 100 } };
      mockRequest.params['*'] = 'track';

      const mockResponse = {
        status: 201,
        data: { success: true, id: 'event-1' },
      };
      mockedAxios.mockResolvedValue(mockResponse);

      await handler(mockRequest, mockReply);

      expect(mockedAxios).toHaveBeenCalledWith({
        method: 'POST',
        url: 'http://analytics-service:3010/venues/venue-1/track',
        headers: expect.objectContaining({
          'x-venue-id': 'venue-1',
          'x-forwarded-for': '192.168.1.1',
        }),
        data: { eventName: 'test-event', data: { visits: 100 } },
        params: { limit: 10 },
      });
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ success: true, id: 'event-1' });
    });

    it('should handle analytics service error response', async () => {
      const mockError = {
        response: {
          status: 404,
          data: { error: 'Venue not found in analytics' },
        },
      };
      mockedAxios.mockRejectedValue(mockError);

      await handler(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: 'venue-1' }),
        'Analytics proxy error'
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Venue not found in analytics' });
    });

    it('should handle analytics service unavailable', async () => {
      const mockError = new Error('Network error');
      mockedAxios.mockRejectedValue(mockError);

      await handler(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: mockError, venueId: 'venue-1' }),
        'Analytics proxy error'
      );
      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Analytics service unavailable',
        message: 'The analytics service is currently unavailable',
      });
    });
  });

  // =============================================================================
  // Edge Cases - 2 test cases
  // =============================================================================

  describe('Edge Cases', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await analyticsRoutes(mockFastify as any);
      handler = mockFastify.all.mock.calls.find(
        (call: any) => call[0] === '/*'
      )[1];

      mockReply = createMockReply();
    });

    it('should handle empty path parameter', async () => {
      mockRequest = {
        method: 'GET',
        params: { venueId: 'venue-1', '*': '' },
        headers: {},
        body: {},
        query: {},
        ip: '127.0.0.1',
      };

      const mockResponse = {
        status: 200,
        data: { summary: 'venue analytics' },
      };
      mockedAxios.mockResolvedValue(mockResponse);

      await handler(mockRequest, mockReply);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://analytics-service:3010/venues/venue-1/',
        })
      );
    });

    it('should handle undefined path parameter', async () => {
      mockRequest = {
        method: 'GET',
        params: { venueId: 'venue-1' },
        headers: {},
        body: {},
        query: {},
        ip: '127.0.0.1',
      };

      const mockResponse = {
        status: 200,
        data: { summary: 'venue analytics' },
      };
      mockedAxios.mockResolvedValue(mockResponse);

      await handler(mockRequest, mockReply);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://analytics-service:3010/venues/venue-1/',
        })
      );
    });
  });
});
