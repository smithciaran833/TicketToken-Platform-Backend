// Mock crypto BEFORE imports
const mockRandomUUID = jest.fn();
jest.mock('crypto', () => ({
  randomUUID: mockRandomUUID,
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  requestIdMiddleware,
  getRequestId,
  getRequestMetadata,
} from '../../../src/middleware/request-id.middleware';

describe('request-id.middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockHeader: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRandomUUID.mockReturnValue('generated-uuid-456');
    mockHeader = jest.fn().mockReturnThis();

    mockRequest = {
      headers: {},
      id: undefined as any,
      requestId: undefined as any,
      method: 'GET',
      url: '/test',
      user: undefined,
    };

    mockReply = {
      header: mockHeader,
    };
  });

  describe('requestIdMiddleware', () => {
    it('should generate new request ID when none provided', async () => {
      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.requestId).toBe('generated-uuid-456');
      expect(mockRequest.id).toBe('generated-uuid-456');
      expect(mockRandomUUID).toHaveBeenCalled();
    });

    it('should use x-request-id from header', async () => {
      mockRequest.headers = { 'x-request-id': 'header-request-id' };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.requestId).toBe('header-request-id');
      expect(mockRequest.id).toBe('header-request-id');
      expect(mockRandomUUID).not.toHaveBeenCalled();
    });

    it('should use x-correlation-id from header if no x-request-id', async () => {
      mockRequest.headers = { 'x-correlation-id': 'correlation-id-123' };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.requestId).toBe('correlation-id-123');
      expect(mockRequest.id).toBe('correlation-id-123');
    });

    it('should prefer x-request-id over x-correlation-id', async () => {
      mockRequest.headers = {
        'x-request-id': 'request-id-first',
        'x-correlation-id': 'correlation-id-second',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.requestId).toBe('request-id-first');
    });

    it('should set X-Request-ID response header', async () => {
      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockHeader).toHaveBeenCalledWith('X-Request-ID', 'generated-uuid-456');
    });

    it('should set X-Correlation-ID response header', async () => {
      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockHeader).toHaveBeenCalledWith('X-Correlation-ID', 'generated-uuid-456');
    });

    it('should store request metadata', async () => {
      mockRequest.method = 'POST';
      mockRequest.url = '/api/users';
      mockRequest.headers = { 'user-agent': 'TestAgent/1.0' };
      (mockRequest as any).user = { id: 'user-123', venueId: 'venue-456' };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const metadata = (mockRequest as any).metadata;
      expect(metadata).toBeDefined();
      expect(metadata.requestId).toBe('generated-uuid-456');
      expect(metadata.method).toBe('POST');
      expect(metadata.url).toBe('/api/users');
      expect(metadata.userAgent).toBe('TestAgent/1.0');
      expect(metadata.userId).toBe('user-123');
      expect(metadata.venueId).toBe('venue-456');
      expect(metadata.timestamp).toBeGreaterThan(0);
    });

    it('should handle missing user', async () => {
      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const metadata = (mockRequest as any).metadata;
      expect(metadata.userId).toBeUndefined();
      expect(metadata.venueId).toBeUndefined();
    });

    it('should handle missing user-agent', async () => {
      mockRequest.headers = {};

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const metadata = (mockRequest as any).metadata;
      expect(metadata.userAgent).toBeUndefined();
    });

    it('should handle user without id', async () => {
      (mockRequest as any).user = { role: 'admin' };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const metadata = (mockRequest as any).metadata;
      expect(metadata.userId).toBeUndefined();
    });

    it('should record timestamp', async () => {
      const beforeTime = Date.now();

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const metadata = (mockRequest as any).metadata;
      expect(metadata.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(metadata.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('getRequestId', () => {
    it('should return requestId from request', () => {
      (mockRequest as any).requestId = 'request-id-123';

      const result = getRequestId(mockRequest as FastifyRequest);

      expect(result).toBe('request-id-123');
    });

    it('should return id if requestId not set', () => {
      (mockRequest as any).id = 'fallback-id-456';

      const result = getRequestId(mockRequest as FastifyRequest);

      expect(result).toBe('fallback-id-456');
    });

    it('should return unknown if neither is set', () => {
      const result = getRequestId(mockRequest as FastifyRequest);

      expect(result).toBe('unknown');
    });

    it('should prefer requestId over id', () => {
      (mockRequest as any).requestId = 'request-id-123';
      (mockRequest as any).id = 'fallback-id-456';

      const result = getRequestId(mockRequest as FastifyRequest);

      expect(result).toBe('request-id-123');
    });
  });

  describe('getRequestMetadata', () => {
    it('should return metadata from request', () => {
      const expectedMetadata = {
        requestId: 'test-id',
        timestamp: Date.now(),
        method: 'GET',
        url: '/test',
      };
      (mockRequest as any).metadata = expectedMetadata;

      const result = getRequestMetadata(mockRequest as FastifyRequest);

      expect(result).toEqual(expectedMetadata);
    });

    it('should return undefined if no metadata', () => {
      const result = getRequestMetadata(mockRequest as FastifyRequest);

      expect(result).toBeUndefined();
    });

    it('should return full metadata object', () => {
      (mockRequest as any).metadata = {
        requestId: 'req-123',
        timestamp: 1234567890,
        method: 'POST',
        url: '/api/test',
        userAgent: 'Test/1.0',
        userId: 'user-123',
        venueId: 'venue-456',
      };

      const result = getRequestMetadata(mockRequest as FastifyRequest);

      expect(result).toEqual({
        requestId: 'req-123',
        timestamp: 1234567890,
        method: 'POST',
        url: '/api/test',
        userAgent: 'Test/1.0',
        userId: 'user-123',
        venueId: 'venue-456',
      });
    });
  });
});
