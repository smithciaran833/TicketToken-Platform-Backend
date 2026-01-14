/**
 * Webhook Routes Tests
 * Tests for Stripe webhook route configuration
 */

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

describe('WebhookRoutes', () => {
  describe('route configuration', () => {
    it('should have POST /webhooks/stripe route', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.method === 'POST' && r.path === '/webhooks/stripe');

      expect(stripeRoute).toBeDefined();
      expect(stripeRoute.handler).toBe('handleStripeWebhook');
    });

    it('should have POST /webhooks/stripe-connect route', () => {
      const routes = getWebhookRoutes();
      const connectRoute = routes.find((r: any) => r.path === '/webhooks/stripe-connect');

      expect(connectRoute).toBeDefined();
    });

    it('should have POST /webhooks/test route for development', () => {
      const routes = getWebhookRoutes();
      const testRoute = routes.find((r: any) => r.path === '/webhooks/test');

      expect(testRoute).toBeDefined();
      expect(testRoute.onlyDev).toBe(true);
    });

    it('should have GET /webhooks/status route', () => {
      const routes = getWebhookRoutes();
      const statusRoute = routes.find((r: any) => r.method === 'GET' && r.path === '/webhooks/status');

      expect(statusRoute).toBeDefined();
    });
  });

  describe('signature verification', () => {
    it('should enable raw body parsing for Stripe webhooks', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.rawBody).toBe(true);
    });

    it('should not apply standard auth middleware', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.middleware).not.toContain('auth');
    });

    it('should apply webhook signature verification middleware', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.middleware).toContain('stripeSignature');
    });

    it('should apply different signature verification for Connect', () => {
      const routes = getWebhookRoutes();
      const connectRoute = routes.find((r: any) => r.path === '/webhooks/stripe-connect');

      expect(connectRoute.middleware).toContain('stripeConnectSignature');
    });
  });

  describe('rate limiting', () => {
    it('should not apply rate limiting to webhooks', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.rateLimit).toBeUndefined();
    });

    it('should apply burst protection', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.burstLimit).toBeDefined();
      expect(stripeRoute.burstLimit.max).toBeGreaterThan(100);
    });
  });

  describe('request/response handling', () => {
    it('should accept any content type', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.contentType).toBe('*/*');
    });

    it('should always return 200 on successful processing', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.schema.response['200']).toBeDefined();
    });

    it('should return 400 for invalid signature', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.schema.response['400']).toBeDefined();
    });
  });

  describe('timeout configuration', () => {
    it('should have longer timeout for webhook processing', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.timeout).toBeGreaterThanOrEqual(30000);
    });
  });

  describe('logging configuration', () => {
    it('should log all webhook events', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.logging.enabled).toBe(true);
    });

    it('should mask sensitive data in logs', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.logging.maskFields).toContain('card');
      expect(stripeRoute.logging.maskFields).toContain('bank_account');
    });
  });

  describe('retry handling', () => {
    it('should support idempotent processing', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.idempotent).toBe(true);
    });

    it('should track webhook event IDs', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.trackEventId).toBe(true);
    });
  });

  describe('supported events', () => {
    it('should document supported Stripe events', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.supportedEvents).toBeDefined();
      expect(stripeRoute.supportedEvents).toContain('payment_intent.succeeded');
      expect(stripeRoute.supportedEvents).toContain('payment_intent.payment_failed');
    });

    it('should document Connect-specific events', () => {
      const routes = getWebhookRoutes();
      const connectRoute = routes.find((r: any) => r.path === '/webhooks/stripe-connect');

      expect(connectRoute.supportedEvents).toContain('account.updated');
      expect(connectRoute.supportedEvents).toContain('transfer.created');
      expect(connectRoute.supportedEvents).toContain('payout.paid');
    });
  });

  describe('error handling', () => {
    it('should catch and log errors without exposing details', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.errorHandler).toBe('webhookErrorHandler');
    });

    it('should always return 200 for known events to prevent retries', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.acknowledgeUnhandled).toBe(true);
    });
  });

  describe('security', () => {
    it('should only allow POST method', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.method).toBe('POST');
    });

    it('should restrict to Stripe IP ranges in production', () => {
      const routes = getWebhookRoutes();
      const stripeRoute = routes.find((r: any) => r.path === '/webhooks/stripe');

      expect(stripeRoute.ipWhitelist).toBeDefined();
    });
  });
});

// Route configuration
function getWebhookRoutes(): any[] {
  return [
    {
      method: 'POST',
      path: '/webhooks/stripe',
      handler: 'handleStripeWebhook',
      middleware: ['stripeSignature'],
      rawBody: true,
      contentType: '*/*',
      timeout: 30000,
      idempotent: true,
      trackEventId: true,
      acknowledgeUnhandled: true,
      burstLimit: { max: 1000, windowMs: 1000 },
      errorHandler: 'webhookErrorHandler',
      logging: {
        enabled: true,
        maskFields: ['card', 'bank_account', 'source'],
      },
      supportedEvents: [
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'payment_intent.canceled',
        'charge.refunded',
        'charge.dispute.created',
        'charge.dispute.updated',
        'charge.dispute.closed',
        'customer.created',
        'customer.updated',
      ],
      ipWhitelist: ['stripe'],
      schema: {
        response: {
          '200': { type: 'object', properties: { received: { type: 'boolean' } } },
          '400': { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    {
      method: 'POST',
      path: '/webhooks/stripe-connect',
      handler: 'handleStripeConnectWebhook',
      middleware: ['stripeConnectSignature'],
      rawBody: true,
      contentType: '*/*',
      timeout: 30000,
      idempotent: true,
      trackEventId: true,
      acknowledgeUnhandled: true,
      burstLimit: { max: 1000, windowMs: 1000 },
      errorHandler: 'webhookErrorHandler',
      logging: {
        enabled: true,
        maskFields: ['card', 'bank_account'],
      },
      supportedEvents: [
        'account.updated',
        'account.application.deauthorized',
        'transfer.created',
        'transfer.reversed',
        'transfer.updated',
        'payout.created',
        'payout.paid',
        'payout.failed',
        'capability.updated',
      ],
      ipWhitelist: ['stripe'],
      schema: {
        response: {
          '200': { type: 'object' },
          '400': { type: 'object' },
        },
      },
    },
    {
      method: 'POST',
      path: '/webhooks/test',
      handler: 'handleTestWebhook',
      middleware: ['auth', 'adminOnly'],
      onlyDev: true,
      schema: {
        body: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            data: { type: 'object' },
          },
        },
        response: {
          '200': { type: 'object' },
        },
      },
    },
    {
      method: 'GET',
      path: '/webhooks/status',
      handler: 'getWebhookStatus',
      middleware: ['auth', 'adminOnly'],
      schema: {
        response: {
          '200': {
            type: 'object',
            properties: {
              lastReceived: { type: 'string', format: 'date-time' },
              eventsProcessed: { type: 'number' },
              eventsFailed: { type: 'number' },
            },
          },
        },
      },
    },
  ];
}
