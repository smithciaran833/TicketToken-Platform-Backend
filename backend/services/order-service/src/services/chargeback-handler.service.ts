import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { ChargebackRecord, ChargebackData, Evidence, DateRange } from '../types/report.types';

export class ChargebackHandlerService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createChargeback(orderId: string, tenantId: string, data: ChargebackData): Promise<ChargebackRecord> {
    try {
      const query = `
        INSERT INTO chargeback_tracking (
          tenant_id, order_id, chargeback_id, amount_cents, currency, reason,
          status, received_date, response_deadline, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9)
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        tenantId, orderId, data.chargebackId, data.amountCents, data.currency,
        data.reason, data.receivedDate, data.responseDeadline, data.metadata || {},
      ]);

      logger.info('Created chargeback', { orderId, chargebackId: data.chargebackId });
      return this.mapToChargebackRecord(result.rows[0]);
    } catch (error) {
      logger.error('Error creating chargeback', { error, orderId });
      throw error;
    }
  }

  async updateChargebackStatus(chargebackId: string, status: string): Promise<ChargebackRecord> {
    try {
      const query = `
        UPDATE chargeback_tracking
        SET status = $1,
            resolved_date = CASE WHEN $1 IN ('WON', 'LOST', 'WITHDRAWN') THEN NOW() ELSE resolved_date END,
            updated_at = NOW()
        WHERE chargeback_id = $2
        RETURNING *
      `;

      const result = await this.pool.query(query, [status, chargebackId]);

      if (result.rows.length === 0) {
        throw new Error('Chargeback not found');
      }

      logger.info('Updated chargeback status', { chargebackId, status });
      return this.mapToChargebackRecord(result.rows[0]);
    } catch (error) {
      logger.error('Error updating chargeback status', { error, chargebackId });
      throw error;
    }
  }

  async submitEvidence(chargebackId: string, evidence: Evidence): Promise<void> {
    try {
      const query = `
        UPDATE chargeback_tracking
        SET evidence = $1,
            evidence_submitted_date = NOW(),
            status = 'SUBMITTED',
            updated_at = NOW()
        WHERE chargeback_id = $2
      `;

      await this.pool.query(query, [JSON.stringify(evidence), chargebackId]);

      logger.info('Submitted chargeback evidence', { chargebackId });
    } catch (error) {
      logger.error('Error submitting evidence', { error, chargebackId });
      throw error;
    }
  }

  async getChargebacksByOrder(orderId: string, tenantId: string): Promise<ChargebackRecord[]> {
    try {
      const query = `
        SELECT * FROM chargeback_tracking
        WHERE tenant_id = $1 AND order_id = $2
        ORDER BY received_date DESC
      `;

      const result = await this.pool.query(query, [tenantId, orderId]);
      return result.rows.map(row => this.mapToChargebackRecord(row));
    } catch (error) {
      logger.error('Error getting chargebacks by order', { error, orderId });
      throw error;
    }
  }

  async getPendingChargebacks(tenantId: string): Promise<ChargebackRecord[]> {
    try {
      const query = `
        SELECT * FROM chargeback_tracking
        WHERE tenant_id = $1 AND status = 'PENDING'
        ORDER BY response_deadline ASC
      `;

      const result = await this.pool.query(query, [tenantId]);
      return result.rows.map(row => this.mapToChargebackRecord(row));
    } catch (error) {
      logger.error('Error getting pending chargebacks', { error, tenantId });
      throw error;
    }
  }

  async getChargebackRate(tenantId: string, period: DateRange): Promise<number> {
    try {
      const query = `
        SELECT
          (SELECT COUNT(*) FROM chargeback_tracking 
           WHERE tenant_id = $1 AND received_date >= $2 AND received_date <= $3) as chargeback_count,
          (SELECT COUNT(*) FROM orders 
           WHERE tenant_id = $1 AND confirmed_at >= $2 AND confirmed_at <= $3 
           AND status IN ('CONFIRMED', 'COMPLETED')) as order_count
      `;

      const result = await this.pool.query(query, [tenantId, period.startDate, period.endDate]);
      const { chargeback_count, order_count } = result.rows[0];

      if (parseInt(order_count, 10) === 0) return 0;

      return (parseInt(chargeback_count, 10) / parseInt(order_count, 10)) * 100;
    } catch (error) {
      logger.error('Error calculating chargeback rate', { error, tenantId });
      throw error;
    }
  }

  private mapToChargebackRecord(row: any): ChargebackRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderId: row.order_id,
      chargebackId: row.chargeback_id,
      amountCents: parseInt(row.amount_cents, 10),
      currency: row.currency,
      reason: row.reason,
      status: row.status,
      receivedDate: row.received_date,
      responseDeadline: row.response_deadline,
      evidenceSubmittedDate: row.evidence_submitted_date,
      resolvedDate: row.resolved_date,
      evidence: row.evidence ? JSON.parse(row.evidence) : null,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
