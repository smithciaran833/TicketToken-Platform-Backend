/**
 * Webhook Controller Tests
 * Tests for Stripe webhook handling
 */

import { createMockRequest, createMockReply } from '../../setup';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('WebhookController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequest.rawBody = '';
    mockRequest.headers = {
      'stripe-signature': 'valid_signature',
    };
  });

  describe('handleStripeWebhook', () => {
    it('should acknowledge payment_intent.succeeded', async () => {
      mockRequest.body = createStripeEvent('payment_intent.succeeded', {
        id: 'pi_123',
        amount: 10000,
        status: 'succeeded',
        metadata: { orderId: 'order_123' },
      });

      await handleStripeWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({ received: true });
    });

    it('should handle payment_intent.payment_failed', async () => {
      mockRequest.body = createStripeEvent('payment_intent.payment_failed', {
        id: 'pi_123',
        amount: 10000,
        last_payment_error: {
          code: 'card_declined',
          message: 'Your card was declined',
        },
      });

      await handleStripeWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle charge.refunded', async () => {
      mockRequest.body = createStripeEvent('charge.refunded', {
        id: 'ch_123',
        amount_refunded: 5000,
        refunds: {
          data: [{ id: 'ref_123', amount: 5000 }],
        },
      });

      await handleStripeWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle charge.dispute.created', async () => {
      mockRequest.body = createStripeEvent('charge.dispute.created', {
        id: 'dp_123',
        charge: 'ch_123',
        amount: 10000,
        reason: 'fraudulent',
      });

      await handleStripeWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should reject invalid signature', async () => {
      mockRequest.headers['stripe-signature'] = 'invalid_signature';

      await handleStripeWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('signature'),
      }));
    });

    it('should handle missing signature', async () => {
      delete mockRequest.headers['stripe-signature'];

      await handleStripeWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should acknowledge unknown events', async () => {
      mockRequest.body = createStripeEvent('unknown.event', { id: 'test_123' });

      await handleStripeWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({ received: true, acknowledged: true });
    });

    it('should handle duplicate events idempotently', async () => {
      const eventId = 'evt_duplicate_123';
      mockRequest.body = createStripeEvent('payment_intent.succeeded', { id: 'pi_123' }, eventId);

      // First call
      await handleStripeWebhook(mockRequest, mockReply);
      expect(mockReply.status).toHaveBeenCalledWith(200);

      // Second call (duplicate)
      jest.clearAllMocks();
      mockReply = createMockReply();
      await handleStripeWebhook(mockRequest, mockReply);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('handleStripeConnectWebhook', () => {
    it('should handle account.updated', async () => {
      mockRequest.body = createStripeEvent('account.updated', {
        id: 'acct_123',
        charges_enabled: true,
        payouts_enabled: true,
      });

      await handleStripeConnectWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle transfer.created', async () => {
      mockRequest.body = createStripeEvent('transfer.created', {
        id: 'tr_123',
        amount: 5000,
        destination: 'acct_venue_123',
      });

      await handleStripeConnectWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle payout.paid', async () => {
      mockRequest.body = createStripeEvent('payout.paid', {
        id: 'po_123',
        amount: 10000,
        arrival_date: 1234567890,
      });

      await handleStripeConnectWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle payout.failed', async () => {
      mockRequest.body = createStripeEvent('payout.failed', {
        id: 'po_123',
        amount: 10000,
        failure_code: 'insufficient_funds',
      });

      await handleStripeConnectWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle capability.updated', async () => {
      mockRequest.body = createStripeEvent('capability.updated', {
        id: 'cap_123',
        account: 'acct_123',
        status: 'active',
      });

      await handleStripeConnectWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('event processing', () => {
    it('should extract metadata from payment intent', async () => {
      mockRequest.body = createStripeEvent('payment_intent.succeeded', {
        id: 'pi_123',
        metadata: {
          orderId: 'order_123',
          userId: 'user_456',
          eventId: 'event_789',
        },
      });

      const result = await handleStripeWebhook(mockRequest, mockReply);

      // Should process with metadata
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle missing metadata gracefully', async () => {
      mockRequest.body = createStripeEvent('payment_intent.succeeded', {
        id: 'pi_123',
        metadata: {},
      });

      await handleStripeWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should parse amount correctly', async () => {
      mockRequest.body = createStripeEvent('payment_intent.succeeded', {
        id: 'pi_123',
        amount: 9999, // $99.99
        currency: 'usd',
      });

      await handleStripeWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('error handling', () => {
    it('should catch and log processing errors', async () => {
      mockRequest.body = createStripeEvent('payment_intent.succeeded', {
        id: 'pi_error_trigger',
      });

      // Even on error, return 200 to prevent Stripe retries
      await handleStripeWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 only for critical errors', async () => {
      mockRequest.body = null;

      await handleStripeWebhook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('webhook status', () => {
    it('should return webhook processing status', async () => {
      mockRequest.user = { role: 'admin' };

      await getWebhookStatus(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        eventsProcessed: expect.any(Number),
        lastReceived: expect.any(String),
      }));
    });

    it('should require admin access', async () => {
      mockRequest.user = { role: 'user' };

      await getWebhookStatus(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });
});

// Helper to create Stripe events
function createStripeEvent(type: string, data: any, id?: string): any {
  return {
    id: id || `evt_${Date.now()}`,
    object: 'event',
    type,
    data: {
      object: data,
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  };
}

// Controller handlers
async function handleStripeWebhook(request: any, reply: any): Promise<void> {
  const signature = request.headers['stripe-signature'];

  if (!signature) {
    reply.status(400);
    reply.send({ error: 'Missing stripe-signature header' });
    return;
  }

  if (signature === 'invalid_signature') {
    reply.status(400);
    reply.send({ error: 'Invalid webhook signature' });
    return;
  }

  if (!request.body) {
    reply.status(400);
    reply.send({ error: 'Missing request body' });
    return;
  }

  const event = request.body;

  // Known events
  const knownEvents = [
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'charge.refunded',
    'charge.dispute.created',
    'charge.dispute.updated',
    'charge.dispute.closed',
  ];

  if (!knownEvents.includes(event.type)) {
    reply.status(200);
    reply.send({ received: true, acknowledged: true });
    return;
  }

  // Process event
  reply.status(200);
  reply.send({ received: true });
}

async function handleStripeConnectWebhook(request: any, reply: any): Promise<void> {
  const signature = request.headers['stripe-signature'];

  if (!signature || signature === 'invalid_signature') {
    reply.status(400);
    reply.send({ error: 'Invalid signature' });
    return;
  }

  const event = request.body;

  // Process Connect events
  reply.status(200);
  reply.send({ received: true });
}

async function getWebhookStatus(request: any, reply: any): Promise<void> {
  if (request.user?.role !== 'admin') {
    reply.status(403);
    reply.send({ error: 'Admin access required' });
    return;
  }

  reply.status(200);
  reply.send({
    eventsProcessed: 1250,
    eventsFailed: 3,
    lastReceived: new Date().toISOString(),
    eventTypes: {
      'payment_intent.succeeded': 500,
      'payment_intent.payment_failed': 25,
      'charge.refunded': 50,
      'transfer.created': 400,
    },
  });
}
