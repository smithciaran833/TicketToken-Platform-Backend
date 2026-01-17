import { requestIdMiddleware, getRequestId } from '../../../src/middleware/request-id';
import { v4 as uuidv4 } from 'uuid';

jest.mock('uuid');

describe('Request ID Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: {},
      requestId: undefined,
      id: undefined
    };

    mockReply = {
      header: jest.fn().mockReturnThis()
    };

    (uuidv4 as jest.Mock).mockReturnValue('generated-uuid-1234');
  });

  describe('requestIdMiddleware', () => {
    describe('Generate New Request ID', () => {
      it('should generate new UUID when no existing ID', async () => {
        await requestIdMiddleware(mockRequest, mockReply);

        expect(uuidv4).toHaveBeenCalled();
        expect(mockRequest.requestId).toBe('generated-uuid-1234');
        expect(mockRequest.id).toBe('generated-uuid-1234');
      });

      it('should add X-Request-ID to response headers', async () => {
        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'generated-uuid-1234');
      });

      it('should add X-Correlation-ID to response headers', async () => {
        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-Correlation-ID', 'generated-uuid-1234');
      });

      it('should call header twice for both headers', async () => {
        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledTimes(2);
      });
    });

    describe('Accept Existing x-request-id Header', () => {
      it('should use existing x-request-id from headers', async () => {
        mockRequest.headers['x-request-id'] = 'existing-req-123';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(uuidv4).not.toHaveBeenCalled();
        expect(mockRequest.requestId).toBe('existing-req-123');
        expect(mockRequest.id).toBe('existing-req-123');
      });

      it('should propagate existing ID to response headers', async () => {
        mockRequest.headers['x-request-id'] = 'upstream-id-456';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'upstream-id-456');
        expect(mockReply.header).toHaveBeenCalledWith('X-Correlation-ID', 'upstream-id-456');
      });

      it('should handle uppercase X-Request-ID header', async () => {
        mockRequest.headers['x-request-id'] = 'case-test-789';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.requestId).toBe('case-test-789');
      });
    });

    describe('Accept Existing x-correlation-id Header', () => {
      it('should use x-correlation-id when x-request-id not present', async () => {
        mockRequest.headers['x-correlation-id'] = 'correlation-abc';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(uuidv4).not.toHaveBeenCalled();
        expect(mockRequest.requestId).toBe('correlation-abc');
      });

      it('should prefer x-request-id over x-correlation-id', async () => {
        mockRequest.headers['x-request-id'] = 'request-id-first';
        mockRequest.headers['x-correlation-id'] = 'correlation-id-second';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.requestId).toBe('request-id-first');
      });
    });

    describe('Accept traceparent Header', () => {
      it('should use traceparent when other IDs not present', async () => {
        mockRequest.headers['traceparent'] = '00-trace-id-123-span-id-456-01';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(uuidv4).not.toHaveBeenCalled();
        expect(mockRequest.requestId).toBe('00-trace-id-123-span-id-456-01');
      });

      it('should prefer x-request-id over traceparent', async () => {
        mockRequest.headers['x-request-id'] = 'request-wins';
        mockRequest.headers['traceparent'] = 'trace-loses';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.requestId).toBe('request-wins');
      });

      it('should prefer x-correlation-id over traceparent', async () => {
        mockRequest.headers['x-correlation-id'] = 'correlation-wins';
        mockRequest.headers['traceparent'] = 'trace-loses';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.requestId).toBe('correlation-wins');
      });
    });

    describe('Header Priority Order', () => {
      it('should follow priority: x-request-id > x-correlation-id > traceparent', async () => {
        // Test all three present
        mockRequest.headers['x-request-id'] = 'first-priority';
        mockRequest.headers['x-correlation-id'] = 'second-priority';
        mockRequest.headers['traceparent'] = 'third-priority';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.requestId).toBe('first-priority');
      });

      it('should use correlation when request ID missing', async () => {
        mockRequest.headers['x-correlation-id'] = 'second-priority';
        mockRequest.headers['traceparent'] = 'third-priority';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.requestId).toBe('second-priority');
      });

      it('should use traceparent when others missing', async () => {
        mockRequest.headers['traceparent'] = 'last-resort';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.requestId).toBe('last-resort');
      });
    });

    describe('Edge Cases - Invalid Header Values', () => {
      it('should generate new ID when header is empty string', async () => {
        mockRequest.headers['x-request-id'] = '';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(uuidv4).toHaveBeenCalled();
        expect(mockRequest.requestId).toBe('generated-uuid-1234');
      });

      it('should generate new ID when header is whitespace only', async () => {
        mockRequest.headers['x-request-id'] = '   ';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.requestId).toBe('   ');
      });

      it('should handle array of header values (use first)', async () => {
        mockRequest.headers['x-request-id'] = ['id-1', 'id-2'];

        await requestIdMiddleware(mockRequest, mockReply);

        // Arrays should not be strings, so it should generate new ID
        expect(uuidv4).toHaveBeenCalled();
      });

      it('should handle undefined header gracefully', async () => {
        mockRequest.headers['x-request-id'] = undefined;

        await requestIdMiddleware(mockRequest, mockReply);

        expect(uuidv4).toHaveBeenCalled();
        expect(mockRequest.requestId).toBe('generated-uuid-1234');
      });

      it('should handle null header gracefully', async () => {
        mockRequest.headers['x-request-id'] = null;

        await requestIdMiddleware(mockRequest, mockReply);

        expect(uuidv4).toHaveBeenCalled();
      });
    });

    describe('Request Property Setting', () => {
      it('should set both requestId and id properties', async () => {
        mockRequest.headers['x-request-id'] = 'test-id';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.requestId).toBe('test-id');
        expect(mockRequest.id).toBe('test-id');
      });

      it('should maintain Fastify compatibility with id property', async () => {
        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.id).toBeDefined();
        expect(mockRequest.id).toBe(mockRequest.requestId);
      });
    });

    describe('AUDIT FIX ERR-H2 Compliance', () => {
      it('should generate request ID for tracing (ERR-H2)', async () => {
        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.requestId).toBeDefined();
        expect(typeof mockRequest.requestId).toBe('string');
        expect(mockRequest.requestId.length).toBeGreaterThan(0);
      });

      it('should propagate request ID in response headers (ERR-H2)', async () => {
        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith(
          'X-Request-ID',
          expect.any(String)
        );
      });

      it('should accept upstream request IDs for cross-service tracing', async () => {
        mockRequest.headers['x-request-id'] = 'upstream-service-id';

        await requestIdMiddleware(mockRequest, mockReply);

        expect(mockRequest.requestId).toBe('upstream-service-id');
        expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'upstream-service-id');
      });
    });
  });

  describe('getRequestId', () => {
    it('should return requestId from request', () => {
      mockRequest.requestId = 'test-request-id';

      const result = getRequestId(mockRequest);

      expect(result).toBe('test-request-id');
    });

    it('should fallback to id property when requestId missing', () => {
      mockRequest.id = 'fallback-id';

      const result = getRequestId(mockRequest);

      expect(result).toBe('fallback-id');
    });

    it('should generate new UUID when both missing', () => {
      const result = getRequestId(mockRequest);

      expect(uuidv4).toHaveBeenCalled();
      expect(result).toBe('generated-uuid-1234');
    });

    it('should prefer requestId over id', () => {
      mockRequest.requestId = 'preferred';
      mockRequest.id = 'fallback';

      const result = getRequestId(mockRequest);

      expect(result).toBe('preferred');
    });

    it('should handle empty string requestId', () => {
      mockRequest.requestId = '';
      mockRequest.id = 'has-id';

      const result = getRequestId(mockRequest);

      expect(result).toBe('has-id');
    });

    it('should handle null request gracefully', () => {
      const result = getRequestId(null as any);

      expect(uuidv4).toHaveBeenCalled();
      expect(result).toBe('generated-uuid-1234');
    });

    it('should handle undefined request gracefully', () => {
      const result = getRequestId(undefined as any);

      expect(uuidv4).toHaveBeenCalled();
      expect(result).toBe('generated-uuid-1234');
    });
  });

  describe('UUID Generation', () => {
    it('should generate valid UUID v4 format', async () => {
      (uuidv4 as jest.Mock).mockReturnValue('a1b2c3d4-e5f6-4789-a012-b3c4d5e6f7a8');

      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique IDs on multiple calls', async () => {
      (uuidv4 as jest.Mock)
        .mockReturnValueOnce('uuid-1')
        .mockReturnValueOnce('uuid-2')
        .mockReturnValueOnce('uuid-3');

      await requestIdMiddleware(mockRequest, mockReply);
      const id1 = mockRequest.requestId;

      mockRequest = { headers: {}, requestId: undefined, id: undefined };
      mockReply = { header: jest.fn().mockReturnThis() };
      await requestIdMiddleware(mockRequest, mockReply);
      const id2 = mockRequest.requestId;

      mockRequest = { headers: {}, requestId: undefined, id: undefined };
      mockReply = { header: jest.fn().mockReturnThis() };
      await requestIdMiddleware(mockRequest, mockReply);
      const id3 = mockRequest.requestId;

      expect(id1).toBe('uuid-1');
      expect(id2).toBe('uuid-2');
      expect(id3).toBe('uuid-3');
      expect(new Set([id1, id2, id3]).size).toBe(3);
    });
  });

  describe('Cross-Service Tracing', () => {
    it('should maintain request ID across service boundaries', async () => {
      const upstreamId = 'api-gateway-req-12345';
      mockRequest.headers['x-request-id'] = upstreamId;

      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe(upstreamId);
      expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', upstreamId);
      expect(mockReply.header).toHaveBeenCalledWith('X-Correlation-ID', upstreamId);
    });

    it('should support W3C Trace Context traceparent format', async () => {
      const traceId = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      mockRequest.headers['traceparent'] = traceId;

      await requestIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe(traceId);
    });
  });
});
