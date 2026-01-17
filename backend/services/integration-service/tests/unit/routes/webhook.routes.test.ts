// Mock controllers BEFORE imports
const mockHandleSquareWebhook = jest.fn();
const mockHandleStripeWebhook = jest.fn();
const mockHandleMailchimpWebhook = jest.fn();
const mockHandleQuickBooksWebhook = jest.fn();
const mockGetWebhookEvents = jest.fn();
const mockRetryWebhook = jest.fn();

jest.mock('../../../src/controllers/webhook.controller', () => ({
  webhookController: {
    handleSquareWebhook: mockHandleSquareWebhook,
    handleStripeWebhook: mockHandleStripeWebhook,
    handleMailchimpWebhook: mockHandleMailchimpWebhook,
    handleQuickBooksWebhook: mockHandleQuickBooksWebhook,
    getWebhookEvents: mockGetWebhookEvents,
    retryWebhook: mockRetryWebhook,
  },
}));

// Mock middleware
const mockAuthenticate = jest.fn();
const mockVerifyWebhookSignature = jest.fn();

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: mockAuthenticate,
  verifyWebhookSignature: mockVerifyWebhookSignature,
}));

import { FastifyInstance } from 'fastify';
import { webhookRoutes } from '../../../src/routes/webhook.routes';

describe('webhookRoutes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let getSpy: jest.Mock;
  let postSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    getSpy = jest.fn();
    postSpy = jest.fn();

    mockFastify = {
      get: getSpy,
      post: postSpy,
    };

    mockVerifyWebhookSignature.mockImplementation((provider) => `verify-${provider}`);
  });

  describe('webhook provider routes', () => {
    it('should register POST /square with signature verification', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/square',
        expect.objectContaining({
          onRequest: 'verify-square',
        }),
        mockHandleSquareWebhook
      );
      expect(mockVerifyWebhookSignature).toHaveBeenCalledWith('square');
    });

    it('should register POST /stripe with signature verification', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/stripe',
        expect.objectContaining({
          onRequest: 'verify-stripe',
        }),
        mockHandleStripeWebhook
      );
      expect(mockVerifyWebhookSignature).toHaveBeenCalledWith('stripe');
    });

    it('should register POST /mailchimp with signature verification', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/mailchimp',
        expect.objectContaining({
          onRequest: 'verify-mailchimp',
        }),
        mockHandleMailchimpWebhook
      );
      expect(mockVerifyWebhookSignature).toHaveBeenCalledWith('mailchimp');
    });

    it('should register POST /quickbooks with signature verification', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/quickbooks',
        expect.objectContaining({
          onRequest: 'verify-quickbooks',
        }),
        mockHandleQuickBooksWebhook
      );
      expect(mockVerifyWebhookSignature).toHaveBeenCalledWith('quickbooks');
    });

    it('should not require JWT auth for webhook endpoints', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      const providerWebhookRoutes = postSpy.mock.calls.filter((call) =>
        ['/square', '/stripe', '/mailchimp', '/quickbooks'].includes(call[0])
      );

      providerWebhookRoutes.forEach((route) => {
        expect(route[1].onRequest).not.toBe(mockAuthenticate);
      });
    });

    it('should bind correct controller methods', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/square', expect.any(Object), mockHandleSquareWebhook);
      expect(postSpy).toHaveBeenCalledWith('/stripe', expect.any(Object), mockHandleStripeWebhook);
      expect(postSpy).toHaveBeenCalledWith('/mailchimp', expect.any(Object), mockHandleMailchimpWebhook);
      expect(postSpy).toHaveBeenCalledWith('/quickbooks', expect.any(Object), mockHandleQuickBooksWebhook);
    });
  });

  describe('authenticated webhook routes', () => {
    it('should register GET /:provider/events with authentication', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith(
        '/:provider/events',
        expect.objectContaining({
          onRequest: mockAuthenticate,
        }),
        mockGetWebhookEvents
      );
    });

    it('should register POST /retry with authentication', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/retry',
        expect.objectContaining({
          onRequest: mockAuthenticate,
        }),
        mockRetryWebhook
      );
    });

    it('should use JWT auth for authenticated routes', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      const eventsRoute = getSpy.mock.calls.find((call) => call[0] === '/:provider/events');
      const retryRoute = postSpy.mock.calls.find((call) => call[0] === '/retry');

      expect(eventsRoute[1].onRequest).toBe(mockAuthenticate);
      expect(retryRoute[1].onRequest).toBe(mockAuthenticate);
    });
  });

  it('should register all 6 routes', async () => {
    await webhookRoutes(mockFastify as FastifyInstance);

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledTimes(5);
  });

  it('should call verifyWebhookSignature for each provider', async () => {
    await webhookRoutes(mockFastify as FastifyInstance);

    expect(mockVerifyWebhookSignature).toHaveBeenCalledTimes(4);
    expect(mockVerifyWebhookSignature).toHaveBeenCalledWith('square');
    expect(mockVerifyWebhookSignature).toHaveBeenCalledWith('stripe');
    expect(mockVerifyWebhookSignature).toHaveBeenCalledWith('mailchimp');
    expect(mockVerifyWebhookSignature).toHaveBeenCalledWith('quickbooks');
  });

  it('should separate webhook ingestion from management routes', async () => {
    await webhookRoutes(mockFastify as FastifyInstance);

    // Webhook ingestion routes (4) use signature verification
    const webhookPosts = postSpy.mock.calls.filter((call) =>
      ['/square', '/stripe', '/mailchimp', '/quickbooks'].includes(call[0])
    );
    expect(webhookPosts).toHaveLength(4);

    // Management routes (2) use JWT auth
    const authRoutes = [...getSpy.mock.calls, ...postSpy.mock.calls].filter((call) =>
      ['/:provider/events', '/retry'].includes(call[0])
    );
    expect(authRoutes).toHaveLength(2);
  });
});
