/**
 * DYNAMIC FEE CALCULATOR - For Transaction Processing
 */

import { feeConfig } from '../../config/fees';
import { VenueTier, DynamicFees, FeeBreakdown } from '../../types';
import { VenueAnalyticsService } from './venue-analytics.service';
import { TaxCalculatorService, TaxLocation } from './tax-calculator.service';
import { GasFeeEstimatorService, BlockchainNetwork } from './gas-fee-estimator.service';
import { SafeLogger } from '../../utils/pci-log-scrubber.util';
import { cacheService } from '../cache.service';

const logger = new SafeLogger('FeeCalculatorService');

const VENUE_TIER_CACHE_TTL = 3600;
const VENUE_VOLUME_CACHE_TTL = 1800;

function percentOfCents(cents: number, basisPoints: number): number {
  return Math.round((cents * basisPoints) / 10000);
}

function addCents(...amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

export class FeeCalculatorService {
  private venueAnalyticsService: VenueAnalyticsService;
  private taxCalculatorService: TaxCalculatorService;
  private gasFeeEstimatorService: GasFeeEstimatorService;

  constructor() {
    this.venueAnalyticsService = new VenueAnalyticsService();
    this.taxCalculatorService = new TaxCalculatorService();
    this.gasFeeEstimatorService = new GasFeeEstimatorService();
  }

  async calculateDynamicFees(
    venueId: string,
    amountCents: number,
    ticketCount: number,
    location?: TaxLocation
  ): Promise<DynamicFees> {
    const tier = await this.getVenueTier(venueId);
    const platformPercentageBps = this.getTierPercentageBps(tier);

    const platformFee = percentOfCents(amountCents, platformPercentageBps);
    const gasEstimate = await this.estimateGasFees(ticketCount);
    const taxBreakdown = await this.calculateTax(amountCents, venueId, location);

    const total = addCents(
      amountCents,
      platformFee,
      gasEstimate,
      taxBreakdown.state,
      taxBreakdown.county,
      taxBreakdown.city,
      taxBreakdown.special
    );

    const breakdown: FeeBreakdown = {
      ticketPrice: amountCents,
      platformFee,
      gasEstimate,
      stateTax: taxBreakdown.state,
      localTax: taxBreakdown.county + taxBreakdown.city + taxBreakdown.special,
      total
    };

    return {
      platform: platformFee,
      platformPercentage: platformPercentageBps / 100,
      gasEstimate,
      tax: taxBreakdown.total,
      total,
      breakdown
    };
  }

  private async getVenueTier(venueId: string): Promise<VenueTier> {
    const cacheKey = `venue:tier:${venueId}`;

    return cacheService.getOrCompute(
      cacheKey,
      async () => {
        const monthlyVolumeCents = await this.getMonthlyVolume(venueId);

        let tier: VenueTier;
        if (monthlyVolumeCents < feeConfig.tiers.starter.monthlyVolumeMax * 100) {
          tier = VenueTier.STARTER;
        } else if (monthlyVolumeCents < feeConfig.tiers.pro.monthlyVolumeMax * 100) {
          tier = VenueTier.PRO;
        } else {
          tier = VenueTier.ENTERPRISE;
        }

        logger.info({ venueId, tier, monthlyVolumeCents }, 'Venue tier calculated');
        return tier;
      },
      VENUE_TIER_CACHE_TTL
    );
  }

  private getTierPercentageBps(tier: VenueTier): number {
    switch (tier) {
      case VenueTier.STARTER:
        return Math.round(feeConfig.tiers.starter.percentage * 100);
      case VenueTier.PRO:
        return Math.round(feeConfig.tiers.pro.percentage * 100);
      case VenueTier.ENTERPRISE:
        return Math.round(feeConfig.tiers.enterprise.percentage * 100);
      default:
        return Math.round(feeConfig.tiers.starter.percentage * 100);
    }
  }

  private async getMonthlyVolume(venueId: string): Promise<number> {
    const cacheKey = `venue:volume:${venueId}`;

    return cacheService.getOrCompute(
      cacheKey,
      async () => {
        try {
          const volume = await this.venueAnalyticsService.getMonthlyVolume(venueId);

          logger.info({
            venueId,
            volume,
          }, 'Monthly volume retrieved for tier calculation');

          return volume;
        } catch (error) {
          logger.error({
            venueId,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, 'Failed to get monthly volume, using conservative estimate');

          return 0;
        }
      },
      VENUE_VOLUME_CACHE_TTL
    );
  }

  private async estimateGasFees(ticketCount: number): Promise<number> {
    try {
      const network = process.env.BLOCKCHAIN_NETWORK as BlockchainNetwork || BlockchainNetwork.SOLANA;
      const gasFeeEstimate = await this.gasFeeEstimatorService.estimateGasFees(
        ticketCount,
        network
      );

      logger.info({
        ticketCount,
        network,
        totalFeeCents: gasFeeEstimate.totalFeeCents,
        feePerTransaction: gasFeeEstimate.feePerTransactionCents,
      }, 'Gas fees estimated');

      return gasFeeEstimate.totalFeeCents;
    } catch (error) {
      logger.error({
        ticketCount,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Gas fee estimation failed, using fallback');

      const fallbackFeeCents = 50;
      return fallbackFeeCents * ticketCount;
    }
  }

  private async calculateTax(
    amountCents: number,
    venueId: string,
    location?: TaxLocation
  ): Promise<{ state: number; county: number; city: number; special: number; total: number }> {
    const taxLocation: TaxLocation = location || {
      country: 'US',
      state: 'TN',
      zip: '37203',
      city: 'Nashville',
    };

    try {
      const taxBreakdown = await this.taxCalculatorService.calculateTax(
        amountCents,
        taxLocation,
        venueId
      );

      return taxBreakdown;
    } catch (error) {
      logger.error({
        venueId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Tax calculation failed, using fallback');

      const stateTaxBps = 700;
      const localTaxBps = 225;

      const state = percentOfCents(amountCents, stateTaxBps);
      const local = percentOfCents(amountCents, localTaxBps);

      return { state, county: local, city: 0, special: 0, total: state + local };
    }
  }
}
