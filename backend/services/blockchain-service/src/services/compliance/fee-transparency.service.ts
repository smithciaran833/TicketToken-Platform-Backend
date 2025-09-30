import { db } from '../../config/database';
import { logger } from '../../utils/logger';

interface FeeBreakdown {
  basePrice: number;
  platformFee: number;
  platformFeePercent: number;
  venueFee: number;
  venueFeePercent: number;
  paymentProcessingFee: number;
  paymentProcessingPercent: number;
  taxAmount: number;
  taxPercent: number;
  totalPrice: number;
  currency: string;
}

interface VenueFeePolicy {
  venueId: string;
  venueName: string;
  baseFeePercent: number;
  serviceFeePercent: number;
  resaleFeePercent: number;
  maxResalePrice?: number;
  effectiveDate: Date;
  lastUpdated: Date;
}

export class FeeTransparencyService {
  /**
   * Calculate complete fee breakdown for a ticket purchase
   */
  async calculateFeeBreakdown(
    basePrice: number,
    venueId: string,
    isResale: boolean = false,
    location?: string
  ): Promise<FeeBreakdown> {
    try {
      // Get venue fee policy
      const venuePolicy = await this.getVenueFeePolicy(venueId);
      
      // Platform fees (TicketToken's cut)
      const platformFeePercent = isResale ? 2.5 : 3.5; // Lower for resales
      const platformFee = Math.round(basePrice * platformFeePercent / 100);
      
      // Venue fees
      const venueFeePercent = isResale ? 
        venuePolicy.resaleFeePercent : 
        venuePolicy.baseFeePercent;
      const venueFee = Math.round(basePrice * venueFeePercent / 100);
      
      // Payment processing (Stripe/Square)
      const paymentProcessingPercent = 2.9; // + $0.30 typically
      const paymentProcessingFee = Math.round(basePrice * paymentProcessingPercent / 100) + 30;
      
      // Tax calculation (simplified - would use real tax API)
      const taxPercent = this.getTaxRate(location);
      const subtotal = basePrice + platformFee + venueFee + paymentProcessingFee;
      const taxAmount = Math.round(subtotal * taxPercent / 100);
      
      // Total
      const totalPrice = subtotal + taxAmount;
      
      return {
        basePrice,
        platformFee,
        platformFeePercent,
        venueFee,
        venueFeePercent,
        paymentProcessingFee,
        paymentProcessingPercent,
        taxAmount,
        taxPercent,
        totalPrice,
        currency: 'USD'
      };
      
    } catch (error) {
      logger.error('Failed to calculate fee breakdown:', error);
      throw error;
    }
  }

  /**
   * Get venue fee policy
   */
  async getVenueFeePolicy(venueId: string): Promise<VenueFeePolicy> {
    const policy = await db('venue_fee_policies')
      .where({ venue_id: venueId, active: true })
      .first();
    
    if (!policy) {
      // Return default policy
      return {
        venueId,
        venueName: 'Venue',
        baseFeePercent: 5.0,
        serviceFeePercent: 2.5,
        resaleFeePercent: 5.0,
        effectiveDate: new Date(),
        lastUpdated: new Date()
      };
    }
    
    return {
      venueId: policy.venue_id,
      venueName: policy.venue_name,
      baseFeePercent: parseFloat(policy.base_fee_percent),
      serviceFeePercent: parseFloat(policy.service_fee_percent),
      resaleFeePercent: parseFloat(policy.resale_fee_percent),
      maxResalePrice: policy.max_resale_price,
      effectiveDate: policy.effective_date,
      lastUpdated: policy.updated_at
    };
  }

  /**
   * Get all fees for a specific order
   */
  async getOrderFees(orderId: string): Promise<any> {
    const fees = await db('order_fees')
      .where({ order_id: orderId })
      .first();
    
    if (!fees) {
      throw new Error('Order fees not found');
    }
    
    return {
      orderId,
      breakdown: {
        tickets: fees.base_amount / 100,
        platformFee: fees.platform_fee / 100,
        venueFee: fees.venue_fee / 100,
        processingFee: fees.processing_fee / 100,
        tax: fees.tax_amount / 100,
        total: fees.total_amount / 100
      },
      currency: fees.currency,
      paidAt: fees.created_at
    };
  }

  /**
   * Generate fee report for venue
   */
  async generateVenueFeeReport(venueId: string, startDate: Date, endDate: Date): Promise<any> {
    const report = await db('order_fees')
      .where({ venue_id: venueId })
      .whereBetween('created_at', [startDate, endDate])
      .select(
        db.raw('SUM(base_amount) as total_sales'),
        db.raw('SUM(venue_fee) as total_venue_fees'),
        db.raw('SUM(platform_fee) as total_platform_fees'),
        db.raw('COUNT(*) as transaction_count'),
        db.raw('AVG(venue_fee) as avg_venue_fee')
      )
      .first();
    
    const breakdown = await db('order_fees')
      .where({ venue_id: venueId })
      .whereBetween('created_at', [startDate, endDate])
      .select(
        db.raw('DATE(created_at) as date'),
        db.raw('SUM(venue_fee) as daily_fees'),
        db.raw('COUNT(*) as transactions')
      )
      .groupBy(db.raw('DATE(created_at)'))
      .orderBy('date', 'asc');
    
    return {
      venueId,
      period: {
        start: startDate,
        end: endDate
      },
      summary: {
        totalSales: (report.total_sales || 0) / 100,
        totalVenueFees: (report.total_venue_fees || 0) / 100,
        totalPlatformFees: (report.total_platform_fees || 0) / 100,
        transactionCount: report.transaction_count || 0,
        averageFeePerTransaction: (report.avg_venue_fee || 0) / 100
      },
      dailyBreakdown: breakdown.map((day: any) => ({
        date: day.date,
        fees: day.daily_fees / 100,
        transactions: day.transactions
      }))
    };
  }

  /**
   * Get tax rate based on location (simplified)
   */
  private getTaxRate(location?: string): number {
    // In production, would use a real tax API like TaxJar
    const taxRates: Record<string, number> = {
      'CA': 8.5,
      'NY': 8.0,
      'TX': 6.25,
      'FL': 6.0,
      'WA': 6.5
    };
    
    return taxRates[location || 'NY'] || 7.0;
  }
}

export const feeTransparencyService = new FeeTransparencyService();
