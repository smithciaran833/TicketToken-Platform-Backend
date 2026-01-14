import { correlationMiddleware, getCorrelationHeaders } from '../../../src/middleware/correlation.middleware';

describe('correlation.middleware', () => {
  describe('correlationMiddleware', () => {
    let mockApp: any;
    let onRequestHook: Function;
    let onResponseHook: Function;

    beforeEach(() => {
      mockApp = {
        addHook: jest.fn((hookName: string, handler: Function) => {
          if (hookName === 'onRequest') {
            onRequestHook = handler;
          } else if (hookName === 'onResponse') {
            onResponseHook = handler;
          }
        }),
      };
    });

    it('should register onRequest and onResponse hooks', async () => {
      await correlationMiddleware(mockApp);

      expect(mockApp.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
      expect(mockApp.addHook).toHaveBeenCalledWith('onResponse', expect.any(Function));
    });

    describe('onRequest hook', () => {
      beforeEach(async () => {
        await correlationMiddleware(mockApp);
      });

      it('should use existing x-correlation-id header', async () => {
        const mockRequest: any = {
          headers: {
            'x-correlation-id': 'existing-correlation-id',
          },
          id: 'fastify-request-id',
        };
        const mockReply: any = {
          header: jest.fn(),
        };

        await onRequestHook(mockRequest, mockReply);

        expect(mockRequest.correlationId).toBe('existing-correlation-id');
        expect(mockReply.header).toHaveBeenCalledWith('x-correlation-id', 'existing-correlation-id');
        expect(mockReply.header).toHaveBeenCalledWith('x-request-id', 'existing-correlation-id');
      });

      it('should use x-request-id header if x-correlation-id not present', async () => {
        const mockRequest: any = {
          headers: {
            'x-request-id': 'request-id-header',
          },
          id: 'fastify-request-id',
        };
        const mockReply: any = {
          header: jest.fn(),
        };

        await onRequestHook(mockRequest, mockReply);

        expect(mockRequest.correlationId).toBe('request-id-header');
      });

      it('should use fastify request.id if no headers present', async () => {
        const mockRequest: any = {
          headers: {},
          id: 'fastify-request-id',
        };
        const mockReply: any = {
          header: jest.fn(),
        };

        await onRequestHook(mockRequest, mockReply);

        expect(mockRequest.correlationId).toBe('fastify-request-id');
      });

      it('should generate UUID if no existing correlation ID', async () => {
        const mockRequest: any = {
          headers: {},
          id: undefined,
        };
        const mockReply: any = {
          header: jest.fn(),
        };

        await onRequestHook(mockRequest, mockReply);

        expect(mockRequest.correlationId).toBeDefined();
        expect(mockRequest.correlationId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
      });

      it('should set response headers', async () => {
        const mockRequest: any = {
          headers: {},
          id: undefined,
        };
        const mockReply: any = {
          header: jest.fn(),
        };

        await onRequestHook(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('x-correlation-id', expect.any(String));
        expect(mockReply.header).toHaveBeenCalledWith('x-request-id', expect.any(String));
      });
    });

    describe('onResponse hook', () => {
      beforeEach(async () => {
        await correlationMiddleware(mockApp);
      });

      it('should log request completion with correlation ID', async () => {
        const mockLog = {
          info: jest.fn(),
        };
        const mockRequest: any = {
          correlationId: 'test-correlation-id',
          method: 'GET',
          url: '/api/test',
          log: mockLog,
        };
        const mockReply: any = {
          statusCode: 200,
          elapsedTime: 123.45,
        };

        await onResponseHook(mockRequest, mockReply);

        expect(mockLog.info).toHaveBeenCalledWith(
          {
            correlationId: 'test-correlation-id',
            method: 'GET',
            url: '/api/test',
            statusCode: 200,
            responseTime: 123.45,
          },
          'Request completed'
        );
      });
    });
  });

  describe('getCorrelationHeaders', () => {
    it('should return headers with correlation ID from request', () => {
      const mockRequest: any = {
        correlationId: 'my-correlation-id',
      };

      const headers = getCorrelationHeaders(mockRequest);

      expect(headers).toEqual({
        'x-correlation-id': 'my-correlation-id',
        'x-request-id': 'my-correlation-id',
      });
    });
  });
});
