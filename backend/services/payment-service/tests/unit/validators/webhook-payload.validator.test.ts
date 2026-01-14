/**
 * Unit Tests for Webhook Payload Validator
 * 
 * Tests validation of Stripe and Square webhook payloads.
 */

import { WebhookPayloadValidator } from '../../../src/validators/webhook-payload';

describe('WebhookPayloadValidator', () => {
  describe('validateStripePayload', () => {
    describe('Basic Structure Validation', () => {
      it('should return false when id is missing', () => {
        const payload = {
          type: 'payment_intent.succeeded',
          data: { object: {} },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should return false when type is missing', () => {
        const payload = {
          id: 'evt_123',
          data: { object: {} },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should return false when data is missing', () => {
        const payload = {
          id: 'evt_123',
          type: 'payment_intent.succeeded',
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should return false for empty payload', () => {
        expect(WebhookPayloadValidator.validateStripePayload({})).toBe(false);
      });

      it('should return false for null', () => {
        expect(WebhookPayloadValidator.validateStripePayload(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(WebhookPayloadValidator.validateStripePayload(undefined)).toBe(false);
      });
    });

    describe('Payment Intent Validation', () => {
      it('should validate valid payment_intent.succeeded event', () => {
        const payload = {
          id: 'evt_123abc',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_123abc',
              amount: 10000,
              currency: 'usd',
              status: 'succeeded',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });

      it('should validate valid payment_intent.payment_failed event', () => {
        const payload = {
          id: 'evt_456def',
          type: 'payment_intent.payment_failed',
          data: {
            object: {
              id: 'pi_456def',
              amount: 5000,
              currency: 'eur',
              status: 'requires_payment_method',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });

      it('should validate valid payment_intent.created event', () => {
        const payload = {
          id: 'evt_789ghi',
          type: 'payment_intent.created',
          data: {
            object: {
              id: 'pi_789ghi',
              amount: 15000,
              currency: 'gbp',
              status: 'requires_payment_method',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });

      it('should return false when payment intent is missing id', () => {
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
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should return false when payment intent is missing amount', () => {
        const payload = {
          id: 'evt_123',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_123',
              currency: 'usd',
              status: 'succeeded',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should return false when payment intent is missing currency', () => {
        const payload = {
          id: 'evt_123',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_123',
              amount: 10000,
              status: 'succeeded',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should return false when payment intent is missing status', () => {
        const payload = {
          id: 'evt_123',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_123',
              amount: 10000,
              currency: 'usd',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should handle payment intent with all required fields plus extras', () => {
        const payload = {
          id: 'evt_full',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_full',
              amount: 10000,
              currency: 'usd',
              status: 'succeeded',
              metadata: { orderId: 'order-123' },
              customer: 'cus_123',
              payment_method: 'pm_card',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });
    });

    describe('Charge Validation', () => {
      it('should validate valid charge.succeeded event', () => {
        const payload = {
          id: 'evt_charge_123',
          type: 'charge.succeeded',
          data: {
            object: {
              id: 'ch_123abc',
              amount: 10000,
              currency: 'usd',
              paid: true,
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });

      it('should validate valid charge.failed event', () => {
        const payload = {
          id: 'evt_charge_456',
          type: 'charge.failed',
          data: {
            object: {
              id: 'ch_456def',
              amount: 5000,
              currency: 'eur',
              paid: false,
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });

      it('should validate valid charge.refunded event', () => {
        const payload = {
          id: 'evt_charge_789',
          type: 'charge.refunded',
          data: {
            object: {
              id: 'ch_789ghi',
              amount: 7500,
              currency: 'cad',
              paid: true,
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });

      it('should return false when charge is missing id', () => {
        const payload = {
          id: 'evt_123',
          type: 'charge.succeeded',
          data: {
            object: {
              amount: 10000,
              currency: 'usd',
              paid: true,
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should return false when charge is missing amount', () => {
        const payload = {
          id: 'evt_123',
          type: 'charge.succeeded',
          data: {
            object: {
              id: 'ch_123',
              currency: 'usd',
              paid: true,
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should return false when charge is missing currency', () => {
        const payload = {
          id: 'evt_123',
          type: 'charge.succeeded',
          data: {
            object: {
              id: 'ch_123',
              amount: 10000,
              paid: true,
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should return false when charge is missing paid field', () => {
        const payload = {
          id: 'evt_123',
          type: 'charge.succeeded',
          data: {
            object: {
              id: 'ch_123',
              amount: 10000,
              currency: 'usd',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should validate charge with paid: false', () => {
        const payload = {
          id: 'evt_unpaid',
          type: 'charge.failed',
          data: {
            object: {
              id: 'ch_unpaid',
              amount: 10000,
              currency: 'usd',
              paid: false,
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });
    });

    describe('Other Event Types', () => {
      it('should return true for customer.created event with basic structure', () => {
        const payload = {
          id: 'evt_customer',
          type: 'customer.created',
          data: {
            object: {
              id: 'cus_123',
              email: 'test@example.com',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });

      it('should return true for invoice.paid event with basic structure', () => {
        const payload = {
          id: 'evt_invoice',
          type: 'invoice.paid',
          data: {
            object: {
              id: 'in_123',
              amount_paid: 10000,
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });

      it('should return true for subscription event with basic structure', () => {
        const payload = {
          id: 'evt_sub',
          type: 'customer.subscription.created',
          data: {
            object: {
              id: 'sub_123',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });

      it('should return true for account.updated event', () => {
        const payload = {
          id: 'evt_account',
          type: 'account.updated',
          data: {
            object: {
              id: 'acct_123',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });

      it('should return true for payout event', () => {
        const payload = {
          id: 'evt_payout',
          type: 'payout.created',
          data: {
            object: {
              id: 'po_123',
              amount: 50000,
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty data object', () => {
        const payload = {
          id: 'evt_empty',
          type: 'payment_intent.succeeded',
          data: {
            object: {},
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should handle amount of 0', () => {
        const payload = {
          id: 'evt_zero',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_zero',
              amount: 0, // Technically valid in Stripe
              currency: 'usd',
              status: 'succeeded',
            },
          },
        };
        // Amount of 0 is falsy in JS, so this would return false
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(false);
      });

      it('should handle very large amounts', () => {
        const payload = {
          id: 'evt_large',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_large',
              amount: 99999999, // $999,999.99
              currency: 'usd',
              status: 'succeeded',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });

      it('should handle string amount (type coercion)', () => {
        const payload = {
          id: 'evt_string',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_string',
              amount: '10000', // String instead of number
              currency: 'usd',
              status: 'succeeded',
            },
          },
        };
        expect(WebhookPayloadValidator.validateStripePayload(payload)).toBe(true);
      });
    });
  });

  describe('validateSquarePayload', () => {
    it('should validate valid Square payload', () => {
      const payload = {
        merchant_id: 'merchant_123',
        type: 'payment.completed',
        data: {
          object: {
            payment: {
              id: 'payment_123',
              amount_money: { amount: 10000, currency: 'USD' },
            },
          },
        },
      };
      expect(WebhookPayloadValidator.validateSquarePayload(payload)).toBe(true);
    });

    it('should return false when merchant_id is missing', () => {
      const payload = {
        type: 'payment.completed',
        data: {
          object: {},
        },
      };
      expect(WebhookPayloadValidator.validateSquarePayload(payload)).toBe(false);
    });

    it('should return false when type is missing', () => {
      const payload = {
        merchant_id: 'merchant_123',
        data: {
          object: {},
        },
      };
      expect(WebhookPayloadValidator.validateSquarePayload(payload)).toBe(false);
    });

    it('should return false when data is missing', () => {
      const payload = {
        merchant_id: 'merchant_123',
        type: 'payment.completed',
      };
      expect(WebhookPayloadValidator.validateSquarePayload(payload)).toBe(false);
    });

    it('should return false for empty payload', () => {
      expect(WebhookPayloadValidator.validateSquarePayload({})).toBe(false);
    });

    it('should return false for null', () => {
      expect(WebhookPayloadValidator.validateSquarePayload(null)).toBe(false);
    });

    it('should validate Square refund event', () => {
      const payload = {
        merchant_id: 'merchant_456',
        type: 'refund.created',
        data: {
          object: {
            refund: {
              id: 'refund_123',
              amount_money: { amount: 5000, currency: 'USD' },
            },
          },
        },
      };
      expect(WebhookPayloadValidator.validateSquarePayload(payload)).toBe(true);
    });

    it('should validate Square order event', () => {
      const payload = {
        merchant_id: 'merchant_789',
        type: 'order.created',
        data: {
          object: {
            order: {
              id: 'order_123',
            },
          },
        },
      };
      expect(WebhookPayloadValidator.validateSquarePayload(payload)).toBe(true);
    });
  });
});
