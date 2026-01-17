/**
 * Tests for Configuration Validation
 */

// Mock dependencies
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

describe('Config Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let validate: any;
  let mockConfig: any;
  let mockIsProduction: jest.Mock;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
    jest.clearAllMocks();

    // Set up base test environment
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'test_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_password';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-32-chars';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-32-characters';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long';

    // Create mock config
    mockIsProduction = jest.fn().mockReturnValue(false);

    mockConfig = {
      server: {
        port: 3012,
        host: '0.0.0.0',
        logLevel: 'info',
        corsOrigin: '*',
      },
      database: {
        host: 'localhost',
        name: 'test_db',
        user: 'test_user',
        password: 'test_password',
        ssl: false,
        poolMin: 2,
        poolMax: 10,
      },
      redis: {
        host: 'localhost',
        port: 6379,
        password: 'redis-password',
      },
      jwt: {
        secret: 'test-jwt-secret-that-is-long-enough-32-chars',
        algorithm: 'HS256',
        issuer: 'tickettoken',
        audience: 'tickettoken-api',
      },
      providers: {
        stripe: { clientId: '', clientSecret: '' },
        square: { clientId: '', clientSecret: '' },
        ticketmaster: { clientId: '' },
        eventbrite: { clientId: '' },
        mailchimp: { clientId: '', clientSecret: '' },
        quickbooks: { clientId: '', clientSecret: '' },
      },
      services: {
        authServiceUrl: '',
        eventServiceUrl: '',
        ticketServiceUrl: '',
        paymentServiceUrl: '',
      },
      security: {
        requestSizeLimit: '10mb',
      },
    };

    // Mock the config module
    jest.mock('../../../src/config/index', () => ({
      config: mockConfig,
      isProduction: mockIsProduction,
    }));

    validate = require('../../../src/config/validate');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  describe('validateConfig', () => {
    it('should pass with valid configuration', () => {
      const result = validate.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect all errors and warnings', () => {
      mockConfig.server.port = 70000; // Invalid
      mockConfig.database.host = ''; // Missing

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateServerConfig', () => {
    it('should pass with valid server config', () => {
      const result = validate.validateConfig();

      expect(result.valid).toBe(true);
    });

    it('should fail with invalid port number', () => {
      mockConfig.server.port = 70000;

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid PORT: 70000');
    });

    it('should warn about non-standard host', () => {
      mockConfig.server.host = '192.168.1.1';

      const result = validate.validateConfig();

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Host is set to 192.168.1.1');
    });
  });

  describe('validateDatabaseConfig', () => {
    it('should pass with valid database config', () => {
      const result = validate.validateConfig();

      expect(result.valid).toBe(true);
    });

    it('should fail when DATABASE_HOST is missing', () => {
      mockConfig.database.host = '';

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DATABASE_HOST is required');
    });

    it('should fail when DATABASE_NAME is missing', () => {
      mockConfig.database.name = '';

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DATABASE_NAME is required');
    });

    it('should fail when DATABASE_USER is missing', () => {
      mockConfig.database.user = '';

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DATABASE_USER is required');
    });

    it('should fail when DATABASE_PASSWORD is missing in production', () => {
      mockIsProduction.mockReturnValue(true);
      mockConfig.database.password = '';

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DATABASE_PASSWORD is required in production');
    });

    it('should fail when pool min exceeds max', () => {
      mockConfig.database.poolMin = 20;
      mockConfig.database.poolMax = 10;

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('DATABASE_POOL_MIN');
      expect(result.errors[0]).toContain('cannot exceed DATABASE_POOL_MAX');
    });

    it('should warn when SSL is enabled in non-production', () => {
      mockConfig.database.ssl = true;

      const result = validate.validateConfig();

      expect(result.warnings).toContain('SSL is enabled in non-production environment');
    });

    it('should fail when SSL is disabled in production', () => {
      mockIsProduction.mockReturnValue(true);
      mockConfig.database.ssl = false;

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Database SSL must be enabled in production');
    });
  });

  describe('validateRedisConfig', () => {
    it('should pass with valid Redis config', () => {
      const result = validate.validateConfig();

      expect(result.valid).toBe(true);
    });

    it('should fail when REDIS_HOST is missing in production', () => {
      mockIsProduction.mockReturnValue(true);
      mockConfig.redis.host = '';

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('REDIS_HOST is required in production');
    });

    it('should warn when REDIS_HOST is missing in non-production', () => {
      mockConfig.redis.host = '';

      const result = validate.validateConfig();

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('REDIS_HOST not set');
    });

    it('should fail with invalid REDIS_PORT', () => {
      mockConfig.redis.port = 70000;

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid REDIS_PORT: 70000');
    });

    it('should warn when REDIS_PASSWORD is missing in production', () => {
      mockIsProduction.mockReturnValue(true);
      mockConfig.redis.password = undefined;

      const result = validate.validateConfig();

      expect(result.warnings).toContain('REDIS_PASSWORD not set in production');
    });
  });

  describe('validateJwtConfig', () => {
    it('should pass with valid JWT config', () => {
      const result = validate.validateConfig();

      expect(result.valid).toBe(true);
    });

    it('should fail when JWT_SECRET is missing', () => {
      mockConfig.jwt.secret = '';

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('JWT_SECRET is required');
    });

    it('should fail when JWT_SECRET is too short', () => {
      mockConfig.jwt.secret = 'short';

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('JWT_SECRET should be at least 32 characters');
    });

    it('should fail with invalid JWT_ALGORITHM', () => {
      mockConfig.jwt.algorithm = 'INVALID';

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid JWT_ALGORITHM');
    });

    it('should warn when JWT_ISSUER is missing', () => {
      mockConfig.jwt.issuer = '';

      const result = validate.validateConfig();

      expect(result.warnings).toContain('JWT_ISSUER not set');
    });

    it('should warn when JWT_AUDIENCE is missing', () => {
      mockConfig.jwt.audience = '';

      const result = validate.validateConfig();

      expect(result.warnings).toContain('JWT_AUDIENCE not set');
    });
  });

  describe('validateOAuthConfig', () => {
    it('should pass with no providers configured', () => {
      const result = validate.validateConfig();

      expect(result.valid).toBe(true);
    });

    it('should fail when CLIENT_SECRET missing but CLIENT_ID set in production', () => {
      // Set up valid production config first
      mockIsProduction.mockReturnValue(true);
      mockConfig.database.ssl = true;
      mockConfig.providers.stripe.clientId = 'stripe-client-id';
      mockConfig.providers.stripe.clientSecret = '';

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('STRIPE_CLIENT_SECRET required'))).toBe(true);
    });

    it('should warn when Stripe webhook secret is missing', () => {
      // Set up valid production config
      mockIsProduction.mockReturnValue(true);
      mockConfig.database.ssl = true;
      mockConfig.providers.stripe.clientId = 'stripe-id';
      mockConfig.providers.stripe.clientSecret = 'stripe-secret';
      mockConfig.providers.stripe.webhookSecret = '';

      const result = validate.validateConfig();

      expect(result.warnings.some(w => w.includes('STRIPE_WEBHOOK_SECRET not set'))).toBe(true);
    });
  });

  describe('validateServiceUrls', () => {
    it('should pass with no URLs configured in non-production', () => {
      const result = validate.validateConfig();

      expect(result.valid).toBe(true);
    });

    it('should warn when URLs are missing in production', () => {
      mockIsProduction.mockReturnValue(true);
      mockConfig.database.ssl = true;

      const result = validate.validateConfig();

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should fail with invalid URL format', () => {
      mockConfig.services.authServiceUrl = 'not-a-valid-url';

      const result = validate.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid AUTH_SERVICE_URL');
    });

    it('should pass with valid URLs', () => {
      mockConfig.services.authServiceUrl = 'http://auth-service:3000';
      mockConfig.services.eventServiceUrl = 'http://event-service:3001';

      const result = validate.validateConfig();

      expect(result.valid).toBe(true);
    });
  });

  describe('validateSecurityConfig', () => {
    it('should warn when CORS is wildcard in production', () => {
      mockIsProduction.mockReturnValue(true);
      mockConfig.database.ssl = true;
      mockConfig.server.corsOrigin = '*';

      const result = validate.validateConfig();

      expect(result.warnings).toContain('CORS_ORIGIN is set to * in production (should be restricted)');
    });

    it('should warn with non-standard request size limit', () => {
      mockConfig.security.requestSizeLimit = '50mb';

      const result = validate.validateConfig();

      expect(result.warnings[0]).toContain('Non-standard request size limit');
    });
  });

  describe('validateConfigOnStartup', () => {
    it('should log warnings', () => {
      mockConfig.jwt.issuer = '';

      validate.validateConfigOnStartup();

      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('should log success when validation passes', () => {
      validate.validateConfigOnStartup();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Configuration validation passed',
        expect.any(Object)
      );
    });

    it('should exit in production when validation fails', () => {
      mockIsProduction.mockReturnValue(true);
      mockConfig.database.host = '';

      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });

      expect(() => {
        validate.validateConfigOnStartup();
      }).toThrow('Process.exit called with code 1');

      expect(mockLoggerError).toHaveBeenCalled();
      exitSpy.mockRestore();
    });

    it('should warn but not exit in non-production when validation fails', () => {
      mockConfig.database.host = '';

      validate.validateConfigOnStartup();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Configuration validation failed (non-production mode, continuing)'
      );
    });
  });

  describe('getConfigSummary', () => {
    it('should return safe config summary', () => {
      const summary = validate.getConfigSummary();

      expect(summary).toHaveProperty('environment');
      expect(summary).toHaveProperty('server');
      expect(summary).toHaveProperty('database');
      expect(summary).toHaveProperty('redis');
      expect(summary).toHaveProperty('providers');
      expect(summary).toHaveProperty('features');
    });

    it('should not include sensitive data', () => {
      const summary = validate.getConfigSummary();
      const summaryStr = JSON.stringify(summary);

      expect(summaryStr).not.toContain('password');
      expect(summaryStr).not.toContain('secret');
      expect(summaryStr).not.toContain('key');
    });

    it('should show provider configuration status', () => {
      mockConfig.providers.stripe.clientId = 'stripe-id';
      mockConfig.providers.square.clientId = 'square-id';

      const summary = validate.getConfigSummary();

      expect(summary.providers).toEqual({
        stripe: true,
        square: true,
        ticketmaster: false,
        eventbrite: false,
        mailchimp: false,
        quickbooks: false,
      });
    });

    it('should show feature availability', () => {
      mockConfig.redis.host = 'localhost';

      const summary = validate.getConfigSummary();

      expect(summary.features).toEqual({
        rateLimiting: true,
        idempotency: true,
        circuitBreaker: true,
      });
    });
  });
});
