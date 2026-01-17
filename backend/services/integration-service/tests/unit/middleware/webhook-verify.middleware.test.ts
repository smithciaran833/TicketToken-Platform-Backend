/**
 * Tests for Webhook Verification Middleware
 */

// Mock crypto BEFORE imports
const mockTimingSafeEqual = jest.fn();
const mockCreateHmac = jest.fn();
const mockUpdate = jest.fn();
const mockDigest = jest.fn();

jest.mock('crypto', () => ({
  timingSafeEqual: mockTimingSafeEqual,
  createHmac: mockCreateHmac,
}));

// Mock config BEFORE imports
const mockGetStripeConfig = jest.fn();
const mockGetSquareConfig = jest.fn();
const mockGetMailchimpConfig = jest.fn();
const mockGetQuickBooksConfig = jest.fn();
const mockIsProduction = jest.fn();

jest.mock('../../../src/config/index', () => ({
  getStripeConfig: mockGetStripeConfig,
  getSquareConfig: mockGetSquareConfig,
  getMailchimpConfig: mockGetMailchimpConfig,
  getQuickBooksConfig: mockGetQuickBooksConfig,
  isProduction: mockIsProduction,
}));

// Mock logger
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

// Mock errors
class MockInvalidWebhookSignatureError extends Error {
  constructor(provider: string, requestId: string) {
    super(`Invalid webhook signature for ${provider}`);
    this.name = 'InvalidWebhookSignatureError';
  }
}

