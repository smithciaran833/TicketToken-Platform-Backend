import { getConnection, getWallet } from '../config/solana';
import { getPool } from '../config/database';
import { uploadToIPFS, TicketMetadata } from './MetadataService';
import { Connection, Keypair } from '@solana/web3.js';
import { RealCompressedNFT } from './RealCompressedNFT';
import { MintingBlockchainService, TicketBlockchainData } from './blockchain.service';
import { getDASClient } from './DASClient';
import logger from '../utils/logger';
import { checkWalletBalance } from '../utils/solana';
import { checkSpendingLimits, recordSpending } from '../utils/spending-limits';
import { withLock, createMintLockKey } from '../utils/distributed-lock';
import {
  mintsTotal,
  mintsSuccessTotal,
  mintsFailedTotal,
  mintDuration,
  ipfsUploadDuration,
  walletBalanceSOL
} from '../utils/metrics';
// Phase 5c: Service clients to replace direct DB queries
import { eventServiceClient, ticketServiceClient } from '@tickettoken/shared/clients';
import type { RequestContext } from '@tickettoken/shared/http-client/base-service-client';

// Distributed lock TTL for minting operations (30 seconds)
const MINT_LOCK_TTL_MS = 30000;

/**
 * Create RequestContext for service client calls
 */
