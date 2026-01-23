/**
 * Fee Distribution Service - marketplace-service
 *
 * Handles platform fee calculation and distribution.
 * Note: emitFeeCollectionEvent still uses axios for payment-service analytics
 * endpoint as this is a public API call, not internal S2S.
 */

import { db } from '../config/database';
import { logger } from '../utils/logger';
import axios from 'axios';
import { config } from '../config';

interface FeeBreakdown {
  subtotal: number;
  platformFee: number;
  venueFee: number;
  networkFee: number;
  total: number;
  sellerReceives: number;
}

interface FeeDistribution {
  transferId: string;
  platformAmount: number;
  venueAmount: number;
  sellerAmount: number;
  distributedAt: Date;
  platformTxSignature?: string;
  venueTxSignature?: string;
}

export class FeeDistributionService {
  private log = logger.child({ component: 'FeeDistributionService' });
  
  // Fee rates (configurable via environment)
  private readonly PLATFORM_FEE_RATE = parseFloat(process.env.PLATFORM_FEE_RATE || '0.025'); // 2.5%
  private readonly VENUE_FEE_RATE = parseFloat(process.env.VENUE_FEE_RATE || '0.05'); // 5%
  private readonly NETWORK_FEE = 0.00025; // SOL transaction fee

  /**
   * Calculate all fees for a purchase
   */
  calculateFees(listingPrice: number): FeeBreakdown {
    const platformFee = Math.round(listingPrice * this.PLATFORM_FEE_RATE);
    const venueFee = Math.round(listingPrice * this.VENUE_FEE_RATE);
    const total = listingPrice + platformFee + venueFee;
    const sellerReceives = listingPrice - platformFee - venueFee;

    return {
      subtotal: listingPrice,
      platformFee,
      venueFee,
      networkFee: this.NETWORK_FEE,
      total,
      sellerReceives
    };
  }

  /**
   * Record fee collection in database
   */
  async recordFeeCollection(params: {
    transferId: string;
    listingId: string;
    eventId: string;
    venueId: string;
    salePrice: number;
    platformFeeAmount: number;
    venueFeeAmount: number;
  }): Promise<void> {
    try {
      const {
        transferId,
        listingId,
        eventId,
        venueId,
        salePrice,
        platformFeeAmount,
        venueFeeAmount
      } = params;

      await db('platform_fees').insert({
        transfer_id: transferId,
        listing_id: listingId,
        event_id: eventId,
        venue_id: venueId,
        sale_price: salePrice,
        platform_fee_amount: platformFeeAmount,
        platform_fee_rate: this.PLATFORM_FEE_RATE,
        venue_fee_amount: venueFeeAmount,
        venue_fee_rate: this.VENUE_FEE_RATE,
        collection_status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      });

      this.log.info('Fee collection recorded', {
        transferId,
        platformFeeAmount,
        venueFeeAmount
      });
    } catch (error) {
      this.log.error('Failed to record fee collection', { error, params });
      throw error;
    }
  }

  /**
   * Distribute fees to platform and venue treasuries
   */
  async distributeFees(transferId: string): Promise<FeeDistribution> {
    try {
      // Get fee record
      const fee = await db('platform_fees')
        .where({ transfer_id: transferId })
        .first();

      if (!fee) {
        throw new Error(`Fee record not found for transfer ${transferId}`);
      }

      if (fee.collection_status === 'collected') {
        this.log.warn('Fees already distributed', { transferId });
        return {
          transferId,
          platformAmount: fee.platform_fee_amount,
          venueAmount: fee.venue_fee_amount,
          sellerAmount: fee.sale_price - fee.platform_fee_amount - fee.venue_fee_amount,
          distributedAt: fee.collected_at
        };
      }

      // In production, this would trigger actual on-chain transfers
      // For now, just mark as collected
      await db('platform_fees')
        .where({ transfer_id: transferId })
        .update({
          collection_status: 'collected',
          collected_at: new Date(),
          updated_at: new Date()
        });

      const distribution: FeeDistribution = {
        transferId,
        platformAmount: fee.platform_fee_amount,
        venueAmount: fee.venue_fee_amount,
        sellerAmount: fee.sale_price - fee.platform_fee_amount - fee.venue_fee_amount,
        distributedAt: new Date()
      };

      this.log.info('Fees distributed', distribution);

      // Emit event for analytics
      this.emitFeeCollectionEvent(distribution);

      return distribution;
    } catch (error) {
      this.log.error('Failed to distribute fees', { error, transferId });
      throw error;
    }
  }

