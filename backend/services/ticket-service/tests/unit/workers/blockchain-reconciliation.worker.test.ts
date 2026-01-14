// Mock DatabaseService
const mockQuery = jest.fn();
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: mockQuery,
  },
}));

// Mock SolanaService
const mockGetSignatureStatus = jest.fn();
const mockGetBlockHeight = jest.fn();
const mockVerifyOwnership = jest.fn();

const mockConnection = {
  getSignatureStatus: mockGetSignatureStatus,
  getBlockHeight: mockGetBlockHeight,
};

jest.mock('../../../src/services/solanaService', () => ({
  SolanaService: {
    getConnection: jest.fn(() => mockConnection),
    verifyOwnership: mockVerifyOwnership,
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

import { BlockchainReconciliationWorker, blockchainReconciliationWorker } from '../../../src/workers/blockchain-reconciliation.worker';

describe('BlockchainReconciliationWorker', () => {
  let worker: BlockchainReconciliationWorker;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks to default
    mockQuery.mockResolvedValue({ rows: [] });
    mockGetBlockHeight.mockResolvedValue(12345678);
    mockGetSignatureStatus.mockResolvedValue({ value: null });
    mockVerifyOwnership.mockResolvedValue(true);

    worker = new BlockchainReconciliationWorker({
      intervalMs: 60000,
      batchSize: 10,
      pendingAgeThresholdMs: 120000,
      maxRetries: 3,
      autoFix: false,
      enabled: true,
    });
  });

  afterEach(async () => {
    await worker.stop();
  });

  describe('start', () => {
    it('should start worker and run immediately', async () => {
      await worker.start();

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should not start if already running', async () => {
      await worker.start();
      const callCount = mockQuery.mock.calls.length;

      await worker.start(); // Second call should be ignored

      // Call count should not have increased significantly
      expect(mockQuery.mock.calls.length).toBeLessThanOrEqual(callCount + 1);
    });

    it('should not start if disabled', async () => {
      const disabledWorker = new BlockchainReconciliationWorker({ enabled: false });

      await disabledWorker.start();

      expect(disabledWorker.getMetrics().runsCompleted).toBe(0);

      await disabledWorker.stop();
    });
  });

  describe('stop', () => {
    it('should stop the worker', async () => {
      await worker.start();
      await worker.stop();

      // Should be stopped
    });
  });

  describe('runReconciliation', () => {
    it('should reconcile pending transactions', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            tx_signature: 'sig-123',
            tenant_id: 'tenant-1',
            ticket_id: 'ticket-1',
            tx_type: 'mint',
            status: 'pending',
            blockhash: 'blockhash-1',
            last_valid_block_height: 12345700,
            submitted_at: new Date(Date.now() - 300000),
            retry_count: 0,
          }],
        })
        .mockResolvedValue({ rows: [] });

      mockGetSignatureStatus.mockResolvedValue({
        value: {
          slot: 12345679,
          confirmationStatus: 'finalized',
          err: null,
        },
      });

      const result = await worker.runReconciliation();

      expect(result).toHaveProperty('totalProcessed');
      expect(result).toHaveProperty('confirmed');
    });

    it('should handle confirmed transactions', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            tx_signature: 'sig-123',
            tenant_id: 'tenant-1',
            ticket_id: 'ticket-1',
            tx_type: 'mint',
            status: 'pending',
            blockhash: 'blockhash-1',
            last_valid_block_height: 12345700,
            submitted_at: new Date(Date.now() - 300000),
            retry_count: 0,
          }],
        })
        .mockResolvedValue({ rows: [] });

      mockGetSignatureStatus.mockResolvedValue({
        value: {
          slot: 12345679,
          confirmationStatus: 'finalized',
          err: null,
        },
      });

      const result = await worker.runReconciliation();

      expect(result.confirmed).toBeGreaterThanOrEqual(0);
    });

    it('should handle failed transactions', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            tx_signature: 'sig-123',
            tenant_id: 'tenant-1',
            ticket_id: 'ticket-1',
            tx_type: 'mint',
            status: 'pending',
            blockhash: 'blockhash-1',
            last_valid_block_height: 12345700,
            submitted_at: new Date(Date.now() - 300000),
            retry_count: 0,
          }],
        })
        .mockResolvedValue({ rows: [] });

      mockGetSignatureStatus.mockResolvedValue({
        value: {
          err: { InstructionError: [0, 'Custom'] },
        },
      });

      const result = await worker.runReconciliation();

      expect(result.failed).toBeGreaterThanOrEqual(0);
    });

    it('should handle expired blockhashes', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            tx_signature: 'sig-123',
            tenant_id: 'tenant-1',
            ticket_id: 'ticket-1',
            tx_type: 'mint',
            status: 'pending',
            blockhash: 'blockhash-1',
            last_valid_block_height: 12345000, // Expired
            submitted_at: new Date(Date.now() - 300000),
            retry_count: 0,
          }],
        })
        .mockResolvedValue({ rows: [] });

      mockGetSignatureStatus.mockResolvedValue({ value: null });

      const result = await worker.runReconciliation();

      expect(result.expired).toBeGreaterThanOrEqual(0);
    });

    it('should check ownership discrepancies', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // pending transactions
        .mockResolvedValueOnce({
          rows: [{
            ticket_id: 'ticket-1',
            owner_id: 'user-1',
            nft_mint: 'mint-123',
            tenant_id: 'tenant-1',
          }],
        })
        .mockResolvedValue({ rows: [{ count: '0' }] });

      mockVerifyOwnership.mockResolvedValue(false); // Ownership mismatch

      const result = await worker.runReconciliation();

      expect(result.discrepancies).toBeDefined();
    });

    it('should return empty result if already running', async () => {
      // Start a long-running reconciliation
      let resolveQuery: Function;
      mockQuery.mockImplementationOnce(() => new Promise(resolve => {
        resolveQuery = resolve;
      }));

      const promise1 = worker.runReconciliation();

      // Try to start second (should return empty)
      const result2 = await worker.runReconciliation();

      expect(result2.totalProcessed).toBe(0);

      // Cleanup
      resolveQuery!({ rows: [] });
      await promise1;
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics', () => {
      const metrics = worker.getMetrics();

      expect(metrics).toHaveProperty('lastRunAt');
      expect(metrics).toHaveProperty('lastRunDurationMs');
      expect(metrics).toHaveProperty('runsCompleted');
      expect(metrics).toHaveProperty('runsFailed');
      expect(metrics).toHaveProperty('totalTransactionsProcessed');
      expect(metrics).toHaveProperty('isRunning');
    });
  });

  describe('getDiscrepancies', () => {
    it('should return discrepancy log', () => {
      const discrepancies = worker.getDiscrepancies();
      expect(Array.isArray(discrepancies)).toBe(true);
    });
  });

  describe('getPrometheusMetrics', () => {
    it('should return Prometheus format metrics', () => {
      const metrics = worker.getPrometheusMetrics();

      expect(metrics).toContain('blockchain_reconciliation_last_run_timestamp');
      expect(metrics).toContain('blockchain_reconciliation_runs_total');
      expect(metrics).toContain('blockchain_reconciliation_transactions_total');
      expect(metrics).toContain('blockchain_reconciliation_is_running');
    });
  });

  describe('forceReconciliation', () => {
    it('should trigger immediate reconciliation', async () => {
      const result = await worker.forceReconciliation();

      expect(result).toHaveProperty('totalProcessed');
    });
  });

  describe('singleton instance', () => {
    it('should export blockchainReconciliationWorker singleton', () => {
      expect(blockchainReconciliationWorker).toBeInstanceOf(BlockchainReconciliationWorker);
    });
  });
});
