/**
 * COMPONENT TEST: WebhookController
 *
 * Tests webhook handling for Stripe and Square
 */

import { v4 as uuidv4 } from 'uuid';
import { FastifyRequest, FastifyReply } from 'fastify';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.SQUARE_WEBHOOK_SECRET = 'square_secret';

// Mock Redis
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();

jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    get: mockRedisGet,
    set: mockRedisSet,
  },
}));

// Mock db (knex)
const mockDbInsert = jest.fn().mockReturnThis();
const mockDbOnConflict = jest.fn().mockReturnThis();
const mockDbIgnore = jest.fn().mockResolvedValue([]);
const mockDbWhere = jest.fn().mockReturnThis();
const mockDbFirst = jest.fn();
const mockDbUpdate = jest.fn().mockResolvedValue(1);
const mockDbRaw = jest.fn((val) => val);

jest.mock('../../../src/config/database', () => ({
  db: jest.fn((table: string) => ({
    insert: mockDbInsert,
    onConflict: mockDbOnConflict,
    ignore: mockDbIgnore,
    where: mockDbWhere,
    first: mockDbFirst,
    update: mockDbUpdate,
    raw: mockDbRaw,
  })),
}));

// Mock Stripe
const mockStripeConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockStripeConstructEvent,
    },
  }));
});

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    stripe: {
      secretKey: 'sk_test_fake',
      webhookSecret: 'whsec_test',
    },
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { WebhookController, webhookController } from '../../../src/controllers/webhook.controller';

// Helpers
function createMockRequest(overrides: any = {}): FastifyRequest {
  return {
    body: {},
    headers: {},
    params: {},
    query: {},
    rawBody: '',
    ...overrides,
  } as unknown as FastifyRequest;
}

function createMockReply(): { reply: FastifyReply; getResponse: () => any; getStatus: () => number } {
  let response: any = null;
  let status = 200;
  const reply = {
    send: jest.fn().mockImplementation((data) => { response = data; return reply; }),
    status: jest.fn().mockImplementation((code) => { status = code; return reply; }),
  } as unknown as FastifyReply;
  return { reply, getResponse: () => response, getStatus: () => status };
}

