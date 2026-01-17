/**
 * Tests for Environment Configuration
 * 
 * Testing environment variable loading, validation, defaults, and type conversions
 */

describe('Environment Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear the module cache to force re-evaluation
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Server Configuration', () => {
    it('should use default PORT when not set', () => {
      delete process.env.PORT;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.PORT).toBe(3007);
    });

    it('should parse PORT as number', () => {
      process.env.PORT = '4000';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.PORT).toBe(4000);
      expect(typeof env.PORT).toBe('number');
    });

    it('should use default SERVICE_NAME', () => {
      delete process.env.SERVICE_NAME;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.SERVICE_NAME).toBe('notification-service');
    });

    it('should use custom SERVICE_NAME when set', () => {
      process.env.SERVICE_NAME = 'custom-notification-service';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.SERVICE_NAME).toBe('custom-notification-service');
    });

    it('should default NODE_ENV to development', () => {
      delete process.env.NODE_ENV;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.NODE_ENV).toBe('development');
    });

    it('should respect NODE_ENV when set', () => {
      process.env.NODE_ENV = 'production';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.NODE_ENV).toBe('production');
    });
  });

  describe('Database Configuration', () => {
    it('should use database defaults', () => {
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      process.env.DB_PASSWORD = '';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.DB_HOST).toBe('postgres');
      expect(env.DB_PORT).toBe(5432);
      expect(env.DB_NAME).toBe('tickettoken_db');
      expect(env.DB_USER).toBe('postgres');
    });

    it('should parse DB_PORT as number', () => {
      process.env.DB_PORT = '5433';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.DB_PORT).toBe(5433);
      expect(typeof env.DB_PORT).toBe('number');
    });

    it('should use custom database configuration', () => {
      process.env.DB_HOST = 'custom-postgres';
      process.env.DB_PORT = '5555';
      process.env.DB_NAME = 'custom_db';
      process.env.DB_USER = 'custom_user';
      process.env.DB_PASSWORD = 'custom_password';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.DB_HOST).toBe('custom-postgres');
      expect(env.DB_PORT).toBe(5555);
      expect(env.DB_NAME).toBe('custom_db');
      expect(env.DB_USER).toBe('custom_user');
      expect(env.DB_PASSWORD).toBe('custom_password');
    });

    it('should use default pool settings', () => {
      delete process.env.DB_POOL_MIN;
      delete process.env.DB_POOL_MAX;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.DB_POOL_MIN).toBe(2);
      expect(env.DB_POOL_MAX).toBe(10);
    });

    it('should parse pool settings as numbers', () => {
      process.env.DB_POOL_MIN = '5';
      process.env.DB_POOL_MAX = '20';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.DB_POOL_MIN).toBe(5);
      expect(env.DB_POOL_MAX).toBe(20);
    });
  });

  describe('Redis Configuration', () => {
    it('should use Redis defaults', () => {
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_DB;
      delete process.env.REDIS_PASSWORD;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.REDIS_HOST).toBe('postgres');
      expect(env.REDIS_PORT).toBe(6379);
      expect(env.REDIS_DB).toBe(9);
      expect(env.REDIS_PASSWORD).toBeUndefined();
    });

    it('should parse REDIS_PORT and REDIS_DB as numbers', () => {
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_DB = '5';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.REDIS_PORT).toBe(6380);
      expect(env.REDIS_DB).toBe(5);
    });

    it('should include Redis password when set', () => {
      process.env.REDIS_PASSWORD = 'redis-secret';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.REDIS_PASSWORD).toBe('redis-secret');
    });
  });

  describe('RabbitMQ Configuration', () => {
    it('should use RabbitMQ defaults', () => {
      delete process.env.RABBITMQ_URL;
      delete process.env.RABBITMQ_EXCHANGE;
      delete process.env.RABBITMQ_QUEUE;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.RABBITMQ_URL).toBe('amqp://rabbitmq:5672');
      expect(env.RABBITMQ_EXCHANGE).toBe('tickettoken_events');
      expect(env.RABBITMQ_QUEUE).toBe('notifications');
    });

    it('should use custom RabbitMQ configuration', () => {
      process.env.RABBITMQ_URL = 'amqp://user:pass@custom-rabbit:5672';
      process.env.RABBITMQ_EXCHANGE = 'custom_exchange';
      process.env.RABBITMQ_QUEUE = 'custom_queue';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.RABBITMQ_URL).toBe('amqp://user:pass@custom-rabbit:5672');
      expect(env.RABBITMQ_EXCHANGE).toBe('custom_exchange');
      expect(env.RABBITMQ_QUEUE).toBe('custom_queue');
    });
  });

  describe('SendGrid Configuration', () => {
    it('should require SENDGRID_API_KEY in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SENDGRID_API_KEY;
      
      expect(() => {
        jest.resetModules();
        require('../../../src/config/env');
      }).toThrow('Environment variable SENDGRID_API_KEY is not set');
    });

    it('should use default SENDGRID_API_KEY in development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SENDGRID_API_KEY;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.SENDGRID_API_KEY).toBe('dev-sendgrid-key');
    });

    it('should use custom SendGrid configuration', () => {
      process.env.SENDGRID_API_KEY = 'SG.real-api-key';
      process.env.SENDGRID_FROM_EMAIL = 'custom@example.com';
      process.env.SENDGRID_FROM_NAME = 'Custom Name';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.SENDGRID_API_KEY).toBe('SG.real-api-key');
      expect(env.SENDGRID_FROM_EMAIL).toBe('custom@example.com');
      expect(env.SENDGRID_FROM_NAME).toBe('Custom Name');
    });

    it('should use default from email and name', () => {
      delete process.env.SENDGRID_FROM_EMAIL;
      delete process.env.SENDGRID_FROM_NAME;
      process.env.SENDGRID_API_KEY = 'test-key';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.SENDGRID_FROM_EMAIL).toBe('noreply@tickettoken.com');
      expect(env.SENDGRID_FROM_NAME).toBe('TicketToken');
    });
  });

  describe('Twilio Configuration', () => {
    it('should require Twilio credentials in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_FROM_NUMBER;
      
      expect(() => {
        jest.resetModules();
        require('../../../src/config/env');
      }).toThrow();
    });

    it('should use default Twilio credentials in development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_FROM_NUMBER;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.TWILIO_ACCOUNT_SID).toBe('dev-twilio-sid');
      expect(env.TWILIO_AUTH_TOKEN).toBe('dev-twilio-token');
      expect(env.TWILIO_FROM_NUMBER).toBe('+15551234567');
    });

    it('should use custom Twilio configuration', () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC1234567890abcdef';
      process.env.TWILIO_AUTH_TOKEN = 'auth-token-123';
      process.env.TWILIO_FROM_NUMBER = '+19876543210';
      process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG1234567890abcdef';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.TWILIO_ACCOUNT_SID).toBe('AC1234567890abcdef');
      expect(env.TWILIO_AUTH_TOKEN).toBe('auth-token-123');
      expect(env.TWILIO_FROM_NUMBER).toBe('+19876543210');
      expect(env.TWILIO_MESSAGING_SERVICE_SID).toBe('MG1234567890abcdef');
    });
  });

  describe('JWT Configuration', () => {
    it('should require JWT_SECRET', () => {
      delete process.env.JWT_SECRET;
      
      expect(() => {
        jest.resetModules();
        require('../../../src/config/env');
      }).toThrow('Environment variable JWT_SECRET is not set');
    });

    it('should use JWT_SECRET when set', () => {
      process.env.JWT_SECRET = 'super-secret-jwt-key';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.JWT_SECRET).toBe('super-secret-jwt-key');
    });
  });

  describe('Service URLs', () => {
    it('should use default service URLs', () => {
      delete process.env.AUTH_SERVICE_URL;
      delete process.env.VENUE_SERVICE_URL;
      delete process.env.EVENT_SERVICE_URL;
      delete process.env.TICKET_SERVICE_URL;
      delete process.env.PAYMENT_SERVICE_URL;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.AUTH_SERVICE_URL).toBe('http://auth-service:3001');
      expect(env.VENUE_SERVICE_URL).toBe('http://venue-service:3002');
      expect(env.EVENT_SERVICE_URL).toBe('http://event-service:3003');
      expect(env.TICKET_SERVICE_URL).toBe('http://ticket-service:3004');
      expect(env.PAYMENT_SERVICE_URL).toBe('http://payment-service:3005');
    });

    it('should use custom service URLs', () => {
      process.env.AUTH_SERVICE_URL = 'https://auth.example.com';
      process.env.VENUE_SERVICE_URL = 'https://venue.example.com';
      process.env.EVENT_SERVICE_URL = 'https://event.example.com';
      process.env.TICKET_SERVICE_URL = 'https://ticket.example.com';
      process.env.PAYMENT_SERVICE_URL = 'https://payment.example.com';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.AUTH_SERVICE_URL).toBe('https://auth.example.com');
      expect(env.VENUE_SERVICE_URL).toBe('https://venue.example.com');
      expect(env.EVENT_SERVICE_URL).toBe('https://event.example.com');
      expect(env.TICKET_SERVICE_URL).toBe('https://ticket.example.com');
      expect(env.PAYMENT_SERVICE_URL).toBe('https://payment.example.com');
    });
  });

  describe('Rate Limiting Configuration', () => {
    it('should use default rate limiting', () => {
      delete process.env.RATE_LIMIT_WINDOW_MS;
      delete process.env.RATE_LIMIT_MAX_REQUESTS;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.RATE_LIMIT_WINDOW_MS).toBe(60000);
      expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(100);
    });

    it('should parse rate limit values as numbers', () => {
      process.env.RATE_LIMIT_WINDOW_MS = '30000';
      process.env.RATE_LIMIT_MAX_REQUESTS = '50';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.RATE_LIMIT_WINDOW_MS).toBe(30000);
      expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(50);
    });
  });

  describe('Notification Settings', () => {
    it('should use default notification settings', () => {
      delete process.env.SMS_TIME_RESTRICTION_START;
      delete process.env.SMS_TIME_RESTRICTION_END;
      delete process.env.DEFAULT_TIMEZONE;
      delete process.env.MAX_RETRY_ATTEMPTS;
      delete process.env.RETRY_DELAY_MS;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.SMS_TIME_RESTRICTION_START).toBe(8);
      expect(env.SMS_TIME_RESTRICTION_END).toBe(21);
      expect(env.DEFAULT_TIMEZONE).toBe('America/Chicago');
      expect(env.MAX_RETRY_ATTEMPTS).toBe(3);
      expect(env.RETRY_DELAY_MS).toBe(5000);
    });

    it('should parse notification settings as numbers', () => {
      process.env.SMS_TIME_RESTRICTION_START = '7';
      process.env.SMS_TIME_RESTRICTION_END = '22';
      process.env.MAX_RETRY_ATTEMPTS = '5';
      process.env.RETRY_DELAY_MS = '10000';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.SMS_TIME_RESTRICTION_START).toBe(7);
      expect(env.SMS_TIME_RESTRICTION_END).toBe(22);
      expect(env.MAX_RETRY_ATTEMPTS).toBe(5);
      expect(env.RETRY_DELAY_MS).toBe(10000);
    });
  });

  describe('Template Settings', () => {
    it('should use default template settings', () => {
      delete process.env.TEMPLATE_CACHE_TTL;
      delete process.env.ENABLE_TEMPLATE_PREVIEW;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.TEMPLATE_CACHE_TTL).toBe(3600);
      expect(env.ENABLE_TEMPLATE_PREVIEW).toBe(true);
    });

    it('should parse template settings correctly', () => {
      process.env.TEMPLATE_CACHE_TTL = '7200';
      process.env.ENABLE_TEMPLATE_PREVIEW = 'false';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.TEMPLATE_CACHE_TTL).toBe(7200);
      expect(env.ENABLE_TEMPLATE_PREVIEW).toBe(false);
    });
  });

  describe('Compliance Settings', () => {
    it('should use default compliance settings', () => {
      delete process.env.ENABLE_CONSENT_CHECK;
      delete process.env.ENABLE_SUPPRESSION_CHECK;
      delete process.env.LOG_ALL_NOTIFICATIONS;
      delete process.env.DATA_RETENTION_DAYS;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.ENABLE_CONSENT_CHECK).toBe(true);
      expect(env.ENABLE_SUPPRESSION_CHECK).toBe(true);
      expect(env.LOG_ALL_NOTIFICATIONS).toBe(true);
      expect(env.DATA_RETENTION_DAYS).toBe(90);
    });

    it('should parse compliance settings correctly', () => {
      process.env.ENABLE_CONSENT_CHECK = 'false';
      process.env.ENABLE_SUPPRESSION_CHECK = 'false';
      process.env.LOG_ALL_NOTIFICATIONS = 'false';
      process.env.DATA_RETENTION_DAYS = '30';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.ENABLE_CONSENT_CHECK).toBe(false);
      expect(env.ENABLE_SUPPRESSION_CHECK).toBe(false);
      expect(env.LOG_ALL_NOTIFICATIONS).toBe(false);
      expect(env.DATA_RETENTION_DAYS).toBe(30);
    });
  });

  describe('Feature Flags', () => {
    it('should use default feature flags', () => {
      delete process.env.ENABLE_SMS;
      delete process.env.ENABLE_EMAIL;
      delete process.env.ENABLE_PUSH;
      delete process.env.ENABLE_WEBHOOK_DELIVERY;
      
      const { env } = require('../../../src/config/env');
      
      expect(env.ENABLE_SMS).toBe(true);
      expect(env.ENABLE_EMAIL).toBe(true);
      expect(env.ENABLE_PUSH).toBe(false);
      expect(env.ENABLE_WEBHOOK_DELIVERY).toBe(true);
    });

    it('should parse feature flags correctly', () => {
      process.env.ENABLE_SMS = 'false';
      process.env.ENABLE_EMAIL = 'false';
      process.env.ENABLE_PUSH = 'true';
      process.env.ENABLE_WEBHOOK_DELIVERY = 'false';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.ENABLE_SMS).toBe(false);
      expect(env.ENABLE_EMAIL).toBe(false);
      expect(env.ENABLE_PUSH).toBe(true);
      expect(env.ENABLE_WEBHOOK_DELIVERY).toBe(false);
    });

    it('should handle case-insensitive boolean values', () => {
      process.env.ENABLE_SMS = 'TRUE';
      process.env.ENABLE_EMAIL = 'True';
      process.env.ENABLE_PUSH = 'FALSE';
      process.env.ENABLE_WEBHOOK_DELIVERY = 'False';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.ENABLE_SMS).toBe(true);
      expect(env.ENABLE_EMAIL).toBe(true);
      expect(env.ENABLE_PUSH).toBe(false);
      expect(env.ENABLE_WEBHOOK_DELIVERY).toBe(false);
    });
  });

  describe('Type Conversion', () => {
    it('should throw error for invalid number', () => {
      process.env.PORT = 'not-a-number';
      
      expect(() => {
        jest.resetModules();
        require('../../../src/config/env');
      }).toThrow('Environment variable PORT is not a valid number');
    });

    it('should throw error for empty number without default', () => {
      process.env.DB_PORT = '';
      
      expect(() => {
        jest.resetModules();
        require('../../../src/config/env');
      }).toThrow('Environment variable DB_PORT is not a valid number');
    });

    it('should handle zero as valid number', () => {
      process.env.REDIS_DB = '0';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.REDIS_DB).toBe(0);
    });

    it('should handle negative numbers', () => {
      process.env.REDIS_DB = '-1';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.REDIS_DB).toBe(-1);
    });
  });

  describe('Boolean Conversion', () => {
    it('should treat empty string as false', () => {
      process.env.ENABLE_SMS = '';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.ENABLE_SMS).toBe(false);
    });

    it('should treat non-true values as false', () => {
      process.env.ENABLE_SMS = 'yes';
      process.env.ENABLE_EMAIL = '1';
      process.env.ENABLE_PUSH = 'on';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.ENABLE_SMS).toBe(false);
      expect(env.ENABLE_EMAIL).toBe(false);
      expect(env.ENABLE_PUSH).toBe(false);
    });

    it('should only accept "true" (case-insensitive) as true', () => {
      process.env.ENABLE_SMS = 'true';
      process.env.ENABLE_EMAIL = 'TRUE';
      process.env.ENABLE_PUSH = 'True';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.ENABLE_SMS).toBe(true);
      expect(env.ENABLE_EMAIL).toBe(true);
      expect(env.ENABLE_PUSH).toBe(true);
    });
  });

  describe('Production vs Development Differences', () => {
    it('should require SendGrid API key in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SENDGRID_API_KEY;
      
      expect(() => {
        jest.resetModules();
        require('../../../src/config/env');
      }).toThrow();
    });

    it('should require Twilio credentials in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.TWILIO_ACCOUNT_SID;
      process.env.SENDGRID_API_KEY = 'test';
      
      expect(() => {
        jest.resetModules();
        require('../../../src/config/env');
      }).toThrow();
    });

    it('should allow dev defaults in non-production', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SENDGRID_API_KEY;
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_FROM_NUMBER;
      process.env.JWT_SECRET = 'test-secret';
      
      const { env } = require('../../../src/config/env');
      
      expect(env.SENDGRID_API_KEY).toBe('dev-sendgrid-key');
      expect(env.TWILIO_ACCOUNT_SID).toBe('dev-twilio-sid');
    });
  });
});
