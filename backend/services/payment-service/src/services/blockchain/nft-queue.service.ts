import Bull from 'bull';
import { config } from '../../config';
import { NFTMintRequest, MintBatch } from '../../types';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { blockchainConfig } from '../../config/blockchain';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'NFTQueueService' });

export class NFTQueueService {
  private mintQueue: Bull.Queue;
  private batchQueue: Bull.Queue;
  private solanaConnection: Connection;
  
  constructor() {
    this.mintQueue = new Bull('nft-minting', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      }
    });
    
    this.batchQueue = new Bull('nft-batch-minting', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      }
    });
    
    this.solanaConnection = new Connection(
      blockchainConfig.solana.rpcUrl,
      blockchainConfig.solana.commitment
    );
    
    this.setupProcessors();
  }
  
  async queueMinting(request: NFTMintRequest): Promise<string> {
    const job = await this.mintQueue.add('mint-tickets', request, {
      priority: this.getPriority(request.priority),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: true,
      removeOnFail: false
    });
    
    return job.id.toString();
  }
  
  async queueBatchMinting(requests: NFTMintRequest[]): Promise<string> {
    // Group by event for efficient batch minting
    const batches = this.groupByEvent(requests);
    
    const jobs = await Promise.all(
      batches.map(batch => 
        this.batchQueue.add('batch-mint', batch, {
          priority: 1,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10000
          }
        })
      )
    );
    
    return jobs.map(j => j.id).join(',');
  }
  
  private setupProcessors() {
    // Individual minting processor
    this.mintQueue.process('mint-tickets', async (job) => {
      const request = job.data as NFTMintRequest;
      log.info('Processing NFT mint', { paymentId: request.paymentId });
      
      try {
        // Check if we should batch this instead
        const pendingCount = await this.mintQueue.count();
        if (pendingCount > 10 && request.priority !== 'urgent') {
          // Move to batch queue
          await this.moveJobToBatch(request);
          return { status: 'moved_to_batch' };
        }
        
        // Process individual mint
        const result = await this.mintNFTs(request);
        return result;
      } catch (error) {
        log.error('Minting failed', { error });
        throw error;
      }
    });
    
    // Batch minting processor
    this.batchQueue.process('batch-mint', async (job) => {
      const batch = job.data as MintBatch;
      log.info('Processing batch mint', { ticketCount: batch.ticketIds.length });
      
      try {
        const result = await this.batchMintNFTs(batch);
        return result;
      } catch (error) {
        log.error('Batch minting failed', { error });
        throw error;
      }
    });
  }
  
  private async mintNFTs(request: NFTMintRequest): Promise<any> {
    // In production, this would call your Solana program
    // For now, simulate the minting process
    
    log.info('Minting NFTs', { ticketCount: request.ticketIds.length, blockchain: request.blockchain });
    
    // Simulate blockchain interaction
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      success: true,
      transactionHash: `mock_tx_${Date.now()}`,
      ticketIds: request.ticketIds,
      gasUsed: 0.001 * request.ticketIds.length
    };
  }
  
  private async batchMintNFTs(batch: MintBatch): Promise<any> {
    log.info('Batch minting NFTs', { ticketCount: batch.ticketIds.length });
    
    // Simulate batch transaction
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return {
      success: true,
      transactionHash: `mock_batch_tx_${Date.now()}`,
      ticketIds: batch.ticketIds,
      gasUsed: 0.0008 * batch.ticketIds.length // Cheaper per ticket in batch
    };
  }
  
  private getPriority(priority: string): number {
    switch (priority) {
      case 'urgent': return 3;
      case 'high': return 2;
      case 'standard': return 1;
      default: return 0;
    }
  }
  
  private groupByEvent(requests: NFTMintRequest[]): MintBatch[] {
    const groups: { [key: string]: NFTMintRequest[] } = {};
    
    requests.forEach(request => {
      const key = `${request.eventId}_${request.blockchain}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(request);
    });
    
    return Object.entries(groups).map(([key, reqs]) => ({
      id: `batch_${Date.now()}_${key}`,
      ticketIds: reqs.flatMap(r => r.ticketIds),
      status: 'queued',
      attempts: 0
    }));
  }
  
  private async moveJobToBatch(request: NFTMintRequest): Promise<void> {
    // Add to pending batch
    await this.batchQueue.add('pending-batch', request, {
      delay: 5000 // Wait 5 seconds to collect more
    });
  }
  
  async getQueueStatus(): Promise<{
    mintQueue: { waiting: number; active: number; completed: number };
    batchQueue: { waiting: number; active: number; completed: number };
  }> {
    const [
      mintWaiting, mintActive, mintCompleted,
      batchWaiting, batchActive, batchCompleted
    ] = await Promise.all([
      this.mintQueue.getWaitingCount(),
      this.mintQueue.getActiveCount(),
      this.mintQueue.getCompletedCount(),
      this.batchQueue.getWaitingCount(),
      this.batchQueue.getActiveCount(),
      this.batchQueue.getCompletedCount()
    ]);
    
    return {
      mintQueue: {
        waiting: mintWaiting,
        active: mintActive,
        completed: mintCompleted
      },
      batchQueue: {
        waiting: batchWaiting,
        active: batchActive,
        completed: batchCompleted
      }
    };
  }

  async getJobStatus(jobId: string): Promise<any> {
    // TODO: Implement actual job status check
    return {
      jobId,
      status: "completed",
      progress: 100
    };
  }
}
