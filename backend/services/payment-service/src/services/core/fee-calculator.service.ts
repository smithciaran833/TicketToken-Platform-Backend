import { feeConfig } from '../../config/fees';
import { VenueTier, DynamicFees, FeeBreakdown } from '../../types';

// Inline utility functions (replacing shared module dependency)
function percentOfCents(cents: number, basisPoints: number): number {
  return Math.round((cents * basisPoints) / 10000);
}

function addCents(...amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

// All calculations use INTEGER CENTS
export class FeeCalculatorService {
  async calculateDynamicFees(
    venueId: string,
    amountCents: number,
    ticketCount: number
  ): Promise<DynamicFees> {
    const tier = await this.getVenueTier(venueId);
    const platformPercentageBps = this.getTierPercentageBps(tier);
    
    const platformFee = percentOfCents(amountCents, platformPercentageBps);
    const gasEstimate = await this.estimateGasFees(ticketCount);
    const tax = await this.calculateTax(amountCents, venueId);
    
    const total = addCents(amountCents, platformFee, gasEstimate, tax.state, tax.local);

    const breakdown: FeeBreakdown = {
      ticketPrice: amountCents,
      platformFee,
      gasEstimate,
      stateTax: tax.state,
      localTax: tax.local,
      total
    };

    return {
      platform: platformFee,
      platformPercentage: platformPercentageBps / 100,
      gasEstimate,
      tax: tax.state + tax.local,
      total,
      breakdown
    };
  }

  private async getVenueTier(venueId: string): Promise<VenueTier> {
    const monthlyVolumeCents = await this.getMonthlyVolume(venueId);

    if (monthlyVolumeCents < feeConfig.tiers.starter.monthlyVolumeMax * 100) {
      return VenueTier.STARTER;
    } else if (monthlyVolumeCents < feeConfig.tiers.pro.monthlyVolumeMax * 100) {
      return VenueTier.PRO;
    } else {
      return VenueTier.ENTERPRISE;
    }
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
    return 500000; // $5,000 = 500,000 cents
  }

  private async estimateGasFees(ticketCount: number): Promise<number> {
    const baseGasFeeCents = 50; // 50 cents per ticket
    return baseGasFeeCents * ticketCount;
  }

  private async calculateTax(
    amountCents: number,
    venueId: string
  ): Promise<{ state: number; local: number; total: number }> {
    const stateTaxBps = 700;  // 7%
    const localTaxBps = 225;  // 2.25%
    
    const state = percentOfCents(amountCents, stateTaxBps);
    const local = percentOfCents(amountCents, localTaxBps);
    
    return { state, local, total: state + local };
  }
}