describe('WebhookController Component Tests', () => {
  let controller: WebhookController;

  beforeEach(() => {
    mockRedisGet.mockReset();
    mockRedisSet.mockReset();
    mockStripeConstructEvent.mockReset();
    mockDbInsert.mockClear();
    mockDbUpdate.mockClear();
    mockDbFirst.mockReset();

    // Default Redis - no duplicates
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');

    controller = new WebhookController();
  });

  // ===========================================================================
  // STRIPE WEBHOOK
  // ===========================================================================
  describe('handleStripeWebhook()', () => {
    it('should process valid webhook event', async () => {
      const eventId = `evt_${uuidv4().replace(/-/g, '')}`;
      mockStripeConstructEvent.mockReturnValueOnce({
        id: eventId,
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            metadata: { tenant_id: uuidv4() },
          },
        },
      });

      const request = createMockRequest({
        headers: { 'stripe-signature': 'sig_test' },
        rawBody: '{}',
      });
      const { reply, getResponse } = createMockReply();

      await controller.handleStripeWebhook(request, reply);

      expect(mockStripeConstructEvent).toHaveBeenCalled();
      expect(mockRedisSet).toHaveBeenCalled();
      expect(getResponse().received).toBe(true);
    });

    it('should reject invalid signature', async () => {
      mockStripeConstructEvent.mockImplementationOnce(() => {
        throw new Error('Invalid signature');
      });

      const request = createMockRequest({
        headers: { 'stripe-signature': 'invalid_sig' },
        rawBody: '{}',
      });
      const { reply, getStatus } = createMockReply();

      await controller.handleStripeWebhook(request, reply);

      expect(getStatus()).toBe(400);
    });

    it('should deduplicate by event ID', async () => {
      const eventId = `evt_${uuidv4().replace(/-/g, '')}`;

      // Event already processed
      mockRedisGet.mockResolvedValueOnce(JSON.stringify({
        processedAt: new Date().toISOString(),
        status: 'completed',
      }));

      mockStripeConstructEvent.mockReturnValueOnce({
        id: eventId,
        type: 'payment_intent.succeeded',
        data: { object: { metadata: {} } },
      });

      const request = createMockRequest({
        headers: { 'stripe-signature': 'sig_test' },
        rawBody: '{}',
      });
      const { reply, getResponse } = createMockReply();

      await controller.handleStripeWebhook(request, reply);

      const response = getResponse();
      expect(response.received).toBe(true);
      expect(response.duplicate).toBe(true);
    });

    it('should handle payment_intent.succeeded event', async () => {
      mockStripeConstructEvent.mockReturnValueOnce({
        id: `evt_${uuidv4().replace(/-/g, '')}`,
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            amount: 5000,
            metadata: {},
          },
        },
      });

      const request = createMockRequest({
        headers: { 'stripe-signature': 'sig_test' },
        rawBody: '{}',
      });
      const { reply, getResponse } = createMockReply();

      await controller.handleStripeWebhook(request, reply);

      expect(getResponse().received).toBe(true);
    });

    it('should handle payment_intent.payment_failed event', async () => {
      mockStripeConstructEvent.mockReturnValueOnce({
        id: `evt_${uuidv4().replace(/-/g, '')}`,
        type: 'payment_intent.payment_failed',
        data: {
          object: { id: 'pi_test', metadata: {} },
        },
      });

      const request = createMockRequest({
        headers: { 'stripe-signature': 'sig_test' },
        rawBody: '{}',
      });
      const { reply, getResponse } = createMockReply();

      await controller.handleStripeWebhook(request, reply);

      expect(getResponse().received).toBe(true);
    });

    it('should handle charge.refunded event', async () => {
      mockDbFirst.mockResolvedValueOnce({
        id: uuidv4(),
        user_id: uuidv4(),
        tenant_id: uuidv4(),
        amount: 5000,
      });

      mockStripeConstructEvent.mockReturnValueOnce({
        id: `evt_${uuidv4().replace(/-/g, '')}`,
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test',
            payment_intent: 'pi_test',
            amount: 5000,
            amount_refunded: 5000,
            refunded: true,
            refunds: { data: [] },
            metadata: {},
          },
        },
      });

      const request = createMockRequest({
        headers: { 'stripe-signature': 'sig_test' },
        rawBody: '{}',
      });
      const { reply, getResponse } = createMockReply();

      await controller.handleStripeWebhook(request, reply);

      expect(getResponse().received).toBe(true);
    });

    it('should return 200 to prevent Stripe retries on errors', async () => {
      mockStripeConstructEvent.mockReturnValueOnce({
        id: `evt_${uuidv4().replace(/-/g, '')}`,
        type: 'payment_intent.succeeded',
        data: { object: { metadata: {} } },
      });

      const request = createMockRequest({
        headers: { 'stripe-signature': 'sig_test' },
        rawBody: '{}',
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.handleStripeWebhook(request, reply);

      // Should return 200
      expect(getStatus()).toBe(200);
      expect(getResponse().received).toBe(true);
    });
  });

  // ===========================================================================
  // SQUARE WEBHOOK
  // ===========================================================================
  describe('handleSquareWebhook()', () => {
    it('should process valid Square webhook', async () => {
      // Mock crypto for signature verification
      const crypto = require('crypto');
      const body = JSON.stringify({ event_id: 'sq_evt_123', type: 'payment.completed' });
      const hash = crypto
        .createHmac('sha256', process.env.SQUARE_WEBHOOK_SECRET)
        .update(body)
        .digest('base64');

      const request = createMockRequest({
        headers: { 'x-square-signature': hash },
        body: { event_id: 'sq_evt_123', type: 'payment.completed' },
      });
      const { reply, getResponse } = createMockReply();

      await controller.handleSquareWebhook(request, reply);

      expect(getResponse().received).toBe(true);
    });

    it('should reject invalid Square signature', async () => {
      const request = createMockRequest({
        headers: { 'x-square-signature': 'invalid' },
        body: { event_id: 'sq_evt_123', type: 'payment.completed' },
      });
      const { reply, getStatus } = createMockReply();

      await controller.handleSquareWebhook(request, reply);

      expect(getStatus()).toBe(500);
    });

    it('should deduplicate Square webhooks', async () => {
      mockRedisGet.mockResolvedValueOnce(JSON.stringify({ processedAt: new Date().toISOString() }));

      const crypto = require('crypto');
      const body = JSON.stringify({ event_id: 'sq_evt_123', type: 'payment.completed' });
      const hash = crypto
        .createHmac('sha256', process.env.SQUARE_WEBHOOK_SECRET)
        .update(body)
        .digest('base64');

      const request = createMockRequest({
        headers: { 'x-square-signature': hash },
        body: { event_id: 'sq_evt_123', type: 'payment.completed' },
      });
      const { reply, getResponse } = createMockReply();

      await controller.handleSquareWebhook(request, reply);

      expect(getResponse().duplicate).toBe(true);
    });
  });

  // ===========================================================================
  // SINGLETON EXPORT
  // ===========================================================================
  describe('singleton export', () => {
    it('should export webhookController instance', () => {
      expect(webhookController).toBeInstanceOf(WebhookController);
    });
  });
});
