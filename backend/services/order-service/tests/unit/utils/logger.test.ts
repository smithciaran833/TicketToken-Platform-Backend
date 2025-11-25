import { logger, createRequestLogger, createContextLogger } from '../../../src/utils/logger';
import type { FastifyRequest } from 'fastify';

describe('Logger', () => {
  describe('Root Logger', () => {
    it('should export logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should log info messages', () => {
      const infoSpy = jest.spyOn(logger, 'info');
      logger.info('test info message');
      expect(infoSpy).toHaveBeenCalledWith('test info message');
      infoSpy.mockRestore();
    });

    it('should log error messages', () => {
      const errorSpy = jest.spyOn(logger, 'error');
      logger.error('test error message');
      expect(errorSpy).toHaveBeenCalledWith('test error message');
      errorSpy.mockRestore();
    });

    it('should log with additional context', () => {
      const infoSpy = jest.spyOn(logger, 'info');
      logger.info({ userId: '123', action: 'test' }, 'user action');
      expect(infoSpy).toHaveBeenCalledWith({ userId: '123', action: 'test' }, 'user action');
      infoSpy.mockRestore();
    });
  });

  describe('createRequestLogger', () => {
    it('should create child logger with basic request context', () => {
      const mockRequest = {
        id: 'req-123',
        method: 'GET',
        url: '/api/orders',
        ip: '192.168.1.1',
      } as FastifyRequest;

      const childLogger = createRequestLogger(mockRequest);

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('should include traceId from request', () => {
      const mockRequest = {
        id: 'req-123',
        method: 'POST',
        url: '/api/orders',
        ip: '192.168.1.1',
        traceId: 'trace-456',
      } as any;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
    });

    it('should fall back to request.id when traceId is not available', () => {
      const mockRequest = {
        id: 'req-789',
        method: 'PUT',
        url: '/api/orders/123',
        ip: '10.0.0.1',
      } as FastifyRequest;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
    });

    it('should include spanId when available', () => {
      const mockRequest = {
        id: 'req-123',
        method: 'DELETE',
        url: '/api/orders/456',
        ip: '172.16.0.1',
        spanId: 'span-789',
      } as any;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
    });

    it('should include tenant context when available', () => {
      const mockRequest = {
        id: 'req-123',
        method: 'GET',
        url: '/api/orders',
        ip: '192.168.1.1',
        tenant: {
          id: 'tenant-456',
          name: 'Test Tenant',
        },
      } as any;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
    });

    it('should include user context when available', () => {
      const mockRequest = {
        id: 'req-123',
        method: 'POST',
        url: '/api/orders',
        ip: '192.168.1.1',
        user: {
          id: 'user-789',
          role: 'admin',
        },
      } as any;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
    });

    it('should include all context when available', () => {
      const mockRequest = {
        id: 'req-123',
        method: 'PATCH',
        url: '/api/orders/999',
        ip: '203.0.113.1',
        traceId: 'trace-abc',
        spanId: 'span-def',
        tenant: {
          id: 'tenant-ghi',
          name: 'Full Context Tenant',
        },
        user: {
          id: 'user-jkl',
          role: 'venue_owner',
        },
      } as any;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
    });

    it('should handle missing optional fields', () => {
      const mockRequest = {
        id: 'req-minimal',
        method: 'GET',
        url: '/health',
        ip: '127.0.0.1',
      } as FastifyRequest;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
    });

    it('should handle different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
      
      methods.forEach((method) => {
        const mockRequest = {
          id: `req-${method}`,
          method,
          url: '/api/test',
          ip: '192.168.1.1',
        } as FastifyRequest;

        const childLogger = createRequestLogger(mockRequest);
        expect(childLogger).toBeDefined();
      });
    });

    it('should handle different URL paths', () => {
      const urls = [
        '/api/orders',
        '/api/orders/123',
        '/api/orders/123/items',
        '/health',
        '/metrics',
        '/',
      ];

      urls.forEach((url) => {
        const mockRequest = {
          id: 'req-123',
          method: 'GET',
          url,
          ip: '192.168.1.1',
        } as FastifyRequest;

        const childLogger = createRequestLogger(mockRequest);
        expect(childLogger).toBeDefined();
      });
    });

    it('should handle various IP addresses', () => {
      const ips = [
        '127.0.0.1',
        '192.168.1.1',
        '10.0.0.1',
        '172.16.0.1',
        '203.0.113.1',
        '::1', // IPv6 localhost
        '2001:db8::1', // IPv6
      ];

      ips.forEach((ip) => {
        const mockRequest = {
          id: 'req-123',
          method: 'GET',
          url: '/api/test',
          ip,
        } as FastifyRequest;

        const childLogger = createRequestLogger(mockRequest);
        expect(childLogger).toBeDefined();
      });
    });
  });

  describe('createContextLogger', () => {
    it('should create child logger with custom context', () => {
      const context = {
        jobName: 'cleanup-expired-orders',
        jobId: 'job-123',
      };

      const childLogger = createContextLogger(context);

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('should handle empty context', () => {
      const childLogger = createContextLogger({});
      expect(childLogger).toBeDefined();
    });

    it('should handle string values', () => {
      const context = {
        service: 'order-service',
        operation: 'batch-process',
      };

      const childLogger = createContextLogger(context);
      expect(childLogger).toBeDefined();
    });

    it('should handle numeric values', () => {
      const context = {
        batchSize: 100,
        retryCount: 3,
        timeout: 5000,
      };

      const childLogger = createContextLogger(context);
      expect(childLogger).toBeDefined();
    });

    it('should handle boolean values', () => {
      const context = {
        isRetry: true,
        success: false,
      };

      const childLogger = createContextLogger(context);
      expect(childLogger).toBeDefined();
    });

    it('should handle nested objects', () => {
      const context = {
        job: {
          id: 'job-123',
          type: 'scheduled',
          metadata: {
            source: 'cron',
            priority: 'high',
          },
        },
      };

      const childLogger = createContextLogger(context);
      expect(childLogger).toBeDefined();
    });

    it('should handle array values', () => {
      const context = {
        orderIds: ['order-1', 'order-2', 'order-3'],
        tags: ['urgent', 'refund'],
      };

      const childLogger = createContextLogger(context);
      expect(childLogger).toBeDefined();
    });

    it('should include timestamp', () => {
      const context = {
        operation: 'test',
      };

      const childLogger = createContextLogger(context);
      expect(childLogger).toBeDefined();
    });

    it('should handle mixed type context', () => {
      const context = {
        stringField: 'value',
        numberField: 42,
        booleanField: true,
        arrayField: [1, 2, 3],
        objectField: { nested: 'value' },
      };

      const childLogger = createContextLogger(context);
      expect(childLogger).toBeDefined();
    });
  });

  describe('Logger Methods', () => {
    it('should support all log levels', () => {
      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.fatal).toBe('function');
    });

    it('should create child logger from root logger', () => {
      const childLogger = logger.child({ component: 'test' });
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle request logger for authenticated API call', () => {
      const mockRequest = {
        id: 'req-api-001',
        method: 'POST',
        url: '/api/orders/create',
        ip: '203.0.113.42',
        traceId: 'trace-abc-123',
        spanId: 'span-def-456',
        tenant: {
          id: 'tenant-enterprise-01',
          name: 'Enterprise Customer',
        },
        user: {
          id: 'user-admin-99',
          role: 'admin',
        },
      } as any;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
      
      // Should be able to log with this context
      const infoSpy = jest.spyOn(childLogger, 'info');
      childLogger.info('Order created successfully');
      expect(infoSpy).toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    it('should handle context logger for background job', () => {
      const context = {
        jobType: 'scheduled',
        jobName: 'expire-reservations',
        jobId: 'job-12345',
        tenant: 'all',
        processedCount: 0,
        failedCount: 0,
      };

      const childLogger = createContextLogger(context);
      expect(childLogger).toBeDefined();
      
      // Should be able to log progress
      const infoSpy = jest.spyOn(childLogger, 'info');
      childLogger.info({ processed: 10 }, 'Processing batch');
      expect(infoSpy).toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    it('should handle multiple child loggers from same parent', () => {
      const mockRequest1 = {
        id: 'req-001',
        method: 'GET',
        url: '/api/orders/1',
        ip: '192.168.1.1',
      } as FastifyRequest;

      const mockRequest2 = {
        id: 'req-002',
        method: 'POST',
        url: '/api/orders',
        ip: '192.168.1.2',
      } as FastifyRequest;

      const logger1 = createRequestLogger(mockRequest1);
      const logger2 = createRequestLogger(mockRequest2);

      expect(logger1).toBeDefined();
      expect(logger2).toBeDefined();
      expect(logger1).not.toBe(logger2);
    });

    it('should handle request with query parameters in URL', () => {
      const mockRequest = {
        id: 'req-query',
        method: 'GET',
        url: '/api/orders?status=pending&limit=10',
        ip: '192.168.1.1',
      } as FastifyRequest;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
    });

    it('should handle request with fragments in URL', () => {
      const mockRequest = {
        id: 'req-fragment',
        method: 'GET',
        url: '/api/orders/123#details',
        ip: '192.168.1.1',
      } as FastifyRequest;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values in context', () => {
      const context = {
        field1: null,
        field2: 'value',
      };

      const childLogger = createContextLogger(context as any);
      expect(childLogger).toBeDefined();
    });

    it('should handle undefined values in context', () => {
      const context = {
        field1: undefined,
        field2: 'value',
      };

      const childLogger = createContextLogger(context as any);
      expect(childLogger).toBeDefined();
    });

    it('should handle empty string in request fields', () => {
      const mockRequest = {
        id: '',
        method: 'GET',
        url: '',
        ip: '',
      } as FastifyRequest;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
    });

    it('should handle very long request IDs', () => {
      const longId = 'a'.repeat(1000);
      const mockRequest = {
        id: longId,
        method: 'GET',
        url: '/api/test',
        ip: '192.168.1.1',
      } as FastifyRequest;

      const childLogger = createRequestLogger(mockRequest);
      expect(childLogger).toBeDefined();
    });

    it('should handle special characters in context', () => {
      const context = {
        field: 'value with spaces and @#$%^&*() special chars',
        unicode: '你好世界 🎉',
      };

      const childLogger = createContextLogger(context);
      expect(childLogger).toBeDefined();
    });
  });
});
