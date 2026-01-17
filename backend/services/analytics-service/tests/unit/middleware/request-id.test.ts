/**
 * Request ID Middleware Unit Tests
 */

import { randomUUID } from 'crypto';
import { requestIdMiddleware, registerRequestId } from '../../../src/middleware/request-id';

describe('Request ID Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };

    mockReply = {
      header: jest.fn().mockReturnThis(),
    };
  });

  describe('requestIdMiddleware', () => {
    it('should generate request ID when not provided', async () => {
      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.requestId).toBeDefined();
      expect(mockRequest.requestId).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
      );
    });

    it('should use provided request ID from header', async () => {
      const providedId = 'custom-request-id-123';
      mockRequest.headers['x-request-id'] = providedId;

      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe(providedId);
    });

    it('should generate correlation ID when not provided', async () => {
      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.correlationId).toBeDefined();
      // Correlation ID defaults to request ID when not provided
      expect(mockRequest.correlationId).toBe(mockRequest.requestId);
    });

    it('should use provided correlation ID from header', async () => {
      const providedCorrelationId = 'correlation-id-456';
      mockRequest.headers['x-correlation-id'] = providedCorrelationId;

      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.correlationId).toBe(providedCorrelationId);
    });

    it('should generate trace ID when not provided', async () => {
      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.traceId).toBeDefined();
      expect(mockRequest.traceId).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
      );
    });

    it('should use provided trace ID from header', async () => {
      const providedTraceId = 'trace-id-789';
      mockRequest.headers['x-trace-id'] = providedTraceId;

      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.traceId).toBe(providedTraceId);
    });

    it('should set request ID in response header', async () => {
      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith(
        'x-request-id',
        mockRequest.requestId
      );
    });

    it('should set correlation ID in response header', async () => {
      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith(
        'x-correlation-id',
        mockRequest.correlationId
      );
    });

    it('should set trace ID in response header', async () => {
      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith(
        'x-trace-id',
        mockRequest.traceId
      );
    });

    it('should propagate all IDs through distributed system', async () => {
      const requestId = 'req-123';
      const correlationId = 'corr-456';
      const traceId = 'trace-789';

      mockRequest.headers['x-request-id'] = requestId;
      mockRequest.headers['x-correlation-id'] = correlationId;
      mockRequest.headers['x-trace-id'] = traceId;

      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe(requestId);
      expect(mockRequest.correlationId).toBe(correlationId);
      expect(mockRequest.traceId).toBe(traceId);
      expect(mockReply.header).toHaveBeenCalledWith('x-request-id', requestId);
      expect(mockReply.header).toHaveBeenCalledWith('x-correlation-id', correlationId);
      expect(mockReply.header).toHaveBeenCalledWith('x-trace-id', traceId);
    });
  });

  describe('registerRequestId', () => {
    it('should decorate request with ID properties', async () => {
      const mockFastify = {
        decorateRequest: jest.fn(),
        addHook: jest.fn(),
      };

      await registerRequestId(mockFastify as any);

      expect(mockFastify.decorateRequest).toHaveBeenCalledWith('requestId', null);
      expect(mockFastify.decorateRequest).toHaveBeenCalledWith('correlationId', null);
      expect(mockFastify.decorateRequest).toHaveBeenCalledWith('traceId', null);
    });

    it('should add preHandler hook', async () => {
      const mockFastify = {
        decorateRequest: jest.fn(),
        addHook: jest.fn(),
      };

      await registerRequestId(mockFastify as any);

      expect(mockFastify.addHook).toHaveBeenCalledWith('preHandler', requestIdMiddleware);
    });
  });
});
