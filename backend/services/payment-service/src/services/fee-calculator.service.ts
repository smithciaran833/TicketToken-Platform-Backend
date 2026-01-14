/**
 * SIMPLE FEE CALCULATOR - For UI Preview
 * 
 * This is a lightweight fee calculator for frontend fee estimates.
 * Does NOT include tax or blockchain gas fees.
 * 
 * For actual payment processing, use core/fee-calculator.service.ts
 * 
 * @see docs/FEE_CALCULATOR_ARCHITECTURE.md
 */

import axios from 'axios';
import { logger } from '../utils/logger';

export interface FeeCalculation {
  subtotal: number;
  serviceFeePercentage: number;
  serviceFee: number;
  perTicketFee: number;
  processingFee: number;
  totalFees: number;
  total: number;
  venuePayout: number;
  platformRevenue: number;
}

export interface PricingTier {
  tierName: string;
  serviceFeePercentage: number;
  perTicketFee: number;
  processingFeePercentage?: number;
}

export class FeeCalculatorService {
  private defaultTier: PricingTier = {
    tierName: 'standard',
    serviceFeePercentage: 10.00,
    perTicketFee: 2.00,
    processingFeePercentage: 2.90
  };

  async calculateFees(
    subtotal: number,
    ticketCount: number,
    venueId?: string
  ): Promise<FeeCalculation> {
    try {
      let pricingTier = this.defaultTier;

      if (venueId) {
        const venueTier = await this.getVenuePricingTier(venueId);
        if (venueTier) {
          pricingTier = venueTier;
        }
      }

      const serviceFee = (subtotal * pricingTier.serviceFeePercentage) / 100;
      const perTicketFee = pricingTier.perTicketFee * ticketCount;
      const processingFeePercentage = pricingTier.processingFeePercentage || 2.90;
      const processingFee = ((subtotal + serviceFee + perTicketFee) * processingFeePercentage) / 100;

      const totalFees = serviceFee + perTicketFee + processingFee;
      const total = subtotal + totalFees;
      const platformRevenue = serviceFee + processingFee;
      const venuePayout = subtotal;

      logger.info({
        venueId,
        tier: pricingTier.tierName,
        subtotal,
        totalFees,
        total
      });

      return {
        subtotal,
        serviceFeePercentage: pricingTier.serviceFeePercentage,
        serviceFee: Math.round(serviceFee * 100) / 100,
        perTicketFee,
        processingFee: Math.round(processingFee * 100) / 100,
        totalFees: Math.round(totalFees * 100) / 100,
        total: Math.round(total * 100) / 100,
        venuePayout: Math.round(venuePayout * 100) / 100,
        platformRevenue: Math.round(platformRevenue * 100) / 100
      };
    } catch (error) {
      logger.error('Error calculating fees:', error instanceof Error ? error.message : String(error));
      return this.calculateFeesWithTier(subtotal, ticketCount, this.defaultTier);
    }
  }

  private calculateFeesWithTier(
    subtotal: number,
    ticketCount: number,
    tier: PricingTier
  ): FeeCalculation {
    const serviceFee = (subtotal * tier.serviceFeePercentage) / 100;
    const perTicketFee = tier.perTicketFee * ticketCount;
    const processingFeePercentage = tier.processingFeePercentage || 2.90;
    const processingFee = ((subtotal + serviceFee + perTicketFee) * processingFeePercentage) / 100;

    const totalFees = serviceFee + perTicketFee + processingFee;
    const total = subtotal + totalFees;
    const platformRevenue = serviceFee + processingFee;
    const venuePayout = subtotal;

    return {
      subtotal,
      serviceFeePercentage: tier.serviceFeePercentage,
      serviceFee: Math.round(serviceFee * 100) / 100,
      perTicketFee,
      processingFee: Math.round(processingFee * 100) / 100,
      totalFees: Math.round(totalFees * 100) / 100,
      total: Math.round(total * 100) / 100,
      venuePayout: Math.round(venuePayout * 100) / 100,
      platformRevenue: Math.round(platformRevenue * 100) / 100
    };
  }

  private async getVenuePricingTier(venueId: string): Promise<PricingTier | null> {
    try {
      const venueServiceUrl = process.env.VENUE_SERVICE_URL || 'http://venue-service:3002';
      
      const venueResponse = await axios.get(
        `${venueServiceUrl}/api/v1/venues/${venueId}`,
        { timeout: 2000 }
      );

      const pricingTierName = venueResponse.data.venue?.pricing_tier || 'standard';

      const tierResponse = await axios.get(
        `${venueServiceUrl}/api/v1/branding/pricing/tiers`,
        { timeout: 2000 }
      );

      const tiers = tierResponse.data.tiers;
      const tier = tiers.find((t: any) => t.tier_name === pricingTierName);

      if (tier) {
        return {
          tierName: tier.tier_name,
          serviceFeePercentage: parseFloat(tier.service_fee_percentage),
          perTicketFee: parseFloat(tier.per_ticket_fee),
          processingFeePercentage: 2.90
        };
      }

      return null;
    } catch (error: any) {
      logger.warn(`Failed to fetch pricing tier for venue ${venueId}:`, error.message);
      return null;
    }
  }

  async getFeeBreakdown(
    subtotal: number,
    ticketCount: number,
    venueId?: string
  ): Promise<any> {
    const calculation = await this.calculateFees(subtotal, ticketCount, venueId);

    return {
      subtotal: `$${calculation.subtotal.toFixed(2)}`,
      fees: {
        serviceFee: {
          label: `Service Fee (${calculation.serviceFeePercentage}%)`,
          amount: `$${calculation.serviceFee.toFixed(2)}`
        },
        perTicketFee: {
          label: `Per Ticket Fee (${ticketCount} × $${(calculation.perTicketFee / ticketCount).toFixed(2)})`,
          amount: `$${calculation.perTicketFee.toFixed(2)}`
        },
        processingFee: {
          label: 'Processing Fee',
          amount: `$${calculation.processingFee.toFixed(2)}`
        }
      },
      totalFees: `$${calculation.totalFees.toFixed(2)}`,
      total: `$${calculation.total.toFixed(2)}`
    };
  }

  toCents(dollars: number): number {
    return Math.round(dollars * 100);
  }

  toDollars(cents: number): number {
    return cents / 100;
  }
}

export const feeCalculatorService = new FeeCalculatorService();
