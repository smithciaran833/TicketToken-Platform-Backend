// =============================================================================
// TEST SUITE: webhook-payload validator
// =============================================================================

import { WebhookPayloadValidator } from '../../../src/validators/webhook-payload';

describe('WebhookPayloadValidator', () => {
  // ===========================================================================
  // validateStripePayload() - Valid Payloads - 5 test cases
  // ===========================================================================

  describe('validateStripePayload() - Valid Payloads', () => {
    it('should validate complete payment_intent payload', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            amount: 10000,
            currency: 'usd',
            status: 'succeeded',
          },
        },
        created: Date.now(),
      };

      const result = WebhookPayloadValidator.validateStripePayload(payload);

      expect(result).toBe(true);
    });

    it('should validate complete charge payload', () => {
      const payload = {
        id: 'evt_456',
        type: 'charge.succeeded',
        data: {
          object: {
            id: 'ch_123',
            amount: 5000,
            currency: 'usd',
            paid: true,
          },
        },
        created: Date.now(),
      };

      const result = WebhookPayloadValidator.validateStripePayload(payload);

      expect(result).toBe(true);
    });

    it('should validate charge with paid false', () => {
      const payload = {
        id: 'evt_789',
        type: 'charge.failed',
        data: {
          object: {
            id: 'ch_456',
            amount: 2500,
            currency: 'eur',
            paid: false,
          },
        },
      };

      const result = WebhookPayloadValidator.validateStripePayload(payload);

      expect(result).toBe(true);
    });

    it('should validate other event types', () => {
      const payload = {
        id: 'evt_other',
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_123',
          },
        },
      };

      const result = WebhookPayloadValidator.validateStripePayload(payload);

      expect(result).toBe(true);
    });

    it('should validate payment_intent.created', () => {
      const payload = {
        id: 'evt_created',
        type: 'payment_intent.created',
        data: {
          object: {
            id: 'pi_new',
            amount: 7500,
            currency: 'gbp',
            status: 'requires_payment_method',
          },
        },
      };

      const result = WebhookPayloadValidator.validateStripePayload(payload);

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // validateStripePayload() - Invalid Payloads - 6 test cases
  // ===========================================================================

  describe('validateStripePayload() - Invalid Payloads', () => {
    it('should reject payload without id', () => {
      const payload = {
        type: 'payment_intent.succeeded',
        data: { object: {} },
      };

      const result = WebhookPayloadValidator.validateStripePayload(payload);

      expect(result).toBe(false);
    });

    it('should reject payload without type', () => {
      const payload = {
        id: 'evt_123',
        data: { object: {} },
      };

      const result = WebhookPayloadValidator.validateStripePayload(payload);

      expect(result).toBe(false);
    });

    it('should reject payload without data', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
      };

      const result = WebhookPayloadValidator.validateStripePayload(payload);

      expect(result).toBe(false);
    });

    it('should reject payment_intent without required fields', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            // missing amount, currency, status
          },
        },
      };

      const result = WebhookPayloadValidator.validateStripePayload(payload);

      expect(result).toBe(false);
    });

    it('should reject charge without required fields', () => {
      const payload = {
        id: 'evt_456',
        type: 'charge.succeeded',
        data: {
          object: {
            id: 'ch_123',
            amount: 5000,
            // missing currency and paid
          },
        },
      };

      const result = WebhookPayloadValidator.validateStripePayload(payload);

      expect(result).toBe(false);
    });

    it('should reject payment_intent without id', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            amount: 10000,
            currency: 'usd',
            status: 'succeeded',
          },
        },
      };

      const result = WebhookPayloadValidator.validateStripePayload(payload);

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // validateSquarePayload() - 4 test cases
  // ===========================================================================

  describe('validateSquarePayload()', () => {
    it('should validate complete Square payload', () => {
      const payload = {
        merchant_id: 'merchant_123',
        type: 'payment.created',
        data: {
          object: {
            payment: {
              id: 'payment_456',
            },
          },
        },
      };

      const result = WebhookPayloadValidator.validateSquarePayload(payload);

      expect(result).toBe(true);
    });

    it('should reject payload without merchant_id', () => {
      const payload = {
        type: 'payment.created',
        data: {},
      };

      const result = WebhookPayloadValidator.validateSquarePayload(payload);

      expect(result).toBe(false);
    });

    it('should reject payload without type', () => {
      const payload = {
        merchant_id: 'merchant_123',
        data: {},
      };

      const result = WebhookPayloadValidator.validateSquarePayload(payload);

      expect(result).toBe(false);
    });

    it('should reject payload without data', () => {
      const payload = {
        merchant_id: 'merchant_123',
        type: 'payment.created',
      };

      const result = WebhookPayloadValidator.validateSquarePayload(payload);

      expect(result).toBe(false);
    });
  });
});
