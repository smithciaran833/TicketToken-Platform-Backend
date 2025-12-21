/**
 * Environment Validation Integration Tests
 */

describe('Environment Validation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    // Clear module cache
    jest.resetModules();
  });

  // ==========================================================================
  // validateEnv
  // ==========================================================================
  describe('validateEnv', () => {
    it('should pass validation with valid environment', async () => {
      // Set all required env vars
      process.env.PORT = '3003';
      process.env.SERVICE_NAME = 'event-service';
      process.env.DB_HOST = 'localhost';
      process.env.DB_PORT = '5432';
      process.env.DB_USER = 'postgres';
      process.env.DB_PASSWORD = 'postgres';
      process.env.DB_NAME = 'tickettoken_test';
      process.env.REDIS_HOST = 'localhost';
      process.env.REDIS_PORT = '6379';
      process.env.JWT_SECRET = 'a]very_secure_secret_key_for_testing_12345678';
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

      const { validateEnv } = await import('../../src/config/env-validation');
      
      expect(() => validateEnv()).not.toThrow();
    });

    it('should throw error when PORT is missing', async () => {
      delete process.env.PORT;
      process.env.SERVICE_NAME = 'event-service';

      const { validateEnv } = await import('../../src/config/env-validation');
      
      expect(() => validateEnv()).toThrow(/PORT/);
    });

    it('should throw error when SERVICE_NAME is missing', async () => {
      process.env.PORT = '3003';
      delete process.env.SERVICE_NAME;

      const { validateEnv } = await import('../../src/config/env-validation');
      
      expect(() => validateEnv()).toThrow(/SERVICE_NAME/);
    });

    it('should throw error for invalid NODE_ENV', async () => {
      process.env.PORT = '3003';
      process.env.SERVICE_NAME = 'event-service';
      process.env.NODE_ENV = 'invalid_env';

      const { validateEnv } = await import('../../src/config/env-validation');
      
      expect(() => validateEnv()).toThrow(/NODE_ENV/);
    });

    it('should accept valid NODE_ENV values', async () => {
      const validEnvs = ['development', 'staging', 'production'];

      for (const env of validEnvs) {
        jest.resetModules();
        process.env = { ...originalEnv };
        process.env.NODE_ENV = env;
        process.env.PORT = '3003';
        process.env.SERVICE_NAME = 'event-service';
        process.env.DB_HOST = 'localhost';
        process.env.DB_PORT = '5432';
        process.env.DB_USER = 'postgres';
        process.env.DB_PASSWORD = 'postgres';
        process.env.DB_NAME = 'tickettoken_test';
        process.env.REDIS_HOST = 'localhost';
        process.env.REDIS_PORT = '6379';
        process.env.JWT_SECRET = 'a_very_secure_secret_key_for_testing_12345678';
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

        const { validateEnv } = await import('../../src/config/env-validation');
        expect(() => validateEnv()).not.toThrow();
      }
    });

    it('should throw error for invalid port number', async () => {
      process.env.PORT = '99999';
      process.env.SERVICE_NAME = 'event-service';

      const { validateEnv } = await import('../../src/config/env-validation');
      
      expect(() => validateEnv()).toThrow();
    });

    it('should throw error when JWT_SECRET is too short', async () => {
      process.env.PORT = '3003';
      process.env.SERVICE_NAME = 'event-service';
      process.env.DB_HOST = 'localhost';
      process.env.DB_PORT = '5432';
      process.env.DB_USER = 'postgres';
      process.env.DB_PASSWORD = 'postgres';
      process.env.DB_NAME = 'test';
      process.env.REDIS_HOST = 'localhost';
      process.env.REDIS_PORT = '6379';
      process.env.JWT_SECRET = 'short'; // Less than 32 chars

      const { validateEnv } = await import('../../src/config/env-validation');
      
      expect(() => validateEnv()).toThrow(/JWT_SECRET/);
    });

    it('should apply default values', async () => {
      process.env.PORT = '3003';
      process.env.SERVICE_NAME = 'event-service';
      process.env.DB_HOST = 'localhost';
      process.env.DB_PORT = '5432';
      process.env.DB_USER = 'postgres';
      process.env.DB_PASSWORD = 'postgres';
      process.env.DB_NAME = 'tickettoken_test';
      process.env.REDIS_HOST = 'localhost';
      process.env.REDIS_PORT = '6379';
      process.env.JWT_SECRET = 'a_very_secure_secret_key_for_testing_12345678';
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
      delete process.env.NODE_ENV;
      delete process.env.LOG_LEVEL;

      const { validateEnv } = await import('../../src/config/env-validation');
      validateEnv();

      expect(process.env.NODE_ENV).toBe('development');
      expect(process.env.LOG_LEVEL).toBe('info');
    });

    it('should accept valid LOG_LEVEL values', async () => {
      const validLevels = ['debug', 'info', 'warn', 'error'];

      for (const level of validLevels) {
        jest.resetModules();
        process.env = { ...originalEnv };
        process.env.LOG_LEVEL = level;
        process.env.PORT = '3003';
        process.env.SERVICE_NAME = 'event-service';
        process.env.DB_HOST = 'localhost';
        process.env.DB_PORT = '5432';
        process.env.DB_USER = 'postgres';
        process.env.DB_PASSWORD = 'postgres';
        process.env.DB_NAME = 'tickettoken_test';
        process.env.REDIS_HOST = 'localhost';
        process.env.REDIS_PORT = '6379';
        process.env.JWT_SECRET = 'a_very_secure_secret_key_for_testing_12345678';
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

        const { validateEnv } = await import('../../src/config/env-validation');
        expect(() => validateEnv()).not.toThrow();
      }
    });
  });
});
