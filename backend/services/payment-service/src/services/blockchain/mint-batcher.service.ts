import { NFTMintRequest, MintBatch } from '../../types';
import { blockchainConfig } from '../../config/blockchain';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'MintBatcherService' });

export class MintBatcherService {
  private pendingBatches: Map<string, MintBatch> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private batchDelay = 5000; // 5 seconds to collect tickets
  
  async addToBatch(request: NFTMintRequest): Promise<string> {
    const batchKey = `${request.eventId}_${request.blockchain}`;
    
    let batch = this.pendingBatches.get(batchKey);
    
    if (!batch) {
      batch = {
        id: `batch_${Date.now()}_${batchKey}`,
        ticketIds: [],
        status: 'collecting',
        attempts: 0
      };
      if (batch) this.pendingBatches.set(batchKey, batch);
      
      // Set timer to process batch
      const timer = setTimeout(() => {
        this.processBatch(batchKey);
      }, this.batchDelay);
      
      this.batchTimers.set(batchKey, timer);
    }
    
    // Add tickets to batch
    if (batch) batch.ticketIds.push(...request.ticketIds);
    
    // Check if batch is full
    const maxBatchSize = blockchainConfig.batchSizes[request.blockchain];
    if (batch && batch.ticketIds.length >= maxBatchSize) {
      // Process immediately if full
      clearTimeout(this.batchTimers.get(batchKey)!);
      this.batchTimers.delete(batchKey);
      await this.processBatch(batchKey);
    }
    
    return batch ? batch.id : "";
  }
  
  private async processBatch(batchKey: string): Promise<void> {
    const batch = this.pendingBatches.get(batchKey);
    if (!batch || batch.ticketIds.length === 0) {
      return;
    }
    
    // Remove from pending
    this.pendingBatches.delete(batchKey);
    this.batchTimers.delete(batchKey);
    
    // Update status
    batch.status = 'processing';
    
    log.info('Processing batch', { batchId: batch.id, ticketCount: batch.ticketIds.length });
    
    // In production, this would submit the batch to the blockchain
    // For now, we'll simulate processing
    try {
      await this.submitBatchToBlockchain(batch);
      batch.status = 'completed';
    } catch (error) {
      batch.status = 'failed';
      batch.error = error instanceof Error ? error.message : "Unknown error";
      
      // Retry logic would go here
      if (batch.attempts < blockchainConfig.retryConfig.maxAttempts) {
        batch.attempts++;
        // Re-queue for retry
        setTimeout(() => {
          this.retryBatch(batch);
        }, blockchainConfig.retryConfig.baseDelay * batch.attempts);
      }
    }
  }
  
  private async submitBatchToBlockchain(batch: MintBatch): Promise<void> {
    // Simulate blockchain submission
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Random failure for testing
    if (Math.random() < 0.1) {
      throw new Error('Blockchain submission failed');
    }
    
    batch.transactionHash = `0x${Date.now().toString(16)}`;
    batch.gasUsed = 0.001 * batch.ticketIds.length * 0.8; // 20% discount for batching
  }
  
  private async retryBatch(batch: MintBatch): Promise<void> {
    log.info('Retrying batch', { batchId: batch.id, attempt: batch.attempts });
    batch.status = 'processing';
    
    try {
      await this.submitBatchToBlockchain(batch);
      batch.status = 'completed';
    } catch (error) {
      batch.status = 'failed';
      batch.error = error instanceof Error ? error.message : "Unknown error";
    }
  }
  
  getBatchStatus(): {
    pending: number;
    processing: number;
    averageSize: number;
  } {
    const pending = this.pendingBatches.size;
    let totalTickets = 0;
    
    this.pendingBatches.forEach(batch => {
      totalTickets += batch.ticketIds.length;
    });
    
    return {
      pending,
      processing: 0, // Would track processing batches in production
      averageSize: pending > 0 ? totalTickets / pending : 0
    };
  }
}