jest.mock('../../../src/errors/index', () => ({
  InvalidWebhookSignatureError: MockInvalidWebhookSignatureError,
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  verifyStripeWebhook,
  verifySquareWebhook,
  verifyMailchimpWebhook,
  verifyQuickBooksWebhook,
  createWebhookVerifier,
  captureRawBody,
} from '../../../src/middleware/webhook-verify.middleware';
import webhookVerifyDefault from '../../../src/middleware/webhook-verify.middleware';

describe('Webhook Verify Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup HMAC chain
    mockDigest.mockReturnValue('computed-signature');
    mockUpdate.mockReturnValue({ digest: mockDigest });
    mockCreateHmac.mockReturnValue({ update: mockUpdate });

    // Default to production
    mockIsProduction.mockReturnValue(true);

    mockSend = jest.fn().mockReturnThis();

    mockReply = {
      send: mockSend,
    };

    mockRequest = {
      id: 'request-123',
      url: '/webhooks/stripe',
      protocol: 'https',
      hostname: 'api.example.com',
      headers: {},
      body: {},
    };
  });

  describe('timingSafeCompare', () => {
    it('should return true for equal strings', () => {
      mockTimingSafeEqual.mockReturnValue(true);
      
      const result = webhookVerifyDefault.timingSafeCompare('signature123', 'signature123');

      expect(result).toBe(true);
      expect(mockTimingSafeEqual).toHaveBeenCalled();
    });

    it('should return false for different length strings', () => {
      const result = webhookVerifyDefault.timingSafeCompare('short', 'much-longer-string');

      expect(result).toBe(false);
    });

    it('should return false on crypto error', () => {
      mockTimingSafeEqual.mockImplementation(() => {
        throw new Error('Crypto error');
      });

      const result = webhookVerifyDefault.timingSafeCompare('sig1', 'sig2');

      expect(result).toBe(false);
    });
  });

  describe('verifyStripeWebhook', () => {
    beforeEach(() => {
      mockGetStripeConfig.mockReturnValue({
        webhookSecret: 'whsec_test_secret',
      });

      mockRequest.headers = {
        'stripe-signature': 't=1234567890,v1=valid-signature',
      };
      mockRequest.body = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
      };
      mockRequest.rawBody = Buffer.from(JSON.stringify(mockRequest.body));

      // Mock Date.now for timestamp validation
      jest.spyOn(Date, 'now').mockReturnValue(1234567890000 + 60000); // 1 minute later
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should verify valid Stripe webhook signature', async () => {
      mockTimingSafeEqual.mockReturnValue(true);
      mockDigest.mockReturnValue('valid-signature');

      await verifyStripeWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.webhookVerified).toEqual({
        valid: true,
        provider: 'stripe',
        eventId: 'evt_123',
        eventType: 'payment_intent.succeeded',
        timestamp: 1234567890,
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith('Stripe webhook verified', expect.any(Object));
    });

    it('should throw error when signature header is missing', async () => {
      mockRequest.headers = {};

      await expect(
        verifyStripeWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for stripe');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Missing Stripe webhook signature header',
        expect.any(Object)
      );
    });

    it('should throw error when webhook secret not configured in production', async () => {
      mockGetStripeConfig.mockReturnValue({});

      await expect(
        verifyStripeWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for stripe');

      expect(mockLoggerError).toHaveBeenCalledWith('Stripe webhook secret not configured');
    });

    it('should allow webhook without secret in non-production', async () => {
      mockGetStripeConfig.mockReturnValue({});
      mockIsProduction.mockReturnValue(false);

      await verifyStripeWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.webhookVerified).toEqual({
        valid: true,
        provider: 'stripe',
      });
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Allowing Stripe webhook without signature verification in non-production'
      );
    });

    it('should throw error for invalid signature format', async () => {
      mockRequest.headers = {
        'stripe-signature': 'invalid-format',
      };

      await expect(
        verifyStripeWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for stripe');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Invalid Stripe signature format',
        expect.any(Object)
      );
    });

    it('should throw error when timestamp is too old', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1234567890000 + 400000); // 400 seconds later

      await expect(
        verifyStripeWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for stripe');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Stripe webhook timestamp too old',
        expect.any(Object)
      );
    });

    it('should throw error when signature does not match', async () => {
      mockTimingSafeEqual.mockReturnValue(false);
      mockDigest.mockReturnValue('different-signature');

      await expect(
        verifyStripeWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for stripe');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Invalid Stripe webhook signature',
        expect.any(Object)
      );
    });

    it('should use JSON stringified body when rawBody is not available', async () => {
      mockRequest.rawBody = undefined;
      mockTimingSafeEqual.mockReturnValue(true);
      mockDigest.mockReturnValue('valid-signature');

      await verifyStripeWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(mockRequest.body))
      );
    });

    it('should compute signature with correct payload format', async () => {
      mockTimingSafeEqual.mockReturnValue(true);
      mockDigest.mockReturnValue('valid-signature');

      await verifyStripeWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCreateHmac).toHaveBeenCalledWith('sha256', 'whsec_test_secret');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.stringMatching(/^1234567890\./)
      );
    });

    it('should handle generic errors during verification', async () => {
      mockCreateHmac.mockImplementation(() => {
        throw new Error('Crypto error');
      });

      await expect(
        verifyStripeWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for stripe');

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Stripe webhook verification error',
        expect.any(Object)
      );
    });
  });

  describe('verifySquareWebhook', () => {
    beforeEach(() => {
      mockGetSquareConfig.mockReturnValue({
        webhookSignatureKey: 'square-signature-key',
      });

      mockRequest.headers = {
        'x-square-hmacsha256-signature': 'valid-signature-base64',
      };
      mockRequest.body = {
        event_id: 'square-evt-123',
        type: 'payment.created',
      };
      mockRequest.rawBody = Buffer.from(JSON.stringify(mockRequest.body));
      mockRequest.url = '/webhooks/square?param=value';
    });

    it('should verify valid Square webhook signature', async () => {
      mockTimingSafeEqual.mockReturnValue(true);
      mockDigest.mockReturnValue('valid-signature-base64');

      await verifySquareWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.webhookVerified).toEqual({
        valid: true,
        provider: 'square',
        eventId: 'square-evt-123',
        eventType: 'payment.created',
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith('Square webhook verified', expect.any(Object));
    });

    it('should throw error when signature header is missing', async () => {
      mockRequest.headers = {};

      await expect(
        verifySquareWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for square');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Missing Square webhook signature header',
        expect.any(Object)
      );
    });

    it('should throw error when signature key not configured in production', async () => {
      mockGetSquareConfig.mockReturnValue({});

      await expect(
        verifySquareWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for square');

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Square webhook signature key not configured'
      );
    });

    it('should allow webhook without signature key in non-production', async () => {
      mockGetSquareConfig.mockReturnValue({});
      mockIsProduction.mockReturnValue(false);

      await verifySquareWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.webhookVerified).toEqual({
        valid: true,
        provider: 'square',
      });
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Allowing Square webhook without signature verification in non-production'
      );
    });

    it('should throw error when signature does not match', async () => {
      mockTimingSafeEqual.mockReturnValue(false);
      mockDigest.mockReturnValue('different-signature');

      await expect(
        verifySquareWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for square');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Invalid Square webhook signature',
        expect.any(Object)
      );
    });

    it('should construct webhook URL correctly without query params', async () => {
      mockTimingSafeEqual.mockReturnValue(true);
      mockDigest.mockReturnValue('valid-signature-base64');

      await verifySquareWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.stringContaining('https://api.example.com/webhooks/square')
      );
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.not.stringContaining('?param=value')
      );
    });

    it('should use base64 digest for Square signature', async () => {
      mockTimingSafeEqual.mockReturnValue(true);
      mockDigest.mockReturnValue('valid-signature-base64');

      await verifySquareWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDigest).toHaveBeenCalledWith('base64');
    });

    it('should handle generic errors during verification', async () => {
      mockCreateHmac.mockImplementation(() => {
        throw new Error('Crypto error');
      });

      await expect(
        verifySquareWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for square');

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Square webhook verification error',
        expect.any(Object)
      );
    });
  });

  describe('verifyMailchimpWebhook', () => {
    beforeEach(() => {
      mockGetMailchimpConfig.mockReturnValue({
        webhookSecret: 'mailchimp-webhook-secret',
      });

      mockRequest.headers = {
        'x-mandrill-signature': 'valid-signature-base64',
      };
      mockRequest.body = {
        type: 'subscribe',
        email: 'user@example.com',
        list_id: 'list-123',
      };
      mockRequest.url = '/webhooks/mailchimp';
    });

    it('should verify valid Mailchimp webhook signature', async () => {
      mockTimingSafeEqual.mockReturnValue(true);
      mockDigest.mockReturnValue('valid-signature-base64');

      await verifyMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.webhookVerified).toEqual({
        valid: true,
        provider: 'mailchimp',
        eventType: 'subscribe',
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Mailchimp webhook verified',
        expect.any(Object)
      );
    });

    it('should throw error when signature header is missing', async () => {
      mockRequest.headers = {};

      await expect(
        verifyMailchimpWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for mailchimp');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Missing Mailchimp webhook signature header',
        expect.any(Object)
      );
    });

    it('should throw error when webhook secret not configured in production', async () => {
      mockGetMailchimpConfig.mockReturnValue({});

      await expect(
        verifyMailchimpWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for mailchimp');

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Mailchimp webhook secret not configured'
      );
    });

    it('should allow webhook without secret in non-production', async () => {
      mockGetMailchimpConfig.mockReturnValue({});
      mockIsProduction.mockReturnValue(false);

      await verifyMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.webhookVerified).toEqual({
        valid: true,
        provider: 'mailchimp',
      });
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Allowing Mailchimp webhook without signature verification in non-production'
      );
    });

    it('should throw error when signature does not match', async () => {
      mockTimingSafeEqual.mockReturnValue(false);
      mockDigest.mockReturnValue('different-signature');

      await expect(
        verifyMailchimpWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for mailchimp');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Invalid Mailchimp webhook signature',
        expect.any(Object)
      );
    });

    it('should sort parameters alphabetically for signature', async () => {
      mockRequest.body = {
        z_param: 'last',
        a_param: 'first',
        m_param: 'middle',
      };
      mockTimingSafeEqual.mockReturnValue(true);
      mockDigest.mockReturnValue('valid-signature-base64');

      await verifyMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Should be sorted: a_param, m_param, z_param
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.stringContaining('a_paramfirstm_parammiddlez_paramlast')
      );
    });

    it('should use sha1 HMAC for Mailchimp', async () => {
      mockTimingSafeEqual.mockReturnValue(true);
      mockDigest.mockReturnValue('valid-signature-base64');

      await verifyMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCreateHmac).toHaveBeenCalledWith('sha1', 'mailchimp-webhook-secret');
    });

    it('should handle generic errors during verification', async () => {
      mockCreateHmac.mockImplementation(() => {
        throw new Error('Crypto error');
      });

      await expect(
        verifyMailchimpWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for mailchimp');

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Mailchimp webhook verification error',
        expect.any(Object)
      );
    });
  });

  describe('verifyQuickBooksWebhook', () => {
    beforeEach(() => {
      mockGetQuickBooksConfig.mockReturnValue({
        webhookVerifierToken: 'quickbooks-verifier-token',
      });

      mockRequest.headers = {
        'intuit-signature': 'valid-signature-base64',
      };
      mockRequest.body = {
        eventNotifications: [
          {
            dataChangeEvent: {
              entities: [{ id: 'qb-entity-123' }],
            },
          },
        ],
      };
      mockRequest.rawBody = Buffer.from(JSON.stringify(mockRequest.body));
    });

    it('should verify valid QuickBooks webhook signature', async () => {
      mockTimingSafeEqual.mockReturnValue(true);
      mockDigest.mockReturnValue('valid-signature-base64');

      await verifyQuickBooksWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.webhookVerified).toEqual({
        valid: true,
        provider: 'quickbooks',
        eventId: 'qb-entity-123',
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'QuickBooks webhook verified',
        expect.any(Object)
      );
    });

    it('should handle challenge verification request', async () => {
      mockRequest.body = { challenge: 'challenge-token-123' };
      mockRequest.headers = {};

      await verifyQuickBooksWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith('challenge-token-123');
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'QuickBooks webhook challenge request',
        expect.any(Object)
      );
    });

    it('should throw error when signature header is missing', async () => {
      mockRequest.headers = {};

      await expect(
        verifyQuickBooksWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for quickbooks');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Missing QuickBooks webhook signature header',
        expect.any(Object)
      );
    });

    it('should throw error when verifier token not configured in production', async () => {
      mockGetQuickBooksConfig.mockReturnValue({});

      await expect(
        verifyQuickBooksWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for quickbooks');

      expect(mockLoggerError).toHaveBeenCalledWith(
        'QuickBooks webhook verifier token not configured'
      );
    });

    it('should allow webhook without verifier token in non-production', async () => {
      mockGetQuickBooksConfig.mockReturnValue({});
      mockIsProduction.mockReturnValue(false);

      await verifyQuickBooksWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.webhookVerified).toEqual({
        valid: true,
        provider: 'quickbooks',
      });
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Allowing QuickBooks webhook without signature verification in non-production'
      );
    });

    it('should throw error when signature does not match', async () => {
      mockTimingSafeEqual.mockReturnValue(false);
      mockDigest.mockReturnValue('different-signature');

      await expect(
        verifyQuickBooksWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for quickbooks');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Invalid QuickBooks webhook signature',
        expect.any(Object)
      );
    });

    it('should use base64 digest for QuickBooks signature', async () => {
      mockTimingSafeEqual.mockReturnValue(true);
      mockDigest.mockReturnValue('valid-signature-base64');

      await verifyQuickBooksWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDigest).toHaveBeenCalledWith('base64');
    });

    it('should handle generic errors during verification', async () => {
      mockCreateHmac.mockImplementation(() => {
        throw new Error('Crypto error');
      });

      await expect(
        verifyQuickBooksWebhook(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid webhook signature for quickbooks');

      expect(mockLoggerError).toHaveBeenCalledWith(
        'QuickBooks webhook verification error',
        expect.any(Object)
      );
    });
  });

  describe('createWebhookVerifier', () => {
    it('should return Stripe verifier', () => {
      const verifier = createWebhookVerifier('stripe');
      expect(verifier).toBe(verifyStripeWebhook);
    });

    it('should return Square verifier', () => {
      const verifier = createWebhookVerifier('square');
      expect(verifier).toBe(verifySquareWebhook);
    });

    it('should return Mailchimp verifier', () => {
      const verifier = createWebhookVerifier('mailchimp');
      expect(verifier).toBe(verifyMailchimpWebhook);
    });

    it('should return QuickBooks verifier', () => {
      const verifier = createWebhookVerifier('quickbooks');
      expect(verifier).toBe(verifyQuickBooksWebhook);
    });

    it('should throw error for unknown provider', () => {
      expect(() => {
        createWebhookVerifier('unknown' as any);
      }).toThrow('Unknown webhook provider: unknown');
    });
  });

  describe('captureRawBody', () => {
    it('should capture raw body and call done', () => {
      const payload = Buffer.from('test payload');
      const done = jest.fn();
      const mockReq: any = {};

      captureRawBody(mockReq, mockReply as FastifyReply, payload, done);

      expect(mockReq.rawBody).toBe(payload);
      expect(done).toHaveBeenCalledWith(null, payload);
    });

    it('should store Buffer reference without modification', () => {
      const payload = Buffer.from(JSON.stringify({ test: 'data' }));
      const done = jest.fn();
      const mockReq: any = {};

      captureRawBody(mockReq, mockReply as FastifyReply, payload, done);

      expect(mockReq.rawBody).toEqual(payload);
      expect(mockReq.rawBody).toBe(payload); // Same reference
    });
  });
});
