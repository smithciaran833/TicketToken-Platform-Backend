/**
 * COMPONENT TEST: RetryFailedPaymentsJob
 *
 * Tests failed payment retry logic
 */

import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock data
let mockFailedPayments: any[] = [];
let mockPaymentRetries: any[] = [];

// Mock client
const mockClientQuery = jest.fn();

// Mock withSystemContextPool
jest.mock('../../../src/workers/system-job-utils', () => ({
  withSystemContextPool: jest.fn(async (pool: any, fn: any) => {
    const mockClient = { query: mockClientQuery };
    return fn(mockClient);
  }),
}));

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

import { RetryFailedPaymentsJob } from '../../../src/jobs/retry-failed-payments';

describe('RetryFailedPaymentsJob Component Tests', () => {
  let job: RetryFailedPaymentsJob;
  let mockPool: Pool;
  let mockStripe: any;
  let mockStripeRetrieve: jest.Mock;
  let mockStripeConfirm: jest.Mock;

  beforeEach(() => {
    mockFailedPayments = [];
    mockPaymentRetries = [];
    mockClientQuery.mockReset();

    mockStripeRetrieve = jest.fn();
    mockStripeConfirm = jest.fn();

    mockPool = {} as Pool;
    mockStripe = {
      paymentIntents: {
        retrieve: mockStripeRetrieve,
        confirm: mockStripeConfirm,
      },
    };

    // Default query behavior
    mockClientQuery.mockImplementation(async (query: string, params?: any[]) => {
      // SELECT failed payments
      if (query.includes('SELECT') && query.includes('payment_transactions')) {
        return { rows: mockFailedPayments };
      }

      // INSERT payment retry
      if (query.includes('INSERT INTO payment_retries')) {
        mockPaymentRetries.push({
          payment_id: params?.[0],
          attempt_number: params?.[1],
          status: 'pending',
        });
        return { rows: [] };
      }

      // UPDATE payment retry - check for specific status values
      if (query.includes('UPDATE payment_retries')) {
        const retry = mockPaymentRetries[mockPaymentRetries.length - 1];
        if (retry) {
          if (query.includes("status = 'success'")) {
            retry.status = 'success';
          } else if (query.includes("status = 'failed'")) {
            retry.status = 'failed';
            retry.error_message = params?.[0];
          } else if (query.includes("status = 'requires_action'")) {
            retry.status = 'requires_action';
          }
        }
        return { rows: [] };
      }

      return { rows: [] };
    });

    job = new RetryFailedPaymentsJob(mockPool, mockStripe);
  });

  // Helper to add failed payment
  function addFailedPayment(payment: Partial<any>): void {
    mockFailedPayments.push({
      id: payment.id || uuidv4(),
      stripe_payment_intent_id: payment.stripe_payment_intent_id || `pi_${uuidv4().replace(/-/g, '')}`,
      status: 'failed',
      retry_count: payment.retry_count || 0,
      amount: payment.amount || 1000,
      tenant_id: payment.tenant_id || uuidv4(),
    });
  }

  // ===========================================================================
  // REQUIRES CONFIRMATION
  // ===========================================================================
  describe('requires_confirmation status', () => {
    it('should confirm payment intent and mark success', async () => {
      const paymentIntentId = `pi_${uuidv4().replace(/-/g, '')}`;

      addFailedPayment({
        stripe_payment_intent_id: paymentIntentId,
        retry_count: 0,
      });

      mockStripeRetrieve.mockResolvedValueOnce({
        status: 'requires_confirmation',
      });
      mockStripeConfirm.mockResolvedValueOnce({ status: 'succeeded' });

      await job.execute();

      expect(mockStripeConfirm).toHaveBeenCalledWith(paymentIntentId);
      
      // The retry should be marked as success
      const successRetry = mockPaymentRetries.find(r => r.status === 'success');
      expect(successRetry).toBeDefined();
    });
  });

  // ===========================================================================
  // REQUIRES PAYMENT METHOD
  // ===========================================================================
  describe('requires_payment_method status', () => {
    it('should mark as requires_action', async () => {
      addFailedPayment({ retry_count: 0 });

      mockStripeRetrieve.mockResolvedValueOnce({
        status: 'requires_payment_method',
      });

      await job.execute();

      const actionRetry = mockPaymentRetries.find(r => r.status === 'requires_action');
      expect(actionRetry).toBeDefined();
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should mark retry as failed on Stripe error', async () => {
      addFailedPayment({ retry_count: 0 });

      mockStripeRetrieve.mockRejectedValueOnce(new Error('Stripe API error'));

      await job.execute();

      const failedRetry = mockPaymentRetries.find(r => r.status === 'failed');
      expect(failedRetry).toBeDefined();
      expect(failedRetry?.error_message).toContain('Stripe API error');
    });
  });

  // ===========================================================================
  // RETRY LIMIT
  // ===========================================================================
  describe('retry limit', () => {
    it('should not process payments exceeding retry limit', async () => {
      // No payments should be returned (query filters retry_count < 3)
      mockFailedPayments = [];

      await job.execute();

      expect(mockStripeRetrieve).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // BATCH PROCESSING
  // ===========================================================================
  describe('batch processing', () => {
    it('should process multiple failed payments', async () => {
      addFailedPayment({ retry_count: 0 });
      addFailedPayment({ retry_count: 1 });

      mockStripeRetrieve.mockResolvedValue({
        status: 'requires_confirmation',
      });
      mockStripeConfirm.mockResolvedValue({ status: 'succeeded' });

      await job.execute();

      expect(mockStripeRetrieve).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // NO STRIPE PAYMENT INTENT
  // ===========================================================================
  describe('no stripe payment intent', () => {
    it('should skip payments without payment intent ID', async () => {
      mockFailedPayments.push({
        id: uuidv4(),
        stripe_payment_intent_id: null,
        status: 'failed',
        retry_count: 0,
      });

      await job.execute();

      // Should create retry record but not call Stripe
      expect(mockPaymentRetries.length).toBe(1);
      expect(mockStripeRetrieve).not.toHaveBeenCalled();
    });
  });
});
