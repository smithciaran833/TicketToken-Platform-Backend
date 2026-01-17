// Mock crypto BEFORE imports
const mockRandomUUID = jest.fn();
jest.mock('crypto', () => ({
  randomUUID: mockRandomUUID,
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  requestIdMiddleware,
  getRequestDuration,
} from '../../../src/middleware/request-id';

describe('request-id middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockHeader: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRandomUUID.mockReturnValue('generated-uuid-123');
    mockHeader = jest.fn().mockReturnThis();

    mockRequest = {
      headers: {},
      id: undefined as any,
      correlationId: undefined,
      startTime: undefined,
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

      expect(mockRequest.id).toBe('generated-uuid-123');
      expect(mockRandomUUID).toHaveBeenCalled();
      expect(mockHeader).toHaveBeenCalledWith('x-request-id', 'generated-uuid-123');
      expect(mockHeader).toHaveBeenCalledWith('x-correlation-id', 'generated-uuid-123');
    });

    it('should use valid incoming request ID', async () => {
      mockRequest.headers = {
        'x-request-id': 'valid-request-id-456',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.id).toBe('valid-request-id-456');
      expect(mockRandomUUID).not.toHaveBeenCalled();
      expect(mockHeader).toHaveBeenCalledWith('x-request-id', 'valid-request-id-456');
      expect(mockHeader).toHaveBeenCalledWith('x-correlation-id', 'valid-request-id-456');
    });

    it('should sanitize and lowercase incoming request ID', async () => {
      mockRequest.headers = {
        'x-request-id': '  VALID-ID-ABC  ',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.id).toBe('valid-id-abc');
    });

    it('should reject request ID with invalid characters', async () => {
      mockRequest.headers = {
        'x-request-id': 'invalid@id#with$symbols',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.id).toBe('generated-uuid-123');
      expect(mockRandomUUID).toHaveBeenCalled();
    });

    it('should reject request ID that is too short', async () => {
      mockRequest.headers = {
        'x-request-id': 'short',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.id).toBe('generated-uuid-123');
    });

    it('should reject request ID that is too long', async () => {
      mockRequest.headers = {
        'x-request-id': 'a'.repeat(65),
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.id).toBe('generated-uuid-123');
    });

    it('should accept request ID with dashes and underscores', async () => {
      mockRequest.headers = {
        'x-request-id': 'valid_request-id_123',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.id).toBe('valid_request-id_123');
    });

    it('should set start time for duration tracking', async () => {
      const beforeTime = Date.now();

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.startTime).toBeDefined();
      expect(mockRequest.startTime).toBeGreaterThanOrEqual(beforeTime);
      expect(mockRequest.startTime).toBeLessThanOrEqual(Date.now());
    });

    it('should use valid correlation ID from header', async () => {
      mockRequest.headers = {
        'x-correlation-id': 'correlation-123',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.correlationId).toBe('correlation-123');
      expect(mockHeader).toHaveBeenCalledWith('x-correlation-id', 'correlation-123');
    });

    it('should use request ID as correlation ID if none provided', async () => {
      mockRequest.headers = {
        'x-request-id': 'request-123',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.correlationId).toBe('request-123');
      expect(mockHeader).toHaveBeenCalledWith('x-correlation-id', 'request-123');
    });

    it('should use generated ID as correlation ID if no headers', async () => {
      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.correlationId).toBe('generated-uuid-123');
      expect(mockHeader).toHaveBeenCalledWith('x-correlation-id', 'generated-uuid-123');
    });

    it('should set both request ID and correlation ID headers', async () => {
      mockRequest.headers = {
        'x-request-id': 'request-id-123',
        'x-correlation-id': 'correlation-456',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockHeader).toHaveBeenCalledWith('x-request-id', 'request-id-123');
      expect(mockHeader).toHaveBeenCalledWith('x-correlation-id', 'correlation-456');
    });

    it('should reject invalid correlation ID and use request ID', async () => {
      mockRequest.headers = {
        'x-request-id': 'valid-req-123',
        'x-correlation-id': 'invalid@corr',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.correlationId).toBe('valid-req-123');
    });

    it('should handle empty string request ID', async () => {
      mockRequest.headers = {
        'x-request-id': '',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.id).toBe('generated-uuid-123');
      expect(mockRandomUUID).toHaveBeenCalled();
    });

    it('should handle whitespace-only request ID', async () => {
      mockRequest.headers = {
        'x-request-id': '   ',
      };

      await requestIdMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.id).toBe('generated-uuid-123');
    });
  });

  describe('getRequestDuration', () => {
    it('should return 0 when startTime not set', () => {
      const duration = getRequestDuration(mockRequest as FastifyRequest);
      expect(duration).toBe(0);
    });

    it('should calculate duration correctly', () => {
      const startTime = Date.now() - 1000; // 1 second ago
      mockRequest.startTime = startTime;

      const duration = getRequestDuration(mockRequest as FastifyRequest);

      expect(duration).toBeGreaterThanOrEqual(1000);
      expect(duration).toBeLessThan(1100); // Allow small tolerance
    });

    it('should return duration immediately after start', () => {
      mockRequest.startTime = Date.now();

      const duration = getRequestDuration(mockRequest as FastifyRequest);

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(10);
    });

    it('should handle undefined startTime', () => {
      mockRequest.startTime = undefined;

      const duration = getRequestDuration(mockRequest as FastifyRequest);

      expect(duration).toBe(0);
    });
  });
});
