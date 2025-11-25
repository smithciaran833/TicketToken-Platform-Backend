import { Pool } from 'pg';
import logger from '../utils/logger';

/**
 * PRICING SERVICE
 * 
 * Handles transfer fee calculations and pricing logic
 * Phase 6: Enhanced Features & Business Logic
 */

export interface TransferFeeParams {
  ticketId: string;
  ticketTypeId: string;
  fromUserId: string;
  toUserId?: string;
  transferType: 'GIFT' | 'SALE' | 'TRADE';
  salePrice?: number;
}

export interface TransferFeeResult {
  baseFee: number;
  platformFee: number;
  serviceFee: number;
  totalFee: number;
  currency: string;
  breakdown: {
    description: string;
    amount: number;
  }[];
}

export class PricingService {
  constructor(private readonly pool: Pool) {}

  /**
   * Calculate transfer fees
   */
  async calculateTransferFee(params: TransferFeeParams): Promise<TransferFeeResult> {
    const { ticketTypeId, transferType, salePrice } = params;

    try {
      // Get ticket type pricing configuration
      const configResult = await this.pool.query(`
        SELECT 
          base_transfer_fee,
          platform_fee_percentage,
          service_fee_flat,
          is_free_transfer,
          currency
        FROM ticket_types
        WHERE id = $1
      `, [ticketTypeId]);

      if (configResult.rows.length === 0) {
        throw new Error('Ticket type not found');
      }

      const config = configResult.rows[0];
      const currency = config.currency || 'USD';

      // If free transfers enabled, return zero fees
      if (config.is_free_transfer) {
        return {
          baseFee: 0,
          platformFee: 0,
          serviceFee: 0,
          totalFee: 0,
          currency,
          breakdown: [
            { description: 'Transfer Fee (Promotional)', amount: 0 }
          ]
        };
      }

      let baseFee = parseFloat(config.base_transfer_fee || '0');
      let platformFee = 0;
      const serviceFee = parseFloat(config.service_fee_flat || '0');

      // Calculate platform fee for sales
      if (transferType === 'SALE' && salePrice) {
        const feePercentage = parseFloat(config.platform_fee_percentage || '2.5');
        platformFee = (salePrice * feePercentage) / 100;
      }

      // Apply transfer type multipliers
      const multiplier = this.getTransferTypeMultiplier(transferType);
      baseFee = baseFee * multiplier;

      const totalFee = baseFee + platformFee + serviceFee;

      const breakdown = [];
      if (baseFee > 0) {
        breakdown.push({ description: 'Base Transfer Fee', amount: baseFee });
      }
      if (platformFee > 0) {
        breakdown.push({ description: 'Platform Fee', amount: platformFee });
      }
      if (serviceFee > 0) {
        breakdown.push({ description: 'Service Fee', amount: serviceFee });
      }

      logger.info('Transfer fee calculated', {
        ticketTypeId,
        transferType,
        totalFee
      });

      return {
        baseFee,
        platformFee,
        serviceFee,
        totalFee,
        currency,
        breakdown
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to calculate transfer fee');
      throw error;
    }
  }

  /**
   * Get transfer type multiplier
   */
  private getTransferTypeMultiplier(transferType: string): number {
    switch (transferType) {
      case 'GIFT':
        return 0.5; // 50% discount for gifts
      case 'SALE':
        return 1.0; // Full fee for sales
      case 'TRADE':
        return 0.75; // 25% discount for trades
      default:
        return 1.0;
    }
  }

  /**
   * Apply promotional discount
   */
  async applyPromotionalDiscount(
    fee: TransferFeeResult,
    promoCode?: string
  ): Promise<TransferFeeResult> {
    if (!promoCode) {
      return fee;
    }

    try {
      // Check if promo code is valid
      const promoResult = await this.pool.query(`
        SELECT 
          discount_percentage,
          discount_flat,
          is_active,
          expires_at
        FROM promotional_codes
        WHERE code = $1
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > NOW())
      `, [promoCode]);

      if (promoResult.rows.length === 0) {
        logger.warn('Invalid or expired promo code', { promoCode });
        return fee;
      }

      const promo = promoResult.rows[0];
      let discount = 0;

      if (promo.discount_percentage) {
        discount = (fee.totalFee * parseFloat(promo.discount_percentage)) / 100;
      } else if (promo.discount_flat) {
        discount = parseFloat(promo.discount_flat);
      }

      const discountedTotal = Math.max(0, fee.totalFee - discount);

      return {
        ...fee,
        totalFee: discountedTotal,
        breakdown: [
          ...fee.breakdown,
          { description: `Promo Code (${promoCode})`, amount: -discount }
        ]
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to apply promotional discount');
      return fee;
    }
  }

  /**
   * Record fee payment
   */
  async recordFeePayment(
    transferId: string,
    fee: TransferFeeResult,
    paymentMethod: string
  ): Promise<void> {
    try {
      await this.pool.query(`
        INSERT INTO transfer_fees (
          transfer_id,
          base_fee,
          platform_fee,
          service_fee,
          total_fee,
          currency,
          payment_method,
          paid_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        transferId,
        fee.baseFee,
        fee.platformFee,
        fee.serviceFee,
        fee.totalFee,
        fee.currency,
        paymentMethod
      ]);

      logger.info('Transfer fee payment recorded', { transferId, totalFee: fee.totalFee });
    } catch (error) {
      logger.error({ err: error }, 'Failed to record fee payment');
      throw error;
    }
  }
}
