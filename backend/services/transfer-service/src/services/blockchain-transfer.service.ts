import { Pool, PoolClient } from 'pg';
import { nftService } from './nft.service';
import logger from '../utils/logger';
import { retryBlockchainOperation, pollForConfirmation } from '../utils/blockchain-retry';
import { blockchainMetrics } from '../utils/blockchain-metrics';
import { ticketServiceClient, RequestContext } from '@tickettoken/shared';

/**
 * BLOCKCHAIN TRANSFER SERVICE
 * 
 * Integrates blockchain NFT transfers with database transfers
 * Enhanced with retry logic and transaction confirmation
 * 
 * AUDIT FIX IDP-4: Added deduplication check before blockchain transfer
 * 
 * PHASE 5c REFACTORED:
 * - Replaced direct tickets table UPDATE with ticketServiceClient.updateNft()
 * - Replaced direct tickets table SELECT with ticketServiceClient.getTicketFull()
 */

/**
 * Helper to create request context for service calls
 */
function createRequestContext(tenantId: string = 'system'): RequestContext {
  return {
    tenantId,
    traceId: `blockchain-transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

export interface BlockchainTransferParams {
  transferId: string;
  ticketId: string;
  fromWallet: string;
  toWallet: string;
  nftMintAddress: string;
  tenantId?: string;
}

export interface BlockchainTransferResult {
  success: boolean;
  signature?: string;
  explorerUrl?: string;
  error?: string;
}

export class BlockchainTransferService {
  constructor(private readonly pool: Pool) {}

  /**
   * Execute blockchain transfer and update database with retry logic
   * 
   * REFACTORED: Uses ticketServiceClient to update ticket NFT info
   */
  async executeBlockchainTransfer(
    params: BlockchainTransferParams
  ): Promise<BlockchainTransferResult> {
    const { transferId, ticketId, fromWallet, toWallet, nftMintAddress, tenantId } = params;
    const startTime = Date.now();
    const ctx = createRequestContext(tenantId);
    const client = await this.pool.connect();

    try {
      logger.info('Starting blockchain transfer', {
        transferId,
        ticketId,
        nftMintAddress
      });

      // AUDIT FIX IDP-4: Check if transfer already has blockchain signature (duplicate check)
      const existingTransfer = await this.checkExistingBlockchainTransfer(client, transferId);
      
      if (existingTransfer.alreadyExecuted) {
        logger.warn('Blockchain transfer already executed - returning existing result', {
          transferId,
          existingSignature: existingTransfer.signature
        });
        
        return {
          success: true,
          signature: existingTransfer.signature,
          explorerUrl: existingTransfer.explorerUrl
        };
      }

      if (existingTransfer.inProgress) {
        logger.warn('Blockchain transfer already in progress', { transferId });
        throw new Error('TRANSFER_IN_PROGRESS: Another blockchain transfer is in progress for this transfer');
      }

      // Mark transfer as in-progress to prevent duplicate execution
      await this.markBlockchainTransferInProgress(client, transferId);

      // Verify NFT ownership before transfer with retry
      const isOwner = await retryBlockchainOperation(
        () => nftService.verifyOwnership(nftMintAddress, fromWallet),
        'NFT ownership verification',
        { maxAttempts: 2 }
      );

      if (!isOwner) {
        blockchainMetrics.recordTransferFailure('ownership_verification_failed');
        throw new Error('NFT ownership verification failed');
      }

      // Execute NFT transfer on blockchain with retry
      const nftResult = await retryBlockchainOperation(
        () => nftService.transferNFT({
          mintAddress: nftMintAddress,
          fromWallet,
          toWallet
        }),
        'NFT transfer',
        { maxAttempts: 3 }
      );

      if (!nftResult.success) {
        blockchainMetrics.recordTransferFailure('blockchain_transfer_failed');
        throw new Error(nftResult.error || 'NFT transfer failed');
      }

      // Wait for transaction confirmation
      logger.info('Waiting for transaction confirmation', {
        signature: nftResult.signature
      });

      const confirmed = await pollForConfirmation(
        () => nftService.verifyOwnership(nftMintAddress, toWallet),
        {
          maxAttempts: 30,
          intervalMs: 2000,
          timeoutMs: 60000
        }
      );

      if (!confirmed) {
        logger.warn('Transaction not confirmed within timeout', {
          signature: nftResult.signature,
          transferId
        });
        // Continue anyway - transaction may still succeed
      }

      // Update database with blockchain transaction details - transfer_service owned table
      await client.query('BEGIN');

      await client.query(`
        UPDATE ticket_transfers
        SET 
          blockchain_signature = $1,
          blockchain_explorer_url = $2,
          blockchain_transferred_at = NOW(),
          blockchain_confirmed = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [nftResult.signature, nftResult.explorerUrl, confirmed, transferId]);

      // REFACTORED: Update ticket NFT metadata via ticketServiceClient
      try {
        await ticketServiceClient.updateNft(ticketId, {
          nftMintAddress: nftMintAddress,
          nftTransferSignature: nftResult.signature,
          walletAddress: toWallet,
        }, ctx);
      } catch (updateError) {
        logger.warn({ error: updateError, ticketId }, 'Failed to update ticket NFT via service client, falling back to local update');
        // Fallback to local table update for backward compatibility
        await client.query(`
          UPDATE tickets
          SET
            nft_mint_address = $1,
            nft_last_transfer_signature = $2,
            updated_at = NOW()
          WHERE id = $3
        `, [nftMintAddress, nftResult.signature, ticketId]);
      }

      await client.query('COMMIT');

      const duration = Date.now() - startTime;
      blockchainMetrics.recordTransferSuccess(duration);

      logger.info('Blockchain transfer completed successfully', {
        transferId,
        signature: nftResult.signature,
        explorerUrl: nftResult.explorerUrl,
        confirmed,
        durationMs: duration
      });

      return {
        success: true,
        signature: nftResult.signature,
        explorerUrl: nftResult.explorerUrl
      };

    } catch (error) {
      await client.query('ROLLBACK');
      const err = error as Error;
      const duration = Date.now() - startTime;
      
      blockchainMetrics.recordTransferFailure('unhandled_error');
      
      logger.error({ 
        err,
        transferId,
        durationMs: duration
      }, 'Blockchain transfer failed');

      // Store failed transfer for retry queue - transfer_service owned table
      try {
        await this.recordFailedTransfer(transferId, err.message);
      } catch (recordError) {
        logger.error({ err: recordError }, 'Failed to record failed transfer');
      }

      return {
        success: false,
        error: err.message
      };

    } finally {
      client.release();
    }
  }

  /**
   * Record failed transfer for potential retry - transfer_service owned table
   */
  private async recordFailedTransfer(transferId: string, errorMessage: string): Promise<void> {
    try {
      await this.pool.query(`
        INSERT INTO failed_blockchain_transfers (transfer_id, error_message, failed_at, retry_count)
        VALUES ($1, $2, NOW(), 0)
        ON CONFLICT (transfer_id) 
        DO UPDATE SET 
          error_message = $2,
          failed_at = NOW(),
          retry_count = failed_blockchain_transfers.retry_count + 1
      `, [transferId, errorMessage]);
    } catch (error) {
      logger.error({ err: error }, 'Failed to insert into failed_blockchain_transfers table');
    }
  }

  /**
   * Get blockchain transfer details - transfer_service owned table
   */
  async getBlockchainTransferDetails(transferId: string) {
    const result = await this.pool.query(`
      SELECT 
        blockchain_signature,
        blockchain_explorer_url,
        blockchain_transferred_at
      FROM ticket_transfers
      WHERE id = $1
    `, [transferId]);

    return result.rows[0] || null;
  }

  /**
   * Verify blockchain transfer status
   */
  async verifyBlockchainTransfer(
    nftMintAddress: string,
    expectedOwner: string
  ): Promise<boolean> {
    try {
      const actualOwner = await nftService.getNFTOwner(nftMintAddress);
      return actualOwner === expectedOwner;
    } catch (error) {
      logger.error({ err: error }, 'Failed to verify blockchain transfer');
      return false;
    }
  }

  /**
   * REFACTORED: Get NFT metadata for ticket
   * Uses ticketServiceClient to get ticket, then fetches NFT metadata
   */
  async getTicketNFTMetadata(ticketId: string, tenantId?: string) {
    const ctx = createRequestContext(tenantId);

    try {
      // REFACTORED: Get ticket via ticketServiceClient
      const ticket = await ticketServiceClient.getTicketFull(ticketId, ctx);

      if (!ticket || !ticket.mintAddress) {
        return null;
      }

      return await nftService.getNFTMetadata(ticket.mintAddress);
    } catch (error) {
      logger.warn({ error, ticketId }, 'Failed to get ticket NFT metadata via service client');
      
      // Fallback to direct query for backward compatibility
      const result = await this.pool.query(`
        SELECT nft_mint_address FROM tickets WHERE id = $1
      `, [ticketId]);

      if (result.rows.length === 0 || !result.rows[0].nft_mint_address) {
        return null;
      }

      const mintAddress = result.rows[0].nft_mint_address;
      return await nftService.getNFTMetadata(mintAddress);
    }
  }

  /**
   * AUDIT FIX IDP-4: Check if blockchain transfer already executed or in progress
   * This prevents duplicate blockchain transactions which could result in financial loss
   * - transfer_service owned table
   */
  private async checkExistingBlockchainTransfer(
    client: PoolClient,
    transferId: string
  ): Promise<{
    alreadyExecuted: boolean;
    inProgress: boolean;
    signature?: string;
    explorerUrl?: string;
  }> {
    // Use SELECT FOR UPDATE to lock the row and prevent race conditions
    const result = await client.query(`
      SELECT 
        blockchain_signature,
        blockchain_explorer_url,
        blockchain_transfer_status,
        blockchain_transferred_at
      FROM ticket_transfers
      WHERE id = $1
      FOR UPDATE
    `, [transferId]);

    if (result.rows.length === 0) {
      throw new Error(`Transfer ${transferId} not found`);
    }

    const transfer = result.rows[0];

    // If we already have a blockchain signature, the transfer was executed
    if (transfer.blockchain_signature) {
      return {
        alreadyExecuted: true,
        inProgress: false,
        signature: transfer.blockchain_signature,
        explorerUrl: transfer.blockchain_explorer_url
      };
    }

    // Check if transfer is marked as in-progress
    if (transfer.blockchain_transfer_status === 'IN_PROGRESS') {
      // Check if it's been in progress for too long (stale)
      const staleThreshold = 5 * 60 * 1000; // 5 minutes
      const statusAge = transfer.blockchain_transferred_at 
        ? Date.now() - new Date(transfer.blockchain_transferred_at).getTime()
        : 0;
      
      if (statusAge > staleThreshold) {
        // Stale in-progress status - allow retry
        logger.warn('Found stale in-progress blockchain transfer, allowing retry', {
          transferId,
          statusAge
        });
        return { alreadyExecuted: false, inProgress: false };
      }
      
      return { alreadyExecuted: false, inProgress: true };
    }

    return { alreadyExecuted: false, inProgress: false };
  }

  /**
   * AUDIT FIX IDP-4: Mark blockchain transfer as in-progress
   * This creates a distributed lock to prevent duplicate execution
   * - transfer_service owned table
   */
  private async markBlockchainTransferInProgress(
    client: PoolClient,
    transferId: string
  ): Promise<void> {
    await client.query(`
      UPDATE ticket_transfers
      SET 
        blockchain_transfer_status = 'IN_PROGRESS',
        blockchain_transferred_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [transferId]);

    logger.debug('Marked blockchain transfer as in-progress', { transferId });
  }
}
