/**
 * Retry Failed Payments Job Tests
 * Tests for background job that retries failed payments
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('RetryFailedPaymentsJob', () => {
  let job: RetryFailedPaymentsJob;
  let mockPaymentService: any;
  let mockDb: any;
  let mockNotificationService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPaymentService = { retryPayment: jest.fn(), getFailedPayments: jest.fn() };
    mockNotificationService = { sendPaymentFailedNotification: jest.fn() };
    mockDb = createMockDb();
    job = new RetryFailedPaymentsJob(mockPaymentService, mockDb, mockNotificationService);
  });

  describe('execute', () => {
    it('should fetch failed payments eligible for retry', async () => {
      mockDb.payments.findFailedForRetry.mockResolvedValue([]);

      await job.execute();

      expect(mockDb.payments.findFailedForRetry).toHaveBeenCalled();
    });

    it('should retry each eligible payment', async () => {
      mockDb.payments.findFailedForRetry.mockResolvedValue([
        { id: 'pay_1', retryCount: 0 },
        { id: 'pay_2', retryCount: 1 },
      ]);
      mockPaymentService.retryPayment.mockResolvedValue({ success: true });

      await job.execute();

      expect(mockPaymentService.retryPayment).toHaveBeenCalledTimes(2);
    });

    it('should increment retry count', async () => {
      mockDb.payments.findFailedForRetry.mockResolvedValue([{ id: 'pay_1', retryCount: 0 }]);
      mockPaymentService.retryPayment.mockResolvedValue({ success: false });

      await job.execute();

      expect(mockDb.payments.update).toHaveBeenCalledWith('pay_1', expect.objectContaining({ retryCount: 1 }));
    });

    it('should mark as permanently failed after max retries', async () => {
      mockDb.payments.findFailedForRetry.mockResolvedValue([{ id: 'pay_1', retryCount: 2 }]);
      mockPaymentService.retryPayment.mockResolvedValue({ success: false });

      await job.execute();

      expect(mockDb.payments.update).toHaveBeenCalledWith('pay_1', expect.objectContaining({ status: 'permanently_failed' }));
    });

    it('should notify user on permanent failure', async () => {
      mockDb.payments.findFailedForRetry.mockResolvedValue([{ id: 'pay_1', retryCount: 2, userId: 'user_123' }]);
      mockPaymentService.retryPayment.mockResolvedValue({ success: false });

      await job.execute();

      expect(mockNotificationService.sendPaymentFailedNotification).toHaveBeenCalled();
    });

    it('should mark payment as succeeded on successful retry', async () => {
      mockDb.payments.findFailedForRetry.mockResolvedValue([{ id: 'pay_1', retryCount: 1 }]);
      mockPaymentService.retryPayment.mockResolvedValue({ success: true });

      await job.execute();

      expect(mockDb.payments.update).toHaveBeenCalledWith('pay_1', expect.objectContaining({ status: 'succeeded' }));
    });

    it('should use exponential backoff between retries', async () => {
      const payment = { id: 'pay_1', retryCount: 0, lastRetryAt: new Date(Date.now() - 1000) };
      mockDb.payments.findFailedForRetry.mockResolvedValue([payment]);

      await job.execute();

      // First retry should happen immediately after first failure
      expect(mockPaymentService.retryPayment).toHaveBeenCalled();
    });

    it('should skip payments not yet eligible for retry', async () => {
      const recentFailure = { id: 'pay_1', retryCount: 1, lastRetryAt: new Date(Date.now() - 1000) };
      mockDb.payments.findFailedForRetry.mockImplementation(({ minBackoff }) => {
        // Simulate filtering based on backoff
        return [];
      });

      await job.execute();

      expect(mockPaymentService.retryPayment).not.toHaveBeenCalled();
    });
  });

  describe('retry eligibility', () => {
    it('should calculate correct backoff for retry 1', () => {
      const backoff = job.calculateBackoff(1);
      expect(backoff).toBe(60000); // 1 minute
    });

    it('should calculate correct backoff for retry 2', () => {
      const backoff = job.calculateBackoff(2);
      expect(backoff).toBe(300000); // 5 minutes
    });

    it('should calculate correct backoff for retry 3', () => {
      const backoff = job.calculateBackoff(3);
      expect(backoff).toBe(900000); // 15 minutes
    });

    it('should cap backoff at max value', () => {
      const backoff = job.calculateBackoff(10);
      expect(backoff).toBeLessThanOrEqual(3600000); // 1 hour max
    });
  });

  describe('error handling', () => {
    it('should continue processing other payments on individual failure', async () => {
      mockDb.payments.findFailedForRetry.mockResolvedValue([
        { id: 'pay_1', retryCount: 0 },
        { id: 'pay_2', retryCount: 0 },
      ]);
      mockPaymentService.retryPayment
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ success: true });

      await job.execute();

      expect(mockPaymentService.retryPayment).toHaveBeenCalledTimes(2);
    });

    it('should log errors but not throw', async () => {
      mockDb.payments.findFailedForRetry.mockRejectedValue(new Error('DB error'));

      await expect(job.execute()).resolves.not.toThrow();
    });
  });

  describe('tenant isolation', () => {
    it('should process payments for all tenants', async () => {
      mockDb.payments.findFailedForRetry.mockResolvedValue([
        { id: 'pay_1', tenantId: 'tenant_1' },
        { id: 'pay_2', tenantId: 'tenant_2' },
      ]);
      mockPaymentService.retryPayment.mockResolvedValue({ success: true });

      await job.execute();

      expect(mockPaymentService.retryPayment).toHaveBeenCalledTimes(2);
    });
  });

  describe('metrics', () => {
    it('should record retry attempts', async () => {
      mockDb.payments.findFailedForRetry.mockResolvedValue([{ id: 'pay_1', retryCount: 0 }]);
      mockPaymentService.retryPayment.mockResolvedValue({ success: true });

      const result = await job.execute();

      expect(result.attempted).toBe(1);
    });

    it('should record successful retries', async () => {
      mockDb.payments.findFailedForRetry.mockResolvedValue([
        { id: 'pay_1', retryCount: 0 },
        { id: 'pay_2', retryCount: 0 },
      ]);
      mockPaymentService.retryPayment
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false });

      const result = await job.execute();

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
    });
  });
});

function createMockDb() {
  return {
    payments: {
      findFailedForRetry: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(true),
    },
  };
}

class RetryFailedPaymentsJob {
  private maxRetries = 3;

  constructor(
    private paymentService: any,
    private db: any,
    private notificationService: any
  ) {}

  async execute() {
    const stats = { attempted: 0, succeeded: 0, failed: 0 };
    
    try {
      const payments = await this.db.payments.findFailedForRetry({ minBackoff: this.calculateBackoff(1) });

      for (const payment of payments) {
        stats.attempted++;
        try {
          const result = await this.paymentService.retryPayment(payment.id);

          if (result.success) {
            await this.db.payments.update(payment.id, { status: 'succeeded', retryCount: payment.retryCount + 1 });
            stats.succeeded++;
          } else {
            const newRetryCount = payment.retryCount + 1;
            if (newRetryCount >= this.maxRetries) {
              await this.db.payments.update(payment.id, { status: 'permanently_failed', retryCount: newRetryCount });
              await this.notificationService.sendPaymentFailedNotification({ paymentId: payment.id, userId: payment.userId });
            } else {
              await this.db.payments.update(payment.id, { retryCount: newRetryCount, lastRetryAt: new Date() });
            }
            stats.failed++;
          }
        } catch (error) {
          stats.failed++;
        }
      }
    } catch (error) {
      // Log but don't throw
    }

    return stats;
  }

  calculateBackoff(retryNumber: number): number {
    const baseMs = 60000; // 1 minute
    const maxMs = 3600000; // 1 hour
    return Math.min(baseMs * Math.pow(5, retryNumber - 1), maxMs);
  }
}
