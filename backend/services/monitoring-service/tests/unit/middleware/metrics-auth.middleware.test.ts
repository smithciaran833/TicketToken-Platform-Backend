import { FastifyRequest, FastifyReply } from 'fastify';
import { metricsAuth } from '../../../src/middleware/metrics-auth.middleware';

jest.mock('../../../src/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { logger } from '../../../src/logger';

describe('Metrics Auth Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHeader: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn().mockReturnThis();
    mockHeader = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend, header: mockHeader });

    mockRequest = {
      headers: {},
      socket: { remoteAddress: '192.168.1.100' } as any,
    };

    mockReply = {
      status: mockStatus,
      send: mockSend,
      header: mockHeader,
    };

    delete process.env.PROMETHEUS_ALLOWED_IPS;
    delete process.env.METRICS_BASIC_AUTH;

    jest.clearAllMocks();
  });

  describe('IP Whitelist Authentication', () => {
    describe('default configuration', () => {
      it('should allow localhost (127.0.0.1) by default', async () => {
        mockRequest.socket = { remoteAddress: '127.0.0.1' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledWith('Metrics access granted for IP: 127.0.0.1');
      });

      it('should deny non-localhost IPs by default', async () => {
        mockRequest.socket = { remoteAddress: '10.0.0.1' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(403);
        expect(mockSend).toHaveBeenCalledWith({
          error: 'Access denied',
          message: 'Your IP address is not authorized to access metrics',
        });
      });
    });

    describe('custom IP whitelist', () => {
      it('should allow single whitelisted IP', async () => {
        process.env.PROMETHEUS_ALLOWED_IPS = '10.0.0.50';
        mockRequest.socket = { remoteAddress: '10.0.0.50' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });

      it('should allow multiple whitelisted IPs', async () => {
        process.env.PROMETHEUS_ALLOWED_IPS = '10.0.0.1,10.0.0.2,10.0.0.3';
        mockRequest.socket = { remoteAddress: '10.0.0.2' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });

      it('should handle whitespace in IP list', async () => {
        process.env.PROMETHEUS_ALLOWED_IPS = '10.0.0.1 , 10.0.0.2 , 10.0.0.3';
        mockRequest.socket = { remoteAddress: '10.0.0.2' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });

      it('should deny IP not in whitelist', async () => {
        process.env.PROMETHEUS_ALLOWED_IPS = '10.0.0.1,10.0.0.2';
        mockRequest.socket = { remoteAddress: '10.0.0.99' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(403);
        expect(logger.warn).toHaveBeenCalledWith('Metrics access denied for IP: 10.0.0.99');
      });
    });

    describe('CIDR range support', () => {
      it('should allow IP within /24 CIDR range', async () => {
        process.env.PROMETHEUS_ALLOWED_IPS = '192.168.1.0/24';
        mockRequest.socket = { remoteAddress: '192.168.1.150' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });

      it('should allow IP within /16 CIDR range', async () => {
        process.env.PROMETHEUS_ALLOWED_IPS = '10.10.0.0/16';
        mockRequest.socket = { remoteAddress: '10.10.255.255' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });

      it('should allow IP within /8 CIDR range', async () => {
        process.env.PROMETHEUS_ALLOWED_IPS = '10.0.0.0/8';
        mockRequest.socket = { remoteAddress: '10.255.255.255' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });

      it('should deny IP outside CIDR range', async () => {
        process.env.PROMETHEUS_ALLOWED_IPS = '192.168.1.0/24';
        mockRequest.socket = { remoteAddress: '192.168.2.1' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(403);
      });

      it('should handle /32 CIDR (single IP)', async () => {
        process.env.PROMETHEUS_ALLOWED_IPS = '10.0.0.5/32';
        mockRequest.socket = { remoteAddress: '10.0.0.5' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });

      it('should handle mixed IPs and CIDR ranges', async () => {
        process.env.PROMETHEUS_ALLOWED_IPS = '127.0.0.1,10.0.0.0/8,192.168.1.50';
        mockRequest.socket = { remoteAddress: '10.50.25.100' } as any;

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });
    });
  });

  describe('Client IP Extraction', () => {
    beforeEach(() => {
      process.env.PROMETHEUS_ALLOWED_IPS = '10.0.0.1,172.16.0.1,192.168.1.1';
    });

    it('should use X-Forwarded-For header when present (string)', async () => {
      mockRequest.headers = { 'x-forwarded-for': '10.0.0.1, 172.16.0.100' };
      mockRequest.socket = { remoteAddress: '127.0.0.1' } as any;

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Metrics access granted for IP: 10.0.0.1');
    });

    it('should use X-Forwarded-For header when present (array)', async () => {
      mockRequest.headers = { 'x-forwarded-for': ['10.0.0.1, 172.16.0.100'] };
      mockRequest.socket = { remoteAddress: '127.0.0.1' } as any;

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should use X-Real-IP header when X-Forwarded-For is absent', async () => {
      mockRequest.headers = { 'x-real-ip': '172.16.0.1' };
      mockRequest.socket = { remoteAddress: '127.0.0.1' } as any;

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Metrics access granted for IP: 172.16.0.1');
    });

    it('should handle X-Real-IP as array', async () => {
      mockRequest.headers = { 'x-real-ip': ['172.16.0.1'] };
      mockRequest.socket = { remoteAddress: '127.0.0.1' } as any;

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should fall back to socket.remoteAddress when no headers present', async () => {
      mockRequest.headers = {};
      mockRequest.socket = { remoteAddress: '192.168.1.1' } as any;

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Metrics access granted for IP: 192.168.1.1');
    });

    it('should return "unknown" when no IP source available', async () => {
      process.env.PROMETHEUS_ALLOWED_IPS = 'unknown';
      mockRequest.headers = {};
      mockRequest.socket = { remoteAddress: undefined } as any;

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should take first IP from X-Forwarded-For chain and trim whitespace', async () => {
      mockRequest.headers = { 'x-forwarded-for': '  10.0.0.1  , 172.16.0.100, 192.168.1.1' };

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(logger.debug).toHaveBeenCalledWith('Metrics access granted for IP: 10.0.0.1');
    });
  });

  describe('Basic Authentication', () => {
    beforeEach(() => {
      process.env.PROMETHEUS_ALLOWED_IPS = '127.0.0.1';
      mockRequest.socket = { remoteAddress: '10.0.0.99' } as any;
    });

    describe('when configured', () => {
      beforeEach(() => {
        process.env.METRICS_BASIC_AUTH = 'prometheus:secret123';
      });

      it('should allow valid basic auth credentials', async () => {
        const credentials = Buffer.from('prometheus:secret123').toString('base64');
        mockRequest.headers = { authorization: `Basic ${credentials}` };

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledWith(
          expect.stringContaining('Metrics access granted via Basic auth')
        );
      });

      it('should deny invalid password', async () => {
        const credentials = Buffer.from('prometheus:wrongpassword').toString('base64');
        mockRequest.headers = { authorization: `Basic ${credentials}` };

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
      });

      it('should deny invalid username', async () => {
        const credentials = Buffer.from('wronguser:secret123').toString('base64');
        mockRequest.headers = { authorization: `Basic ${credentials}` };

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
      });

      it('should return 401 with WWW-Authenticate header on failure', async () => {
        mockRequest.headers = {};

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Basic realm="Prometheus Metrics"');
        expect(mockSend).toHaveBeenCalledWith({ error: 'Authentication required' });
      });

      it('should deny non-Basic auth schemes', async () => {
        mockRequest.headers = { authorization: 'Bearer sometoken' };

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
      });

      it('should handle malformed base64 gracefully', async () => {
        mockRequest.headers = { authorization: 'Basic !!!notbase64!!!' };

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
      });

      it('should handle credentials without colon separator', async () => {
        const credentials = Buffer.from('nocolonseparator').toString('base64');
        mockRequest.headers = { authorization: `Basic ${credentials}` };

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
      });
    });

    describe('when not configured', () => {
      it('should return 403 without WWW-Authenticate header', async () => {
        delete process.env.METRICS_BASIC_AUTH;
        mockRequest.headers = {};

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(403);
        expect(mockHeader).not.toHaveBeenCalled();
        expect(mockSend).toHaveBeenCalledWith({
          error: 'Access denied',
          message: 'Your IP address is not authorized to access metrics',
        });
      });
    });

    describe('invalid configuration', () => {
      it('should warn and return null for missing password', async () => {
        process.env.METRICS_BASIC_AUTH = 'usernameonly';
        mockRequest.headers = {};

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(logger.warn).toHaveBeenCalledWith(
          'Invalid METRICS_BASIC_AUTH format. Expected username:password'
        );
        expect(mockStatus).toHaveBeenCalledWith(403);
      });

      it('should warn for empty password', async () => {
        process.env.METRICS_BASIC_AUTH = 'username:';
        mockRequest.headers = {};

        await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(logger.warn).toHaveBeenCalledWith(
          'Invalid METRICS_BASIC_AUTH format. Expected username:password'
        );
      });
    });
  });

  describe('Authentication Priority', () => {
    it('should allow IP whitelist even when basic auth is configured', async () => {
      process.env.PROMETHEUS_ALLOWED_IPS = '10.0.0.50';
      process.env.METRICS_BASIC_AUTH = 'user:pass';
      mockRequest.socket = { remoteAddress: '10.0.0.50' } as any;
      mockRequest.headers = {};

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Metrics access granted for IP: 10.0.0.50');
    });

    it('should fall back to basic auth when IP not whitelisted', async () => {
      process.env.PROMETHEUS_ALLOWED_IPS = '10.0.0.1';
      process.env.METRICS_BASIC_AUTH = 'user:pass';
      mockRequest.socket = { remoteAddress: '10.0.0.99' } as any;

      const credentials = Buffer.from('user:pass').toString('base64');
      mockRequest.headers = { authorization: `Basic ${credentials}` };

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Metrics access granted via Basic auth')
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle IPv6 localhost', async () => {
      process.env.PROMETHEUS_ALLOWED_IPS = '::1';
      mockRequest.socket = { remoteAddress: '::1' } as any;

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should handle empty PROMETHEUS_ALLOWED_IPS', async () => {
      process.env.PROMETHEUS_ALLOWED_IPS = '';
      mockRequest.socket = { remoteAddress: '10.0.0.1' } as any;

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(403);
    });

    it('should handle invalid IP format in request', async () => {
      process.env.PROMETHEUS_ALLOWED_IPS = '10.0.0.0/8';
      mockRequest.socket = { remoteAddress: 'not-an-ip' } as any;

      await metricsAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(403);
    });
  });
});
