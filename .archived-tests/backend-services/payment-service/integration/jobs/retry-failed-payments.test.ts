/**
 * Retry Failed Payments Job Integration Tests
 */

import Stripe from 'stripe';
import { RetryFailedPaymentsJob } from '../../../src/jobs/retry-failed-payments';
import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  createTestPaymentTransaction,
  pool,
  db,
} from '../setup';

describe('RetryFailedPaymentsJob', () => {
  let job: RetryFailedPaymentsJob;
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
        confirm: jest.fn(),
      },
    };

    job = new RetryFailedPaymentsJob(pool, mockStripe as unknown as Stripe);
  });

  afterAll(async () => {
    await teardownTestApp({ db });
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    jest.clearAllMocks();
  });

  describe('execute()', () => {
    it('should complete without errors when no failed payments exist', async () => {
      await expect(job.execute()).resolves.not.toThrow();
    });

    it('should find failed payments older than 1 hour', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'failed',
          stripe_payment_intent_id: 'pi_failed_123',
        }
      );

      await pool.query(
        `UPDATE payment_transactions 
         SET updated_at = NOW() - INTERVAL '2 hours' 
         WHERE id = $1`,
        [transaction.id]
      );

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_failed_123',
        status: 'requires_payment_method',
      });

      await job.execute();

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_failed_123');
    });

    it('should not retry payments that are too recent', async () => {
      await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'failed',
          stripe_payment_intent_id: 'pi_recent_fail_123',
        }
      );

      await job.execute();

      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('should not retry payments with 3+ retry attempts', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'failed',
          stripe_payment_intent_id: 'pi_maxretry_123',
        }
      );

      await pool.query(
        `UPDATE payment_transactions 
         SET updated_at = NOW() - INTERVAL '2 hours' 
         WHERE id = $1`,
        [transaction.id]
      );

      for (let i = 1; i <= 3; i++) {
        await pool.query(
          `INSERT INTO payment_retries (payment_id, attempt_number, status)
           VALUES ($1, $2, 'failed')`,
          [transaction.id, i]
        );
      }

      await job.execute();

      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('should confirm payment when status is requires_confirmation', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'failed',
          stripe_payment_intent_id: 'pi_retry_confirm_123',
        }
      );

      await pool.query(
        `UPDATE payment_transactions 
         SET updated_at = NOW() - INTERVAL '2 hours' 
         WHERE id = $1`,
        [transaction.id]
      );

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_retry_confirm_123',
        status: 'requires_confirmation',
      });

      mockStripe.paymentIntents.confirm.mockResolvedValue({
        id: 'pi_retry_confirm_123',
        status: 'succeeded',
      });

      await job.execute();

      expect(mockStripe.paymentIntents.confirm).toHaveBeenCalledWith('pi_retry_confirm_123');
    });

    it('should not confirm when requires_payment_method', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'failed',
          stripe_payment_intent_id: 'pi_needs_pm_123',
        }
      );

      await pool.query(
        `UPDATE payment_transactions 
         SET updated_at = NOW() - INTERVAL '2 hours' 
         WHERE id = $1`,
        [transaction.id]
      );

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_needs_pm_123',
        status: 'requires_payment_method',
      });

      await job.execute();

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalled();
      expect(mockStripe.paymentIntents.confirm).not.toHaveBeenCalled();
    });

    it('should limit to 10 payments per execution', async () => {
      for (let i = 0; i < 15; i++) {
        const tx = await createTestPaymentTransaction(
          testTenantId,
          testUserId,
          testVenueId,
          testEventId,
          {
            status: 'failed',
            stripe_payment_intent_id: `pi_batch_${i}`,
          }
        );

        await pool.query(
          `UPDATE payment_transactions 
           SET updated_at = NOW() - INTERVAL '2 hours' 
           WHERE id = $1`,
          [tx.id]
        );
      }

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        status: 'requires_payment_method',
      });

      await job.execute();

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledTimes(10);
    });
  });

  describe('retryPayment()', () => {
    it('should create retry record', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'failed',
          stripe_payment_intent_id: 'pi_retry_record_123',
        }
      );

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_retry_record_123',
        status: 'requires_payment_method',
      });

      const jobInstance = job as any;
      await jobInstance.retryPayment({
        id: transaction.id,
        stripe_payment_intent_id: 'pi_retry_record_123',
        retry_count: 0,
      });

      const result = await pool.query(
        `SELECT * FROM payment_retries WHERE payment_id = $1`,
        [transaction.id]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].attempt_number).toBe(1);
    });

    it('should handle Stripe API errors gracefully', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'failed',
          stripe_payment_intent_id: 'pi_error_123',
        }
      );

      mockStripe.paymentIntents.retrieve.mockRejectedValue(
        new Error('Payment intent not found')
      );

      const jobInstance = job as any;

      await expect(
        jobInstance.retryPayment({
          id: transaction.id,
          stripe_payment_intent_id: 'pi_error_123',
          retry_count: 0,
        })
      ).resolves.not.toThrow();

      const result = await pool.query(
        `SELECT * FROM payment_retries WHERE payment_id = $1`,
        [transaction.id]
      );

      expect(result.rows[0].status).toBe('failed');
      expect(result.rows[0].error_message).toContain('Payment intent not found');
    });

    it('should skip payments without stripe_payment_intent_id', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'failed',
          stripe_payment_intent_id: null,
        }
      );

      const jobInstance = job as any;
      await jobInstance.retryPayment({
        id: transaction.id,
        stripe_payment_intent_id: null,
        retry_count: 0,
      });

      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('should record requires_action status when payment needs new method', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'failed',
          stripe_payment_intent_id: 'pi_needs_action_123',
        }
      );

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_needs_action_123',
        status: 'requires_payment_method',
      });

      const jobInstance = job as any;
      await jobInstance.retryPayment({
        id: transaction.id,
        stripe_payment_intent_id: 'pi_needs_action_123',
        retry_count: 1,
      });

      const result = await pool.query(
        `SELECT * FROM payment_retries WHERE payment_id = $1`,
        [transaction.id]
      );

      expect(result.rows[0].status).toBe('requires_action');
    });

    it('should record success status on successful confirmation', async () => {
      const transaction = await createTestPaymentTransaction(
        testTenantId,
        testUserId,
        testVenueId,
        testEventId,
        {
          status: 'failed',
          stripe_payment_intent_id: 'pi_success_123',
        }
      );

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_success_123',
        status: 'requires_confirmation',
      });

      mockStripe.paymentIntents.confirm.mockResolvedValue({
        id: 'pi_success_123',
        status: 'succeeded',
      });

      const jobInstance = job as any;
      await jobInstance.retryPayment({
        id: transaction.id,
        stripe_payment_intent_id: 'pi_success_123',
        retry_count: 0,
      });

      const result = await pool.query(
        `SELECT * FROM payment_retries WHERE payment_id = $1`,
        [transaction.id]
      );

      expect(result.rows[0].status).toBe('success');
    });
  });
});
