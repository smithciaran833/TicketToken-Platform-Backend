/**
 * Unit Tests for Correlation ID Middleware
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  getCorrelationId,
  createTracingHeaders,
  generateCorrelationId,
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
} from '../../../src/middleware/correlation-id';

describe('middleware/correlation-id', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockHeaders: Record<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockHeaders = {};
    mockRequest = {
      id: 'req-123',
      headers: {},
      correlationId: undefined,
    };

    mockReply = {
      header: jest.fn((key: string, value: string) => {
        mockHeaders[key] = value;
        return mockReply as FastifyReply;
      }),
      getHeader: jest.fn((key: string) => mockHeaders[key]),
    } as any;
  });

  describe('getCorrelationId', () => {
    it('should return correlation ID from request', () => {
      mockRequest.correlationId = 'test-correlation-id';

      const result = getCorrelationId(mockRequest as FastifyRequest);

      expect(result).toBe('test-correlation-id');
    });

    it('should return correlation ID from headers if not on request object', () => {
      mockRequest.headers = {
        'x-correlation-id': 'header-correlation-id',
      };

      const result = getCorrelationId(mockRequest as FastifyRequest);

      expect(result).toBe('header-correlation-id');
    });

    it('should return "unknown" if no correlation ID found', () => {
      const result = getCorrelationId(mockRequest as FastifyRequest);

      expect(result).toBe('unknown');
    });
  });

  describe('createTracingHeaders', () => {
    it('should create headers with correlation ID and request ID', () => {
      mockRequest.correlationId = 'test-corr-id';
      mockRequest.id = 'req-456';

      const headers = createTracingHeaders(mockRequest as FastifyRequest);

      expect(headers).toEqual({
        'x-correlation-id': 'test-corr-id',
        'x-request-id': 'req-456',
      });
    });

    it('should handle missing correlation ID', () => {
      mockRequest.id = 'req-789';

      const headers = createTracingHeaders(mockRequest as FastifyRequest);

      expect(headers['x-request-id']).toBe('req-789');
      expect(headers['x-correlation-id']).toBeUndefined();
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate a valid UUID v4', () => {
      const id = generateCorrelationId();

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });

    it('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).not.toBe(id2);
    });
  });

  describe('constants', () => {
    it('should export correct header names', () => {
      expect(CORRELATION_ID_HEADER).toBe('x-correlation-id');
      expect(REQUEST_ID_HEADER).toBe('x-request-id');
    });
  });
});
