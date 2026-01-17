import { FastifyInstance } from 'fastify';

// Mock before imports
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn(() => mockLogger),
}));

jest.mock('@fastify/cors', () => jest.fn());

import { setupCorsMiddleware } from '../../../src/middleware/cors.middleware';
import { createLogger } from '../../../src/utils/logger';
import { config } from '../../../src/config';

describe('cors.middleware', () => {
  let mockServer: any;
  let originCallback: Function;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    mockServer = {
      register: jest.fn().mockImplementation(async (plugin: any, options: any) => {
        // Capture the origin callback for testing
        if (options && options.origin) {
          originCallback = options.origin;
        }
      }),
    };

    // Mock config
    (config as any).cors = {
      origin: ['https://tickettoken.com', 'https://app.tickettoken.com'],
      credentials: true,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('setupCorsMiddleware', () => {
    it('registers fastifyCors plugin', async () => {
      await setupCorsMiddleware(mockServer);

      expect(mockServer.register).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('configures CORS with credentials from config', async () => {
      await setupCorsMiddleware(mockServer);

      const options = mockServer.register.mock.calls[0][1];
      expect(options.credentials).toBe(true);
    });

    it('configures allowed HTTP methods', async () => {
      await setupCorsMiddleware(mockServer);

      const options = mockServer.register.mock.calls[0][1];
      expect(options.methods).toEqual([
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
      ]);
    });

    it('configures allowed headers', async () => {
      await setupCorsMiddleware(mockServer);

      const options = mockServer.register.mock.calls[0][1];
      expect(options.allowedHeaders).toContain('Content-Type');
      expect(options.allowedHeaders).toContain('Authorization');
      expect(options.allowedHeaders).toContain('X-API-Key');
      expect(options.allowedHeaders).toContain('X-Request-ID');
      expect(options.allowedHeaders).toContain('Idempotency-Key');
    });

    it('configures exposed headers', async () => {
      await setupCorsMiddleware(mockServer);

      const options = mockServer.register.mock.calls[0][1];
      expect(options.exposedHeaders).toContain('X-Request-ID');
      expect(options.exposedHeaders).toContain('X-RateLimit-Limit');
      expect(options.exposedHeaders).toContain('X-RateLimit-Remaining');
      expect(options.exposedHeaders).toContain('Retry-After');
      expect(options.exposedHeaders).toContain('Deprecation');
    });

    it('sets maxAge to 24 hours', async () => {
      await setupCorsMiddleware(mockServer);

      const options = mockServer.register.mock.calls[0][1];
      expect(options.maxAge).toBe(86400);
    });

    it('logs configuration with strict mode false by default', async () => {
      await setupCorsMiddleware(mockServer);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { strictMode: false },
        'CORS middleware configured'
      );
    });

    it('logs configuration with strict mode true when enabled', async () => {
      process.env.CORS_STRICT = 'true';

      await setupCorsMiddleware(mockServer);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { strictMode: true },
        'CORS middleware configured'
      );
    });
  });

  describe('origin callback - no origin header', () => {
    it('allows requests without origin when not in strict mode', async () => {
      process.env.CORS_STRICT = 'false';
      process.env.NODE_ENV = 'production';

      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback(undefined, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('allows requests without origin in development', async () => {
      process.env.NODE_ENV = 'development';

      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback(null, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('blocks requests without origin in strict mode and production', async () => {
      process.env.CORS_STRICT = 'true';
      process.env.NODE_ENV = 'production';

      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback(undefined, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
      expect(callback.mock.calls[0][0].message).toBe('Origin header required');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Blocked request with no Origin header (strict mode)'
      );
    });

    it('allows requests without origin in strict mode but non-production', async () => {
      process.env.CORS_STRICT = 'true';
      process.env.NODE_ENV = 'development';

      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback(undefined, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });

  describe('origin callback - development mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('allows localhost origins', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('http://localhost:3000', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('allows 127.0.0.1 origins', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('http://127.0.0.1:8080', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('still checks allowed origins for non-localhost requests', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://tickettoken.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('blocks non-localhost origins not in allowed list', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://evil.com', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });
  });

  describe('origin callback - wildcard', () => {
    it('allows all origins when wildcard is in config', async () => {
      (config as any).cors.origin = ['*'];

      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://any-domain.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('allows any origin with wildcard even in production', async () => {
      process.env.NODE_ENV = 'production';
      (config as any).cors.origin = ['*'];

      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://untrusted.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });

  describe('origin callback - exact match', () => {
    it('allows origin with exact match', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://tickettoken.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('allows second origin in list', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://app.tickettoken.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('blocks origin not in allowed list', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://malicious.com', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
      expect(callback.mock.calls[0][0].message).toBe('Not allowed by CORS');
    });

    it('is case-sensitive for origin matching', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://TICKETTOKEN.COM', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });
  });

  describe('origin callback - pattern matching', () => {
    beforeEach(() => {
      (config as any).cors.origin = ['*.tickettoken.com'];
    });

    it('allows subdomain matching with wildcard pattern', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://app.tickettoken.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('allows deep subdomain matching', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://api.app.tickettoken.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('allows root domain when using wildcard pattern', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://tickettoken.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('blocks different domain even with similar name', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://tickettoken.com.evil.com', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });

    it('blocks domain that does not end with pattern', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://tickettokenfake.com', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });
  });

  describe('origin callback - multiple patterns', () => {
    beforeEach(() => {
      (config as any).cors.origin = [
        'https://tickettoken.com',
        '*.tickettoken.com',
        '*.staging.tickettoken.com',
      ];
    });

    it('allows exact match from multiple patterns', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://tickettoken.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('allows first wildcard pattern match', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://app.tickettoken.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('allows second wildcard pattern match', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://test.staging.tickettoken.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('blocks origin matching none of the patterns', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://prod.example.com', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });
  });

  describe('origin callback - logging', () => {
    it('logs warning when blocking origin', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://blocked.com', callback);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          origin: 'https://blocked.com',
          allowedOrigins: ['https://tickettoken.com', 'https://app.tickettoken.com'],
        },
        'Blocked by CORS policy'
      );
    });

    it('does not log warning when allowing origin', async () => {
      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://tickettoken.com', callback);

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('logs warning with correct origin in development when blocked', async () => {
      process.env.NODE_ENV = 'development';

      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://should-block.com', callback);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: 'https://should-block.com',
        }),
        'Blocked by CORS policy'
      );
    });
  });

  describe('edge cases', () => {
    it('handles empty allowed origins array', async () => {
      (config as any).cors.origin = [];

      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://any.com', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });

    it('handles origin with port number', async () => {
      (config as any).cors.origin = ['https://tickettoken.com:8443'];

      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://tickettoken.com:8443', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('blocks origin with different port', async () => {
      (config as any).cors.origin = ['https://tickettoken.com'];

      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('https://tickettoken.com:8443', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });

    it('handles http vs https differences', async () => {
      (config as any).cors.origin = ['https://tickettoken.com'];

      await setupCorsMiddleware(mockServer);

      const callback = jest.fn();
      originCallback('http://tickettoken.com', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });
  });
});
