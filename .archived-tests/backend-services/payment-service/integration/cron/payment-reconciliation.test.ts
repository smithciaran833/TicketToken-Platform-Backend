/**
 * Payment Reconciliation Cron Integration Tests
 */

import Stripe from 'stripe';
import { PaymentReconciliation } from '../../../src/cron/payment-reconciliation';
import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  createTestPaymentTransaction,
  pool,
  db,
} from '../setup';

describe('PaymentReconciliation', () => {
  let reconciliation: PaymentReconciliation;
  let mockStripe: any;
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;

  beforeAll(async () => {
    const context = await setupTestApp();
    testTenantId = context.testTenantId;
    testUserId = context.testUserId;
    testVenueId = context.testVenueId;
    testEventId = context.testEventId;

    mockStripe = {
      paymentIntents: {
        retrieve: jest.fn(),
      },
      events: {
        list: jest.fn(),
      },
    };

    reconciliation = new PaymentReconciliation(pool, mockStripe as unknown as Stripe);
  });

  afterAll(async () => {
    await teardownTestApp({ db });
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    jest.clearAllMocks();
  });

  describe('run()', () => {
    it('should complete without errors when no stuck payments exist', async () => {
      mockStripe.events.list.mockResolvedValue({ data: [] });

      await expect(reconciliation.run()).resolves.not.toThrow();
    });

    it('should find stuck payments in processing state older than 10 minutes', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'processing',
          stripe_payment_intent_id: 'pi_stuck_test_123',
        }
      );

      await pool.query(
        `UPDATE payment_transactions 
         SET updated_at = NOW() - INTERVAL '15 minutes' 
         WHERE id = $1`,
        [transaction.id]
      );

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_stuck_test_123',
        status: 'succeeded',
      });
      mockStripe.events.list.mockResolvedValue({ data: [] });

      await reconciliation.run();

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_stuck_test_123');

      // Verify status was updated
      const result = await pool.query(
        `SELECT status FROM payment_transactions WHERE id = $1`,
        [transaction.id]
      );
      expect(result.rows[0].status).toBe('completed');
    });

    it('should not process payments updated within 10 minutes', async () => {
      await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'processing',
          stripe_payment_intent_id: 'pi_recent_123',
        }
      );

      mockStripe.events.list.mockResolvedValue({ data: [] });

      await reconciliation.run();

      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('should handle Stripe API errors gracefully in reconcilePayment', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'processing',
          stripe_payment_intent_id: 'pi_error_123',
        }
      );

      await pool.query(
        `UPDATE payment_transactions 
         SET updated_at = NOW() - INTERVAL '15 minutes' 
         WHERE id = $1`,
        [transaction.id]
      );

      mockStripe.paymentIntents.retrieve.mockRejectedValue(new Error('Stripe error'));
      mockStripe.events.list.mockResolvedValue({ data: [] });

      // Should not throw, just log error
      await expect(reconciliation.run()).resolves.not.toThrow();
    });
  });

  describe('checkMissingWebhooks()', () => {
    it('should detect and store missing webhook events', async () => {
      const mockEvent = {
        id: 'evt_missing_123',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000) - 1800,
        data: { object: { id: 'pi_test' } },
      };

      mockStripe.events.list.mockResolvedValue({ data: [mockEvent] });

      await reconciliation.run();

      const result = await pool.query(
        `SELECT * FROM webhook_inbox WHERE webhook_id = $1`,
        ['evt_missing_123']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].provider).toBe('stripe');
      expect(result.rows[0].event_type).toBe('payment_intent.succeeded');
      expect(result.rows[0].status).toBe('pending');
    });

    it('should not duplicate existing webhook events', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox (provider, event_id, webhook_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['stripe', 'evt_existing_123', 'evt_existing_123', 'payment_intent.succeeded', '{}', 'processed']
      );

      const mockEvent = {
        id: 'evt_existing_123',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000) - 1800,
        data: { object: {} },
      };

      mockStripe.events.list.mockResolvedValue({ data: [mockEvent] });

      await reconciliation.run();

      const result = await pool.query(
        `SELECT COUNT(*) FROM webhook_inbox WHERE webhook_id = $1`,
        ['evt_existing_123']
      );

      expect(parseInt(result.rows[0].count)).toBe(1);
    });

    it('should handle multiple missing events', async () => {
      const mockEvents = [
        { id: 'evt_multi_1', type: 'payment_intent.succeeded', created: Math.floor(Date.now() / 1000) - 1800, data: { object: {} } },
        { id: 'evt_multi_2', type: 'payment_intent.failed', created: Math.floor(Date.now() / 1000) - 1700, data: { object: {} } },
        { id: 'evt_multi_3', type: 'charge.refunded', created: Math.floor(Date.now() / 1000) - 1600, data: { object: {} } },
      ];

      mockStripe.events.list.mockResolvedValue({ data: mockEvents });

      await reconciliation.run();

      const result = await pool.query(
        `SELECT COUNT(*) FROM webhook_inbox WHERE webhook_id IN ('evt_multi_1', 'evt_multi_2', 'evt_multi_3')`
      );

      expect(parseInt(result.rows[0].count)).toBe(3);
    });
  });

  describe('mapStripeStatus()', () => {
    it('should map requires_payment_method to pending', () => {
      const rec = reconciliation as any;
      expect(rec.mapStripeStatus('requires_payment_method')).toBe('pending');
    });

    it('should map requires_confirmation to pending', () => {
      const rec = reconciliation as any;
      expect(rec.mapStripeStatus('requires_confirmation')).toBe('pending');
    });

    it('should map requires_action to pending', () => {
      const rec = reconciliation as any;
      expect(rec.mapStripeStatus('requires_action')).toBe('pending');
    });

    it('should map processing to processing', () => {
      const rec = reconciliation as any;
      expect(rec.mapStripeStatus('processing')).toBe('processing');
    });

    it('should map succeeded to completed', () => {
      const rec = reconciliation as any;
      expect(rec.mapStripeStatus('succeeded')).toBe('completed');
    });

    it('should map canceled to cancelled', () => {
      const rec = reconciliation as any;
      expect(rec.mapStripeStatus('canceled')).toBe('cancelled');
    });

    it('should map requires_capture to processing', () => {
      const rec = reconciliation as any;
      expect(rec.mapStripeStatus('requires_capture')).toBe('processing');
    });

    it('should map unknown status to failed', () => {
      const rec = reconciliation as any;
      expect(rec.mapStripeStatus('unknown_status')).toBe('failed');
      expect(rec.mapStripeStatus('')).toBe('failed');
    });
  });

  describe('reconcilePayment()', () => {
    it('should update payment status when Stripe status differs', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'processing',
          stripe_payment_intent_id: 'pi_reconcile_123',
        }
      );

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_reconcile_123',
        status: 'succeeded',
      });

      const rec = reconciliation as any;
      await rec.reconcilePayment({
        id: transaction.id,
        status: 'processing',
        stripe_payment_intent_id: 'pi_reconcile_123',
      });

      const result = await pool.query(
        `SELECT status FROM payment_transactions WHERE id = $1`,
        [transaction.id]
      );
      expect(result.rows[0].status).toBe('completed');
    });

    it('should not update when status matches', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'processing',
          stripe_payment_intent_id: 'pi_match_123',
        }
      );

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_match_123',
        status: 'processing',
      });

      const rec = reconciliation as any;
      await rec.reconcilePayment({
        id: transaction.id,
        status: 'processing',
        stripe_payment_intent_id: 'pi_match_123',
      });

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalled();
    });

    it('should skip payments without stripe_payment_intent_id', async () => {
      const rec = reconciliation as any;
      await rec.reconcilePayment({
        id: 'test-id',
        status: 'processing',
        stripe_payment_intent_id: null,
      });

      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('should handle Stripe retrieval errors gracefully', async () => {
      mockStripe.paymentIntents.retrieve.mockRejectedValue(
        new Error('Payment intent not found')
      );

      const rec = reconciliation as any;

      await expect(
        rec.reconcilePayment({
          id: 'test-id',
          status: 'processing',
          stripe_payment_intent_id: 'pi_invalid_123',
        })
      ).resolves.not.toThrow();
    });
  });
});
