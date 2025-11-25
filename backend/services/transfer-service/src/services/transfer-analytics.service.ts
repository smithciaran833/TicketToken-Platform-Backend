import { Pool } from 'pg';
import logger from '../utils/logger';

/**
 * TRANSFER ANALYTICS SERVICE
 * 
 * Provides analytics and insights on transfer patterns
 * Phase 6: Enhanced Features & Business Logic
 */

export interface TransferMetrics {
  totalTransfers: number;
  completedTransfers: number;
  pendingTransfers: number;
  failedTransfers: number;
  avgTransferTime: number;
  topTransferredTickets: Array<{
    ticketId: string;
    transferCount: number;
  }>;
}

export interface UserTransferStats {
  userId: string;
  totalSent: number;
  totalReceived: number;
  successRate: number;
  avgTimeToAccept: number;
}

export class TransferAnalyticsService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get transfer metrics for a time period
   */
  async getTransferMetrics(params: {
    tenantId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<TransferMetrics> {
    const { tenantId, startDate, endDate } = params;

    try {
      const metricsResult = await this.pool.query(`
        SELECT 
          COUNT(*) as total_transfers,
          COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_transfers,
          COUNT(*) FILTER (WHERE status = 'PENDING') as pending_transfers,
          COUNT(*) FILTER (WHERE status = 'FAILED') as failed_transfers,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_transfer_time
        FROM ticket_transfers
        WHERE tenant_id = $1
          AND created_at BETWEEN $2 AND $3
      `, [tenantId, startDate, endDate]);

      const topTicketsResult = await this.pool.query(`
        SELECT 
          ticket_id,
          COUNT(*) as transfer_count
        FROM ticket_transfers
        WHERE tenant_id = $1
          AND created_at BETWEEN $2 AND $3
          AND status = 'COMPLETED'
        GROUP BY ticket_id
        ORDER BY transfer_count DESC
        LIMIT 10
      `, [tenantId, startDate, endDate]);

      const metrics = metricsResult.rows[0];

      return {
        totalTransfers: parseInt(metrics.total_transfers || '0'),
        completedTransfers: parseInt(metrics.completed_transfers || '0'),
        pendingTransfers: parseInt(metrics.pending_transfers || '0'),
        failedTransfers: parseInt(metrics.failed_transfers || '0'),
        avgTransferTime: parseFloat(metrics.avg_transfer_time || '0'),
        topTransferredTickets: topTicketsResult.rows.map(row => ({
          ticketId: row.ticket_id,
          transferCount: parseInt(row.transfer_count)
        }))
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to get transfer metrics');
      throw error;
    }
  }

  /**
   * Get user transfer statistics
   */
  async getUserTransferStats(userId: string): Promise<UserTransferStats> {
    try {
      const sentResult = await this.pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed
        FROM ticket_transfers
        WHERE from_user_id = $1
      `, [userId]);

      const receivedResult = await this.pool.query(`
        SELECT COUNT(*) as total
        FROM ticket_transfers
        WHERE to_user_id = $1
          AND status = 'COMPLETED'
      `, [userId]);

      const avgTimeResult = await this.pool.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_time
        FROM ticket_transfers
        WHERE to_user_id = $1
          AND status = 'COMPLETED'
          AND completed_at IS NOT NULL
      `, [userId]);

      const sent = sentResult.rows[0];
      const totalSent = parseInt(sent.total || '0');
      const completedSent = parseInt(sent.completed || '0');
      const successRate = totalSent > 0 ? (completedSent / totalSent) * 100 : 0;

      return {
        userId,
        totalSent,
        totalReceived: parseInt(receivedResult.rows[0].total || '0'),
        successRate,
        avgTimeToAccept: parseFloat(avgTimeResult.rows[0].avg_time || '0')
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to get user transfer stats');
      throw error;
    }
  }

  /**
   * Get transfer trends over time
   */
  async getTransferTrends(params: {
    tenantId: string;
    startDate: Date;
    endDate: Date;
    interval: 'hour' | 'day' | 'week' | 'month';
  }) {
    const { tenantId, startDate, endDate, interval } = params;

    try {
      const result = await this.pool.query(`
        SELECT 
          DATE_TRUNC($1, created_at) as period,
          COUNT(*) as transfer_count,
          COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_count,
          COUNT(*) FILTER (WHERE status = 'FAILED') as failed_count
        FROM ticket_transfers
        WHERE tenant_id = $2
          AND created_at BETWEEN $3 AND $4
        GROUP BY period
        ORDER BY period
      `, [interval, tenantId, startDate, endDate]);

      return result.rows.map(row => ({
        period: row.period,
        transferCount: parseInt(row.transfer_count),
        completedCount: parseInt(row.completed_count),
        failedCount: parseInt(row.failed_count)
      }));

    } catch (error) {
      logger.error({ err: error }, 'Failed to get transfer trends');
      throw error;
    }
  }

  /**
   * Get transfer fee analytics
   */
  async getTransferFeeAnalytics(params: {
    tenantId: string;
    startDate: Date;
    endDate: Date;
  }) {
    const { tenantId, startDate, endDate } = params;

    try {
      const result = await this.pool.query(`
        SELECT 
          COUNT(*) as total_paid_transfers,
          SUM(total_fee) as total_fees_collected,
          AVG(total_fee) as avg_fee,
          SUM(platform_fee) as total_platform_fees,
          SUM(base_fee) as total_base_fees,
          SUM(service_fee) as total_service_fees
        FROM transfer_fees tf
        JOIN ticket_transfers tt ON tf.transfer_id = tt.id
        WHERE tt.tenant_id = $1
          AND tf.paid_at BETWEEN $2 AND $3
      `, [tenantId, startDate, endDate]);

      const metrics = result.rows[0];

      return {
        totalPaidTransfers: parseInt(metrics.total_paid_transfers || '0'),
        totalFeesCollected: parseFloat(metrics.total_fees_collected || '0'),
        avgFee: parseFloat(metrics.avg_fee || '0'),
        totalPlatformFees: parseFloat(metrics.total_platform_fees || '0'),
        totalBaseFees: parseFloat(metrics.total_base_fees || '0'),
        totalServiceFees: parseFloat(metrics.total_service_fees || '0')
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to get transfer fee analytics');
      throw error;
    }
  }

  /**
   * Get blockchain transfer analytics
   */
  async getBlockchainTransferAnalytics(params: {
    tenantId: string;
    startDate: Date;
    endDate: Date;
  }) {
    const { tenantId, startDate, endDate } = params;

    try {
      const result = await this.pool.query(`
        SELECT 
          COUNT(*) as total_blockchain_transfers,
          COUNT(*) FILTER (WHERE blockchain_signature IS NOT NULL) as successful_blockchain_transfers,
          AVG(EXTRACT(EPOCH FROM (blockchain_transferred_at - created_at))) as avg_blockchain_transfer_time
        FROM ticket_transfers
        WHERE tenant_id = $1
          AND blockchain_transferred_at BETWEEN $2 AND $3
      `, [tenantId, startDate, endDate]);

      const metrics = result.rows[0];

      return {
        totalBlockchainTransfers: parseInt(metrics.total_blockchain_transfers || '0'),
        successfulBlockchainTransfers: parseInt(metrics.successful_blockchain_transfers || '0'),
        avgBlockchainTransferTime: parseFloat(metrics.avg_blockchain_transfer_time || '0')
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to get blockchain transfer analytics');
      throw error;
    }
  }

  /**
   * Get transfer velocity (transfers per hour)
   */
  async getTransferVelocity(tenantId: string, hours: number = 24) {
    try {
      const result = await this.pool.query(`
        SELECT COUNT(*) as transfer_count
        FROM ticket_transfers
        WHERE tenant_id = $1
          AND created_at >= NOW() - INTERVAL '${hours} hours'
      `, [tenantId]);

      const count = parseInt(result.rows[0].transfer_count || '0');
      return {
        transfersPerHour: count / hours,
        totalTransfers: count,
        periodHours: hours
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to get transfer velocity');
      throw error;
    }
  }
}
