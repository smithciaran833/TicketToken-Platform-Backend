// Mock dependencies before imports
const mockStripe = jest.fn();
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    // Mock Stripe instance
  }));
});

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

describe('Config - Stripe Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    jest.resetModules();
    
    // Set required env var
    process.env.STRIPE_SECRET_KEY = 'sk_test_123456789';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Required environment variables', () => {
    it('should throw error if STRIPE_SECRET_KEY is missing', () => {
      delete process.env.STRIPE_SECRET_KEY;
      
      expect(() => {
        require('../../../src/config/stripe.config');
      }).toThrow('FATAL: STRIPE_SECRET_KEY environment variable is required');
    });

    it('should throw error if STRIPE_SECRET_KEY is empty', () => {
      process.env.STRIPE_SECRET_KEY = '';
      
      expect(() => {
        require('../../../src/config/stripe.config');
      }).toThrow('FATAL: STRIPE_SECRET_KEY environment variable is required');
    });
  });

  describe('Stripe key format validation', () => {
    it('should throw error if key does not start with "sk_"', () => {
      process.env.STRIPE_SECRET_KEY = 'invalid_key_123';
      
      expect(() => {
        require('../../../src/config/stripe.config');
      }).toThrow('FATAL: Invalid STRIPE_SECRET_KEY format. Must start with "sk_"');
    });

    it('should throw error if key starts with "pk_" (publishable key)', () => {
      process.env.STRIPE_SECRET_KEY = 'pk_test_123456789';
      
      expect(() => {
        require('../../../src/config/stripe.config');
      }).toThrow('FATAL: Invalid STRIPE_SECRET_KEY format. Must start with "sk_"');
    });

    it('should accept key starting with "sk_test_"', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123456789';
      
      expect(() => {
        require('../../../src/config/stripe.config');
      }).not.toThrow();
    });

    it('should accept key starting with "sk_live_"', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_live_123456789';
      
      expect(() => {
        require('../../../src/config/stripe.config');
      }).not.toThrow();
    });
  });

  describe('API version configuration', () => {
    it('should use default API version when not specified', () => {
      delete process.env.STRIPE_API_VERSION;
      const { stripeConfig } = require('../../../src/config/stripe.config');
      expect(stripeConfig.apiVersion).toBe('2023-10-16');
    });

    it('should use custom API version from env var', () => {
      process.env.STRIPE_API_VERSION = '2024-01-01';
      const { stripeConfig } = require('../../../src/config/stripe.config');
      expect(stripeConfig.apiVersion).toBe('2024-01-01');
    });
  });

  describe('Stripe client initialization', () => {
    it('should create Stripe instance with correct secret key', () => {
      const Stripe = require('stripe');
      process.env.STRIPE_SECRET_KEY = 'sk_test_abcdef123456';
      require('../../../src/config/stripe.config');
      
      expect(Stripe).toHaveBeenCalledWith(
        'sk_test_abcdef123456',
        expect.any(Object)
      );
    });

    it('should initialize with correct configuration', () => {
      const Stripe = require('stripe');
      require('../../../src/config/stripe.config');
      
      expect(Stripe).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          apiVersion: expect.any(String),
          typescript: true,
          maxNetworkRetries: 3,
          timeout: 80000,
        })
      );
    });

    it('should include appInfo in configuration', () => {
      const Stripe = require('stripe');
      require('../../../src/config/stripe.config');
      
      expect(Stripe).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          appInfo: {
            name: 'TicketToken Queue Service',
            version: '1.0.0',
          },
        })
      );
    });

    it('should have maxNetworkRetries of 3', () => {
      const Stripe = require('stripe');
      require('../../../src/config/stripe.config');
      
      const config = Stripe.mock.calls[0][1];
      expect(config.maxNetworkRetries).toBe(3);
    });

    it('should have timeout of 80000ms (80 seconds)', () => {
      const Stripe = require('stripe');
      require('../../../src/config/stripe.config');
      
      const config = Stripe.mock.calls[0][1];
      expect(config.timeout).toBe(80000);
    });

    it('should enable TypeScript mode', () => {
      const Stripe = require('stripe');
      require('../../../src/config/stripe.config');
      
      const config = Stripe.mock.calls[0][1];
      expect(config.typescript).toBe(true);
    });

    it('should export stripe client', () => {
      const { stripe } = require('../../../src/config/stripe.config');
      expect(stripe).toBeDefined();
    });
  });

  describe('Webhook configuration', () => {
    it('should export webhook secret when provided', () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
      const { stripeWebhookSecret } = require('../../../src/config/stripe.config');
      expect(stripeWebhookSecret).toBe('whsec_test123');
    });

    it('should export undefined when webhook secret not provided', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const { stripeWebhookSecret } = require('../../../src/config/stripe.config');
      expect(stripeWebhookSecret).toBeUndefined();
    });

    it('should warn when webhook secret is not set', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      require('../../../src/config/stripe.config');
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'STRIPE_WEBHOOK_SECRET not set - webhook signature verification will be disabled'
      );
    });

    it('should not warn when webhook secret is set', () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
      require('../../../src/config/stripe.config');
      
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('stripeConfig object', () => {
    it('should have all required properties', () => {
      const { stripeConfig } = require('../../../src/config/stripe.config');
      expect(stripeConfig).toHaveProperty('secretKey');
      expect(stripeConfig).toHaveProperty('apiVersion');
      expect(stripeConfig).toHaveProperty('webhookSecret');
      expect(stripeConfig).toHaveProperty('isTestMode');
    });

    it('should have secretKey matching env var', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_mykey123';
      const { stripeConfig } = require('../../../src/config/stripe.config');
      expect(stripeConfig.secretKey).toBe('sk_test_mykey123');
    });

    it('should have apiVersion as string', () => {
      const { stripeConfig } = require('../../../src/config/stripe.config');
      expect(typeof stripeConfig.apiVersion).toBe('string');
    });

    it('should have webhookSecret when provided', () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
      const { stripeConfig } = require('../../../src/config/stripe.config');
      expect(stripeConfig.webhookSecret).toBe('whsec_test123');
    });

    it('should have isTestMode true for test keys', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123456789';
      const { stripeConfig } = require('../../../src/config/stripe.config');
      expect(stripeConfig.isTestMode).toBe(true);
    });

    it('should have isTestMode false for live keys', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_live_123456789';
      const { stripeConfig } = require('../../../src/config/stripe.config');
      expect(stripeConfig.isTestMode).toBe(false);
    });

    it('should detect test mode based on "_test_" in key', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_somekey';
      const { stripeConfig } = require('../../../src/config/stripe.config');
      expect(stripeConfig.isTestMode).toBe(true);
    });
  });

  describe('Initialization logging', () => {
    it('should log initialization with config details', () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
      require('../../../src/config/stripe.config');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Stripe configuration initialized',
        expect.objectContaining({
          apiVersion: expect.any(String),
          isTestMode: expect.any(Boolean),
          webhookConfigured: true,
        })
      );
    });

    it('should log webhookConfigured as true when secret is set', () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
      require('../../../src/config/stripe.config');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          webhookConfigured: true,
        })
      );
    });

    it('should log webhookConfigured as false when secret is not set', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      require('../../../src/config/stripe.config');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          webhookConfigured: false,
        })
      );
    });

    it('should log test mode correctly', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      require('../../../src/config/stripe.config');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          isTestMode: true,
        })
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle empty webhook secret', () => {
      process.env.STRIPE_WEBHOOK_SECRET = '';
      const { stripeWebhookSecret } = require('../../../src/config/stripe.config');
      expect(stripeWebhookSecret).toBe('');
    });

    it('should handle whitespace in secret key', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123456789 ';
      const { stripeConfig } = require('../../../src/config/stripe.config');
      expect(stripeConfig.secretKey).toBe('sk_test_123456789 ');
    });

    it('should handle restricted keys starting with "rk_"', () => {
      process.env.STRIPE_SECRET_KEY = 'rk_test_123456789';
      
      expect(() => {
        require('../../../src/config/stripe.config');
      }).toThrow('FATAL: Invalid STRIPE_SECRET_KEY format. Must start with "sk_"');
    });
  });

  describe('Module exports', () => {
    it('should export stripe client', () => {
      const module = require('../../../src/config/stripe.config');
      expect(module).toHaveProperty('stripe');
    });

    it('should export stripeWebhookSecret', () => {
      const module = require('../../../src/config/stripe.config');
      expect(module).toHaveProperty('stripeWebhookSecret');
    });

    it('should export stripeConfig', () => {
      const module = require('../../../src/config/stripe.config');
      expect(module).toHaveProperty('stripeConfig');
    });
  });
});
