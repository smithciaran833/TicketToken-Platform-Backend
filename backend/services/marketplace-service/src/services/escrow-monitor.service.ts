import { db } from '../config/database';
import { logger } from '../utils/logger';
import { blockchainService } from './blockchain.service';
import { transferService } from './transfer.service';

interface EscrowRecord {
  transferId: string;
  escrowAddress: string;
  buyerWallet: string;
  sellerWallet: string;
  listingId: string;
  amount: number;
  createdAt: Date;
  status: string;
}

export class EscrowMonitorService {
  private log = logger.child({ component: 'EscrowMonitorService' });
  private readonly ESCROW_TIMEOUT_MINUTES = 5;
  private readonly CHECK_INTERVAL_MS = 60000; // 1 minute
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Start monitoring escrows
   */
  start(): void {
    if (this.isRunning) {
      this.log.warn('Escrow monitor already running');
      return;
    }

    this.isRunning = true;
    this.log.info('Starting escrow monitor', {
      checkIntervalMs: this.CHECK_INTERVAL_MS,
      timeoutMinutes: this.ESCROW_TIMEOUT_MINUTES
    });

    // Run immediately
    this.checkTimedOutEscrows();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkTimedOutEscrows();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop monitoring escrows
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.log.info('Stopped escrow monitor');
  }

  /**
   * Check for timed out escrows and refund them
   */
  private async checkTimedOutEscrows(): Promise<void> {
    try {
      const timeoutDate = new Date(Date.now() - this.ESCROW_TIMEOUT_MINUTES * 60 * 1000);

      // Find transfers with escrow that are stuck in 'initiated' or 'pending' status
      const stuckTransfers = await db('marketplace_transfers')
        .where('status', 'in', ['initiated', 'pending'])
        .where('created_at', '<', timeoutDate)
        .whereNotNull('escrow_address')
        .select('*');

      if (stuckTransfers.length === 0) {
        this.log.debug('No timed out escrows found');
        return;
      }

      this.log.info('Found timed out escrows', { count: stuckTransfers.length });

      for (const transfer of stuckTransfers) {
        await this.handleTimedOutEscrow(transfer);
      }
    } catch (error) {
      this.log.error('Error checking timed out escrows', { error });
    }
  }

  /**
   * Handle a single timed out escrow
   */
  private async handleTimedOutEscrow(transfer: any): Promise<void> {
    try {
      this.log.info('Processing timed out escrow', {
        transferId: transfer.id,
        escrowAddress: transfer.escrow_address,
        buyerWallet: transfer.buyer_wallet
      });

      // Check escrow status on blockchain
      const escrowStatus = await blockchainService.getEscrowStatus(transfer.escrow_address);

      if (!escrowStatus.exists) {
        this.log.warn('Escrow account does not exist', {
          transferId: transfer.id,
          escrowAddress: transfer.escrow_address
        });
        // Mark transfer as failed
        await transferService.failTransfer(
          transfer.id,
          'Escrow account not found or never created'
        );
        return;
      }

      if (escrowStatus.released) {
        this.log.info('Escrow already released', {
          transferId: transfer.id,
          escrowAddress: transfer.escrow_address
        });
        // Already handled, mark transfer appropriately
        return;
      }

      // Refund to buyer
      this.log.info('Refunding timed out escrow to buyer', {
        transferId: transfer.id,
        escrowAddress: transfer.escrow_address,
        buyerWallet: transfer.buyer_wallet
      });

      const refundResult = await blockchainService.refundEscrowToBuyer({
        escrowAddress: transfer.escrow_address,
        listingId: transfer.listing_id,
        buyerWallet: transfer.buyer_wallet
      });

      this.log.info('Escrow refunded successfully', {
        transferId: transfer.id,
        refundSignature: refundResult.signature
      });

      // Mark transfer as failed with timeout reason
      await transferService.failTransfer(
        transfer.id,
        `Escrow timed out after ${this.ESCROW_TIMEOUT_MINUTES} minutes - refunded to buyer`
      );

      // Record the refund in database
      await db('marketplace_transfers')
        .where({ id: transfer.id })
        .update({
          refund_signature: refundResult.signature,
          refunded_at: new Date(),
          updated_at: new Date()
        });

    } catch (error) {
      this.log.error('Failed to handle timed out escrow', {
        error,
        transferId: transfer.id,
        escrowAddress: transfer.escrow_address
      });
    }
  }

