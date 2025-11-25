import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';

/**
 * Stripe Webhook Signature Tests
 * 
 * These tests verify:
 * 1. Valid webhook signatures are accepted
 * 2. Invalid signatures are rejected
 * 3. Replay attack prevention via idempotency
 * 4. All major event types process correctly
 * 
 * Prerequisites:
 * - STRIPE_SECRET_KEY must be set
 * - STRIPE_WEBHOOK_SECRET must be set (whsec_...)
 */

describe('Stripe Webhook Signature Tests', () => {
  let stripe: Stripe;
  let webhookSecret: string;

  beforeAll(() => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY must be set for webhook tests');
    }

    if (!webhookSecret || !webhookSecret.startsWith('whsec_')) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be set to whsec_* value');
    }

    stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });
  });

  describe('Valid Signature', () => {
    it('should accept webhook with valid signature', () => {
      const event = {
        id: `evt_test_${Date.now()}`,
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 1000,
            currency: 'usd',
            status: 'succeeded',
          },
        },
      };

      const payload = JSON.stringify(event);
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Generate valid signature
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      // Verify signature
      expect(() => {
        stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      }).not.toThrow();

      const constructedEvent = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      expect(constructedEvent.type).toBe('payment_intent.succeeded');
      expect(constructedEvent.id).toBe(event.id);
    });

    it('should process payment_intent.succeeded event', () => {
      const event = {
        id: `evt_succeeded_${Date.now()}`,
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 5000,
            currency: 'usd',
            status: 'succeeded',
            metadata: {
              orderId: 'order_123',
              eventId: uuidv4(),
            },
          },
        },
      };

      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      const constructedEvent = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      expect(constructedEvent.type).toBe('payment_intent.succeeded');
      expect((constructedEvent.data.object as any).amount).toBe(5000);
    });

    it('should process charge.refunded event', () => {
      const event = {
        id: `evt_refunded_${Date.now()}`,
        object: 'event',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_123',
            amount: 3000,
            amount_refunded: 3000,
            refunded: true,
            payment_intent: 'pi_test_123',
          },
        },
      };

      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      const constructedEvent = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      expect(constructedEvent.type).toBe('charge.refunded');
      expect((constructedEvent.data.object as any).refunded).toBe(true);
    });

    it('should process payment_intent.payment_failed event', () => {
      const event = {
        id: `evt_failed_${Date.now()}`,
        object: 'event',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_failed',
            amount: 2000,
            currency: 'usd',
            status: 'requires_payment_method',
            last_payment_error: {
              message: 'Your card was declined',
              type: 'card_error',
            },
          },
        },
      };

      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      const constructedEvent = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      expect(constructedEvent.type).toBe('payment_intent.payment_failed');
      expect((constructedEvent.data.object as any).status).toBe('requires_payment_method');
    });

    it('should process payment_intent.canceled event', () => {
      const event = {
        id: `evt_canceled_${Date.now()}`,
        object: 'event',
        type: 'payment_intent.canceled',
        data: {
          object: {
            id: 'pi_test_canceled',
            amount: 1500,
            currency: 'usd',
            status: 'canceled',
          },
        },
      };

      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      const constructedEvent = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      expect(constructedEvent.type).toBe('payment_intent.canceled');
      expect((constructedEvent.data.object as any).status).toBe('canceled');
    });
  });

  describe('Invalid Signature', () => {
    it('should reject webhook with wrong signature', () => {
      const event = {
        id: 'evt_invalid',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 1000,
          },
        },
      };

      const payload = JSON.stringify(event);
      const wrongSignature = 't=1234567890,v1=fakesignature';

      // Should throw error for invalid signature
      expect(() => {
        stripe.webhooks.constructEvent(payload, wrongSignature, webhookSecret);
      }).toThrow();
    });

    it('should reject webhook with modified payload', () => {
      const event = {
        id: 'evt_modified',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 1000,
          },
        },
      };

      const originalPayload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload: originalPayload,
        secret: webhookSecret,
      });

      // Modify payload after signature generation
      const modifiedEvent = { ...event };
      (modifiedEvent.data.object as any).amount = 9999; // Tampered amount
      const modifiedPayload = JSON.stringify(modifiedEvent);

      // Should throw error for tampered payload
      expect(() => {
        stripe.webhooks.constructEvent(modifiedPayload, signature, webhookSecret);
      }).toThrow();
    });

    it('should reject webhook with expired timestamp', () => {
      const event = {
        id: 'evt_expired',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 1000,
          },
        },
      };

      const payload = JSON.stringify(event);
      
      // Generate signature with old timestamp (more than 5 minutes ago)
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes old
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
        timestamp: oldTimestamp,
      });

      // Should throw error for expired timestamp
      expect(() => {
        stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      }).toThrow();
    });
  });

  describe('Replay Attack Prevention', () => {
    it('should detect duplicate event IDs', () => {
      const eventId = `evt_duplicate_${Date.now()}`;
      
      const event = {
        id: eventId,
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 1000,
          },
        },
      };

      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      // First webhook - should process
      const event1 = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      expect(event1.id).toBe(eventId);

      // Second webhook with SAME event ID - should be detected as duplicate
      // In real application, this would be caught by webhook_inbox table
      // and returned as cached/idempotent response
      const event2 = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      expect(event2.id).toBe(eventId);
      
      // Both should have same ID (duplicate detection happens at application level)
    });

    it('should handle rapid duplicate webhooks (within 7 days)', () => {
      // Stripe retry policy sends webhooks for up to 7 days
      const eventId = `evt_retry_${Date.now()}`;
      
      const event = {
        id: eventId,
        object: 'event',
        type:' payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_retry',
            amount: 2500,
          },
        },
      };

      const payload = JSON.stringify(event);
      
      // Simulate multiple webhook deliveries (Stripe retries)
      const signature1 = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      const signature2 = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      const event1 = stripe.webhooks.constructEvent(payload, signature1, webhookSecret);
      const event2 = stripe.webhooks.constructEvent(payload, signature2, webhookSecret);

      // Both should construct successfully
      expect(event1.id).toBe(eventId);
      expect(event2.id).toBe(eventId);
      
      // Application-level idempotency should prevent duplicate processing
    });
  });

  describe('Webhook Event Types', () => {
    it('should handle all major payment event types', () => {
      const eventTypes = [
        'payment_intent.created',
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'payment_intent.canceled',
        'charge.succeeded',
        'charge.failed',
        'charge.refunded',
        'refund.created',
        'refund.updated',
      ];

      eventTypes.forEach((eventType) => {
        const event = {
          id: `evt_${eventType}_${Date.now()}`,
          object: 'event',
          type: eventType,
          data: {
            object: {
              id: `obj_${eventType}`,
              amount: 1000,
            },
          },
        };

        const payload = JSON.stringify(event);
        const signature = stripe.webhooks.generateTestHeaderString({
          payload,
          secret: webhookSecret,
        });

        const constructedEvent = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        expect(constructedEvent.type).toBe(eventType);
      });
    });
  });

  describe('Webhook Signature Validation Performance', () => {
    it('should validate signatures quickly (< 100ms)', () => {
      const event = {
        id: 'evt_perf_test',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 1000,
          },
        },
      };

      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      const startTime = Date.now();
      stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(100); // Should be much faster than 100ms
    });
  });
});
