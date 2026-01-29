/**
 * COMPONENT TEST: TransferRetryJob
 *
 * Tests Stripe transfer retry logic
 */

import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

// Mock data stores
let mockPendingTransfers: any[] = [];
let mockStripeTransfers: any[] = [];

// Mock client
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};

// Mock DatabaseService
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: () => ({
      query: jest.fn().mockImplementation(async (query: string, params?: any[]) => {
        if (query.includes('INSERT INTO pending_transfers')) {
          const id = params?.[0];
          mockPendingTransfers.push({
            id,
            payment_id: params?.[1],
            order_id: params?.[2],
            amount: params?.[3],
            destination_account: params?.[4],
            status: 'pending_retry',
            retry_count: 0,
            last_error: params?.[5],
            tenant_id: params?.[6],
          });
          return { rows: [] };
        }
        if (query.includes('SELECT') && query.includes('pending_transfers')) {
          return { rows: mockPendingTransfers.filter(t => t.id === params?.[0]) };
        }
        return { rows: [] };
      }),
      connect: jest.fn().mockResolvedValue(mockClient),
    }),
  },
}));

// Mock Stripe
const mockStripeTransferCreate = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    transfers: {
      create: mockStripeTransferCreate,
    },
  }));
});

// Mock alerting service
const mockAlertTransferFailed = jest.fn();
jest.mock('../../../src/services/alerting.service', () => ({
  alertingService: {
    alertTransferFailed: mockAlertTransferFailed,
  },
}));

