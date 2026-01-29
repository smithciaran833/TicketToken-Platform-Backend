/**
 * COMPONENT TEST: PaymentReconciliation
 *
 * Tests payment reconciliation cron job
 */

import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock data
let mockStuckPayments: any[] = [];
let mockWebhookInbox: any[] = [];

// Mock pool
const mockPoolQuery = jest.fn();

// Mock Stripe
const mockStripeRetrieve = jest.fn();
const mockStripeEventsList = jest.fn();

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

import { PaymentReconciliation } from '../../../src/cron/payment-reconciliation';

describe('PaymentReconciliation Component Tests', () => {
  let reconciliation: PaymentReconciliation;
  let mockPool: Pool;
  let mockStripe: any;

  beforeEach(() => {
    mockStuckPayments = [];
    mockWebhookInbox = [];
    mockPoolQuery.mockReset();
    mockStripeRetrieve.mockReset();
    mockStripeEventsList.mockReset();

    // Default Stripe responses
    mockStripeRetrieve.mockResolvedValue({ status: 'succeeded' });
    mockStripeEventsList.mockResolvedValue({ data: [] });

    // Setup pool query behavior
    mockPoolQuery.mockImplementation(async (query: string, params?: any[]) => {
      // SELECT stuck payments
      if (query.includes('SELECT') && query.includes('payment_transactions')) {
        return { rows: mockStuckPayments };
      }

      // UPDATE payment
      if (query.includes('UPDATE payment_transactions')) {
        const paymentId = params?.[1];
        const payment = mockStuckPayments.find(p => p.id === paymentId);
        if (payment) {
          payment.status = params?.[0];
        }
        return { rowCount: 1 };
      }

      // SELECT webhook exists
      if (query.includes('SELECT') && query.includes('webhook_inbox')) {
        const eventId = params?.[0];
        const exists = mockWebhookInbox.find(w => w.event_id === eventId);
        return { rows: exists ? [exists] : [] };
      }

      // INSERT webhook
      if (query.includes('INSERT INTO webhook_inbox')) {
        return { rowCount: 1 };
      }

      return { rows: [] };
    });

    mockPool = { query: mockPoolQuery } as unknown as Pool;
    mockStripe = {
      paymentIntents: {
        retrieve: mockStripeRetrieve,
      },
      events: {
        list: mockStripeEventsList,
      },
    };

    reconciliation = new PaymentReconciliation(mockPool, mockStripe);
  });

  // Helper to add stuck payment - respects null/undefined for stripe_payment_intent_id
  function addStuckPayment(payment: Partial<any> = {}): string {
    const id = payment.id || uuidv4();
    const hasStripeId = 'stripe_payment_intent_id' in payment;
    
    mockStuckPayments.push({
      id,
      tenant_id: payment.tenant_id || uuidv4(),
      venue_id: payment.venue_id || uuidv4(),
      user_id: payment.user_id || uuidv4(),
      event_id: payment.event_id || uuidv4(),
      order_id: payment.order_id || uuidv4(),
      amount: payment.amount || 100.00,
      currency: payment.currency || 'USD',
      status: payment.status || 'processing',
      stripe_payment_intent_id: hasStripeId 
        ? payment.stripe_payment_intent_id 
        : `pi_${uuidv4().replace(/-/g, '')}`,
      created_at: payment.created_at || new Date(),
      updated_at: payment.updated_at || new Date(Date.now() - 15 * 60 * 1000),
    });
    return id;
  }

  // ===========================================================================
  // RECONCILE STUCK PAYMENTS
  // ===========================================================================
  describe('reconcile stuck payments', () => {
    it('should update payment status from Stripe', async () => {
      const paymentId = addStuckPayment({
        status: 'processing',
        stripe_payment_intent_id: 'pi_test123',
      });

      mockStripeRetrieve.mockResolvedValueOnce({ status: 'succeeded' });

      await reconciliation.run();

      expect(mockStripeRetrieve).toHaveBeenCalledWith('pi_test123');
      
      const payment = mockStuckPayments.find(p => p.id === paymentId);
      expect(payment?.status).toBe('completed');
    });

    it('should not update if status unchanged', async () => {
      addStuckPayment({
        status: 'processing',
        stripe_payment_intent_id: 'pi_test123',
      });

      mockStripeRetrieve.mockResolvedValueOnce({ status: 'processing' });

      await reconciliation.run();

      expect(mockStripeRetrieve).toHaveBeenCalled();
      const updateCalls = mockPoolQuery.mock.calls.filter(
        call => call[0].includes('UPDATE')
      );
      expect(updateCalls.length).toBe(0);
    });

    it('should map Stripe statuses correctly', async () => {
      const testCases = [
        { stripeStatus: 'requires_payment_method', expectedStatus: 'pending' },
        { stripeStatus: 'requires_confirmation', expectedStatus: 'pending' },
        { stripeStatus: 'requires_action', expectedStatus: 'pending' },
        { stripeStatus: 'processing', expectedStatus: 'processing' },
        { stripeStatus: 'succeeded', expectedStatus: 'completed' },
        { stripeStatus: 'canceled', expectedStatus: 'failed' },
        { stripeStatus: 'requires_capture', expectedStatus: 'processing' },
        { stripeStatus: 'unknown_status', expectedStatus: 'failed' },
      ];

      for (const { stripeStatus, expectedStatus } of testCases) {
        mockStuckPayments = [];
        const paymentId = addStuckPayment({ status: 'processing' });

        mockStripeRetrieve.mockResolvedValueOnce({ status: stripeStatus });

        await reconciliation.run();

        const payment = mockStuckPayments.find(p => p.id === paymentId);
        expect(payment?.status).toBe(expectedStatus);
      }
    });

    it('should handle Stripe API errors gracefully', async () => {
      addStuckPayment({ status: 'processing' });

      mockStripeRetrieve.mockRejectedValueOnce(new Error('Stripe API error'));

      await expect(reconciliation.run()).resolves.not.toThrow();
    });

    it('should skip payments without stripe_payment_intent_id', async () => {
      addStuckPayment({
        status: 'processing',
        stripe_payment_intent_id: null,
      });

      await reconciliation.run();

      expect(mockStripeRetrieve).not.toHaveBeenCalled();
    });

    it('should skip payments with undefined stripe_payment_intent_id', async () => {
      addStuckPayment({
        status: 'processing',
        stripe_payment_intent_id: undefined,
      });

      await reconciliation.run();

      expect(mockStripeRetrieve).not.toHaveBeenCalled();
    });

    it('should process mixed results - some succeed, some fail', async () => {
      addStuckPayment({ stripe_payment_intent_id: 'pi_success' });
      addStuckPayment({ stripe_payment_intent_id: 'pi_fail' });
      addStuckPayment({ stripe_payment_intent_id: 'pi_success2' });

      mockStripeRetrieve
        .mockResolvedValueOnce({ status: 'succeeded' })
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ status: 'succeeded' });

      await reconciliation.run();

      // Should have called all 3
      expect(mockStripeRetrieve).toHaveBeenCalledTimes(3);
      
      // 2 should be updated (the successful ones)
      const updateCalls = mockPoolQuery.mock.calls.filter(
        call => call[0].includes('UPDATE')
      );
      expect(updateCalls.length).toBe(2);
    });
  });

  // ===========================================================================
  // CHECK MISSING WEBHOOKS
  // ===========================================================================
  describe('check missing webhooks', () => {
    it('should check for missing webhook events', async () => {
      mockStripeEventsList.mockResolvedValueOnce({
        data: [
          { id: 'evt_123', type: 'payment_intent.succeeded' },
          { id: 'evt_456', type: 'charge.refunded' },
        ],
      });

      mockWebhookInbox.push({ event_id: 'evt_123' });

      await reconciliation.run();

      expect(mockStripeEventsList).toHaveBeenCalledWith(
        expect.objectContaining({
          created: expect.objectContaining({ gte: expect.any(Number) }),
          limit: 100,
        })
      );
    });

    it('should detect missing events not in database', async () => {
      mockStripeEventsList.mockResolvedValueOnce({
        data: [
          { id: 'evt_missing', type: 'payment_intent.succeeded' },
        ],
      });

      // No webhooks in inbox
      mockWebhookInbox = [];

      await reconciliation.run();

      // Should query for the event
      const selectCalls = mockPoolQuery.mock.calls.filter(
        call => call[0].includes('SELECT') && call[0].includes('webhook_inbox')
      );
      expect(selectCalls.length).toBeGreaterThan(0);
    });

    it('should handle empty events list', async () => {
      mockStripeEventsList.mockResolvedValueOnce({ data: [] });

      await expect(reconciliation.run()).resolves.not.toThrow();
    });

    it('should query Stripe for events from last hour', async () => {
      const beforeTime = Math.floor(Date.now() / 1000) - 3600;

      await reconciliation.run();

      expect(mockStripeEventsList).toHaveBeenCalledWith(
        expect.objectContaining({
          created: expect.objectContaining({
            gte: expect.any(Number),
          }),
        })
      );

      const calledGte = mockStripeEventsList.mock.calls[0][0].created.gte;
      expect(calledGte).toBeGreaterThanOrEqual(beforeTime - 5);
      expect(calledGte).toBeLessThanOrEqual(beforeTime + 5);
    });
  });

  // ===========================================================================
  // BATCH PROCESSING
  // ===========================================================================
  describe('batch processing', () => {
    it('should process multiple stuck payments', async () => {
      addStuckPayment({ stripe_payment_intent_id: 'pi_1' });
      addStuckPayment({ stripe_payment_intent_id: 'pi_2' });
      addStuckPayment({ stripe_payment_intent_id: 'pi_3' });

      mockStripeRetrieve.mockResolvedValue({ status: 'succeeded' });

      await reconciliation.run();

      expect(mockStripeRetrieve).toHaveBeenCalledTimes(3);
    });

    it('should handle no stuck payments', async () => {
      mockStuckPayments = [];

      await reconciliation.run();

      expect(mockStripeRetrieve).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // QUERY STRUCTURE
  // ===========================================================================
  describe('query structure', () => {
    it('should use explicit field list for security', async () => {
      addStuckPayment({});

      await reconciliation.run();

      const selectCalls = mockPoolQuery.mock.calls.filter(
        call => call[0].includes('SELECT') && call[0].includes('payment_transactions')
      );
      
      for (const call of selectCalls) {
        expect(call[0]).not.toContain('SELECT *');
        expect(call[0]).toContain('tenant_id');
        expect(call[0]).toContain('venue_id');
      }
    });

    it('should filter payments older than 10 minutes', async () => {
      await reconciliation.run();

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('10 minutes'),
        expect.any(Array)
      );
    });

    it('should filter by processing status', async () => {
      await reconciliation.run();

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = $1'),
        ['processing']
      );
    });
  });
});
