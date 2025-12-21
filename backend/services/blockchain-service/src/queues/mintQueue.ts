import { BaseQueue } from './baseQueue';
import { Pool } from 'pg';
import config from '../config';
import queueConfig from '../config/queue';
import { Job, JobOptions } from 'bull';

interface MintJobData {
  ticketId: string;
  userId: string;
  eventId: string;
  metadata: any;
  timestamp?: string;
}

interface MintResult {
  success: boolean;
  tokenId: string;
  transactionId: string;
  signature: string;
  blockHeight: number;
  timestamp: string;
  alreadyMinted?: boolean;
}

export class MintQueue extends BaseQueue {
  private db: Pool;

  constructor() {
    super('nft-minting', {
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000
        },
        removeOnComplete: 50,
        removeOnFail: 100
      }
    });

    this.db = new Pool(config.database);
    this.setupProcessor();
  }

  setupProcessor(): void {
    const concurrency = queueConfig.queues['nft-minting'].concurrency || 5;

    this.queue.process(concurrency, async (job: Job<MintJobData>) => {
      const { ticketId, userId, eventId, metadata } = job.data;

      try {
        // Update job progress
        job.progress(10);

        // Check if already minted (idempotency)
        const existing = await this.checkExistingMint(ticketId);
        if (existing) {
          console.log(`Ticket ${ticketId} already minted`);
          return existing;
        }

        job.progress(20);

        // Update ticket status to RESERVED (while minting)
        await this.updateTicketStatus(ticketId, 'RESERVED');

        job.progress(30);

        // Store job in database
        await this.storeJobRecord(job.id as string, ticketId, userId, 'PROCESSING');

        job.progress(40);

        // Simulate NFT minting (will be replaced with actual blockchain call)
        const mintResult = await this.simulateMint(ticketId, metadata);

        job.progress(70);

        // Store transaction result
        await this.storeTransaction(ticketId, mintResult);

        job.progress(90);

        // Update ticket as minted
        await this.updateTicketAsMinted(ticketId, mintResult);

        // Update job record
        await this.updateJobRecord(job.id as string, 'COMPLETED', mintResult);

        job.progress(100);

        console.log(`Successfully minted NFT for ticket ${ticketId}`);
        return mintResult;

      } catch (error: any) {
        console.error(`Minting failed for ticket ${ticketId}:`, error);

        // Update job record with error
        await this.updateJobRecord(job.id as string, 'FAILED', null, error.message);

        // If final attempt, update ticket status
        if (job.attemptsMade >= (job.opts.attempts || 1) - 1) {
          await this.updateTicketStatus(ticketId, 'AVAILABLE');
        }

        throw error;
      }
    });
  }

  async checkExistingMint(ticketId: string): Promise<MintResult | null> {
    const result = await this.db.query(
      'SELECT token_id, mint_transaction_id FROM tickets WHERE id = $1 AND is_minted = true',
      [ticketId]
    );

    if (result.rows.length > 0) {
      return {
        success: true,
        alreadyMinted: true,
        tokenId: result.rows[0].token_id,
        transactionId: result.rows[0].mint_transaction_id,
        signature: '',
        blockHeight: 0,
        timestamp: new Date().toISOString()
      };
    }

    return null;
  }

  async updateTicketStatus(ticketId: string, status: string): Promise<void> {
    await this.db.query(
      'UPDATE tickets SET status = $1 WHERE id = $2',
      [status, ticketId]
    );
  }

  async storeJobRecord(jobId: string, ticketId: string, userId: string, status: string): Promise<void> {
    // REMOVED: queue_jobs table doesn't exist - BullMQ uses Redis for job tracking
    // This was legacy code referencing a PostgreSQL table that was never migrated
    // Job status is already tracked by BullMQ in Redis
    console.log(`Job ${jobId} for ticket ${ticketId} status: ${status}`);
  }

  async updateJobRecord(jobId: string, status: string, result: MintResult | null = null, error: string | null = null): Promise<void> {
    // REMOVED: queue_jobs table doesn't exist - BullMQ uses Redis for job tracking
    // This was legacy code referencing a PostgreSQL table that was never migrated
    // Job status is already tracked by BullMQ in Redis
    console.log(`Job ${jobId} ${status}${error ? `: ${error}` : ''}`);
  }

  async simulateMint(ticketId: string, metadata: any): Promise<MintResult> {
    // This will be replaced with actual blockchain minting
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      success: true,
      tokenId: `token_${ticketId}_${Date.now()}`,
      transactionId: `tx_${Math.random().toString(36).substr(2, 9)}`,
      signature: `sig_${Math.random().toString(36).substr(2, 9)}`,
      blockHeight: Math.floor(Math.random() * 1000000),
      timestamp: new Date().toISOString()
    };
  }

  async storeTransaction(ticketId: string, mintResult: MintResult): Promise<void> {
    await this.db.query(`
      INSERT INTO blockchain_transactions (
        ticket_id,
        type,
        status,
        slot_number,
        metadata,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      ticketId,
      'MINT',
      'CONFIRMED',
      mintResult.blockHeight || 0,
      JSON.stringify(mintResult)
    ]);
  }

  async updateTicketAsMinted(ticketId: string, mintResult: MintResult): Promise<void> {
    await this.db.query(`
      UPDATE tickets
      SET
        is_minted = true,
        token_id = $1,
        mint_transaction_id = $2,
        status = 'SOLD',
        is_nft = true
      WHERE id = $3
    `, [mintResult.tokenId, mintResult.transactionId, ticketId]);
  }

  // Public method to add a minting job
  async addMintJob(ticketId: string, userId: string, eventId: string, metadata: any, options: JobOptions = {}): Promise<any> {
    return await this.addJob({
      ticketId,
      userId,
      eventId,
      metadata,
      timestamp: new Date().toISOString()
    }, {
      ...options,
      jobId: `mint_${ticketId}_${Date.now()}`
    });
  }
}

export default MintQueue;
