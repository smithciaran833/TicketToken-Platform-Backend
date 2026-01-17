import { validateEnv, logSanitizedConfig } from '../../../src/config/env-validation';

describe('env-validation.ts', () => {
  const originalEnv = process.env;
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    console.error = jest.fn();
    console.log = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  });

  describe('validateEnv', () => {
    it('validates and returns config with all required fields', () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long';
      process.env.AUTH_SERVICE_URL = 'http://localhost:3001';
      process.env.VENUE_SERVICE_URL = 'http://localhost:3002';
      process.env.EVENT_SERVICE_URL = 'http://localhost:3003';
      process.env.TICKET_SERVICE_URL = 'http://localhost:3004';
      process.env.PAYMENT_SERVICE_URL = 'http://localhost:3005';
      process.env.MARKETPLACE_SERVICE_URL = 'http://localhost:3006';
      process.env.ANALYTICS_SERVICE_URL = 'http://localhost:3007';
      process.env.NOTIFICATION_SERVICE_URL = 'http://localhost:3008';
      process.env.INTEGRATION_SERVICE_URL = 'http://localhost:3009';
      process.env.COMPLIANCE_SERVICE_URL = 'http://localhost:3010';
      process.env.QUEUE_SERVICE_URL = 'http://localhost:3011';
      process.env.SEARCH_SERVICE_URL = 'http://localhost:3012';
      process.env.FILE_SERVICE_URL = 'http://localhost:3013';
      process.env.MONITORING_SERVICE_URL = 'http://localhost:3014';
      process.env.BLOCKCHAIN_SERVICE_URL = 'http://localhost:3015';
      process.env.ORDER_SERVICE_URL = 'http://localhost:3016';
      process.env.SCANNING_SERVICE_URL = 'http://localhost:3020';
      process.env.MINTING_SERVICE_URL = 'http://localhost:3018';
      process.env.TRANSFER_SERVICE_URL = 'http://localhost:3019';

      const config = validateEnv();

      expect(config.NODE_ENV).toBe('development');
      expect(config.JWT_SECRET).toBe('test-secret-key-at-least-32-characters-long');
      expect(config.PORT).toBe(3000);
    });

    it('applies default values for optional fields', () => {
      process.env.NODE_ENV = 'development';
      process.env.LOG_LEVEL = 'info'; // Override setup.ts default
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long';
      process.env.AUTH_SERVICE_URL = 'http://localhost:3001';
      process.env.VENUE_SERVICE_URL = 'http://localhost:3002';
      process.env.EVENT_SERVICE_URL = 'http://localhost:3003';
      process.env.TICKET_SERVICE_URL = 'http://localhost:3004';
      process.env.PAYMENT_SERVICE_URL = 'http://localhost:3005';
      process.env.MARKETPLACE_SERVICE_URL = 'http://localhost:3006';
      process.env.ANALYTICS_SERVICE_URL = 'http://localhost:3007';
      process.env.NOTIFICATION_SERVICE_URL = 'http://localhost:3008';
      process.env.INTEGRATION_SERVICE_URL = 'http://localhost:3009';
      process.env.COMPLIANCE_SERVICE_URL = 'http://localhost:3010';
      process.env.QUEUE_SERVICE_URL = 'http://localhost:3011';
      process.env.SEARCH_SERVICE_URL = 'http://localhost:3012';
      process.env.FILE_SERVICE_URL = 'http://localhost:3013';
      process.env.MONITORING_SERVICE_URL = 'http://localhost:3014';
      process.env.BLOCKCHAIN_SERVICE_URL = 'http://localhost:3015';
      process.env.ORDER_SERVICE_URL = 'http://localhost:3016';
      process.env.SCANNING_SERVICE_URL = 'http://localhost:3020';
      process.env.MINTING_SERVICE_URL = 'http://localhost:3018';
      process.env.TRANSFER_SERVICE_URL = 'http://localhost:3019';

      const config = validateEnv();

      expect(config.PORT).toBe(3000);
      expect(config.HOST).toBe('0.0.0.0');
      expect(config.LOG_LEVEL).toBe('info');
      expect(config.REDIS_HOST).toBe('localhost');
      expect(config.REDIS_PORT).toBe(6379);
    });

    it('throws error when JWT_SECRET is too short', () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'short';
      process.env.AUTH_SERVICE_URL = 'http://localhost:3001';

      expect(() => validateEnv()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET must be at least 32 characters'));
    });

    it('throws error when service URL is invalid', () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long';
      process.env.AUTH_SERVICE_URL = 'not-a-valid-url';

      expect(() => validateEnv()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AUTH_SERVICE_URL must be a valid URL'));
    });

    it('validates production environment requires strong JWT_SECRET', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'your-secret-key-here';
      process.env.REDIS_PASSWORD = 'redis-password-production';
      process.env.AUTH_SERVICE_URL = 'http://localhost:3001';

      expect(() => validateEnv()).toThrow('JWT_SECRET cannot be default value in production');
    });

    it('validates production environment requires REDIS_PASSWORD', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'production-secret-key-that-is-very-long-and-secure';
      delete process.env.REDIS_PASSWORD;
      process.env.AUTH_SERVICE_URL = 'http://localhost:3001';
      process.env.VENUE_SERVICE_URL = 'http://localhost:3002';
      process.env.EVENT_SERVICE_URL = 'http://localhost:3003';
      process.env.TICKET_SERVICE_URL = 'http://localhost:3004';
      process.env.PAYMENT_SERVICE_URL = 'http://localhost:3005';
      process.env.MARKETPLACE_SERVICE_URL = 'http://localhost:3006';
      process.env.ANALYTICS_SERVICE_URL = 'http://localhost:3007';
      process.env.NOTIFICATION_SERVICE_URL = 'http://localhost:3008';
      process.env.INTEGRATION_SERVICE_URL = 'http://localhost:3009';
      process.env.COMPLIANCE_SERVICE_URL = 'http://localhost:3010';
      process.env.QUEUE_SERVICE_URL = 'http://localhost:3011';
      process.env.SEARCH_SERVICE_URL = 'http://localhost:3012';
      process.env.FILE_SERVICE_URL = 'http://localhost:3013';
      process.env.MONITORING_SERVICE_URL = 'http://localhost:3014';
      process.env.BLOCKCHAIN_SERVICE_URL = 'http://localhost:3015';
      process.env.ORDER_SERVICE_URL = 'http://localhost:3016';
      process.env.SCANNING_SERVICE_URL = 'http://localhost:3020';
      process.env.MINTING_SERVICE_URL = 'http://localhost:3018';
      process.env.TRANSFER_SERVICE_URL = 'http://localhost:3019';

      expect(() => validateEnv()).toThrow('REDIS_PASSWORD is required');
    });

    it('transforms PORT string to number', () => {
      process.env.NODE_ENV = 'development';
      process.env.PORT = '8080';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long';
      process.env.AUTH_SERVICE_URL = 'http://localhost:3001';
      process.env.VENUE_SERVICE_URL = 'http://localhost:3002';
      process.env.EVENT_SERVICE_URL = 'http://localhost:3003';
      process.env.TICKET_SERVICE_URL = 'http://localhost:3004';
      process.env.PAYMENT_SERVICE_URL = 'http://localhost:3005';
      process.env.MARKETPLACE_SERVICE_URL = 'http://localhost:3006';
      process.env.ANALYTICS_SERVICE_URL = 'http://localhost:3007';
      process.env.NOTIFICATION_SERVICE_URL = 'http://localhost:3008';
      process.env.INTEGRATION_SERVICE_URL = 'http://localhost:3009';
      process.env.COMPLIANCE_SERVICE_URL = 'http://localhost:3010';
      process.env.QUEUE_SERVICE_URL = 'http://localhost:3011';
      process.env.SEARCH_SERVICE_URL = 'http://localhost:3012';
      process.env.FILE_SERVICE_URL = 'http://localhost:3013';
      process.env.MONITORING_SERVICE_URL = 'http://localhost:3014';
      process.env.BLOCKCHAIN_SERVICE_URL = 'http://localhost:3015';
      process.env.ORDER_SERVICE_URL = 'http://localhost:3016';
      process.env.SCANNING_SERVICE_URL = 'http://localhost:3020';
      process.env.MINTING_SERVICE_URL = 'http://localhost:3018';
      process.env.TRANSFER_SERVICE_URL = 'http://localhost:3019';

      const config = validateEnv();

      expect(config.PORT).toBe(8080);
      expect(typeof config.PORT).toBe('number');
    });

    it('rejects PORT outside valid range', () => {
      process.env.NODE_ENV = 'development';
      process.env.PORT = '99999';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long';

      expect(() => validateEnv()).toThrow();
    });

    it('transforms ENABLE_SWAGGER string to boolean', () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_SWAGGER = 'true';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long';
      process.env.AUTH_SERVICE_URL = 'http://localhost:3001';
      process.env.VENUE_SERVICE_URL = 'http://localhost:3002';
      process.env.EVENT_SERVICE_URL = 'http://localhost:3003';
      process.env.TICKET_SERVICE_URL = 'http://localhost:3004';
      process.env.PAYMENT_SERVICE_URL = 'http://localhost:3005';
      process.env.MARKETPLACE_SERVICE_URL = 'http://localhost:3006';
      process.env.ANALYTICS_SERVICE_URL = 'http://localhost:3007';
      process.env.NOTIFICATION_SERVICE_URL = 'http://localhost:3008';
      process.env.INTEGRATION_SERVICE_URL = 'http://localhost:3009';
      process.env.COMPLIANCE_SERVICE_URL = 'http://localhost:3010';
      process.env.QUEUE_SERVICE_URL = 'http://localhost:3011';
      process.env.SEARCH_SERVICE_URL = 'http://localhost:3012';
      process.env.FILE_SERVICE_URL = 'http://localhost:3013';
      process.env.MONITORING_SERVICE_URL = 'http://localhost:3014';
      process.env.BLOCKCHAIN_SERVICE_URL = 'http://localhost:3015';
      process.env.ORDER_SERVICE_URL = 'http://localhost:3016';
      process.env.SCANNING_SERVICE_URL = 'http://localhost:3020';
      process.env.MINTING_SERVICE_URL = 'http://localhost:3018';
      process.env.TRANSFER_SERVICE_URL = 'http://localhost:3019';

      const config = validateEnv();

      expect(config.ENABLE_SWAGGER).toBe(true);
      expect(typeof config.ENABLE_SWAGGER).toBe('boolean');
    });
  });

  describe('logSanitizedConfig', () => {
    it('logs config without secrets', () => {
      const config = {
        NODE_ENV: 'development',
        PORT: 3000,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'info',
        JWT_SECRET: 'super-secret-value',
        JWT_ACCESS_TOKEN_EXPIRY: '15m',
        JWT_REFRESH_TOKEN_EXPIRY: '7d',
        JWT_ISSUER: 'test-issuer',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: 'secret-password',
        REDIS_DB: 0,
        AUTH_SERVICE_URL: 'http://localhost:3001',
        VENUE_SERVICE_URL: 'http://localhost:3002',
        EVENT_SERVICE_URL: 'http://localhost:3003',
        TICKET_SERVICE_URL: 'http://localhost:3004',
        PAYMENT_SERVICE_URL: 'http://localhost:3005',
        MARKETPLACE_SERVICE_URL: 'http://localhost:3006',
        ANALYTICS_SERVICE_URL: 'http://localhost:3007',
        NOTIFICATION_SERVICE_URL: 'http://localhost:3008',
        INTEGRATION_SERVICE_URL: 'http://localhost:3009',
        COMPLIANCE_SERVICE_URL: 'http://localhost:3010',
        QUEUE_SERVICE_URL: 'http://localhost:3011',
        SEARCH_SERVICE_URL: 'http://localhost:3012',
        FILE_SERVICE_URL: 'http://localhost:3013',
        MONITORING_SERVICE_URL: 'http://localhost:3014',
        BLOCKCHAIN_SERVICE_URL: 'http://localhost:3015',
        ORDER_SERVICE_URL: 'http://localhost:3016',
        SCANNING_SERVICE_URL: 'http://localhost:3020',
        MINTING_SERVICE_URL: 'http://localhost:3018',
        TRANSFER_SERVICE_URL: 'http://localhost:3019',
        RATE_LIMIT_MAX: 100,
        RATE_LIMIT_WINDOW_MS: 60000,
        MAX_REQUEST_SIZE: '10mb',
        CORS_ORIGIN: '*',
        ENABLE_SWAGGER: false,
      } as any;

      logSanitizedConfig(config);

      const loggedOutput = (console.log as jest.Mock).mock.calls.join('\n');
      
      expect(console.log).toHaveBeenCalledWith('✅ Environment configuration loaded:');
      expect(loggedOutput).not.toContain('super-secret-value');
      expect(loggedOutput).not.toContain('secret-password');
      expect(loggedOutput).toContain('localhost:3001');
      expect(loggedOutput).toContain('"passwordSet": true');
    });

    it('shows passwordSet as false when REDIS_PASSWORD not provided', () => {
      const config = {
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_DB: 0,
      } as any;

      logSanitizedConfig(config);

      const loggedOutput = (console.log as jest.Mock).mock.calls.join('\n');
      expect(loggedOutput).toContain('"passwordSet": false');
    });
  });
});
