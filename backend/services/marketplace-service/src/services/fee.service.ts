import { feeModel } from '../models/fee.model';
import { transferModel } from '../models/transfer.model';
import { venueSettingsModel } from '../models/venue-settings.model';
import { percentOfCents } from '@tickettoken/shared';
import { logger } from '../utils/logger';
import { constants } from '../config';
import { NotFoundError } from '../utils/errors';

export interface FeeCalculation {
  salePrice: number;        // INTEGER CENTS
  platformFee: number;      // INTEGER CENTS
  venueFee: number;         // INTEGER CENTS
  sellerPayout: number;     // INTEGER CENTS
  totalFees: number;        // INTEGER CENTS
}

export interface FeeReport {
  totalVolume: number;           // INTEGER CENTS
  totalPlatformFees: number;     // INTEGER CENTS
  totalVenueFees: number;        // INTEGER CENTS
  transactionCount: number;
  averageTransactionSize: number; // INTEGER CENTS
}

export class FeeService {
  private log = logger.child({ component: 'FeeService' });

  /**
   * Calculate fees for a sale (all amounts in INTEGER CENTS)
   */
  calculateFees(salePriceCents: number, venueRoyaltyPercentage?: number): FeeCalculation {
    const platformFeePercentage = constants.FEES.PLATFORM_FEE_PERCENTAGE;
    const venueFeePercentage = venueRoyaltyPercentage || constants.FEES.DEFAULT_VENUE_FEE_PERCENTAGE;

    // Convert percentages to basis points
    const platformFeeBps = Math.round(platformFeePercentage * 100);
    const venueFeeBps = Math.round(venueFeePercentage * 100);

    const platformFeeCents = percentOfCents(salePriceCents, platformFeeBps);
    const venueFeeCents = percentOfCents(salePriceCents, venueFeeBps);
    const totalFeesCents = platformFeeCents + venueFeeCents;
    const sellerPayoutCents = salePriceCents - totalFeesCents;

    return {
      salePrice: salePriceCents,
      platformFee: platformFeeCents,
      venueFee: venueFeeCents,
      sellerPayout: sellerPayoutCents,
      totalFees: totalFeesCents,
    };
  }

  /**
   * Get fee breakdown for a transfer
   */
  async getTransferFees(transferId: string) {
    const fee = await feeModel.findByTransferId(transferId);
    if (!fee) {
      throw new NotFoundError('Fee record');
    }

    return {
      transferId,
      salePrice: fee.salePrice,
      platformFee: {
        amount: fee.platformFeeAmount,
        percentage: fee.platformFeePercentage,
        collected: fee.platformFeeCollected,
        signature: fee.platformFeeSignature,
      },
      venueFee: {
        amount: fee.venueFeeAmount,
        percentage: fee.venueFeePercentage,
        collected: fee.venueFeeCollected,
        signature: fee.venueFeeSignature,
      },
      sellerPayout: fee.sellerPayout,
      createdAt: fee.createdAt,
    };
  }

  /**
   * Get platform fee report (amounts in cents)
   */
  async getPlatformFeeReport(startDate?: Date, endDate?: Date): Promise<FeeReport> {
    const totalFeesCents = await feeModel.getTotalPlatformFees(startDate, endDate);

    // Estimate volume based on 5% platform fee
    const estimatedVolumeCents = Math.round(totalFeesCents * 20);

    return {
      totalVolume: estimatedVolumeCents,
      totalPlatformFees: totalFeesCents,
      totalVenueFees: 0,
      transactionCount: 0,
      averageTransactionSize: 0,
    };
  }

  /**
   * Get venue fee report (amounts in cents)
   */
  async getVenueFeeReport(venueId: string, startDate?: Date, endDate?: Date): Promise<FeeReport> {
    const totalFeesCents = await feeModel.getTotalVenueFees(venueId, startDate, endDate);
    const totalVolumeCents = await transferModel.getTotalVolumeByVenueId(venueId);

    return {
      totalVolume: totalVolumeCents,
      totalPlatformFees: 0,
      totalVenueFees: totalFeesCents,
      transactionCount: 0,
      averageTransactionSize: 0,
    };
  }

  /**
   * Process fee distribution (called by cron job)
   */
  async processFeeDistributions() {
    this.log.info('Processing fee distributions');
  }

  /**
   * Get fee statistics for a venue (amounts in cents)
   */
  async getVenueStatistics(venueId: string) {
    const settings = await venueSettingsModel.findByVenueId(venueId);
    if (!settings) {
      throw new NotFoundError('Venue settings');
    }

    const totalVolumeCents = await transferModel.getTotalVolumeByVenueId(venueId);
    const totalFeesCents = await feeModel.getTotalVenueFees(venueId);

    return {
      venueId,
      royaltyPercentage: settings.royaltyPercentage,
      totalVolume: totalVolumeCents,
      totalFeesEarned: totalFeesCents,
      minimumPayout: settings.minimumRoyaltyPayout,
      payoutWallet: settings.royaltyWalletAddress,
    };
  }
}

export const feeService = new FeeService();
