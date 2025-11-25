import { complianceRoutes } from '../../../src/controllers/compliance.controller';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe('Compliance Controller', () => {
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
  // ALL /* - Proxy Compliance Requests - 4 test cases
  // =============================================================================

  describe('ALL /* - Proxy Compliance Requests', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await complianceRoutes(mockFastify as any);
      handler = mockFastify.all.mock.calls.find(
        (call: any) => call[0] === '/*'
      )[1];

      mockRequest = {
        method: 'GET',
        params: { venueId: 'venue-1', '*': 'status' },
        headers: { 'authorization': 'Bearer token123' },
        body: {},
        query: { detailed: true },
        ip: '192.168.1.1',
      };

      mockReply = createMockReply();
    });

    it('should proxy GET request successfully', async () => {
      const mockResponse = {
        status: 200,
        data: { compliant: true, checks: [] },
      };
      mockedAxios.mockResolvedValue(mockResponse);

      await handler(mockRequest, mockReply);

      expect(mockedAxios).toHaveBeenCalledWith({
        method: 'GET',
        url: 'http://compliance-service:3018/api/v1/venues/venue-1/compliance/status',
        headers: expect.objectContaining({
          'authorization': 'Bearer token123',
          'x-venue-id': 'venue-1',
          'x-forwarded-for': '192.168.1.1',
        }),
        data: {},
        params: { detailed: true },
      });
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({ compliant: true, checks: [] });
    });

    it('should proxy POST request with body', async () => {
      mockRequest.method = 'POST';
      mockRequest.body = { 
        checkType: 'accessibility', 
        data: { wheelchairAccess: true } 
      };
      mockRequest.params['*'] = 'verify';

      const mockResponse = {
        status: 201,
        data: { success: true, verificationId: 'verify-1' },
      };
      mockedAxios.mockResolvedValue(mockResponse);

      await handler(mockRequest, mockReply);

      expect(mockedAxios).toHaveBeenCalledWith({
        method: 'POST',
        url: 'http://compliance-service:3018/api/v1/venues/venue-1/compliance/verify',
        headers: expect.objectContaining({
          'x-venue-id': 'venue-1',
          'x-forwarded-for': '192.168.1.1',
        }),
        data: { checkType: 'accessibility', data: { wheelchairAccess: true } },
        params: { detailed: true },
      });
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ success: true, verificationId: 'verify-1' });
    });

    it('should handle compliance service error response', async () => {
      const mockError = {
        response: {
          status: 422,
          data: { error: 'Compliance check failed', violations: ['fire_code'] },
        },
      };
      mockedAxios.mockRejectedValue(mockError);

      await handler(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: 'venue-1' }),
        'Compliance proxy error'
      );
      expect(mockReply.code).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith({ 
        error: 'Compliance check failed', 
        violations: ['fire_code'] 
      });
    });

    it('should handle compliance service unavailable', async () => {
      const mockError = new Error('Connection refused');
      mockedAxios.mockRejectedValue(mockError);

      await handler(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: mockError, venueId: 'venue-1' }),
        'Compliance proxy error'
      );
      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Compliance service unavailable',
        message: 'The compliance service is currently unavailable',
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
      await complianceRoutes(mockFastify as any);
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
        data: { overview: 'compliance summary' },
      };
      mockedAxios.mockResolvedValue(mockResponse);

      await handler(mockRequest, mockReply);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://compliance-service:3018/api/v1/venues/venue-1/compliance/',
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
        data: { overview: 'compliance summary' },
      };
      mockedAxios.mockResolvedValue(mockResponse);

      await handler(mockRequest, mockReply);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://compliance-service:3018/api/v1/venues/venue-1/compliance/',
        })
      );
    });
  });
});
