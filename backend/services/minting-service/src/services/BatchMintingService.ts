import { Transaction, Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getConnection, getWallet } from '../config/solana';
import { sendAndConfirmTransactionWithRetry } from '../utils/solana';
import { uploadToIPFS, TicketMetadata } from './MetadataService';
import logger from '../utils/logger';
import { recordMintSuccess, recordMintFailure } from '../utils/metrics';

interface BatchMintRequest {
  tickets: Array<{
    id: string;
    eventId: string;
    userId: string;
    ticketData: any;
  }>;
  venueId: string;
}

interface BatchMintResult {
  successful: Array<{
    ticketId: string;
    signature: string;
    metadataUri: string;
  }>;
  failed: Array<{
    ticketId: string;
    error: string;
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    totalDuration: number;
    avgDuration: number;
  };
}

export class BatchMintingService {
  private connection: Connection;
  private wallet: Keypair;
  
  // Batch configuration
  private readonly MAX_BATCH_SIZE = 10; // Max tickets per batch
  private readonly BATCH_DELAY_MS = 100; // Delay between batches to avoid rate limits

  constructor() {
    this.connection = getConnection();
    this.wallet = getWallet();
  }

  /**
   * Mint multiple NFTs in optimized batches
   */
  async batchMint(request: BatchMintRequest): Promise<BatchMintResult> {
    const startTime = Date.now();
    const result: BatchMintResult = {
      successful: [],
      failed: [],
      summary: {
        total: request.tickets.length,
        succeeded: 0,
        failed: 0,
        totalDuration: 0,
        avgDuration: 0
      }
    };

    logger.info('Starting batch mint', {
      venueId: request.venueId,
      totalTickets: request.tickets.length,
      batches: Math.ceil(request.tickets.length / this.MAX_BATCH_SIZE)
    });

    // Split into batches
    const batches = this.createBatches(request.tickets, this.MAX_BATCH_SIZE);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      logger.info(`Processing batch ${i + 1}/${batches.length}`, {
        batchSize: batch.length
      });

      try {
        // Process batch in parallel (but within batch size limit)
        const batchResults = await Promise.allSettled(
          batch.map(ticket => this.mintSingle(ticket, request.venueId))
        );

        // Collect results
        batchResults.forEach((batchResult, index) => {
          const ticket = batch[index];
          
          if (batchResult.status === 'fulfilled') {
            result.successful.push({
              ticketId: ticket.id,
              signature: batchResult.value.signature,
              metadataUri: batchResult.value.metadataUri
            });
            result.summary.succeeded++;
            recordMintSuccess(request.venueId, batchResult.value.duration);
          } else {
            result.failed.push({
              ticketId: ticket.id,
              error: batchResult.reason?.message || 'Unknown error'
            });
            result.summary.failed++;
            recordMintFailure(request.venueId, 'batch_mint_error');
          }
        });

        // Delay between batches to respect rate limits
        if (i < batches.length - 1) {
          await this.delay(this.BATCH_DELAY_MS);
        }

      } catch (error) {
        logger.error(`Batch ${i + 1} failed completely`, {
          error: (error as Error).message
        });
        
        // Mark all in batch as failed
        batch.forEach(ticket => {
          result.failed.push({
            ticketId: ticket.id,
            error: (error as Error).message
          });
          result.summary.failed++;
        });
      }
    }

    // Calculate final metrics
    const totalDuration = (Date.now() - startTime) / 1000;
    result.summary.totalDuration = totalDuration;
    result.summary.avgDuration = result.summary.succeeded > 0 
      ? totalDuration / result.summary.succeeded 
      : 0;

    logger.info('Batch mint completed', {
      ...result.summary,
      successRate: `${((result.summary.succeeded / result.summary.total) * 100).toFixed(2)}%`
    });

    return result;
  }

  /**
   * Mint a single NFT (optimized for batch context)
   */
  private async mintSingle(
    ticket: { id: string; eventId: string; userId: string; ticketData: any },
    venueId: string
  ): Promise<{ signature: string; metadataUri: string; duration: number }> {
    const startTime = Date.now();

    try {
      // Upload metadata to IPFS (can be done in parallel)
      const ticketMetadata: TicketMetadata = {
        ticketId: ticket.id,
        eventId: ticket.eventId,
        orderId: ticket.ticketData.orderId || ticket.id,
        eventName: ticket.ticketData.eventName,
        eventDate: ticket.ticketData.eventDate,
        venue: ticket.ticketData.venue,
        tier: ticket.ticketData.tier,
        seatNumber: ticket.ticketData.seatNumber,
        image: ticket.ticketData.image
      };
      
      const metadataUri = await uploadToIPFS(ticketMetadata);

      // Create simplified transaction (Memo program for Phase 1)
      // In production, this would be the full Bubblegum compressed NFT mint
      const transaction = new Transaction();
      
      // Add memo instruction with metadata URI
      const memoData = JSON.stringify({
        type: 'ticket_nft',
        ticketId: ticket.id,
        eventId: ticket.eventId,
        userId: ticket.userId,
        metadataUri,
        timestamp: new Date().toISOString()
      });

      transaction.add({
        keys: [],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: Buffer.from(memoData)
      });

      // Send and confirm transaction
      const result = await sendAndConfirmTransactionWithRetry(
        this.connection,
        transaction,
        [this.wallet],
        3 // max retries
      );

      const duration = (Date.now() - startTime) / 1000;

      return {
        signature: result.signature,
        metadataUri,
        duration
      };

    } catch (error) {
      logger.error('Single mint failed in batch', {
        ticketId: ticket.id,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Split array into batches
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Estimate batch mint cost
   */
  async estimateBatchCost(ticketCount: number): Promise<{
    estimatedSOL: number;
    estimatedTimeSeconds: number;
    batchCount: number;
  }> {
    const costPerMint = 0.001; // Approximate SOL cost per mint
    const timePerMint = 2; // Approximate seconds per mint
    const batchCount = Math.ceil(ticketCount / this.MAX_BATCH_SIZE);

    return {
      estimatedSOL: ticketCount * costPerMint,
      estimatedTimeSeconds: ticketCount * timePerMint,
      batchCount
    };
  }
}