// Mock metrics
jest.mock('../../../src/routes/metrics.routes', () => ({
  recordStripeApiDuration: jest.fn(),
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

import {
  processPendingTransfers,
  queueTransferForRetry,
  getTransferStatus,
} from '../../../src/jobs/transfer-retry.job';

describe('TransferRetryJob Component Tests', () => {
  beforeEach(() => {
    mockPendingTransfers = [];
    mockStripeTransfers = [];
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockStripeTransferCreate.mockReset();
    mockAlertTransferFailed.mockReset();

    // Default Stripe success
    mockStripeTransferCreate.mockResolvedValue({
      id: `tr_${uuidv4().replace(/-/g, '')}`,
      amount: 1000,
      currency: 'usd',
    });

    // Setup client query behavior
    mockClientQuery.mockImplementation(async (query: string, params?: any[]) => {
      if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
        return { rows: [] };
      }

      if (query.includes('set_config')) {
        return { rows: [] };
      }

      // SELECT pending transfers
      if (query.includes('SELECT') && query.includes('pending_transfers')) {
        const pending = mockPendingTransfers.filter(
          t => t.status === 'pending_retry' && t.retry_count < 5
        );
        return { rows: pending };
      }

      // UPDATE pending_transfers
      if (query.includes('UPDATE pending_transfers')) {
        const transferId = params?.[0];
        const transfer = mockPendingTransfers.find(t => t.id === transferId);
        if (transfer) {
          if (query.includes("status = 'processing'")) {
            transfer.status = 'processing';
            transfer.retry_count = (transfer.retry_count || 0) + 1;
          } else if (query.includes("status = 'completed'")) {
            transfer.status = 'completed';
            transfer.stripe_transfer_id = params?.[1];
          } else if (query.includes("status = 'failed'")) {
            transfer.status = 'failed';
            transfer.last_error = params?.[1];
          } else if (query.includes("status = 'pending_retry'")) {
            transfer.status = 'pending_retry';
            transfer.last_error = params?.[1];
          }
        }
        return { rows: [] };
      }

      // INSERT into stripe_transfers
      if (query.includes('INSERT INTO stripe_transfers')) {
        mockStripeTransfers.push({
          id: params?.[0],
          stripe_transfer_id: params?.[3],
        });
        return { rows: [] };
      }

      return { rows: [] };
    });
  });

  // Helper to add pending transfer
  function addPendingTransfer(transfer: Partial<any>): string {
    const id = transfer.id || uuidv4();
    mockPendingTransfers.push({
      id,
      payment_id: transfer.payment_id || uuidv4(),
      order_id: transfer.order_id || uuidv4(),
      amount: transfer.amount || 1000,
      destination_account: transfer.destination_account || 'acct_test123',
      status: transfer.status || 'pending_retry',
      retry_count: transfer.retry_count || 0,
      last_error: transfer.last_error || null,
      tenant_id: transfer.tenant_id || uuidv4(),
      created_at: transfer.created_at || new Date(),
    });
    return id;
  }

  // ===========================================================================
  // SUCCESSFUL TRANSFER
  // ===========================================================================
  describe('successful transfer', () => {
    it('should process pending transfer successfully', async () => {
      const tenantId = uuidv4();
      const transferId = addPendingTransfer({
        amount: 5000,
        destination_account: 'acct_venue123',
        tenant_id: tenantId,
      });

      await processPendingTransfers();

      expect(mockStripeTransferCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 5000,
          destination: 'acct_venue123',
        })
      );

      const transfer = mockPendingTransfers.find(t => t.id === transferId);
      expect(transfer?.status).toBe('completed');
    });

    it('should include metadata in Stripe transfer', async () => {
      const tenantId = uuidv4();
      const paymentId = uuidv4();
      const orderId = uuidv4();

      addPendingTransfer({
        payment_id: paymentId,
        order_id: orderId,
        tenant_id: tenantId,
      });

      await processPendingTransfers();

      expect(mockStripeTransferCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            payment_id: paymentId,
            order_id: orderId,
            tenant_id: tenantId,
          }),
        })
      );
    });

    it('should create stripe_transfers record', async () => {
      addPendingTransfer({});

      await processPendingTransfers();

      expect(mockStripeTransfers.length).toBe(1);
    });
  });

  // ===========================================================================
  // FAILED TRANSFER - RETRYABLE
  // ===========================================================================
  describe('retryable failures', () => {
    it('should schedule retry on temporary error', async () => {
      mockStripeTransferCreate.mockRejectedValueOnce({
        message: 'Temporary network error',
        statusCode: 500,
      });

      const transferId = addPendingTransfer({
        retry_count: 0,
      });

      await processPendingTransfers();

      const transfer = mockPendingTransfers.find(t => t.id === transferId);
      expect(transfer?.status).toBe('pending_retry');
      expect(transfer?.last_error).toContain('Temporary network error');
    });

    it('should increment retry count', async () => {
      mockStripeTransferCreate.mockRejectedValueOnce({
        message: 'Error',
        statusCode: 500,
      });

      const transferId = addPendingTransfer({
        retry_count: 1,
      });

      await processPendingTransfers();

      const transfer = mockPendingTransfers.find(t => t.id === transferId);
      expect(transfer?.retry_count).toBe(2);
    });
  });

  // ===========================================================================
  // FAILED TRANSFER - TERMINAL
  // ===========================================================================
  describe('terminal failures', () => {
    it('should mark as failed on invalid_destination', async () => {
      mockStripeTransferCreate.mockRejectedValueOnce({
        message: 'Invalid destination',
        code: 'invalid_destination',
        statusCode: 400,
      });

      const transferId = addPendingTransfer({
        retry_count: 0,
      });

      await processPendingTransfers();

      const transfer = mockPendingTransfers.find(t => t.id === transferId);
      expect(transfer?.status).toBe('failed');
    });

    it('should mark as failed after max retries', async () => {
      mockStripeTransferCreate.mockRejectedValueOnce({
        message: 'Error',
        statusCode: 500,
      });

      const transferId = addPendingTransfer({
        retry_count: 4, // Will be 5 after this attempt
      });

      await processPendingTransfers();

      const transfer = mockPendingTransfers.find(t => t.id === transferId);
      expect(transfer?.status).toBe('failed');
    });

    it('should send alert on permanent failure', async () => {
      mockStripeTransferCreate.mockRejectedValueOnce({
        message: 'Account closed',
        code: 'account_closed',
        statusCode: 400,
      });

      addPendingTransfer({
        amount: 10000,
        destination_account: 'acct_closed',
        tenant_id: uuidv4(),
      });

      await processPendingTransfers();

      expect(mockAlertTransferFailed).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // QUEUE TRANSFER FOR RETRY
  // ===========================================================================
  describe('queueTransferForRetry()', () => {
    it('should create pending transfer record', async () => {
      const paymentId = uuidv4();
      const orderId = uuidv4();
      const tenantId = uuidv4();

      const id = await queueTransferForRetry(
        paymentId,
        orderId,
        5000,
        'acct_test',
        tenantId,
        'Initial error'
      );

      expect(id).toBeDefined();
      expect(mockPendingTransfers.length).toBe(1);
      expect(mockPendingTransfers[0].amount).toBe(5000);
    });
  });

  // ===========================================================================
  // GET TRANSFER STATUS
  // ===========================================================================
  describe('getTransferStatus()', () => {
    it('should return transfer status', async () => {
      const transferId = addPendingTransfer({
        status: 'completed',
        retry_count: 2,
        stripe_transfer_id: 'tr_123',
      });

      const status = await getTransferStatus(transferId);

      expect(status).toEqual(
        expect.objectContaining({
          status: 'completed',
          retryCount: 2,
        })
      );
    });

    it('should return null for non-existent transfer', async () => {
      const status = await getTransferStatus(uuidv4());
      expect(status).toBeNull();
    });
  });

  // ===========================================================================
  // BATCH PROCESSING
  // ===========================================================================
  describe('batch processing', () => {
    it('should process multiple transfers', async () => {
      addPendingTransfer({ amount: 1000 });
      addPendingTransfer({ amount: 2000 });
      addPendingTransfer({ amount: 3000 });

      await processPendingTransfers();

      expect(mockStripeTransferCreate).toHaveBeenCalledTimes(3);
    });

    it('should skip transfers exceeding max retries', async () => {
      addPendingTransfer({ retry_count: 5 });

      await processPendingTransfers();

      expect(mockStripeTransferCreate).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // TENANT CONTEXT
  // ===========================================================================
  describe('tenant context', () => {
    it('should set tenant context before processing', async () => {
      const tenantId = uuidv4();
      addPendingTransfer({ tenant_id: tenantId });

      await processPendingTransfers();

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        [tenantId]
      );
    });
  });
});
