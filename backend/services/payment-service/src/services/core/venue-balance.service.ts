import { VenueBalanceModel } from '../../models';
import { VenueBalance } from '../../types';
import { chargebackReserves, payoutThresholds } from '../../config/fees';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'VenueBalanceService' });

export class VenueBalanceService {
  async getBalance(venueId: string): Promise<VenueBalance> {
    return VenueBalanceModel.getBalance(venueId);
  }
  
  async calculatePayoutAmount(venueId: string): Promise<{
    available: number;
    reserved: number;
    payable: number;
  }> {
    const balance = await this.getBalance(venueId);
    
    // Calculate required reserve based on venue risk
    const riskLevel = await this.getVenueRiskLevel(venueId);
    const reservePercentage = chargebackReserves[riskLevel];
    const requiredReserve = balance.available * (reservePercentage / 100);
    
    // Ensure minimum reserve
    const currentReserve = balance.reserved;
    const additionalReserve = Math.max(0, requiredReserve - currentReserve);
    
    // Calculate payable amount
    const payable = Math.max(
      0,
      balance.available - additionalReserve - payoutThresholds.minimum
    );
    
    return {
      available: balance.available,
      reserved: requiredReserve,
      payable: payable >= payoutThresholds.minimum ? payable : 0
    };
  }
  
  private async getVenueRiskLevel(venueId: string): Promise<'low' | 'medium' | 'high'> {
    // In production, this would analyze:
    // - Chargeback history
    // - Time in business
    // - Transaction volume
    // - Event types
    
    // Placeholder
    return 'medium';
  }
  
  async processPayout(venueId: string, amount: number): Promise<void> {
    const { payable } = await this.calculatePayoutAmount(venueId);
    
    if (amount > payable) {
      throw new Error('Insufficient funds for payout');
    }
    
    if (amount > payoutThresholds.maximumDaily) {
      throw new Error('Exceeds daily payout limit');
    }
    
    // Move from available to processing
    await VenueBalanceModel.updateBalance(venueId, -amount, 'available');
    
    // In production, would initiate actual bank transfer here
    // For now, just mark as processed
    log.info('Processing payout', { amount, venueId });
  }
}
