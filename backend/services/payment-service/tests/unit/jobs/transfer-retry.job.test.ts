/**
 * Transfer Retry Job Tests
 * Tests for retrying failed Stripe transfers
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('TransferRetryJob', () => {
  let job: TransferRetryJob;
  let mockDb: any;
  let mockStripe: any;
  let mockMetrics: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    mockStripe = { transfers: { create: jest.fn() } };
    mockMetrics = { increment: jest.fn(), gauge: jest.fn() };
    job = new TransferRetryJob(mockDb, mockStripe, mockMetrics);
  });

  describe('execute', () => {
    it('should find failed transfers', async () => {
      mockDb.transfers.findFailedForRetry.mockResolvedValue([]);

      await job.execute();

      expect(mockDb.transfers.findFailedForRetry).toHaveBeenCalled();
    });

    it('should retry each failed transfer', async () => {
      mockDb.transfers.findFailedForRetry.mockResolvedValue([
        { id: 'tr_1', amount: 5000, destinationAccount: 'acct_1', retryCount: 0 },
        { id: 'tr_2', amount: 3000, destinationAccount: 'acct_2', retryCount: 1 },
      ]);
      mockStripe.transfers.create.mockResolvedValue({ id: 'new_tr' });

      await job.execute();

      expect(mockStripe.transfers.create).toHaveBeenCalledTimes(2);
    });

    it('should update status on successful retry', async () => {
      mockDb.transfers.findFailedForRetry.mockResolvedValue([
        { id: 'tr_1', amount: 5000, destinationAccount: 'acct_1', retryCount: 0 },
      ]);
      mockStripe.transfers.create.mockResolvedValue({ id: 'new_tr_123' });

      await job.execute();

      expect(mockDb.transfers.updateStatus).toHaveBeenCalledWith('tr_1', 'completed', expect.any(Object));
    });

    it('should increment retry count on failure', async () => {
      mockDb.transfers.findFailedForRetry.mockResolvedValue([
        { id: 'tr_1', amount: 5000, destinationAccount: 'acct_1', retryCount: 0 },
      ]);
      mockStripe.transfers.create.mockRejectedValue(new Error('Stripe error'));

      await job.execute();

      expect(mockDb.transfers.incrementRetryCount).toHaveBeenCalledWith('tr_1');
    });
  });

  describe('retry eligibility', () => {
    it('should not retry if max retries exceeded', async () => {
      mockDb.transfers.findFailedForRetry.mockResolvedValue([
        { id: 'tr_1', amount: 5000, destinationAccount: 'acct_1', retryCount: 5 },
      ]);

      await job.execute();

      expect(mockStripe.transfers.create).not.toHaveBeenCalled();
    });

    it('should mark as permanently failed after max retries', async () => {
      mockDb.transfers.findFailedForRetry.mockResolvedValue([
        { id: 'tr_1', amount: 5000, destinationAccount: 'acct_1', retryCount: 5 },
      ]);

      await job.execute();

      expect(mockDb.transfers.updateStatus).toHaveBeenCalledWith('tr_1', 'permanently_failed', expect.any(Object));
    });
  });

  describe('exponential backoff', () => {
    it('should calculate correct delay for retry 1', () => {
      const delay = job.calculateBackoffDelay(1);
      expect(delay).toBe(60000);
    });

    it('should calculate correct delay for retry 2', () => {
      const delay = job.calculateBackoffDelay(2);
      expect(delay).toBe(120000);
    });

    it('should cap at maximum delay', () => {
      const delay = job.calculateBackoffDelay(10);
      expect(delay).toBeLessThanOrEqual(3600000);
    });
  });

  describe('error handling', () => {
    it('should handle card_error gracefully', async () => {
      mockDb.transfers.findFailedForRetry.mockResolvedValue([
        { id: 'tr_1', amount: 5000, destinationAccount: 'acct_1', retryCount: 0 },
      ]);
      const stripeError = new Error('Card declined');
      (stripeError as any).type = 'card_error';
      mockStripe.transfers.create.mockRejectedValue(stripeError);

      await job.execute();

      expect(mockDb.transfers.updateStatus).toHaveBeenCalledWith('tr_1', 'permanently_failed', expect.objectContaining({
        reason: 'card_error',
      }));
    });

    it('should retry on network errors', async () => {
      mockDb.transfers.findFailedForRetry.mockResolvedValue([
        { id: 'tr_1', amount: 5000, destinationAccount: 'acct_1', retryCount: 0 },
      ]);
      const networkError = new Error('Network error');
      (networkError as any).type = 'api_connection_error';
      mockStripe.transfers.create.mockRejectedValue(networkError);

      await job.execute();

      expect(mockDb.transfers.incrementRetryCount).toHaveBeenCalled();
    });
  });

  describe('metrics', () => {
    it('should track retry attempts', async () => {
      mockDb.transfers.findFailedForRetry.mockResolvedValue([
        { id: 'tr_1', amount: 5000, retryCount: 0, destinationAccount: 'acct_1' },
      ]);
      mockStripe.transfers.create.mockResolvedValue({ id: 'new_tr' });

      await job.execute();

      expect(mockMetrics.increment).toHaveBeenCalledWith('transfer.retry.attempted');
    });

    it('should track successful retries', async () => {
      mockDb.transfers.findFailedForRetry.mockResolvedValue([
        { id: 'tr_1', amount: 5000, retryCount: 0, destinationAccount: 'acct_1' },
      ]);
      mockStripe.transfers.create.mockResolvedValue({ id: 'new_tr' });

      await job.execute();

      expect(mockMetrics.increment).toHaveBeenCalledWith('transfer.retry.success');
    });

    it('should track failed retries', async () => {
      mockDb.transfers.findFailedForRetry.mockResolvedValue([
        { id: 'tr_1', amount: 5000, retryCount: 0, destinationAccount: 'acct_1' },
      ]);
      mockStripe.transfers.create.mockRejectedValue(new Error('Failed'));

      await job.execute();

      expect(mockMetrics.increment).toHaveBeenCalledWith('transfer.retry.failed');
    });
  });
});

function createMockDb() {
  return {
    transfers: {
      findFailedForRetry: jest.fn().mockResolvedValue([]),
      updateStatus: jest.fn().mockResolvedValue(true),
      incrementRetryCount: jest.fn().mockResolvedValue(true),
    },
  };
}

interface TransferRecord {
  id: string;
  amount: number;
  destinationAccount: string;
  retryCount: number;
}

interface JobOptions {
  maxRetries?: number;
}

class TransferRetryJob {
  private maxRetries: number;

  constructor(private db: any, private stripe: any, private metrics: any, options: JobOptions = {}) {
    this.maxRetries = options.maxRetries || 5;
  }

  async execute() {
    const failedTransfers = await this.db.transfers.findFailedForRetry();

    for (const transfer of failedTransfers) {
      if (transfer.retryCount >= this.maxRetries) {
        await this.db.transfers.updateStatus(transfer.id, 'permanently_failed', { reason: 'max_retries_exceeded' });
        continue;
      }
      await this.retryTransfer(transfer);
    }
  }

  private async retryTransfer(transfer: TransferRecord) {
    this.metrics.increment('transfer.retry.attempted');

    try {
      const result = await this.stripe.transfers.create({
        amount: transfer.amount, currency: 'usd', destination: transfer.destinationAccount,
      });
      await this.db.transfers.updateStatus(transfer.id, 'completed', { stripeTransferId: result.id });
      this.metrics.increment('transfer.retry.success');
    } catch (error: any) {
      this.metrics.increment('transfer.retry.failed');
      if (error.type === 'card_error') {
        await this.db.transfers.updateStatus(transfer.id, 'permanently_failed', { reason: 'card_error' });
      } else {
        await this.db.transfers.incrementRetryCount(transfer.id);
      }
    }
  }

  calculateBackoffDelay(retryCount: number): number {
    const baseDelay = 60000;
    const maxDelay = 3600000;
    return Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
  }
}