  /**
   * Get fee statistics for reporting
   */
  async getFeeStatistics(params: {
    startDate?: Date;
    endDate?: Date;
    venueId?: string;
  }): Promise<{
    totalFeesCollected: number;
    platformFeesCollected: number;
    venueFeesCollected: number;
    transactionCount: number;
    averageFeePerTransaction: number;
  }> {
    try {
      const { startDate, endDate, venueId } = params;

      let query = db('platform_fees')
        .where('collection_status', 'collected');

      if (startDate) {
        query = query.where('collected_at', '>=', startDate);
      }

      if (endDate) {
        query = query.where('collected_at', '<=', endDate);
      }

      if (venueId) {
        query = query.where('venue_id', venueId);
      }

      const result = await query
        .select(
          db.raw('COUNT(*) as transaction_count'),
          db.raw('SUM(platform_fee_amount + venue_fee_amount) as total_fees'),
          db.raw('SUM(platform_fee_amount) as platform_fees'),
          db.raw('SUM(venue_fee_amount) as venue_fees')
        )
        .first();

      const transactionCount = parseInt(result.transaction_count) || 0;
      const totalFees = parseInt(result.total_fees) || 0;
      const platformFees = parseInt(result.platform_fees) || 0;
      const venueFees = parseInt(result.venue_fees) || 0;

      return {
        totalFeesCollected: totalFees,
        platformFeesCollected: platformFees,
        venueFeesCollected: venueFees,
        transactionCount,
        averageFeePerTransaction: transactionCount > 0 ? Math.round(totalFees / transactionCount) : 0
      };
    } catch (error) {
      this.log.error('Failed to get fee statistics', { error, params });
      throw error;
    }
  }

  /**
   * Get pending fee collections
   */
  async getPendingFeeCollections(): Promise<Array<{
    transferId: string;
    platformFeeAmount: number;
    venueFeeAmount: number;
    createdAt: Date;
  }>> {
    try {
      const pending = await db('platform_fees')
        .where('collection_status', 'pending')
        .select('transfer_id', 'platform_fee_amount', 'venue_fee_amount', 'created_at');

      return pending.map(row => ({
        transferId: row.transfer_id,
        platformFeeAmount: row.platform_fee_amount,
        venueFeeAmount: row.venue_fee_amount,
        createdAt: row.created_at
      }));
    } catch (error) {
      this.log.error('Failed to get pending fee collections', { error });
      throw error;
    }
  }

  /**
   * Emit fee collection event to analytics service
   */
  private async emitFeeCollectionEvent(distribution: FeeDistribution): Promise<void> {
    try {
      // Send to analytics service if configured
      if (config.paymentServiceUrl) {
        await axios.post(
          `${config.paymentServiceUrl}/api/v1/analytics/fee-collection`,
          {
            transferId: distribution.transferId,
            platformAmount: distribution.platformAmount,
            venueAmount: distribution.venueAmount,
            timestamp: distribution.distributedAt
          },
          {
            headers: {
              'X-Service-Name': 'marketplace-service',
              'X-Internal-Request': 'true'
            },
            timeout: 3000
          }
        );
      }
    } catch (error) {
      // Don't fail the distribution if analytics fails
      this.log.warn('Failed to emit fee collection event to analytics', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Reconcile fees - verify all completed transfers have fee records
   */
  async reconcileFees(): Promise<{
    missingFeeRecords: number;
    pendingCollections: number;
  }> {
    try {
      // Find completed transfers without fee records
      const completedTransfers = await db('marketplace_transfers')
        .where('status', 'completed')
        .whereNotExists(function() {
          this.select('*')
            .from('platform_fees')
            .whereRaw('platform_fees.transfer_id = marketplace_transfers.id');
        })
        .select('id');

      const pendingFees = await db('platform_fees')
        .where('collection_status', 'pending')
        .count('* as count')
        .first();

      this.log.info('Fee reconciliation complete', {
        missingFeeRecords: completedTransfers.length,
        pendingCollections: parseInt(pendingFees?.count as string) || 0
      });

      return {
        missingFeeRecords: completedTransfers.length,
        pendingCollections: parseInt(pendingFees?.count as string) || 0
      };
    } catch (error) {
      this.log.error('Failed to reconcile fees', { error });
      throw error;
    }
  }
}

export const feeDistributionService = new FeeDistributionService();
