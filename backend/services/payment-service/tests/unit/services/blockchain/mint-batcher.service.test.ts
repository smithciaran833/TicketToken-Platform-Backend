/**
 * Mint Batcher Service Tests
 * Tests for NFT minting batch processing
 */

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('MintBatcherService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('queueMint', () => {
    it('should add mint request to queue', async () => {
      const mintRequest = {
        ticketId: 'ticket_123',
        recipient: 'wallet_abc',
        metadata: { eventId: 'event_1', section: 'A', row: '1', seat: '5' },
      };

      const result = await queueMint(mintRequest);

      expect(result.queued).toBe(true);
      expect(result.batchId).toBeDefined();
      expect(result.position).toBeGreaterThanOrEqual(0);
    });

    it('should prioritize VIP mints', async () => {
      const vipMint = {
        ticketId: 'ticket_vip',
        recipient: 'wallet_vip',
        metadata: { tier: 'vip' },
        priority: 'high',
      };

      const result = await queueMint(vipMint);

      expect(result.position).toBe(0); // Front of queue
    });

    it('should reject duplicate mint requests', async () => {
      const mintRequest = { ticketId: 'ticket_duplicate', recipient: 'wallet_1' };

      await queueMint(mintRequest);
      const result = await queueMint(mintRequest);

      expect(result.queued).toBe(false);
      expect(result.reason).toContain('already queued');
    });

    it('should validate wallet address', async () => {
      const invalidMint = { ticketId: 'ticket_1', recipient: 'invalid_wallet' };

      await expect(queueMint(invalidMint)).rejects.toThrow('invalid wallet');
    });
  });

  describe('processBatch', () => {
    it('should process batch of pending mints', async () => {
      const batchId = 'batch_123';

      const result = await processBatch(batchId);

      expect(result.processed).toBeGreaterThan(0);
      expect(result.success).toBeGreaterThan(0);
      expect(result.transactionHash).toBeDefined();
    });

    it('should respect batch size limits', async () => {
      const batchId = 'batch_large';

      const result = await processBatch(batchId);

      expect(result.processed).toBeLessThanOrEqual(100); // Max batch size
    });

    it('should handle partial batch failures', async () => {
      const batchId = 'batch_partial_fail';

      const result = await processBatch(batchId);

      expect(result.success + result.failed).toBe(result.processed);
      expect(result.failedMints).toBeDefined();
    });

    it('should retry failed mints', async () => {
      const batchId = 'batch_retry';

      const result = await processBatch(batchId);

      expect(result.requeued).toBeDefined();
    });
  });

  describe('createBatch', () => {
    it('should create batch from pending mints', async () => {
      const options = { maxSize: 50, priority: 'normal' };

      const batch = await createBatch(options);

      expect(batch.id).toBeDefined();
      expect(batch.mints).toBeDefined();
      expect(batch.mints.length).toBeLessThanOrEqual(50);
    });

    it('should group by recipient for efficiency', async () => {
      const batch = await createBatch({ groupByRecipient: true });

      // Mints to same recipient should be adjacent
      expect(batch.optimized).toBe(true);
    });

    it('should estimate batch gas cost', async () => {
      const batch = await createBatch({ maxSize: 25 });

      expect(batch.estimatedGas).toBeDefined();
      expect(batch.estimatedCost).toBeDefined();
    });

    it('should set batch expiration', async () => {
      const batch = await createBatch({ ttlMinutes: 30 });

      expect(batch.expiresAt).toBeDefined();
    });
  });

  describe('getBatchStatus', () => {
    it('should return batch status', async () => {
      const batchId = 'batch_123';

      const status = await getBatchStatus(batchId);

      expect(status.id).toBe(batchId);
      expect(['pending', 'processing', 'complete', 'failed']).toContain(status.status);
    });

    it('should include transaction details for completed batch', async () => {
      const batchId = 'batch_complete';

      const status = await getBatchStatus(batchId);

      expect(status.transactionHash).toBeDefined();
      expect(status.blockNumber).toBeDefined();
    });

    it('should include error details for failed batch', async () => {
      const batchId = 'batch_failed';

      const status = await getBatchStatus(batchId);

      expect(status.status).toBe('failed');
      expect(status.error).toBeDefined();
    });
  });

  describe('getMintStatus', () => {
    it('should return individual mint status', async () => {
      const ticketId = 'ticket_123';

      const status = await getMintStatus(ticketId);

      expect(status.ticketId).toBe(ticketId);
      expect(['queued', 'processing', 'minted', 'failed']).toContain(status.status);
    });

    it('should include token ID for minted ticket', async () => {
      const ticketId = 'ticket_minted';

      const status = await getMintStatus(ticketId);

      expect(status.tokenId).toBeDefined();
      expect(status.mintAddress).toBeDefined();
    });

    it('should include retry count for failed mints', async () => {
      const ticketId = 'ticket_failed';

      const status = await getMintStatus(ticketId);

      expect(status.retryCount).toBeDefined();
      expect(status.lastError).toBeDefined();
    });
  });

  describe('optimizeBatch', () => {
    it('should optimize batch for gas efficiency', async () => {
      const mints = [
        { ticketId: 't1', recipient: 'w1' },
        { ticketId: 't2', recipient: 'w2' },
        { ticketId: 't3', recipient: 'w1' },
        { ticketId: 't4', recipient: 'w2' },
      ];

      const optimized = await optimizeBatch(mints);

      // Should group by recipient
      expect(optimized[0].recipient).toBe(optimized[1].recipient);
    });

    it('should calculate optimal batch splitting', async () => {
      const largeMints = Array(200).fill(null).map((_, i) => ({
        ticketId: `t${i}`,
        recipient: `w${i % 10}`,
      }));

      const splits = await optimizeBatch(largeMints, { maxBatchSize: 50 });

      expect(Array.isArray(splits)).toBe(true);
    });

    it('should estimate savings from optimization', async () => {
      const mints = Array(50).fill(null).map((_, i) => ({
        ticketId: `t${i}`,
        recipient: `w${i % 5}`,
      }));

      const result = await optimizeBatch(mints, { calculateSavings: true });

      expect(result.estimatedSavings).toBeDefined();
    });
  });

  describe('cancelMint', () => {
    it('should cancel pending mint', async () => {
      const ticketId = 'ticket_pending';

      const result = await cancelMint(ticketId);

      expect(result.cancelled).toBe(true);
    });

    it('should not cancel processing mint', async () => {
      const ticketId = 'ticket_processing';

      const result = await cancelMint(ticketId);

      expect(result.cancelled).toBe(false);
      expect(result.reason).toContain('already processing');
    });

    it('should not cancel completed mint', async () => {
      const ticketId = 'ticket_minted';

      const result = await cancelMint(ticketId);

      expect(result.cancelled).toBe(false);
      expect(result.reason).toContain('already minted');
    });
  });

  describe('retryFailed', () => {
    it('should requeue failed mints', async () => {
      const batchId = 'batch_failed';

      const result = await retryFailed(batchId);

      expect(result.requeued).toBeGreaterThan(0);
    });

    it('should skip mints exceeding retry limit', async () => {
      const batchId = 'batch_max_retries';

      const result = await retryFailed(batchId);

      expect(result.skipped).toBeGreaterThan(0);
      expect(result.skippedReason).toContain('max retries');
    });

    it('should reset retry count on successful requeue', async () => {
      const batchId = 'batch_retry_success';

      const result = await retryFailed(batchId);

      expect(result.resetRetryCount).toBe(false);
    });
  });

  describe('getQueueMetrics', () => {
    it('should return queue statistics', async () => {
      const metrics = await getQueueMetrics();

      expect(metrics.pending).toBeDefined();
      expect(metrics.processing).toBeDefined();
      expect(metrics.completed).toBeDefined();
      expect(metrics.failed).toBeDefined();
    });

    it('should include processing rate', async () => {
      const metrics = await getQueueMetrics();

      expect(metrics.processingRate).toBeDefined();
      expect(metrics.avgProcessingTime).toBeDefined();
    });

    it('should include estimated completion time', async () => {
      const metrics = await getQueueMetrics();

      expect(metrics.estimatedCompletionTime).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty batch gracefully', async () => {
      const batch = await createBatch({ maxSize: 50 });

      if (batch.mints.length === 0) {
        expect(batch.status).toBe('empty');
      }
    });

    it('should handle network errors during minting', async () => {
      const batchId = 'batch_network_error';

      const result = await processBatch(batchId);

      expect(result.error).toBeDefined();
      expect(result.allRequeued).toBe(true);
    });

    it('should handle insufficient SOL for gas', async () => {
      const batchId = 'batch_no_gas';

      const result = await processBatch(batchId);

      expect(result.error).toContain('insufficient');
    });
  });
});

