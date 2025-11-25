// =============================================================================
// TEST SUITE: stripeMock service
// =============================================================================

import { StripeMock } from '../../../../src/services/providers/stripeMock';

describe('StripeMock', () => {
  let stripeMock: StripeMock;

  beforeEach(() => {
    stripeMock = new StripeMock();
  });

  // ===========================================================================
  // paymentIntents.create() - 8 test cases
  // ===========================================================================

  describe('paymentIntents.create()', () => {
    it('should create payment intent with amount', async () => {
      const result = await stripeMock.paymentIntents.create({
        amount: 10000,
        currency: 'usd',
      });

      expect(result.amount).toBe(10000);
    });

    it('should create payment intent with currency', async () => {
      const result = await stripeMock.paymentIntents.create({
        amount: 5000,
        currency: 'eur',
      });

      expect(result.currency).toBe('eur');
    });

    it('should generate id with pi_test prefix', async () => {
      const result = await stripeMock.paymentIntents.create({
        amount: 1000,
        currency: 'usd',
      });

      expect(result.id).toMatch(/^pi_test_\d+_[a-z0-9]+$/);
    });

    it('should generate client_secret', async () => {
      const result = await stripeMock.paymentIntents.create({
        amount: 1000,
        currency: 'usd',
      });

      expect(result.client_secret).toBeDefined();
      expect(result.client_secret).toContain('pi_test_');
      expect(result.client_secret).toContain('_secret_');
    });

    it('should set status to requires_payment_method', async () => {
      const result = await stripeMock.paymentIntents.create({
        amount: 1000,
        currency: 'usd',
      });

      expect(result.status).toBe('requires_payment_method');
    });

    it('should include application_fee_amount when provided', async () => {
      const result = await stripeMock.paymentIntents.create({
        amount: 10000,
        currency: 'usd',
        application_fee_amount: 500,
      });

      expect(result.application_fee_amount).toBe(500);
    });

    it('should include metadata when provided', async () => {
      const metadata = { orderId: 'order-123', userId: 'user-456' };
      const result = await stripeMock.paymentIntents.create({
        amount: 1000,
        currency: 'usd',
        metadata,
      });

      expect(result.metadata).toEqual(metadata);
    });

    it('should include created timestamp', async () => {
      const result = await stripeMock.paymentIntents.create({
        amount: 1000,
        currency: 'usd',
      });

      expect(result.created).toBeDefined();
      expect(typeof result.created).toBe('number');
    });
  });

  // ===========================================================================
  // paymentIntents.retrieve() - 4 test cases
  // ===========================================================================

  describe('paymentIntents.retrieve()', () => {
    it('should retrieve payment intent by id', async () => {
      const result = await stripeMock.paymentIntents.retrieve('pi_test_123');

      expect(result.id).toBe('pi_test_123');
    });

    it('should return succeeded status', async () => {
      const result = await stripeMock.paymentIntents.retrieve('pi_test_456');

      expect(result.status).toBe('succeeded');
    });

    it('should return default amount', async () => {
      const result = await stripeMock.paymentIntents.retrieve('pi_test_789');

      expect(result.amount).toBe(10000);
    });

    it('should return usd currency', async () => {
      const result = await stripeMock.paymentIntents.retrieve('pi_test_abc');

      expect(result.currency).toBe('usd');
    });
  });

  // ===========================================================================
  // webhookEndpoints.create() - 5 test cases
  // ===========================================================================

  describe('webhookEndpoints.create()', () => {
    it('should create webhook endpoint with url', async () => {
      const result = await stripeMock.webhookEndpoints.create({
        url: 'https://example.com/webhook',
        enabled_events: ['payment_intent.succeeded'],
      });

      expect(result.url).toBe('https://example.com/webhook');
    });

    it('should create webhook endpoint with enabled_events', async () => {
      const events = ['payment_intent.succeeded', 'charge.failed'];
      const result = await stripeMock.webhookEndpoints.create({
        url: 'https://example.com/webhook',
        enabled_events: events,
      });

      expect(result.enabled_events).toEqual(events);
    });

    it('should generate id with we_test prefix', async () => {
      const result = await stripeMock.webhookEndpoints.create({
        url: 'https://example.com/webhook',
        enabled_events: [],
      });

      expect(result.id).toMatch(/^we_test_\d+$/);
    });

    it('should generate unique ids', async () => {
      const result1 = await stripeMock.webhookEndpoints.create({
        url: 'https://example1.com/webhook',
        enabled_events: [],
      });
      const result2 = await stripeMock.webhookEndpoints.create({
        url: 'https://example2.com/webhook',
        enabled_events: [],
      });

      expect(result1.id).not.toBe(result2.id);
    });

    it('should handle multiple enabled events', async () => {
      const events = [
        'payment_intent.succeeded',
        'payment_intent.failed',
        'charge.succeeded',
        'charge.failed',
      ];
      const result = await stripeMock.webhookEndpoints.create({
        url: 'https://example.com/webhook',
        enabled_events: events,
      });

      expect(result.enabled_events).toHaveLength(4);
    });
  });
});
