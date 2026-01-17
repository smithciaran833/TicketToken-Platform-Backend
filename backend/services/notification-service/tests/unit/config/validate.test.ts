import { validateConfig, assertValidConfig } from '../../../src/config/validate';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/utils/logger');

describe('Configuration Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateConfig()', () => {
    it('should return valid=true with minimal required config', () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '3007';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.RABBITMQ_URL = 'amqp://localhost:5672';
      process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';

      jest.resetModules();
      const { validateConfig: validate } = require('../../../src/config/validate');

      const result = validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    describe('Required Variables', () => {
      it('should error when PORT is invalid', () => {
        process.env.PORT = '99999';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('PORT must be a valid port number');
      });

      it('should error when PORT is negative', () => {
        process.env.PORT = '-1';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
      });
    });

    describe('Database Configuration', () => {
      it('should error when DATABASE_URL is missing', () => {
        delete process.env.DATABASE_URL;

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('DATABASE_URL is required');
      });

      it('should error when DATABASE_URL is not PostgreSQL', () => {
        process.env.DATABASE_URL = 'mysql://localhost:3306/test';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('DATABASE_URL must be a PostgreSQL connection string');
      });

      it('should warn about missing SSL in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.warnings).toContain('DATABASE_URL should include sslmode=require in production');
      });

      it('should accept postgresql:// prefix', () => {
        process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.errors).not.toContain('DATABASE_URL must be a PostgreSQL connection string');
      });
    });

    describe('Redis Configuration', () => {
      it('should warn when REDIS_HOST is not set', () => {
        delete process.env.REDIS_HOST;

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.warnings).toContain('REDIS_HOST not set, rate limiting may use memory fallback');
      });

      it('should warn about missing TLS in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.REDIS_HOST = 'redis.example.com';
        delete process.env.REDIS_TLS;

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.warnings).toContain('Redis should use TLS in production (REDIS_TLS=true)');
      });
    });

    describe('RabbitMQ Configuration', () => {
      it('should error when RABBITMQ_URL is missing', () => {
        delete process.env.RABBITMQ_URL;

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('RABBITMQ_URL is required for event processing');
      });

      it('should error when not using amqps:// in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.RABBITMQ_URL = 'amqp://localhost:5672';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('RABBITMQ_URL must use amqps:// in production');
      });

      it('should allow amqps:// in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.RABBITMQ_URL = 'amqps://localhost:5672';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.errors).not.toContain('RABBITMQ_URL must use amqps:// in production');
      });
    });

    describe('Email Provider Configuration', () => {
      it('should error when no email provider in production', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.SENDGRID_API_KEY;
        delete process.env.AWS_ACCESS_KEY_ID;

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Either SENDGRID_API_KEY or AWS SES credentials required');
      });

      it('should warn when no email provider in non-production', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.SENDGRID_API_KEY;
        delete process.env.AWS_ACCESS_KEY_ID;

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.warnings).toContain('No email provider configured');
      });

      it('should warn when SENDGRID_API_KEY does not start with SG.', () => {
        process.env.SENDGRID_API_KEY = 'invalid-key';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.warnings).toContain('SENDGRID_API_KEY should start with "SG."');
      });

      it('should accept valid SENDGRID_API_KEY', () => {
        process.env.SENDGRID_API_KEY = 'SG.valid-key';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.warnings).not.toContain('SENDGRID_API_KEY should start with "SG."');
      });
    });

    describe('SMS Provider Configuration', () => {
      it('should warn when Twilio not configured in production', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.TWILIO_ACCOUNT_SID;
        delete process.env.TWILIO_AUTH_TOKEN;

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.warnings).toContain('Twilio credentials not configured, SMS disabled');
      });

      it('should warn when TWILIO_ACCOUNT_SID does not start with AC', () => {
        process.env.TWILIO_ACCOUNT_SID = 'invalid-sid';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.warnings).toContain('TWILIO_ACCOUNT_SID should start with "AC"');
      });

      it('should accept valid TWILIO_ACCOUNT_SID', () => {
        process.env.TWILIO_ACCOUNT_SID = 'AC1234567890abcdef';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.warnings).not.toContain('TWILIO_ACCOUNT_SID should start with "AC"');
      });
    });

    describe('JWT Configuration', () => {
      it('should error when JWT_SECRET is missing', () => {
        delete process.env.JWT_SECRET;

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('JWT_SECRET is required');
      });

      it('should warn when JWT_SECRET is too short', () => {
        process.env.JWT_SECRET = 'short-secret';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.warnings).toContain('JWT_SECRET should be at least 32 characters');
      });

      it('should accept JWT_SECRET with 32+ characters', () => {
        process.env.JWT_SECRET = 'this-is-a-secret-with-32-chars-or-more';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.warnings).not.toContain('JWT_SECRET should be at least 32 characters');
      });
    });

    describe('URL Configuration', () => {
      it('should error when APP_URL is invalid', () => {
        process.env.APP_URL = 'not-a-valid-url';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('APP_URL must be a valid URL');
      });

      it('should error when FRONTEND_URL is invalid', () => {
        process.env.FRONTEND_URL = 'not-a-valid-url';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('FRONTEND_URL must be a valid URL');
      });

      it('should accept valid URLs', () => {
        process.env.APP_URL = 'https://app.example.com';
        process.env.FRONTEND_URL = 'https://frontend.example.com';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.errors).not.toContain('APP_URL must be a valid URL');
        expect(result.errors).not.toContain('FRONTEND_URL must be a valid URL');
      });
    });

    describe('Email Defaults', () => {
      it('should error when DEFAULT_FROM_EMAIL is invalid', () => {
        process.env.DEFAULT_FROM_EMAIL = 'not-an-email';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('DEFAULT_FROM_EMAIL must be a valid email');
      });

      it('should accept valid email', () => {
        process.env.DEFAULT_FROM_EMAIL = 'noreply@example.com';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.errors).not.toContain('DEFAULT_FROM_EMAIL must be a valid email');
      });
    });

    describe('Numeric Validation', () => {
      it('should error when REDIS_PORT is out of range', () => {
        process.env.REDIS_PORT = '99999';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('REDIS_PORT must be <= 65535');
      });

      it('should error when REDIS_DB is out of range', () => {
        process.env.REDIS_DB = '20';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('REDIS_DB must be <= 15');
      });

      it('should error when RATE_LIMIT_WINDOW_MS is too small', () => {
        process.env.RATE_LIMIT_WINDOW_MS = '500';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('RATE_LIMIT_WINDOW_MS must be >= 1000');
      });

      it('should error when RATE_LIMIT_MAX_REQUESTS is invalid', () => {
        process.env.RATE_LIMIT_MAX_REQUESTS = '0';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('RATE_LIMIT_MAX_REQUESTS must be >= 1');
      });

      it('should error when QUEUE_CONCURRENCY is out of range', () => {
        process.env.QUEUE_CONCURRENCY = '200';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('QUEUE_CONCURRENCY must be <= 100');
      });

      it('should error when numeric value is not a number', () => {
        process.env.REDIS_PORT = 'not-a-number';

        jest.resetModules();
        const { validateConfig: validate } = require('../../../src/config/validate');

        const result = validate();

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('REDIS_PORT must be a number');
      });
    });
  });

  describe('assertValidConfig()', () => {
    it('should not throw when config is valid', () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '3007';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.RABBITMQ_URL = 'amqp://localhost:5672';
      process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';

      jest.resetModules();
      const { assertValidConfig: assert } = require('../../../src/config/validate');

      expect(() => assert()).not.toThrow();
    });

    it('should log warnings', () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '3007';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.RABBITMQ_URL = 'amqp://localhost:5672';
      process.env.JWT_SECRET = 'short';

      jest.resetModules();
      const { assertValidConfig: assert } = require('../../../src/config/validate');

      expect(() => assert()).not.toThrow();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Configuration warning: JWT_SECRET should be at least 32 characters')
      );
    });

    it('should throw when config is invalid', () => {
      delete process.env.JWT_SECRET;

      jest.resetModules();
      const { assertValidConfig: assert } = require('../../../src/config/validate');

      expect(() => assert()).toThrow('Configuration errors');
    });

    it('should log errors before throwing', () => {
      delete process.env.JWT_SECRET;

      jest.resetModules();
      const { assertValidConfig: assert } = require('../../../src/config/validate');

      expect(() => assert()).toThrow();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Configuration errors'));
    });

    it('should log success message when valid', () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '3007';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.RABBITMQ_URL = 'amqp://localhost:5672';
      process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';

      jest.resetModules();
      const { assertValidConfig: assert } = require('../../../src/config/validate');

      assert();

      expect(logger.info).toHaveBeenCalledWith('Configuration validated successfully');
    });
  });
});
