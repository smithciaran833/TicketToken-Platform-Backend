import { BaseQueue } from './baseQueue';
import { Pool } from 'pg';
import { Connection, Keypair } from '@solana/web3.js';
import config from '../config';
import queueConfig from '../config/queue';
import { Job, JobOptions } from 'bull';
import { logger } from '../utils/logger';
import { MetaplexService } from '../services/MetaplexService';
import { TransactionConfirmationService } from '../services/TransactionConfirmationService';
import { RPCFailoverService } from '../services/RPCFailoverService';
import { withLock, createMintLockKey } from '../utils/distributed-lock';
import { withCircuitBreaker, configureCircuit } from '../utils/circuit-breaker';
import { blockchainMetrics } from '../utils/blockchain-metrics';
import { ticketServiceClient, RequestContext } from '@tickettoken/shared';
import { 
  SolanaError, 
  MintingError, 
  ValidationError,
  WalletError,
  ErrorCode
} from '../errors';

/**
 * NFT MINTING QUEUE
 * 
 * AUDIT FIXES:
 * - #86: Replace simulateMint() with real MetaplexService.mintNFT()
 * - #87: Real blockchain data written to DB (not fake CONFIRMED)
 * - #89: Confirm on-chain THEN update DB (blockchain-first pattern)
 * 
 * PHASE 5c REFACTORED:
 * - updateMintStatus() - Now uses ticketServiceClient.updateStatus()
 * - saveMintRecord() - Now uses ticketServiceClient.updateNft()
 * - Replaced direct tickets table UPDATEs with service client calls
 * 
 * Flow:
 * 1. Acquire distributed lock for ticketId
 * 2. Check idempotency (already minted?)
 * 3. Update ticket status to 'MINTING'
 * 4. Call MetaplexService.mintNFT() - real blockchain transaction
 * 5. Wait for 'finalized' confirmation via TransactionConfirmationService
 * 6. ONLY after confirmation: update DB with real signature, tokenId, slot
 * 7. Mark ticket as 'MINTED' with real on-chain data
 * 8. If confirmation fails: mark as 'MINT_FAILED', do NOT write fake data
 * 9. Release distributed lock
 */

// Configure circuit breaker for metaplex operations
configureCircuit('metaplex-mint', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000 // 1 minute
});

// Types
interface MintJobData {
  ticketId: string;
  tenantId: string;
  userId: string;
  eventId: string;
  metadata: NFTMetadataInput;
  idempotencyKey?: string;
  timestamp?: string;
}

interface NFTMetadataInput {
  name: string;
  symbol?: string;
  description?: string;
  image: string;
  eventName?: string;
  eventDate?: string;
  venue?: string;
  tier?: string;
  seatNumber?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}

interface MintResult {
  success: boolean;
  tokenId: string;
  transactionId: string;
  signature: string;
  slot: number;
  metadataUri: string;
  mintAddress: string;
  timestamp: string;
  alreadyMinted?: boolean;
}

interface ExistingMintRecord {
  id: string;
  ticket_id: string;
  tenant_id: string;
  status: 'pending' | 'minting' | 'completed' | 'failed';
  transaction_signature?: string;
  mint_address?: string;
  metadata_uri?: string;
  slot?: number;
}

// Distributed lock TTL for minting operations (60 seconds - minting can take time)
const MINT_LOCK_TTL_MS = 60000;

export class MintQueue extends BaseQueue {
  private db: Pool;
  private metaplexService: MetaplexService | null = null;
  private confirmationService: TransactionConfirmationService | null = null;
  private rpcFailover: RPCFailoverService | null = null;
  private initialized: boolean = false;

