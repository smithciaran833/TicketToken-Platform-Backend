import { Pool } from 'pg';
import { nftService } from './nft.service';
import logger from '../utils/logger';
import { retryBlockchainOperation, pollForConfirmation } from '../utils/blockchain-retry';
import { blockchainMetrics } from '../utils/blockchain-metrics';

/**
 * BLOCKCHAIN TRANSFER SERVICE
 * 
 * Integrates blockchain NFT transfers with database transfers
 * Enhanced with retry logic and transaction confirmation
 */

export interface BlockchainTransferParams {
  transferId: string;
  ticketId: string;
  fromWallet: string;
  toWallet: string;
  nftMintAddress: string;
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
   */
  async executeBlockchainTransfer(
    params: BlockchainTransferParams
  ): Promise<BlockchainTransferResult> {
    const { transferId, ticketId, fromWallet, toWallet, nftMintAddress } = params;
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      logger.info('Starting blockchain transfer', {
        transferId,
        ticketId,
        nftMintAddress
      });

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

      // Update database with blockchain transaction details
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

      // Also update ticket metadata with NFT info
      await client.query(`
        UPDATE tickets
        SET
          nft_mint_address = $1,
          nft_last_transfer_signature = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [nftMintAddress, nftResult.signature, ticketId]);

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

      // Store failed transfer for retry queue
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
   * Record failed transfer for potential retry
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
   * Get blockchain transfer details
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
   * Get NFT metadata for ticket
   */
  async getTicketNFTMetadata(ticketId: string) {
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
