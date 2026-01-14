/**
 * Payment Reconciliation Tests
 * Tests for payment reconciliation cron job
 */

// Mock logger
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

import { PaymentReconciliation } from '../../../src/cron/payment-reconciliation';

describe('PaymentReconciliation', () => {
  let reconciliation: PaymentReconciliation;
  let mockDb: any;
  let mockStripe: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDb = {
      query: jest.fn(),
    };
    
    mockStripe = {
      paymentIntents: {
        retrieve: jest.fn(),
      },
      events: {
        list: jest.fn(),
      },
    };

    reconciliation = new PaymentReconciliation(mockDb, mockStripe);
  });

  describe('run', () => {
    it('should reconcile stuck payments', async () => {
      // Mock stuck payments query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'payment_1',
            status: 'processing',
            stripe_payment_intent_id: 'pi_123',
          },
        ],
      });

      // Mock Stripe payment intent retrieval
      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: 'pi_123',
        status: 'succeeded',
      });

      // Mock update query
      mockDb.query.mockResolvedValueOnce({});

      // Mock events list for webhook check (empty)
      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = $1'),
        ['processing']
      );
      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_123');
    });

    it('should update payment status when Stripe status differs', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'payment_2',
            status: 'processing',
            stripe_payment_intent_id: 'pi_456',
          },
        ],
      });

      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: 'pi_456',
        status: 'succeeded',
      });

      mockDb.query.mockResolvedValueOnce({});
      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payment_transactions SET status = $1'),
        ['completed', 'payment_2']
      );
    });

    it('should not update payment when status matches', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'payment_3',
            status: 'processing',
            stripe_payment_intent_id: 'pi_789',
          },
        ],
      });

      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: 'pi_789',
        status: 'processing',
      });

      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      // Should only have 2 queries: initial select and webhook check
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple stuck payments', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'payment_a', status: 'processing', stripe_payment_intent_id: 'pi_a' },
          { id: 'payment_b', status: 'processing', stripe_payment_intent_id: 'pi_b' },
          { id: 'payment_c', status: 'processing', stripe_payment_intent_id: 'pi_c' },
        ],
      });

      mockStripe.paymentIntents.retrieve
        .mockResolvedValueOnce({ id: 'pi_a', status: 'succeeded' })
        .mockResolvedValueOnce({ id: 'pi_b', status: 'canceled' })
        .mockResolvedValueOnce({ id: 'pi_c', status: 'processing' });

      mockDb.query
        .mockResolvedValueOnce({})  // update payment_a
        .mockResolvedValueOnce({}); // update payment_b

      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledTimes(3);
      // payment_c status matches, so only 2 updates
    });

    it('should handle payment without stripe intent id', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'payment_no_pi',
            status: 'processing',
            stripe_payment_intent_id: null,
          },
        ],
      });

      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('should handle Stripe API error gracefully', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'payment_error',
            status: 'processing',
            stripe_payment_intent_id: 'pi_error',
          },
        ],
      });

      mockStripe.paymentIntents.retrieve.mockRejectedValueOnce(
        new Error('Stripe API Error')
      );

      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      // Should not throw
      await reconciliation.run();

      // Should continue to webhook check
      expect(mockStripe.events.list).toHaveBeenCalled();
    });
  });

  describe('checkMissingWebhooks', () => {
    it('should detect and insert missing webhook events', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // no stuck payments

      mockStripe.events.list.mockResolvedValueOnce({
        data: [
          { id: 'evt_123', type: 'payment_intent.succeeded' },
          { id: 'evt_456', type: 'charge.refunded' },
        ],
      });

      // Check for existing webhooks
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // evt_123 not found
        .mockResolvedValueOnce({}) // insert evt_123
        .mockResolvedValueOnce({ rows: [{ id: 'existing' }] }); // evt_456 exists

      await reconciliation.run();

      expect(mockStripe.events.list).toHaveBeenCalledWith({
        created: expect.any(Object),
        limit: 100,
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT id FROM webhook_inbox WHERE webhook_id = $1',
        ['evt_123']
      );
    });

    it('should not insert existing webhook events', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // no stuck payments

      mockStripe.events.list.mockResolvedValueOnce({
        data: [
          { id: 'evt_existing', type: 'payment_intent.succeeded' },
        ],
      });

      // Event already exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'evt_existing' }] });

      await reconciliation.run();

      // Should not have INSERT query
      const insertCalls = mockDb.query.mock.calls.filter(
        (call: any[]) => call[0]?.includes('INSERT INTO webhook_inbox')
      );
      expect(insertCalls).toHaveLength(0);
    });

    it('should handle empty event list', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      expect(mockStripe.events.list).toHaveBeenCalled();
      // Only stuck payments query should be called
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('status mapping', () => {
    const testStatusMapping = async (stripeStatus: string, expectedStatus: string) => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'payment_map',
            status: 'processing',
            stripe_payment_intent_id: 'pi_map',
          },
        ],
      });

      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: 'pi_map',
        status: stripeStatus,
      });

      mockDb.query.mockResolvedValueOnce({});
      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      if (stripeStatus !== 'processing') {
        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE'),
          [expectedStatus, 'payment_map']
        );
      }
    };

    it('should map requires_payment_method to pending', async () => {
      await testStatusMapping('requires_payment_method', 'pending');
    });

    it('should map requires_confirmation to pending', async () => {
      await testStatusMapping('requires_confirmation', 'pending');
    });

    it('should map requires_action to pending', async () => {
      await testStatusMapping('requires_action', 'pending');
    });

    it('should map succeeded to completed', async () => {
      await testStatusMapping('succeeded', 'completed');
    });

    it('should map canceled to cancelled', async () => {
      await testStatusMapping('canceled', 'cancelled');
    });

    it('should map requires_capture to processing', async () => {
      // Same status, so no update
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'payment_capture',
            status: 'pending',
            stripe_payment_intent_id: 'pi_capture',
          },
        ],
      });

      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: 'pi_capture',
        status: 'requires_capture',
      });

      mockDb.query.mockResolvedValueOnce({});
      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      // Check for processing status update
      const updateCalls = mockDb.query.mock.calls.filter(
        (call: any[]) => call[0]?.includes('UPDATE') && call[1]?.includes('processing')
      );
      expect(updateCalls).toHaveLength(1);
    });

    it('should map unknown status to failed', async () => {
      await testStatusMapping('unknown_status', 'failed');
    });
  });

  describe('edge cases', () => {
    it('should handle database error on stuck payments query', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database connection error'));

      await expect(reconciliation.run()).rejects.toThrow('Database connection error');
    });

    it('should handle Stripe events.list error', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockStripe.events.list.mockRejectedValueOnce(new Error('Stripe API Error'));

      await expect(reconciliation.run()).rejects.toThrow('Stripe API Error');
    });

    it('should process payments older than 10 minutes', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '10 minutes'"),
        expect.any(Array)
      );
    });

    it('should check webhooks from last hour', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      const eventsListCall = mockStripe.events.list.mock.calls[0][0];
      const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
      expect(eventsListCall.created.gte).toBeCloseTo(oneHourAgo, -1);
    });

    it('should use ON CONFLICT DO NOTHING for webhook insert', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      
      mockStripe.events.list.mockResolvedValueOnce({
        data: [{ id: 'evt_conflict', type: 'test.event' }],
      });

      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      await reconciliation.run();

      const insertCall = mockDb.query.mock.calls.find(
        (call: any[]) => call[0]?.includes('INSERT INTO webhook_inbox')
      );
      expect(insertCall[0]).toContain('ON CONFLICT (webhook_id) DO NOTHING');
    });
  });

  describe('logging', () => {
    it('should log start of reconciliation', async () => {
      const { logger } = require('../../../src/utils/logger');
      const mockLog = logger.child();
      
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      expect(mockLog.info).toHaveBeenCalledWith('Starting payment reconciliation');
    });

    it('should log reconciled payments', async () => {
      const { logger } = require('../../../src/utils/logger');
      const mockLog = logger.child();
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'payment_log',
          status: 'processing',
          stripe_payment_intent_id: 'pi_log',
        }],
      });

      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        status: 'succeeded',
      });

      mockDb.query.mockResolvedValueOnce({});
      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'payment_log',
          oldStatus: 'processing',
          newStatus: 'completed',
        }),
        'Reconciled payment'
      );
    });

    it('should log missing webhook events', async () => {
      const { logger } = require('../../../src/utils/logger');
      const mockLog = logger.child();
      
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      
      mockStripe.events.list.mockResolvedValueOnce({
        data: [{ id: 'evt_missing', type: 'payment_intent.succeeded' }],
      });

      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      await reconciliation.run();

      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_missing',
          eventType: 'payment_intent.succeeded',
        }),
        'Missing webhook event detected'
      );
    });

    it('should log errors during reconciliation', async () => {
      const { logger } = require('../../../src/utils/logger');
      const mockLog = logger.child();
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'payment_err',
          status: 'processing',
          stripe_payment_intent_id: 'pi_err',
        }],
      });

      mockStripe.paymentIntents.retrieve.mockRejectedValueOnce(new Error('API Error'));
      mockStripe.events.list.mockResolvedValueOnce({ data: [] });

      await reconciliation.run();

      expect(mockLog.error).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'payment_err',
          error: expect.any(Error),
        }),
        'Failed to reconcile payment'
      );
    });
  });
});