  /**
   * Get escrow metrics
   */
  async getMetrics(): Promise<{
    activeEscrows: number;
    timedOutEscrows: number;
    totalEscrowValue:number;
    averageEscrowAge: number;
  }> {
    try {
      const timeoutDate = new Date(Date.now() - this.ESCROW_TIMEOUT_MINUTES * 60 * 1000);

      // Count active escrows
      const activeResult = await db('marketplace_transfers')
        .where('status', 'in', ['initiated', 'pending'])
        .whereNotNull('escrow_address')
        .count('* as count')
        .sum('usd_value as totalValue')
        .avg('usd_value as avgValue')
        .first();

      // Count timed out escrows
      const timedOutResult = await db('marketplace_transfers')
        .where('status', 'in', ['initiated', 'pending'])
        .where('created_at', '<', timeoutDate)
        .whereNotNull('escrow_address')
        .count('* as count')
        .first();

      return {
        activeEscrows: parseInt(activeResult?.count as string) || 0,
        timedOutEscrows: parseInt(timedOutResult?.count as string) || 0,
        totalEscrowValue: parseInt(activeResult?.totalValue as string) || 0,
        averageEscrowAge: parseFloat(activeResult?.avgValue as string) || 0
      };
    } catch (error) {
      this.log.error('Failed to get escrow metrics', { error });
      return {
        activeEscrows: 0,
        timedOutEscrows: 0,
        totalEscrowValue: 0,
        averageEscrowAge: 0
      };
    }
  }

  /**
   * Manually resolve a stuck escrow (admin function)
   */
  async manuallyResolveEscrow(params: {
    transferId: string;
    action: 'refund' | 'release';
    reason: string;
  }): Promise<void> {
    const { transferId, action, reason } = params;

    try {
      this.log.info('Manually resolving escrow', { transferId, action, reason });

      const transfer = await db('marketplace_transfers')
        .where({ id: transferId })
        .first();

      if (!transfer) {
        throw new Error('Transfer not found');
      }

      if (!transfer.escrow_address) {
        throw new Error('Transfer has no escrow address');
      }

      if (action === 'refund') {
        const refundResult = await blockchainService.refundEscrowToBuyer({
          escrowAddress: transfer.escrow_address,
          listingId: transfer.listing_id,
          buyerWallet: transfer.buyer_wallet
        });

        await transferService.failTransfer(transferId, `Manual refund: ${reason}`);
        
        await db('marketplace_transfers')
          .where({ id: transferId })
          .update({
            refund_signature: refundResult.signature,
            refunded_at: new Date()
          });

        this.log.info('Escrow manually refunded', {
          transferId,
          refundSignature: refundResult.signature
        });
      } else if (action === 'release') {
        // Get fee information
        const fee = await db('platform_fees')
          .where({ transfer_id: transferId })
          .first();

        const releaseResult = await blockchainService.releaseEscrowToSeller({
          escrowAddress: transfer.escrow_address,
          listingId: transfer.listing_id,
          buyerWallet: transfer.buyer_wallet,
          sellerWallet: transfer.seller_wallet,
          platformFee: fee?.platform_fee_amount || 0,
          venueFee: fee?.venue_fee_amount || 0
        });

        // Complete the transfer
        await transferService.completeTransfer({
          transferId,
          blockchainSignature: releaseResult.signature
        });

        this.log.info('Escrow manually released', {
          transferId,
          releaseSignature: releaseResult.signature
        });
      }
    } catch (error) {
      this.log.error('Failed to manually resolve escrow', {
        error,
        transferId,
        action
      });
      throw error;
    }
  }
}

// Export singleton instance
export const escrowMonitorService = new EscrowMonitorService();