function createRequestContext(tenantId: string, userId?: string): RequestContext {
  return {
    tenantId,
    userId: userId || 'system',
    traceId: `mint-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  };
}

interface TicketData {
  ticketId: string;
  orderId: string;
  eventId: string;
  tenantId: string;
  userId?: string;
  ownerAddress?: string;
  metadata?: {
    eventName?: string;
    eventDate?: string;
    venue?: string;
    tier?: string;
    seatNumber?: string;
    image?: string;
  };
}

interface MintResult {
  success: boolean;
  ticketId: string;
  signature: string;
  mintAddress: string;
  metadataUri: string;
  assetId?: string;
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
  asset_id?: string;
  retry_count?: number;
}

interface MintRecord {
  ticketId: string;
  tenantId: string;
  signature: string;
  mintAddress: string;
  metadataUri: string;
  assetId?: string;
}

export class MintingOrchestrator {
  private connection: Connection | null = null;
  private wallet: Keypair | null = null;
  private nftService: RealCompressedNFT;
  private blockchainService: MintingBlockchainService;
  private initialized: boolean = false;

  constructor() {
    this.nftService = new RealCompressedNFT();
    this.blockchainService = new MintingBlockchainService();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    this.connection = getConnection();
    this.wallet = getWallet();
    await this.nftService.initialize();
    this.initialized = true;

    logger.info('MintingOrchestrator initialized');
  }

  async mintCompressedNFT(ticketData: TicketData): Promise<MintResult> {
    await this.ensureInitialized();

    const { ticketId, tenantId } = ticketData;

    // ===== DISTRIBUTED LOCK =====
    // Acquire lock to prevent concurrent mints for the same ticket
    const lockKey = createMintLockKey(tenantId, ticketId);

    logger.info(`Acquiring distributed lock for mint: ${lockKey}`, {
      tenantId,
      ticketId
    });

    return withLock(lockKey, MINT_LOCK_TTL_MS, async () => {
      return this.executeMint(ticketData);
    });
  }

  /**
   * Execute the actual mint operation (called within distributed lock)
   */
  private async executeMint(ticketData: TicketData): Promise<MintResult> {
    const endTimer = mintDuration.startTimer({ tenant_id: ticketData.tenantId });
    const { ticketId, orderId, tenantId, ownerAddress, metadata } = ticketData;

    logger.info(`Starting compressed NFT mint for ticket ${ticketId}`, {
      tenantId,
      ticketId,
      orderId
    });

    // ===== IDEMPOTENCY CHECK =====
    // Check for existing mint record before starting (within the lock)
    const existingMint = await this.checkExistingMint(ticketId, tenantId);
    
    if (existingMint) {
      if (existingMint.status === 'completed') {
        logger.info(`Mint already completed for ticket ${ticketId}, returning cached result`, {
          ticketId,
          tenantId,
          signature: existingMint.transaction_signature
        });
        endTimer();
        return {
          success: true,
          ticketId,
          signature: existingMint.transaction_signature || '',
          mintAddress: existingMint.mint_address || '',
          metadataUri: existingMint.metadata_uri || '',
          assetId: existingMint.asset_id,
          alreadyMinted: true
        };
      }
      
      if (existingMint.status === 'minting') {
        // This shouldn't happen with distributed lock, but handle gracefully
        logger.warn(`Mint already in progress for ticket ${ticketId}`, {
          ticketId,
          tenantId,
          existingId: existingMint.id
        });
        endTimer();
        throw new Error(`Mint already in progress for ticket ${ticketId}. Please wait for completion.`);
      }
      
      // Status is 'pending' or 'failed' - can proceed with retry
      logger.info(`Retrying mint for ticket ${ticketId} (previous status: ${existingMint.status})`, {
        ticketId,
        tenantId,
        retryCount: existingMint.retry_count
      });
    }

    mintsTotal.inc({ status: 'started', tenant_id: tenantId });

    try {
      // Mark as minting before starting (DB-level protection)
      await this.markMintingStarted(ticketId, tenantId);
      
      // 1. Check wallet balance before minting
      const minBalance = parseFloat(process.env.MIN_SOL_BALANCE || '0.1');
      const balanceCheck = await checkWalletBalance(
        this.connection!,
        this.wallet!.publicKey,
        minBalance
      );

      walletBalanceSOL.set(balanceCheck.balance);

      if (!balanceCheck.sufficient) {
        mintsFailedTotal.inc({ reason: 'insufficient_balance', tenant_id: tenantId });
        throw new Error(
          `Insufficient wallet balance: ${balanceCheck.balance} SOL (minimum: ${minBalance} SOL). ` +
          'Please fund the wallet before minting.'
        );
      }

      // 2. Prepare and upload metadata to IPFS
      const metadataUri = await this.prepareAndUploadMetadata(ticketData);

      // 3. Mint the compressed NFT using RealCompressedNFT
      const mintResult = await this.nftService.mintNFT({
        ticketId,
        ownerAddress,
        metadata: {
          name: metadata?.eventName
            ? `${metadata.eventName} - ${metadata.tier || 'General'}`
            : `Ticket #${ticketId}`,
          uri: metadataUri
        }
      });

      // Generate asset ID from merkle tree + ticket
      const assetId = `${mintResult.merkleTree}:${ticketId}`;
      const mintAddress = mintResult.merkleTree;

      // 4. Save to database
      await this.saveMintRecord({
        ticketId,
        tenantId,
        signature: mintResult.signature,
        mintAddress,
        metadataUri,
        assetId
      });

      // 5. Register ticket on blockchain
      if (ticketData.userId) {
        try {
          // Phase 5c: Use eventServiceClient instead of direct DB query
          const ctx = createRequestContext(tenantId, ticketData.userId);
          const eventPdaResponse = await eventServiceClient.getEventPda(ticketData.eventId, ctx);

          if (eventPdaResponse.hasBlockchainConfig && eventPdaResponse.blockchain.eventPda) {
            const eventPda = eventPdaResponse.blockchain.eventPda;

            const blockchainData: TicketBlockchainData = {
              eventPda,
              ticketId: parseInt(ticketId, 10),
              nftAssetId: assetId,
              ownerId: ticketData.userId,
            };

            const blockchainResult = await this.blockchainService.registerTicketOnChain(blockchainData);

            // Phase 5c: Use ticketServiceClient instead of direct DB query
            await ticketServiceClient.updateNft(ticketId, {
              nftMintAddress: blockchainResult.ticketPda,
              // Note: ticket_pda stored in mint address field; event_pda tracked via eventId
              isMinted: true,
              mintedAt: new Date().toISOString(),
            }, ctx);

            logger.info(`Ticket ${ticketId} registered on blockchain`, {
              ticketId,
              ticketPda: blockchainResult.ticketPda,
              signature: blockchainResult.signature,
            });
          } else {
            logger.warn(`Event ${ticketData.eventId} has no event_pda, skipping blockchain registration`, {
              ticketId,
              eventId: ticketData.eventId,
            });
          }
        } catch (blockchainError) {
          logger.error(`Failed to register ticket ${ticketId} on blockchain`, {
            ticketId,
            error: blockchainError instanceof Error ? blockchainError.message : String(blockchainError),
          });

          // Phase 5c: Use ticketServiceClient for failure update
          try {
            const ctx = createRequestContext(tenantId, ticketData.userId);
            await ticketServiceClient.updateNft(ticketId, {
              isMinted: false, // Mark as failed/not minted
            }, ctx);
          } catch (updateError) {
            logger.error(`Failed to update ticket ${ticketId} blockchain status`, {
              ticketId,
              error: updateError instanceof Error ? updateError.message : String(updateError),
            });
          }
        }
      } else {
        logger.warn(`Ticket ${ticketId} has no userId, skipping blockchain registration`);
      }

      mintsSuccessTotal.inc({ tenant_id: tenantId });
      mintsTotal.inc({ status: 'completed', tenant_id: tenantId });
      endTimer();

      logger.info(`Mint successful for ticket ${ticketId}`, {
        signature: mintResult.signature,
        merkleTree: mintResult.merkleTree,
        assetId
      });

      // 6. Verify minted asset via DAS (async, non-blocking)
      // This helps catch issues with indexing or ownership
      this.verifyMintedAsset(assetId, ownerAddress || this.wallet!.publicKey.toString())
        .catch(err => {
          logger.warn('Post-mint verification failed (non-blocking)', {
            assetId,
            error: err.message
          });
        });

      return {
        success: true,
        ticketId,
        signature: mintResult.signature,
        mintAddress,
        metadataUri,
        assetId
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      const reason = this.categorizeError(errorMessage);
      mintsFailedTotal.inc({ reason, tenant_id: tenantId });
      mintsTotal.inc({ status: 'failed', tenant_id: tenantId });
      endTimer();

      logger.error(`Mint failed for ticket ${ticketId}`, {
        error: errorMessage,
        stack: (error as Error).stack
      });
      throw error;
    }
  }

  /**
   * Check for existing mint record (idempotency check)
   */
  private async checkExistingMint(ticketId: string, tenantId: string): Promise<ExistingMintRecord | null> {
    const pool = getPool();
    
    try {
      const result = await pool.query(`
        SELECT id, ticket_id, tenant_id, status, transaction_signature, 
               mint_address, metadata_uri, asset_id, retry_count
        FROM nft_mints
        WHERE ticket_id = $1 AND tenant_id = $2
      `, [ticketId, tenantId]);

      if (result.rows.length > 0) {
        return result.rows[0] as ExistingMintRecord;
      }
      
      return null;
    } catch (error) {
      // If table doesn't exist yet, treat as no existing record
      if ((error as Error).message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Mark mint as started (prevents concurrent mints)
   */
  private async markMintingStarted(ticketId: string, tenantId: string): Promise<void> {
    const pool = getPool();
    
    try {
      // Ensure table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS nft_mints (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          ticket_id VARCHAR(255) NOT NULL,
          tenant_id VARCHAR(255) NOT NULL,
          transaction_signature VARCHAR(255),
          mint_address VARCHAR(255),
          asset_id VARCHAR(255),
          metadata_uri TEXT,
          merkle_tree VARCHAR(255),
          retry_count INTEGER DEFAULT 0,
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(ticket_id, tenant_id)
        )
      `);

      // Insert or update to 'minting' status
      await pool.query(`
        INSERT INTO nft_mints (ticket_id, tenant_id, status, created_at, updated_at)
        VALUES ($1, $2, 'minting', NOW(), NOW())
        ON CONFLICT (ticket_id, tenant_id)
        DO UPDATE SET
          status = 'minting',
          retry_count = nft_mints.retry_count + 1,
          updated_at = NOW()
        WHERE nft_mints.status != 'minting'
      `, [ticketId, tenantId]);

      logger.debug(`Marked mint as started for ticket ${ticketId}`, { ticketId, tenantId });
    } catch (error) {
      logger.error(`Failed to mark mint as started`, {
        ticketId,
        tenantId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  private categorizeError(errorMessage: string): string {
    if (errorMessage.includes('Insufficient wallet balance')) return 'insufficient_balance';
    if (errorMessage.includes('IPFS')) return 'ipfs_upload_failed';
    if (errorMessage.includes('Transaction failed')) return 'transaction_failed';
    if (errorMessage.includes('timeout')) return 'timeout';
    if (errorMessage.includes('Bubblegum')) return 'bubblegum_error';
    return 'unknown';
  }

  private async prepareAndUploadMetadata(ticketData: TicketData): Promise<string> {
    const endTimer = ipfsUploadDuration.startTimer();

    try {
      const ticketMetadata: TicketMetadata = {
        ticketId: ticketData.ticketId,
        orderId: ticketData.orderId,
        eventId: ticketData.eventId,
        eventName: ticketData.metadata?.eventName,
        eventDate: ticketData.metadata?.eventDate,
        venue: ticketData.metadata?.venue,
        tier: ticketData.metadata?.tier,
        seatNumber: ticketData.metadata?.seatNumber,
        image: ticketData.metadata?.image
      };

      const result = await uploadToIPFS(ticketMetadata);
      endTimer();
      return result;
    } catch (error) {
      endTimer();
      throw error;
    }
  }

  private async saveMintRecord(mintData: MintRecord): Promise<void> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // nft_mints table is owned by minting-service - OK to query directly
      await client.query(`
        CREATE TABLE IF NOT EXISTS nft_mints (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          ticket_id VARCHAR(255) NOT NULL,
          tenant_id VARCHAR(255) NOT NULL,
          transaction_signature VARCHAR(255),
          mint_address VARCHAR(255),
          asset_id VARCHAR(255),
          metadata_uri TEXT,
          merkle_tree VARCHAR(255),
          retry_count INTEGER DEFAULT 0,
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(ticket_id, tenant_id)
        )
      `);

      const query = `
        INSERT INTO nft_mints (
          ticket_id,
          tenant_id,
          transaction_signature,
          mint_address,
          asset_id,
          metadata_uri,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (ticket_id, tenant_id)
        DO UPDATE SET
          transaction_signature = EXCLUDED.transaction_signature,
          mint_address = EXCLUDED.mint_address,
          asset_id = EXCLUDED.asset_id,
          metadata_uri = EXCLUDED.metadata_uri,
          status = EXCLUDED.status,
          updated_at = NOW()
      `;

      await client.query(query, [
        mintData.ticketId,
        mintData.tenantId,
        mintData.signature,
        mintData.mintAddress,
        mintData.assetId || null,
        mintData.metadataUri,
        'completed'
      ]);

      await client.query('COMMIT');
      
      // Phase 5c: Use ticketServiceClient instead of direct DB query for tickets table
      // This is done outside the transaction since it's a separate service
      const ctx = createRequestContext(mintData.tenantId);
      await ticketServiceClient.updateNft(mintData.ticketId, {
        nftMintAddress: mintData.mintAddress,
        nftTransferSignature: mintData.signature,
        metadataUri: mintData.metadataUri,
        isMinted: true,
        mintedAt: new Date().toISOString(),
      }, ctx);

      logger.info(`Saved mint record for ticket ${mintData.ticketId}`);

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Failed to save mint record`, {
        ticketId: mintData.ticketId,
        error: (error as Error).message
      });
      throw error;
    } finally {
      client.release();
    }
  }

  getMerkleTreeAddress(): string | null {
    return this.nftService.getMerkleTreeAddress();
  }

  getCollectionAddress(): string | null {
    return this.nftService.getCollectionAddress();
  }

  // ===========================================================================
  // POST-MINT VERIFICATION
  // ===========================================================================

  /**
   * Verify a minted asset exists and has correct ownership
   * Called asynchronously after successful mint to catch indexing issues
   * 
   * @param assetId - The asset ID to verify
   * @param expectedOwner - The expected owner address
   */
  private async verifyMintedAsset(assetId: string, expectedOwner: string): Promise<void> {
    // Wait for indexing (DAS may take a few seconds to pick up new assets)
    const INDEXING_DELAY_MS = parseInt(process.env.DAS_INDEXING_DELAY || '3000');
    await new Promise(resolve => setTimeout(resolve, INDEXING_DELAY_MS));

    try {
      const dasClient = getDASClient();
      
      // Check if asset exists
      const exists = await dasClient.assetExists(assetId);
      
      if (!exists) {
        logger.warn('Minted asset not found in DAS (may need more indexing time)', {
          assetId,
          expectedOwner,
          delayMs: INDEXING_DELAY_MS
        });
        return;
      }

      // Verify ownership
      const isOwner = await dasClient.verifyOwnership(assetId, expectedOwner);
      
      if (!isOwner) {
        logger.error('CRITICAL: Minted asset ownership mismatch!', {
          assetId,
          expectedOwner,
          alert: true
        });
        
        // This is a critical error - the asset was minted to the wrong address
        // In production, this should trigger an alert
        return;
      }

      // Get full asset details for logging
      const asset = await dasClient.getAsset(assetId);
      
      logger.info('Post-mint verification successful', {
        assetId,
        owner: asset.ownership.owner,
        compressed: asset.compression?.compressed,
        tree: asset.compression?.tree,
        leafIndex: asset.compression?.leaf_index,
        name: asset.content?.metadata?.name
      });

    } catch (error: unknown) {
      const err = error as Error;
      // Don't throw - this is a non-blocking verification
      logger.warn('Post-mint verification error (non-blocking)', {
        assetId,
        expectedOwner,
        error: err.message
      });
    }
  }
}