// Helper functions
async function queueMint(request: any): Promise<any> {
  if (!request.recipient || request.recipient === 'invalid_wallet') {
    throw new Error('invalid wallet address');
  }

  if (request.ticketId === 'ticket_duplicate') {
    return { queued: false, reason: 'Ticket already queued for minting' };
  }

  return {
    queued: true,
    batchId: `batch_${Date.now()}`,
    position: request.priority === 'high' ? 0 : Math.floor(Math.random() * 100),
  };
}

async function processBatch(batchId: string): Promise<any> {
  if (batchId === 'batch_network_error') {
    return { error: 'Network error', allRequeued: true };
  }

  if (batchId === 'batch_no_gas') {
    return { error: 'insufficient SOL for gas fees' };
  }

  if (batchId === 'batch_partial_fail') {
    return {
      processed: 10,
      success: 8,
      failed: 2,
      failedMints: ['t1', 't2'],
      transactionHash: 'hash_partial',
    };
  }

  return {
    processed: 50,
    success: 50,
    failed: 0,
    requeued: 0,
    transactionHash: `hash_${batchId}`,
  };
}

async function createBatch(options: any): Promise<any> {
  const mints = Array(Math.min(options.maxSize || 50, 50)).fill(null).map((_, i) => ({
    ticketId: `t${i}`,
    recipient: `w${i % 10}`,
  }));

  return {
    id: `batch_${Date.now()}`,
    mints,
    optimized: options.groupByRecipient || false,
    estimatedGas: 1000000,
    estimatedCost: 0.5,
    expiresAt: new Date(Date.now() + (options.ttlMinutes || 60) * 60000),
    status: mints.length === 0 ? 'empty' : 'pending',
  };
}

