/**
 * Unit Tests for Security Headers Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Security Headers Middleware', () => {
  let securityHeadersMiddleware: any;
  let metricsNetworkRestriction: any;
  let registerSecurityMiddleware: any;
  let isFromAllowedNetwork: any;
  let logger: any;

  let mockRequest: any;
  let mockReply: any;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    const module = await import('../../../src/middleware/security-headers');
    securityHeadersMiddleware = module.securityHeadersMiddleware;
    metricsNetworkRestriction = module.metricsNetworkRestriction;
    registerSecurityMiddleware = module.registerSecurityMiddleware;
    isFromAllowedNetwork = module.default.isFromAllowedNetwork;

    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
      url: '/metrics',
      id: 'req-123'
    };

    mockReply = {
      header: jest.fn<(name: string, value: string) => any>().mockReturnThis(),
      removeHeader: jest.fn<(name: string) => any>().mockReturnThis(),
      code: jest.fn<(code: number) => any>().mockReturnThis(),
      send: jest.fn<(body: any) => any>().mockReturnThis()
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('securityHeadersMiddleware', () => {
    it('should set X-Content-Type-Options header', async () => {
      await securityHeadersMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should set X-Frame-Options header', async () => {
      await securityHeadersMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    it('should set X-XSS-Protection header', async () => {
      await securityHeadersMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    });

    it('should set Referrer-Policy header', async () => {
      await securityHeadersMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    });

    it('should set Content-Security-Policy header', async () => {
      await securityHeadersMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'"
      );
    });

    it('should set Cache-Control header', async () => {
      await securityHeadersMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private'
      );
    });

    it('should remove X-Powered-By header', async () => {
      await securityHeadersMiddleware(mockRequest, mockReply);

      expect(mockReply.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    });

    describe('HSTS in production', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production';
      });

      it('should set HSTS header in production', async () => {
        jest.resetModules();
        process.env.NODE_ENV = 'production';
        
        const freshModule = await import('../../../src/middleware/security-headers');
        await freshModule.securityHeadersMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith(
          'Strict-Transport-Security',
          expect.stringContaining('max-age=31536000')
        );
      });

      it('should include includeSubDomains in HSTS', async () => {
        jest.resetModules();
        process.env.NODE_ENV = 'production';
        
        const freshModule = await import('../../../src/middleware/security-headers');
        await freshModule.securityHeadersMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith(
          'Strict-Transport-Security',
          expect.stringContaining('includeSubDomains')
        );
      });

      it('should include preload in HSTS', async () => {
        jest.resetModules();
        process.env.NODE_ENV = 'production';
        
        const freshModule = await import('../../../src/middleware/security-headers');
        await freshModule.securityHeadersMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith(
          'Strict-Transport-Security',
          expect.stringContaining('preload')
        );
      });
    });

    describe('HSTS in non-production', () => {
      it('should not set HSTS header in development', async () => {
        process.env.NODE_ENV = 'development';
        jest.resetModules();

        const freshModule = await import('../../../src/middleware/security-headers');
        await freshModule.securityHeadersMiddleware(mockRequest, mockReply);

        const hstsCall = mockReply.header.mock.calls.find(
          (call: any[]) => call[0] === 'Strict-Transport-Security'
        );
        expect(hstsCall).toBeUndefined();
      });
    });
  });

  describe('metricsNetworkRestriction', () => {
    it('should allow requests from localhost (127.0.0.1)', async () => {
      mockRequest.ip = '127.0.0.1';

      await metricsNetworkRestriction(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should allow requests from private network 10.x.x.x', async () => {
      mockRequest.ip = '10.0.0.50';

      await metricsNetworkRestriction(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow requests from private network 172.16.x.x', async () => {
      mockRequest.ip = '172.16.0.100';

      await metricsNetworkRestriction(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow requests from private network 192.168.x.x', async () => {
      mockRequest.ip = '192.168.1.1';

      await metricsNetworkRestriction(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow requests from IPv6 localhost', async () => {
      mockRequest.ip = '::1';

      await metricsNetworkRestriction(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should deny requests from public IPs', async () => {
      mockRequest.ip = '8.8.8.8';

      await metricsNetworkRestriction(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
          title: 'Forbidden',
          detail: 'Access to metrics is restricted to internal networks'
        })
      );
    });

    it('should deny requests from external IPs', async () => {
      mockRequest.ip = '203.0.113.50';

      await metricsNetworkRestriction(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('should log warning when access is denied', async () => {
      mockRequest.ip = '8.8.8.8';

      await metricsNetworkRestriction(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          clientIP: '8.8.8.8',
          path: '/metrics'
        }),
        expect.stringContaining('Metrics access denied')
      );
    });

    it('should use x-forwarded-for header when present', async () => {
      mockRequest.ip = '127.0.0.1';
      mockRequest.headers['x-forwarded-for'] = '8.8.8.8, 10.0.0.1';

      await metricsNetworkRestriction(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('should use x-real-ip header when present', async () => {
      mockRequest.ip = '127.0.0.1';
      mockRequest.headers['x-real-ip'] = '8.8.8.8';

      await metricsNetworkRestriction(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('should include request instance in error response', async () => {
      mockRequest.ip = '8.8.8.8';
      mockRequest.id = 'unique-request-123';

      await metricsNetworkRestriction(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          instance: 'unique-request-123'
        })
      );
    });
  });

  describe('registerSecurityMiddleware', () => {
    it('should register onRequest hook with Fastify', async () => {
      const mockApp = {
        addHook: jest.fn<(name: string, handler: any) => void>()
      };

      await registerSecurityMiddleware(mockApp as any);

      expect(mockApp.addHook).toHaveBeenCalledWith('onRequest', securityHeadersMiddleware);
    });

    it('should log registration info', async () => {
      const mockApp = {
        addHook: jest.fn<(name: string, handler: any) => void>()
      };

      await registerSecurityMiddleware(mockApp as any);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          hstsMaxAge: 31536000
        }),
        expect.stringContaining('Security headers middleware registered')
      );
    });
  });

  describe('isFromAllowedNetwork', () => {
    it('should return true for localhost', () => {
      mockRequest.ip = '127.0.0.1';
      expect(isFromAllowedNetwork(mockRequest)).toBe(true);
    });

    it('should return true for private networks', () => {
      mockRequest.ip = '10.0.0.1';
      expect(isFromAllowedNetwork(mockRequest)).toBe(true);

      mockRequest.ip = '172.16.0.1';
      expect(isFromAllowedNetwork(mockRequest)).toBe(true);

      mockRequest.ip = '192.168.0.1';
      expect(isFromAllowedNetwork(mockRequest)).toBe(true);
    });

    it('should return false for public IPs', () => {
      mockRequest.ip = '8.8.8.8';
      expect(isFromAllowedNetwork(mockRequest)).toBe(false);
    });
  });

  describe('default export', () => {
    it('should export all functions', async () => {
      const module = await import('../../../src/middleware/security-headers');
      
      expect(module.default).toHaveProperty('securityHeadersMiddleware');
      expect(module.default).toHaveProperty('metricsNetworkRestriction');
      expect(module.default).toHaveProperty('registerSecurityMiddleware');
      expect(module.default).toHaveProperty('isFromAllowedNetwork');
    });
  });
});
