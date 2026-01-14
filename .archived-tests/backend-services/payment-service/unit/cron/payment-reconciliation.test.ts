import { PaymentReconciliation } from '../../../src/cron/payment-reconciliation';
import { PaymentState } from '../../../src/services/state-machine/payment-state-machine';
import { Pool } from 'pg';
import Stripe from 'stripe';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

describe('PaymentReconciliation', () => {
  let reconciliation: PaymentReconciliation;
  let mockDb: jest.Mocked<Pool>;
  let mockStripe: jest.Mocked<Stripe>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    } as any;

    mockStripe = {
      paymentIntents: {
        retrieve: jest.fn()
      },
      events: {
        list: jest.fn()
      }
    } as any;

    reconciliation = new PaymentReconciliation(mockDb, mockStripe);
  });

  describe('run', () => {
    it('should reconcile stuck payments', async () => {
      mockDb.query
        .mockResolvedValueOnce({ // Get stuck payments
          rows: [
            {
              id: 'payment_1',
              provider: 'stripe',
              provider_payment_id: 'pi_123',
              state: PaymentState.PROCESSING
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [] }); // Update query

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        status: 'succeeded'
      } as any);

      mockStripe.events.list.mockResolvedValue({ data: [] } as any);

      await reconciliation.run();

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_123');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payment_transactions'),
        [PaymentState.COMPLETED, 'payment_1']
      );
    });

    it('should detect missing webhooks', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // No stuck payments
        .mockResolvedValueOnce({ rows: [] }) // Check if webhook exists
        .mockResolvedValueOnce({ rows: [] }); // Insert missing webhook

      mockStripe.events.list.mockResolvedValue({
        data: [
          {
            id: 'evt_123',
            type: 'payment_intent.succeeded',
            created: Math.floor(Date.now() / 1000)
          }
        ]
      } as any);

      await reconciliation.run();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO webhook_inbox'),
        expect.any(Array)
      );
    });

    it('should handle reconciliation errors gracefully', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'payment_1',
            provider: 'stripe',
            provider_payment_id: 'pi_123',
            state: PaymentState.PROCESSING
          }
        ]
      });

      mockStripe.paymentIntents.retrieve.mockRejectedValue(
        new Error('Stripe API error')
      );

      mockStripe.events.list.mockResolvedValue({ data: [] } as any);

      await expect(reconciliation.run()).resolves.not.toThrow();
    });

    it('should map Stripe statuses correctly', async () => {
      const testCases = [
        { stripeStatus: 'succeeded', expectedState: PaymentState.COMPLETED },
        { stripeStatus: 'canceled', expectedState: PaymentState.CANCELLED },
        { stripeStatus: 'processing', expectedState: PaymentState.PROCESSING },
        { stripeStatus: 'requires_payment_method', expectedState: PaymentState.PENDING }
      ];

      for (const testCase of testCases) {
        mockDb.query
          .mockResolvedValueOnce({
            rows: [{
              id: 'payment_1',
              provider: 'stripe',
              provider_payment_id: 'pi_123',
              state: PaymentState.PROCESSING
            }]
          })
          .mockResolvedValueOnce({ rows: [] });

        mockStripe.paymentIntents.retrieve.mockResolvedValue({
          status: testCase.stripeStatus
        } as any);

        mockStripe.events.list.mockResolvedValue({ data: [] } as any);

        await reconciliation.run();

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE payment_transactions'),
          [testCase.expectedState, 'payment_1']
        );

        jest.clearAllMocks();
      }
    });

    it('should skip payments with matching states', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'payment_1',
          provider: 'stripe',
          provider_payment_id: 'pi_123',
          state: PaymentState.COMPLETED
        }]
      });

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        status: 'succeeded' // Maps to COMPLETED
      } as any);

      mockStripe.events.list.mockResolvedValue({ data: [] } as any);

      await reconciliation.run();

      // Should not update if states match
      expect(mockDb.query).toHaveBeenCalledTimes(2); // Only initial query + events check
    });

    it('should handle multiple stuck payments', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'payment_1', provider: 'stripe', provider_payment_id: 'pi_1', state: PaymentState.PROCESSING },
            { id: 'payment_2', provider: 'stripe', provider_payment_id: 'pi_2', state: PaymentState.PROCESSING },
            { id: 'payment_3', provider: 'stripe', provider_payment_id: 'pi_3', state: PaymentState.PROCESSING }
          ]
        })
        .mockResolvedValue({ rows: [] });

      mockStripe.paymentIntents.retrieve
        .mockResolvedValueOnce({ status: 'succeeded' } as any)
        .mockResolvedValueOnce({ status: 'canceled' } as any)
        .mockResolvedValueOnce({ status: 'succeeded' } as any);

      mockStripe.events.list.mockResolvedValue({ data: [] } as any);

      await reconciliation.run();

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledTimes(3);
    });

    it('should check webhooks from last hour only', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      mockStripe.events.list.mockResolvedValue({ data: [] } as any);

      await reconciliation.run();

      expect(mockStripe.events.list).toHaveBeenCalledWith({
        created: { gte: expect.any(Number) },
        limit: 100
      });
    });

    it('should skip existing webhooks', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // No stuck payments
        .mockResolvedValueOnce({ rows: [{ id: 'webhook_1' }] }); // Webhook exists

      mockStripe.events.list.mockResolvedValue({
        data: [{
          id: 'evt_123',
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000)
        }]
      } as any);

      await reconciliation.run();

      // Should not insert if webhook exists
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should handle non-Stripe providers', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'payment_1',
          provider: 'paypal', // Not Stripe
          state: PaymentState.PROCESSING
        }]
      });

      mockStripe.events.list.mockResolvedValue({ data: [] } as any);

      await reconciliation.run();

      // Should not call Stripe API for non-Stripe payments
      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty stuck payments', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockStripe.events.list.mockResolvedValue({ data: [] } as any);

      await reconciliation.run();

      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('should handle Stripe API rate limits', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'payment_1', provider: 'stripe', provider_payment_id: 'pi_123' }]
      });

      mockStripe.paymentIntents.retrieve.mockRejectedValue({
        type: 'StripeRateLimitError'
      });

      mockStripe.events.list.mockResolvedValue({ data: [] } as any);

      await expect(reconciliation.run()).resolves.not.toThrow();
    });

    it('should handle database connection errors', async () => {
      mockDb.query.mockRejectedValue(new Error('Database connection lost'));

      await expect(reconciliation.run()).rejects.toThrow('Database connection lost');
    });

    it('should handle malformed payment data', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'payment_1',
            provider: 'stripe',
            provider_payment_id: null, // Malformed
            state: PaymentState.PROCESSING
          }]
        });

      mockStripe.events.list.mockResolvedValue({ data: [] } as any);

      await expect(reconciliation.run()).resolves.not.toThrow();
    });

    it('should handle large batches of stuck payments', async () => {
      const payments = Array(100).fill(null).map((_, i) => ({
        id: `payment_${i}`,
        provider: 'stripe',
        provider_payment_id: `pi_${i}`,
        state: PaymentState.PROCESSING
      }));

      mockDb.query
        .mockResolvedValueOnce({ rows: payments })
        .mockResolvedValue({ rows: [] });

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        status: 'succeeded'
      } as any);

      mockStripe.events.list.mockResolvedValue({ data: [] } as any);

      await reconciliation.run();

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledTimes(100);
    });
  });
});
