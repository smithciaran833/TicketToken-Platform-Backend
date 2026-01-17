// Mock services and crypto BEFORE imports
const mockProcessWebhookEventMailchimp = jest.fn();
const mockProcessWebhookEventSquare = jest.fn();
const mockProcessWebhookEventStripe = jest.fn();
const mockConstructWebhookEvent = jest.fn();

jest.mock('../../../src/services/providers/mailchimp-sync.service', () => ({
  mailchimpSyncService: {
    processWebhookEvent: mockProcessWebhookEventMailchimp,
  },
}));

jest.mock('../../../src/services/providers/square-sync.service', () => ({
  squareSyncService: {
    processWebhookEvent: mockProcessWebhookEventSquare,
  },
}));

jest.mock('../../../src/services/providers/stripe-sync.service', () => ({
  stripeSyncService: {
    processWebhookEvent: mockProcessWebhookEventStripe,
    constructWebhookEvent: mockConstructWebhookEvent,
  },
}));

const mockRetrieveApiKeys = jest.fn();
jest.mock('../../../src/services/credential-encryption.service', () => ({
  credentialEncryptionService: {
    retrieveApiKeys: mockRetrieveApiKeys,
  },
}));

// Mock crypto
const mockCreateHmac = jest.fn();
const mockUpdate = jest.fn();
const mockDigest = jest.fn();
const mockTimingSafeEqual = jest.fn();

jest.mock('crypto', () => ({
  createHmac: jest.fn(() => ({
    update: mockUpdate,
    digest: mockDigest,
  })),
  timingSafeEqual: mockTimingSafeEqual,
}));

import { WebhookController } from '../../../src/controllers/webhook.controller';
import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