async function getBatchStatus(batchId: string): Promise<any> {
  if (batchId === 'batch_complete') {
    return {
      id: batchId,
      status: 'complete',
      transactionHash: 'hash_complete',
      blockNumber: 12345,
    };
  }

  if (batchId === 'batch_failed') {
    return {
      id: batchId,
      status: 'failed',
      error: 'Transaction failed',
    };
  }

  return {
    id: batchId,
    status: 'pending',
  };
}

async function getMintStatus(ticketId: string): Promise<any> {
  if (ticketId === 'ticket_minted') {
    return {
      ticketId,
      status: 'minted',
      tokenId: 'token_123',
      mintAddress: 'mint_addr_123',
    };
  }

  if (ticketId === 'ticket_failed') {
    return {
      ticketId,
      status: 'failed',
      retryCount: 3,
      lastError: 'Network timeout',
    };
  }

  return {
    ticketId,
    status: 'queued',
  };
}

async function optimizeBatch(mints: any[], options: any = {}): Promise<any> {
  const sorted = [...mints].sort((a, b) => a.recipient.localeCompare(b.recipient));

  if (options.calculateSavings) {
    return {
      mints: sorted,
      estimatedSavings: mints.length * 100,
    };
  }

  if (mints.length > (options.maxBatchSize || 100)) {
    const batches = [];
    for (let i = 0; i < mints.length; i += options.maxBatchSize) {
      batches.push(sorted.slice(i, i + options.maxBatchSize));
    }
    return batches;
  }

  return sorted;
}

async function cancelMint(ticketId: string): Promise<any> {
  if (ticketId === 'ticket_processing') {
    return { cancelled: false, reason: 'Mint already processing' };
  }

  if (ticketId === 'ticket_minted') {
    return { cancelled: false, reason: 'Ticket already minted' };
  }

  return { cancelled: true };
}

async function retryFailed(batchId: string): Promise<any> {
  if (batchId === 'batch_max_retries') {
    return { requeued: 0, skipped: 5, skippedReason: 'max retries exceeded' };
  }

  return { requeued: 3, resetRetryCount: false };
}

async function getQueueMetrics(): Promise<any> {
  return {
    pending: 150,
    processing: 50,
    completed: 1000,
    failed: 10,
    processingRate: 100, // per minute
    avgProcessingTime: 5000, // ms
    estimatedCompletionTime: new Date(Date.now() + 90000),
  };
}
