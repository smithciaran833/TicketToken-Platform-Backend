/**
 * Unit tests for src/utils/logger.ts
 * Tests pino logger configuration and security features
 */

// Create mock logger before importing pino
const createMockLogger = () => {
  const logger: any = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  logger.child = jest.fn().mockReturnValue(logger);
  return logger;
};

const mockLogger = createMockLogger();
const mockPino = Object.assign(
  jest.fn(() => mockLogger),
  { stdTimeFunctions: { isoTime: () => ',"time":"2024-01-01T00:00:00.000Z"' } }
);

jest.mock('pino', () => mockPino);

import pino from 'pino';

describe('utils/logger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Logger Configuration', () => {
    it('should create a pino logger instance', () => {
      const { logger } = require('../../../src/utils/logger');
      
      expect(logger).toBeDefined();
      expect(pino).toHaveBeenCalled();
    });

    it('should use LOG_LEVEL from environment', () => {
      process.env.LOG_LEVEL = 'debug';
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
        })
      );
    });

    it('should default to info level when LOG_LEVEL not set', () => {
      delete process.env.LOG_LEVEL;
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
        })
      );
    });

    it('should use ISO timestamp format', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Function),
        })
      );
    });

    it('should include service name in base', () => {
      process.env.SERVICE_NAME = 'test-service';
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          base: expect.objectContaining({
            service: 'test-service',
          }),
        })
      );
    });

    it('should default service name to venue-service', () => {
      delete process.env.SERVICE_NAME;
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          base: expect.objectContaining({
            service: 'venue-service',
          }),
        })
      );
    });

    it('should include environment in base', () => {
      process.env.NODE_ENV = 'test';
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          base: expect.objectContaining({
            env: 'test',
          }),
        })
      );
    });

    it('should default environment to development', () => {
      delete process.env.NODE_ENV;
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          base: expect.objectContaining({
            env: 'development',
          }),
        })
      );
    });
  });

  describe('Security - Sensitive Data Redaction', () => {
    it('should configure redaction for sensitive paths', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          redact: expect.objectContaining({
            censor: '[REDACTED]',
          }),
        })
      );
    });

    it('should redact password fields', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('password');
      expect(config.redact.paths).toContain('pass');
      expect(config.redact.paths).toContain('passwd');
    });

    it('should redact authentication tokens', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('token');
      expect(config.redact.paths).toContain('accessToken');
      expect(config.redact.paths).toContain('refreshToken');
      expect(config.redact.paths).toContain('access_token');
      expect(config.redact.paths).toContain('refresh_token');
      expect(config.redact.paths).toContain('jwt');
      expect(config.redact.paths).toContain('bearer');
    });

    it('should redact API keys', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('apiKey');
      expect(config.redact.paths).toContain('api_key');
    });

    it('should redact secrets', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('secret');
      expect(config.redact.paths).toContain('secretKey');
      expect(config.redact.paths).toContain('secret_key');
    });

    it('should redact authorization headers', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('authorization');
      expect(config.redact.paths).toContain('req.headers.authorization');
    });

    it('should redact cookies', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('req.headers.cookie');
      expect(config.redact.paths).toContain('res.headers["set-cookie"]');
    });

    it('should redact session IDs', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('sessionId');
      expect(config.redact.paths).toContain('session_id');
      expect(config.redact.paths).toContain('req.headers["x-session-id"]');
    });

    it('should redact credentials', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('credentials');
      expect(config.redact.paths).toContain('encrypted_credentials');
    });

    it('should redact encryption/signing keys', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('privateKey');
      expect(config.redact.paths).toContain('private_key');
      expect(config.redact.paths).toContain('publicKey');
      expect(config.redact.paths).toContain('public_key');
      expect(config.redact.paths).toContain('signingKey');
      expect(config.redact.paths).toContain('encryptionKey');
    });

    it('should redact Stripe/payment data', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('stripe_account_id');
      expect(config.redact.paths).toContain('stripeAccountId');
      expect(config.redact.paths).toContain('stripe_secret_key');
      expect(config.redact.paths).toContain('card_number');
      expect(config.redact.paths).toContain('cvv');
      expect(config.redact.paths).toContain('cvc');
    });

    it('should redact PII', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('email');
      expect(config.redact.paths).toContain('phone');
      expect(config.redact.paths).toContain('ssn');
      expect(config.redact.paths).toContain('date_of_birth');
      expect(config.redact.paths).toContain('address');
      expect(config.redact.paths).toContain('ip');
      expect(config.redact.paths).toContain('ipAddress');
    });

    it('should redact database connection strings', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('connectionString');
      expect(config.redact.paths).toContain('connection_string');
      expect(config.redact.paths).toContain('databaseUrl');
      expect(config.redact.paths).toContain('DATABASE_URL');
      expect(config.redact.paths).toContain('REDIS_URL');
      expect(config.redact.paths).toContain('MONGODB_URI');
    });

    it('should redact nested sensitive fields', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.redact.paths).toContain('*.password');
      expect(config.redact.paths).toContain('*.token');
      expect(config.redact.paths).toContain('*.secret');
      expect(config.redact.paths).toContain('*.apiKey');
      expect(config.redact.paths).toContain('*.credentials');
    });
  });

  describe('Serializers', () => {
    it('should have request serializer', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.serializers).toBeDefined();
      expect(config.serializers.req).toBeDefined();
      expect(typeof config.serializers.req).toBe('function');
    });

    it('should serialize request with id, method, url, and venueId', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      const mockReq = {
        id: 'req-123',
        method: 'GET',
        url: '/venues/abc',
        headers: { 'x-venue-id': 'venue-456' },
        other: 'should-not-appear',
      };
      
      const serialized = config.serializers.req(mockReq);
      
      expect(serialized).toEqual({
        id: 'req-123',
        method: 'GET',
        url: '/venues/abc',
        venueId: 'venue-456',
      });
    });

    it('should have response serializer', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      expect(config.serializers.res).toBeDefined();
      expect(typeof config.serializers.res).toBe('function');
    });

    it('should serialize response with statusCode only', () => {
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      const config = (pino as unknown as jest.Mock).mock.calls[0][0];
      const mockRes = {
        statusCode: 200,
        body: 'should-not-appear',
        headers: 'should-not-appear',
      };
      
      const serialized = config.serializers.res(mockRes);
      
      expect(serialized).toEqual({
        statusCode: 200,
      });
    });
  });

  describe('Environment-specific Configuration', () => {
    it('should use pino-pretty in non-production', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: expect.objectContaining({
            target: 'pino-pretty',
            options: expect.objectContaining({
              colorize: true,
            }),
          }),
        })
      );
    });

    it('should not use pino-pretty in production', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: undefined,
        })
      );
    });
  });
});