  constructor() {
    super('nft-minting', {
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000 // Start with 5 seconds, exponential backoff
        },
        removeOnComplete: 50,
        removeOnFail: 100
      }
    });

    this.db = new Pool(config.database);
    this.setupProcessor();
  }

  /**
   * Initialize blockchain services lazily
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    // Get wallet keypair from secrets/config
    const walletKey = process.env.TREASURY_WALLET_KEY;
    if (!walletKey) {
      throw WalletError.notInitialized();
    }

    let authority: Keypair;
    try {
      // Try as JSON array first (most common in env vars)
      try {
        const keyArray = JSON.parse(walletKey);
        authority = Keypair.fromSecretKey(Uint8Array.from(keyArray));
      } catch {
        // Try to decode as base58 (standard Solana format)
        // Note: base58 decoding typically needs the bs58 library
        // For now, assume JSON array format is required
        throw new Error('Wallet key must be JSON array format');
      }
    } catch (error: any) {
      throw new WalletError(
        `Invalid wallet key format: ${error.message}`,
        ErrorCode.WALLET_NOT_INITIALIZED,
        503,
        { hint: 'Set TREASURY_WALLET_KEY as JSON array format' }
      );
    }

    // Initialize RPC failover with primary + fallback URLs
    const rpcUrls = [config.solana.rpcUrl, ...config.solana.rpcFallbackUrls];
    this.rpcFailover = new RPCFailoverService({
      endpoints: rpcUrls,
      commitment: config.solana.commitment,
      timeout: 30000,
      maxFailures: 3
    });

    // Initialize services
    const connection = this.rpcFailover.getConnection();
    this.metaplexService = new MetaplexService(connection, authority);
    this.confirmationService = new TransactionConfirmationService(connection);
    this.initialized = true;

    logger.info('MintQueue blockchain services initialized', {
      authority: authority.publicKey.toString(),
      rpcEndpoints: rpcUrls.length,
      network: config.solana.network
    });
  }

  /**
   * Setup the Bull queue processor
   */
  setupProcessor(): void {
    const concurrency = queueConfig.queues['nft-minting']?.concurrency || 3;

    this.queue.process(concurrency, async (job: Job<MintJobData>) => {
      const { ticketId, tenantId, userId, eventId, metadata } = job.data;
      const startTime = Date.now();

      logger.info('Processing mint job', {
        jobId: job.id,
        ticketId,
        tenantId,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts
      });

      try {
        // Ensure blockchain services are initialized
        await this.ensureInitialized();

        // DISTRIBUTED LOCK - prevent concurrent mints for same ticket
        const lockKey = createMintLockKey(tenantId, ticketId);
        
        const result = await withLock(lockKey, MINT_LOCK_TTL_MS, async () => {
          return this.executeMint(job, { ticketId, tenantId, userId, eventId, metadata });
        });

        const duration = Date.now() - startTime;
        blockchainMetrics.recordQueueJob('nft-minting', 'completed', duration);

        logger.info('Mint job completed successfully', {
          jobId: job.id,
          ticketId,
          signature: result.signature,
          mintAddress: result.mintAddress,
          durationMs: duration
        });

        return result;

      } catch (error: any) {
        const duration = Date.now() - startTime;
        blockchainMetrics.recordQueueJob('nft-minting', 'failed', duration);

        logger.error('Mint job failed', {
          jobId: job.id,
          ticketId,
          tenantId,
          error: error.message,
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts,
          durationMs: duration
        });

        // Update job status if final attempt
        if (job.attemptsMade >= (job.opts.attempts || 1) - 1) {
          await this.markMintFailed(ticketId, tenantId, error.message);
        }

        throw error;
      }
    });
  }

  /**
   * Execute the actual mint operation (called within distributed lock)
   * 
   * AUDIT FIX #89: Blockchain-first pattern - confirm on-chain THEN update DB
   */
  private async executeMint(
    job: Job<MintJobData>,
    data: { ticketId: string; tenantId: string; userId: string; eventId: string; metadata: NFTMetadataInput }
  ): Promise<MintResult> {
    const { ticketId, tenantId, userId, eventId, metadata } = data;

    // Step 1: Check idempotency - already minted?
    job.progress(5);
    const existingMint = await this.checkExistingMint(ticketId, tenantId);
    
    if (existingMint) {
      if (existingMint.status === 'completed') {
        logger.info('Ticket already minted (idempotent return)', {
          ticketId,
          tenantId,
          mintAddress: existingMint.mint_address
        });
        return {
          success: true,
          alreadyMinted: true,
          tokenId: existingMint.mint_address || '',
          transactionId: existingMint.transaction_signature || '',
          signature: existingMint.transaction_signature || '',
          slot: existingMint.slot || 0,
          metadataUri: existingMint.metadata_uri || '',
          mintAddress: existingMint.mint_address || '',
          timestamp: new Date().toISOString()
        };
      }
      
      if (existingMint.status === 'minting') {
        // Another process has the lock - shouldn't happen with distributed lock
        throw MintingError.inProgress(ticketId);
      }
      // Status is 'pending' or 'failed' - proceed with retry
    }

    // Step 2: Mark as MINTING in DB (status tracking only)
    job.progress(10);
    await this.updateMintStatus(ticketId, tenantId, 'minting');

    // Step 3: Prepare NFT metadata
    job.progress(15);
    const nftMetadata = {
      name: metadata.name || `${metadata.eventName || 'Event'} - ${metadata.tier || 'General'}`,
      symbol: metadata.symbol || 'TKTK',
      description: metadata.description || `Ticket for ${metadata.eventName || 'event'}`,
      image: metadata.image,
      attributes: [
        ...(metadata.attributes || []),
        { trait_type: 'Event', value: metadata.eventName || eventId },
        { trait_type: 'Tier', value: metadata.tier || 'General' },
        ...(metadata.venue ? [{ trait_type: 'Venue', value: metadata.venue }] : []),
        ...(metadata.seatNumber ? [{ trait_type: 'Seat', value: metadata.seatNumber }] : []),
        ...(metadata.eventDate ? [{ trait_type: 'Date', value: metadata.eventDate }] : []),
      ]
    };

    // Step 4: Execute REAL blockchain mint via circuit breaker
    job.progress(30);
    logger.info('Executing blockchain mint', {
      ticketId,
      tenantId,
      metadataName: nftMetadata.name
    });

    // AUDIT FIX #86: Real MetaplexService.mintNFT() call with circuit breaker
    const mintResult = await withCircuitBreaker('metaplex-mint', async () => {
      if (!this.metaplexService) {
        throw new SolanaError(
          'MetaplexService not initialized',
          ErrorCode.SOLANA_RPC_UNAVAILABLE,
          503
        );
      }

      return this.metaplexService.mintNFT({
        metadata: nftMetadata,
        creators: [
          {
            address: this.metaplexService.getAuthorityPublicKey().toString(),
            share: 100
          }
        ],
        sellerFeeBasisPoints: 500, // 5% royalty
      });
    });

    job.progress(60);

    // Step 5: Wait for FINALIZED confirmation
    // AUDIT FIX #89: Must confirm on-chain BEFORE writing to DB
    logger.info('Waiting for transaction confirmation', {
      ticketId,
      signature: mintResult.transactionSignature
    });

    const confirmation = await this.confirmationService!.confirmTransaction(
      mintResult.transactionSignature,
      {
        commitment: 'finalized', // CRITICAL: Must be finalized, not just confirmed
        timeout: 60000 // 60 second timeout
      }
    );

    job.progress(80);

    if (!confirmation.confirmed) {
      // Transaction failed - mark as failed but DON'T write fake data
      await this.updateMintStatus(ticketId, tenantId, 'failed', confirmation.err?.toString());
      throw new SolanaError(
        'Transaction confirmation failed',
        ErrorCode.SOLANA_CONFIRMATION_TIMEOUT,
        504,
        {
          ticketId,
          signature: mintResult.transactionSignature,
          error: confirmation.err
        }
      );
    }

    // Step 6: ONLY after finalized confirmation - update DB with REAL on-chain data
    // AUDIT FIX #87: Write real data, not fake
    job.progress(90);
    logger.info('Transaction finalized, updating database', {
      ticketId,
      signature: mintResult.transactionSignature,
      slot: confirmation.slot,
      mintAddress: mintResult.mintAddress
    });

    await this.saveMintRecord(
      ticketId,
      tenantId,
      {
        signature: mintResult.transactionSignature,
        mintAddress: mintResult.mintAddress,
        metadataUri: mintResult.metadataUri,
        slot: confirmation.slot || 0
      }
    );

    job.progress(100);

    return {
      success: true,
      tokenId: mintResult.mintAddress,
      transactionId: mintResult.transactionSignature,
      signature: mintResult.transactionSignature,
      slot: confirmation.slot || 0,
      metadataUri: mintResult.metadataUri,
      mintAddress: mintResult.mintAddress,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check for existing mint record (idempotency)
   */
  private async checkExistingMint(ticketId: string, tenantId: string): Promise<ExistingMintRecord | null> {
    const result = await this.db.query(`
      SELECT id, ticket_id, tenant_id, status, transaction_signature, 
             mint_address, metadata_uri, slot_number as slot
      FROM blockchain_transactions
      WHERE ticket_id = $1 AND tenant_id = $2 AND type = 'MINT'
      ORDER BY created_at DESC
      LIMIT 1
    `, [ticketId, tenantId]);

    if (result.rows.length > 0) {
      return result.rows[0] as ExistingMintRecord;
    }

    return null;
  }

  /**
   * Helper to create request context for service client calls
   */
  private createRequestContext(tenantId: string): RequestContext {
    return {
      tenantId,
      traceId: `mint-queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  /**
   * Update mint status in DB
   * PHASE 5c REFACTORED: Uses ticketServiceClient for ticket status updates
   */
  private async updateMintStatus(
    ticketId: string, 
    tenantId: string, 
    status: 'pending' | 'minting' | 'completed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    const ctx = this.createRequestContext(tenantId);

    // Update or insert blockchain_transactions record - blockchain-service owned
    await this.db.query(`
      INSERT INTO blockchain_transactions (
        ticket_id, tenant_id, type, status, error_message, created_at, updated_at
      ) VALUES ($1, $2, 'MINT', $3, $4, NOW(), NOW())
      ON CONFLICT (ticket_id, tenant_id, type)
      DO UPDATE SET
        status = EXCLUDED.status,
        error_message = EXCLUDED.error_message,
        updated_at = NOW()
    `, [ticketId, tenantId, status.toUpperCase(), errorMessage || null]);

    // Update ticket status via ticketServiceClient
    const ticketStatus = status === 'minting' ? 'MINTING' : 
                        status === 'completed' ? 'MINTED' :
                        status === 'failed' ? 'MINT_FAILED' : 'PENDING';
    
    try {
      // REFACTORED: Use ticketServiceClient instead of direct UPDATE
      await ticketServiceClient.updateStatus(ticketId, ticketStatus, ctx);
      logger.info('Updated ticket status via service', { ticketId, status: ticketStatus });
    } catch (serviceError: any) {
      logger.warn('Failed to update ticket status via service, using fallback', {
        ticketId,
        status: ticketStatus,
        error: serviceError.message
      });
      // Fallback to direct update for backward compatibility
      await this.db.query(`
        UPDATE tickets
        SET status = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
      `, [ticketStatus, ticketId, tenantId]);
    }
  }

  /**
   * Save successful mint record to DB
   * AUDIT FIX #87 & #89: Only called AFTER on-chain confirmation
   * PHASE 5c REFACTORED: Uses ticketServiceClient for ticket NFT updates
   */
  private async saveMintRecord(
    ticketId: string,
    tenantId: string,
    data: {
      signature: string;
      mintAddress: string;
      metadataUri: string;
      slot: number;
    }
  ): Promise<void> {
    const ctx = this.createRequestContext(tenantId);

    // Update blockchain_transactions with real on-chain data - blockchain-service owned
    await this.db.query(`
      INSERT INTO blockchain_transactions (
        ticket_id, tenant_id, type, status, 
        transaction_signature, mint_address, metadata_uri, slot_number,
        created_at, updated_at
      ) VALUES ($1, $2, 'MINT', 'CONFIRMED', $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (ticket_id, tenant_id, type)
      DO UPDATE SET
        status = 'CONFIRMED',
        transaction_signature = EXCLUDED.transaction_signature,
        mint_address = EXCLUDED.mint_address,
        metadata_uri = EXCLUDED.metadata_uri,
        slot_number = EXCLUDED.slot_number,
        error_message = NULL,
        updated_at = NOW()
    `, [ticketId, tenantId, data.signature, data.mintAddress, data.metadataUri, data.slot]);

    // REFACTORED: Update ticket with real NFT data via ticketServiceClient
    try {
      await ticketServiceClient.updateNft(ticketId, {
        nftMintAddress: data.mintAddress,
        metadataUri: data.metadataUri,
        nftTransferSignature: data.signature,
        isMinted: true,
        mintedAt: new Date().toISOString(),
      }, ctx);
      
      // Also update status to SOLD
      await ticketServiceClient.updateStatus(ticketId, 'SOLD', ctx);

      logger.info('Mint record saved via service client', {
        ticketId,
        tenantId,
        signature: data.signature,
        mintAddress: data.mintAddress,
        slot: data.slot
      });
    } catch (serviceError: any) {
      logger.warn('Failed to update ticket via service client, using fallback', {
        ticketId,
        error: serviceError.message
      });
      
      // Fallback to direct update for backward compatibility
      await this.db.query(`
        UPDATE tickets
        SET
          is_minted = true,
          is_nft = true,
          token_id = $1,
          mint_transaction_id = $2,
          mint_address = $3,
          status = 'SOLD',
          updated_at = NOW()
        WHERE id = $4 AND tenant_id = $5
      `, [data.mintAddress, data.signature, data.mintAddress, ticketId, tenantId]);

      logger.info('Mint record saved to database (fallback)', {
        ticketId,
        tenantId,
        signature: data.signature,
        mintAddress: data.mintAddress,
        slot: data.slot
      });
    }
  }

  /**
   * Mark mint as failed (final failure)
   */
  private async markMintFailed(ticketId: string, tenantId: string, errorMessage: string): Promise<void> {
    try {
      await this.updateMintStatus(ticketId, tenantId, 'failed', errorMessage);
      logger.warn('Mint marked as failed', {
        ticketId,
        tenantId,
        error: errorMessage
      });
    } catch (error) {
      logger.error('Failed to update mint status to failed', {
        ticketId,
        tenantId,
        originalError: errorMessage,
        updateError: (error as Error).message
      });
    }
  }

  /**
   * Public method to add a minting job
   * 
   * Uses deterministic job ID based on ticketId + tenantId for idempotency
   */
  async addMintJob(
    ticketId: string, 
    tenantId: string,
    userId: string, 
    eventId: string, 
    metadata: NFTMetadataInput, 
    options: JobOptions = {}
  ): Promise<any> {
    // Validate inputs
    if (!ticketId || !tenantId || !userId || !eventId) {
      throw ValidationError.missingField('ticketId, tenantId, userId, or eventId');
    }

    // Generate deterministic job ID for idempotency
    const idempotencyKey = `${tenantId}:${ticketId}`;
    const jobId = `mint:${idempotencyKey}`;

    logger.info('Adding mint job to queue', {
      jobId,
      ticketId,
      tenantId,
      userId,
      eventId
    });

    return await this.addJob({
      ticketId,
      tenantId,
      userId,
      eventId,
      metadata,
      idempotencyKey,
      timestamp: new Date().toISOString()
    }, {
      ...options,
      jobId // Deterministic job ID for Bull's built-in deduplication
    });
  }

  /**
   * Get mint status for a ticket
   */
  async getMintStatus(ticketId: string, tenantId: string): Promise<ExistingMintRecord | null> {
    return this.checkExistingMint(ticketId, tenantId);
  }

  /**
   * Cleanup resources
   */
  async close(): Promise<void> {
    this.rpcFailover?.stop();
    await this.db.end();
    await super.close();
  }
}

export default MintQueue;
