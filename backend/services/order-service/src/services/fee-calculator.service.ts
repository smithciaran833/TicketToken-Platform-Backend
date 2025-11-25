import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { FeeBreakdown, FeeSummary, DateRange } from '../types/report.types';
import { orderConfig } from '../config';

export class FeeCalculatorService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Calculate total fees for an order
   */
  async calculateTotalFees(orderId: string, tenantId: string): Promise<FeeBreakdown> {
    try {
      const orderQuery = `
        SELECT subtotal_cents, platform_fee_cents, processing_fee_cents, tax_cents, total_cents
        FROM orders
        WHERE id = $1 AND tenant_id = $2
      `;

      const result = await this.pool.query(orderQuery, [orderId, tenantId]);

      if (result.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = result.rows[0];
      const subtotalCents = parseInt(order.subtotal_cents, 10);
      const platformFeeCents = parseInt(order.platform_fee_cents, 10);
      const processingFeeCents = parseInt(order.processing_fee_cents, 10);
      const taxCents = parseInt(order.tax_cents, 10);
      const totalCents = parseInt(order.total_cents, 10);

      const feeBreakdown: FeeBreakdown = {
        id: '',
        tenantId,
        orderId,
        subtotalCents,
        platformFeeCents,
        platformFeePercentage: orderConfig.fees.platformFeePercentage,
        processingFeeCents,
        processingFeePercentage: orderConfig.fees.processingFeePercentage,
        processingFeeFixedCents: orderConfig.fees.processingFeeFixedCents,
        taxCents,
        taxPercentage: orderConfig.fees.defaultTaxRate,
        totalFeesCents: platformFeeCents + processingFeeCents + taxCents,
        netRevenueCents: totalCents - processingFeeCents - taxCents,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return feeBreakdown;
    } catch (error) {
      logger.error('Error calculating total fees', { error, orderId, tenantId });
      throw error;
    }
  }

  /**
   * Store fee breakdown
   */
  async storeFeeBreakdown(orderId: string, tenantId: string, fees: FeeBreakdown): Promise<void> {
    try {
      const query = `
        INSERT INTO fee_breakdown (
          tenant_id, order_id, subtotal_cents, platform_fee_cents, platform_fee_percentage,
          processing_fee_cents, processing_fee_percentage, processing_fee_fixed_cents,
          tax_cents, tax_percentage, total_fees_cents, net_revenue_cents
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (tenant_id, order_id) DO UPDATE SET
          subtotal_cents = EXCLUDED.subtotal_cents,
          platform_fee_cents = EXCLUDED.platform_fee_cents,
          processing_fee_cents = EXCLUDED.processing_fee_cents,
          tax_cents = EXCLUDED.tax_cents,
          total_fees_cents = EXCLUDED.total_fees_cents,
          net_revenue_cents = EXCLUDED.net_revenue_cents,
          updated_at = NOW()
      `;

      await this.pool.query(query, [
        tenantId, orderId, fees.subtotalCents, fees.platformFeeCents, fees.platformFeePercentage,
        fees.processingFeeCents, fees.processingFeePercentage, fees.processingFeeFixedCents,
        fees.taxCents, fees.taxPercentage, fees.totalFeesCents, fees.netRevenueCents,
      ]);

      logger.info('Stored fee breakdown', { orderId, tenantId });
    } catch (error) {
      logger.error('Error storing fee breakdown', { error, orderId, tenantId });
      throw error;
    }
  }

  /**
   * Get fee breakdown for an order
   */
  async getFeeBreakdown(orderId: string, tenantId: string): Promise<FeeBreakdown | null> {
    try {
      const query = `SELECT * FROM fee_breakdown WHERE tenant_id = $1 AND order_id = $2`;
      const result = await this.pool.query(query, [tenantId, orderId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToFeeBreakdown(result.rows[0]);
    } catch (error) {
      logger.error('Error getting fee breakdown', { error, orderId, tenantId });
      throw error;
    }
  }

  /**
   * Get total fees by period
   */
  async getTotalFeesByPeriod(tenantId: string, period: DateRange): Promise<FeeSummary> {
    try {
      const query = `
        SELECT
          COUNT(*) as order_count,
          COALESCE(SUM(platform_fee_cents), 0) as total_platform_fees,
          COALESCE(SUM(processing_fee_cents), 0) as total_processing_fees,
          COALESCE(SUM(tax_cents), 0) as total_tax,
          COALESCE(SUM(total_fees_cents), 0) as total_fees,
          COALESCE(AVG(total_fees_cents)::bigint, 0) as avg_fee_per_order
        FROM fee_breakdown
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3
      `;

      const result = await this.pool.query(query, [tenantId, period.startDate, period.endDate]);
      const row = result.rows[0];

      return {
        totalPlatformFeesCents: parseInt(row.total_platform_fees, 10),
        totalProcessingFeesCents: parseInt(row.total_processing_fees, 10),
        totalTaxCents: parseInt(row.total_tax, 10),
        totalFeesCents: parseInt(row.total_fees, 10),
        orderCount: parseInt(row.order_count, 10),
        averageFeePerOrderCents: parseInt(row.avg_fee_per_order, 10),
      };
    } catch (error) {
      logger.error('Error getting total fees by period', { error, tenantId });
      throw error;
    }
  }

  private mapToFeeBreakdown(row: any): FeeBreakdown {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderId: row.order_id,
      subtotalCents: parseInt(row.subtotal_cents, 10),
      platformFeeCents: parseInt(row.platform_fee_cents, 10),
      platformFeePercentage: parseFloat(row.platform_fee_percentage),
      processingFeeCents: parseInt(row.processing_fee_cents, 10),
      processingFeePercentage: parseFloat(row.processing_fee_percentage),
      processingFeeFixedCents: parseInt(row.processing_fee_fixed_cents, 10),
      taxCents: parseInt(row.tax_cents, 10),
      taxPercentage: parseFloat(row.tax_percentage),
      totalFeesCents: parseInt(row.total_fees_cents, 10),
      netRevenueCents: parseInt(row.net_revenue_cents, 10),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