describe('WebhookController', () => {
  let controller: WebhookController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new WebhookController();

    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      status: mockStatus,
    };

    mockRequest = {
      params: {},
      query: {},
      body: {},
      headers: {},
      ip: '127.0.0.1',
    };

    // Setup crypto mocks
    (crypto.createHmac as jest.Mock) = mockCreateHmac;
    mockCreateHmac.mockReturnValue({
      update: mockUpdate.mockReturnThis(),
      digest: mockDigest,
    });
    (crypto.timingSafeEqual as jest.Mock) = mockTimingSafeEqual;
  });

  describe('handleMailchimpWebhook', () => {
    it('should reject webhook from unauthorized IP', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.ip = '192.168.1.1'; // Not a Mailchimp IP
      mockRequest.body = { type: 'subscribe', data: {} };

      await controller.handleMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Unauthorized IP address',
      });
    });

    it('should accept webhook from Mailchimp IP range 205.201.131.x', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.ip = '205.201.131.50';
      mockRequest.body = { type: 'subscribe', data: { email: 'test@example.com' } };

      await controller.handleMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith({ received: true });
    });

    it('should accept webhook from Mailchimp IP range 198.2.179.x', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.ip = '198.2.179.100';
      mockRequest.body = { type: 'unsubscribe', data: {} };

      await controller.handleMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should accept webhook from Mailchimp IP range 148.105.8.x', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.ip = '148.105.8.25';
      mockRequest.body = { type: 'profile', data: {} };

      await controller.handleMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should handle IPv6-mapped IPv4 addresses', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.ip = '::ffff:205.201.131.50'; // IPv6-mapped IPv4
      mockRequest.body = { type: 'subscribe', data: {} };

      await controller.handleMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should handle subscribe events', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.ip = '205.201.131.1';
      mockRequest.body = {
        type: 'subscribe',
        data: { email: 'new@example.com' },
      };

      await controller.handleMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith({ received: true });
    });

    it('should handle unsubscribe events', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.ip = '205.201.131.1';
      mockRequest.body = {
        type: 'unsubscribe',
        data: { email: 'leaving@example.com' },
      };

      await controller.handleMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should handle profile events', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.ip = '205.201.131.1';
      mockRequest.body = {
        type: 'profile',
        data: { email: 'updated@example.com' },
      };

      await controller.handleMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should handle cleaned events', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.ip = '205.201.131.1';
      mockRequest.body = {
        type: 'cleaned',
        data: { email: 'bounced@example.com' },
      };

      await controller.handleMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should handle unknown event types', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.ip = '205.201.131.1';
      mockRequest.body = {
        type: 'unknown_event',
        data: {},
      };

      await controller.handleMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith({ received: true });
    });

    it('should return 500 on processing error', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.ip = '205.201.131.1';
      mockRequest.body = { type: 'subscribe' };

      // Force an error by making body access throw
      Object.defineProperty(mockRequest, 'body', {
        get: () => {
          throw new Error('Body parsing failed');
        },
      });

      await controller.handleMailchimpWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Webhook processing failed',
      });
    });
  });

  describe('handleSquareWebhook', () => {
    it('should reject webhook with invalid signature', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'x-square-signature': 'invalid-signature' };
      mockRequest.body = { type: 'payment.created', data: {} };

      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'webhook-secret' });
      mockDigest.mockReturnValue('different-signature');
      mockTimingSafeEqual.mockReturnValue(false);

      await controller.handleSquareWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Invalid webhook signature',
      });
    });

    it('should accept webhook with valid signature', async () => {
      const signature = 'valid-signature';
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'x-square-signature': signature };
      mockRequest.body = { type: 'payment.created', data: { id: 'pay-123' } };

      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'webhook-secret' });
      mockDigest.mockReturnValue(signature);
      mockTimingSafeEqual.mockReturnValue(true);
      mockProcessWebhookEventSquare.mockResolvedValue(undefined);

      await controller.handleSquareWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCreateHmac).toHaveBeenCalledWith('sha256', 'webhook-secret');
      expect(mockProcessWebhookEventSquare).toHaveBeenCalledWith(
        'payment.created',
        { id: 'pay-123' }
      );
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith({ received: true });
    });

    it('should reject when credentials not found', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'x-square-signature': 'signature' };
      mockRequest.body = { type: 'payment.created', data: {} };

      mockRetrieveApiKeys.mockResolvedValue(null);

      await controller.handleSquareWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
    });

    it('should return 500 on processing error', async () => {
      const signature = 'valid-signature';
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'x-square-signature': signature };
      mockRequest.body = { type: 'payment.created', data: {} };

      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'webhook-secret' });
      mockDigest.mockReturnValue(signature);
      mockTimingSafeEqual.mockReturnValue(true);
      // Make event processing fail
      mockProcessWebhookEventSquare.mockRejectedValue(new Error('Processing failed'));

      await controller.handleSquareWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Webhook processing failed',
      });
    });
  });

  describe('handleStripeWebhook', () => {
    it('should reject webhook when secret not configured', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'stripe-signature': 'sig-123' };
      mockRequest.body = {};

      mockRetrieveApiKeys.mockResolvedValue(null);

      await controller.handleStripeWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Webhook secret not configured',
      });
    });

    it('should accept webhook with valid signature', async () => {
      const event = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: {} },
      };

      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'stripe-signature': 'valid-sig' };
      mockRequest.body = { type: 'payment_intent.succeeded' };

      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'whsec_123' });
      mockConstructWebhookEvent.mockReturnValue(event);
      mockProcessWebhookEventStripe.mockResolvedValue(undefined);

      await controller.handleStripeWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockConstructWebhookEvent).toHaveBeenCalledWith(
        mockRequest.body,
        'valid-sig',
        'whsec_123'
      );
      expect(mockProcessWebhookEventStripe).toHaveBeenCalledWith(event);
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith({ received: true });
    });

    it('should return 401 on signature verification failure', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'stripe-signature': 'invalid-sig' };
      mockRequest.body = {};

      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'whsec_123' });
      mockConstructWebhookEvent.mockImplementation(() => {
        throw new Error('Signature verification failed');
      });

      await controller.handleStripeWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Webhook signature verification failed',
      });
    });

    it('should handle different event types', async () => {
      const eventTypes = [
        'payment_intent.succeeded',
        'charge.succeeded',
        'customer.created',
        'invoice.payment_succeeded',
      ];

      for (const type of eventTypes) {
        jest.clearAllMocks();

        const event = { id: 'evt_1', type, data: {} };
        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.headers = { 'stripe-signature': 'sig' };
        mockRequest.body = { type };

        mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'whsec_123' });
        mockConstructWebhookEvent.mockReturnValue(event);
        mockProcessWebhookEventStripe.mockResolvedValue(undefined);

        await controller.handleStripeWebhook(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockProcessWebhookEventStripe).toHaveBeenCalledWith(event);
      }
    });
  });

  describe('handleQuickBooksWebhook', () => {
    it('should reject webhook with invalid signature', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'intuit-signature': 'invalid-sig' };
      mockRequest.body = { eventNotifications: [] };

      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'webhook-secret' });
      mockDigest.mockReturnValue('different-signature');
      mockTimingSafeEqual.mockReturnValue(false);

      await controller.handleQuickBooksWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Invalid webhook signature',
      });
    });

    it('should accept webhook with valid signature', async () => {
      const signature = 'valid-signature';
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'intuit-signature': signature };
      mockRequest.body = {
        eventNotifications: [
          {
            realmId: 'realm-123',
            dataChangeEvent: {
              entities: [
                { id: '1', name: 'Customer', operation: 'Create' },
                { id: '2', name: 'Invoice', operation: 'Update' },
              ],
            },
          },
        ],
      };

      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'webhook-secret' });
      mockDigest.mockReturnValue(signature);
      mockTimingSafeEqual.mockReturnValue(true);

      await controller.handleQuickBooksWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCreateHmac).toHaveBeenCalledWith('sha256', 'webhook-secret');
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith({ received: true });
    });

    it('should process multiple entities in notification', async () => {
      const signature = 'valid-sig';
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'intuit-signature': signature };
      mockRequest.body = {
        eventNotifications: [
          {
            realmId: 'realm-123',
            dataChangeEvent: {
              entities: [
                { id: '1', name: 'Customer', operation: 'Create' },
                { id: '2', name: 'Invoice', operation: 'Update' },
                { id: '3', name: 'Payment', operation: 'Delete' },
              ],
            },
          },
        ],
      };

      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'secret' });
      mockDigest.mockReturnValue(signature);
      mockTimingSafeEqual.mockReturnValue(true);

      await controller.handleQuickBooksWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should process multiple notifications', async () => {
      const signature = 'valid-sig';
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'intuit-signature': signature };
      mockRequest.body = {
        eventNotifications: [
          {
            realmId: 'realm-1',
            dataChangeEvent: {
              entities: [{ id: '1', name: 'Customer', operation: 'Create' }],
            },
          },
          {
            realmId: 'realm-2',
            dataChangeEvent: {
              entities: [{ id: '2', name: 'Invoice', operation: 'Update' }],
            },
          },
        ],
      };

      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'secret' });
      mockDigest.mockReturnValue(signature);
      mockTimingSafeEqual.mockReturnValue(true);

      await controller.handleQuickBooksWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should reject when credentials not found', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'intuit-signature': 'sig' };
      mockRequest.body = { eventNotifications: [] };

      mockRetrieveApiKeys.mockResolvedValue(null);

      await controller.handleQuickBooksWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
    });

    it('should return 500 on processing error', async () => {
      const signature = 'valid-sig';
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.headers = { 'intuit-signature': signature };
      mockRequest.body = {
        eventNotifications: [
          {
            realmId: 'realm-123',
            dataChangeEvent: {
              entities: [{ id: '1', name: 'Customer', operation: 'Create' }],
            },
          },
        ],
      };

      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'secret' });
      mockDigest.mockReturnValue(signature);
      mockTimingSafeEqual.mockReturnValue(true);

      // Force an error during processing by making the body structure invalid
      Object.defineProperty(mockRequest.body.eventNotifications[0], 'dataChangeEvent', {
        get: () => {
          throw new Error('Processing failed');
        },
      });

      await controller.handleQuickBooksWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Webhook processing failed',
      });
    });
  });

  describe('getWebhookEvents', () => {
    it('should return empty webhook events list', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { integrationType: 'stripe', limit: 50 };

      await controller.getWebhookEvents(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith({
        events: [],
        total: 0,
      });
    });

    it('should handle query parameters', async () => {
      mockRequest.params = { venueId: 'venue-456' };
      mockRequest.query = { integrationType: 'square', limit: 100 };

      await controller.getWebhookEvents(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should return 500 on error', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {};

      // Force an error
      Object.defineProperty(mockRequest, 'params', {
        get: () => {
          throw new Error('Params access failed');
        },
      });

      await controller.getWebhookEvents(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Failed to get webhook events',
      });
    });
  });

  describe('retryWebhook', () => {
    it('should queue webhook for retry', async () => {
      mockRequest.params = { webhookId: 'webhook-123' };

      await controller.retryWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Webhook webhook-123 queued for retry',
      });
    });

    it('should handle different webhook IDs', async () => {
      const webhookIds = ['wh-1', 'wh-2', 'wh-3'];

      for (const id of webhookIds) {
        jest.clearAllMocks();
        mockRequest.params = { webhookId: id };

        await controller.retryWebhook(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockSend).toHaveBeenCalledWith({
          success: true,
          message: `Webhook ${id} queued for retry`,
        });
      }
    });

    it('should return 500 on error', async () => {
      mockRequest.params = { webhookId: 'webhook-123' };

      // Force an error
      Object.defineProperty(mockRequest, 'params', {
        get: () => {
          throw new Error('Params access failed');
        },
      });

      await controller.retryWebhook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Failed to retry webhook',
      });
    });
  });
});
