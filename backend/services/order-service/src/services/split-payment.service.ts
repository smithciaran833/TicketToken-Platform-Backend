import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { PaymentSplit, SplitPaymentRequest, SplitPaymentStatus } from '../types/split-payment.types';

export class SplitPaymentService {
  async processSplitPayment(tenantId: string, request: SplitPaymentRequest): Promise<PaymentSplit[]> {
    const db = getDatabase();
    try {
      const orderResult = await db.query('SELECT total_cents FROM orders WHERE id = $1 AND tenant_id = $2', [request.orderId, tenantId]);
      if (orderResult.rows.length === 0) throw new Error('Order not found');
      
      const orderTotal = orderResult.rows[0].total_cents;
      const splitTotal = request.splits.reduce((sum, split) => sum + split.amountCents, 0);
      
      if (splitTotal !== orderTotal) throw new Error('Split amounts must equal order total');
      
      const splits: PaymentSplit[] = [];
      for (const split of request.splits) {
        const percentage = (split.amountCents / orderTotal) * 100;
        const result = await db.query(
          `INSERT INTO payment_splits (order_id, payment_method_id, tenant_id, amount_cents, percentage, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
          [request.orderId, split.paymentMethodId, tenantId, split.amountCents, percentage, SplitPaymentStatus.COMPLETED]
        );
        splits.push(this.mapToPaymentSplit(result.rows[0]));
      }
      
      logger.info('Split payment processed', { orderId: request.orderId, splitCount: splits.length });
      return splits;
    } catch (error) {
      logger.error('Error processing split payment', { error, request });
      throw error;
    }
  }

  async getSplitsForOrder(orderId: string): Promise<PaymentSplit[]> {
    const db = getDatabase();
    try {
      const result = await db.query('SELECT * FROM payment_splits WHERE order_id = $1', [orderId]);
      return result.rows.map(row => this.mapToPaymentSplit(row));
    } catch (error) {
      logger.error('Error getting splits', { error, orderId });
      throw error;
    }
  }

  private mapToPaymentSplit(row: any): PaymentSplit {
    return {
      id: row.id,
      orderId: row.order_id,
      paymentMethodId: row.payment_method_id,
      tenantId: row.tenant_id,
      amountCents: row.amount_cents,
      percentage: row.percentage ? parseFloat(row.percentage) : undefined,
      status: row.status,
      processedAt: row.processed_at,
      createdAt: row.created_at,
    };
  }
}

