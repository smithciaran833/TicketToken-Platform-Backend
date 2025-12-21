import { Connection } from '@solana/web3.js';
import { getConnection } from '../config/solana';
import db from '../config/database';
import logger from '../utils/logger';

interface ReconciliationRecord {
  ticketId: string;
  dbStatus: string;
  blockchainStatus: 'confirmed' | 'not_found' | 'pending' | 'error';
  signature: string | null;
  discrepancy: boolean;
  details: string;
  checkedAt: Date;
}

interface ReconciliationSummary {
  totalChecked: number;
  confirmed: number;
  notFound: number;
  pending: number;
  errors: number;
  discrepancies: ReconciliationRecord[];
}

export class ReconciliationService {
  private connection: Connection;

  constructor() {
    this.connection = getConnection();
  }

  /**
   * Reconcile all minted tickets against blockchain
   */
  async reconcileAll(venueId: string): Promise<ReconciliationSummary> {
    logger.info('Starting reconciliation', { venueId });

    const summary: ReconciliationSummary = {
      totalChecked: 0,
      confirmed: 0,
      notFound: 0,
      pending: 0,
      errors: 0,
      discrepancies: []
    };

    try {
      // Get all minted tickets from database
      const tickets = await db('ticket_mints')
        .where({ venue_id: venueId, status: 'minted' })
        .select('*');

      summary.totalChecked = tickets.length;

      logger.info(`Checking ${tickets.length} tickets`, { venueId });

      // Check each ticket on blockchain
      for (const ticket of tickets) {
        const record = await this.checkTicket(ticket);
        
        if (record.discrepancy) {
          summary.discrepancies.push(record);
        }

        switch (record.blockchainStatus) {
          case 'confirmed':
            summary.confirmed++;
            break;
          case 'not_found':
            summary.notFound++;
            break;
          case 'pending':
            summary.pending++;
            break;
          case 'error':
            summary.errors++;
            break;
        }
      }

      // Log results
      logger.info('Reconciliation completed', {
        venueId,
        ...summary,
        discrepancyRate: `${((summary.discrepancies.length / summary.totalChecked) * 100).toFixed(2)}%`
      });

      // Store reconciliation results
      await this.storeReconciliationReport(venueId, summary);

      return summary;

    } catch (error) {
      logger.error('Reconciliation failed', {
        venueId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Check single ticket against blockchain
   */
  private async checkTicket(ticket: any): Promise<ReconciliationRecord> {
    const record: ReconciliationRecord = {
      ticketId: ticket.ticket_id,
      dbStatus: ticket.status,
      blockchainStatus: 'pending',
      signature: ticket.transaction_signature,
      discrepancy: false,
      details: '',
      checkedAt: new Date()
    };

    try {
      if (!ticket.transaction_signature) {
        record.blockchainStatus = 'not_found';
        record.discrepancy = true;
        record.details = 'No transaction signature in database';
        return record;
      }

      // Check transaction on blockchain
      const txInfo = await this.connection.getTransaction(
        ticket.transaction_signature,
        {
          maxSupportedTransactionVersion: 0
        }
      );

      if (!txInfo) {
        record.blockchainStatus = 'not_found';
        record.discrepancy = true;
        record.details = 'Transaction not found on blockchain';
      } else if (txInfo.meta?.err) {
        record.blockchainStatus = 'error';
        record.discrepancy = true;
        record.details = `Transaction failed: ${JSON.stringify(txInfo.meta.err)}`;
      } else {
        record.blockchainStatus = 'confirmed';
        record.details = 'Transaction confirmed on blockchain';
        
        // Verify block time matches approximately
        const blockTime = txInfo.blockTime;
        const createdAt = new Date(ticket.created_at).getTime() / 1000;
        const timeDiff = Math.abs((blockTime || 0) - createdAt);
        
        if (timeDiff > 3600) { // More than 1 hour difference
          record.discrepancy = true;
          record.details += ` (Warning: ${timeDiff}s time difference)`;
        }
      }

    } catch (error) {
      record.blockchainStatus = 'error';
      record.discrepancy = true;
      record.details = `Error checking blockchain: ${(error as Error).message}`;
    }

    return record;
  }

  /**
   * Fix discrepancies (attempt to re-mint failed tickets)
   */
  async fixDiscrepancies(venueId: string, ticketIds: string[]): Promise<{
    attempted: number;
    fixed: number;
    failed: number;
  }> {
    logger.info('Fixing discrepancies', { venueId, ticketCount: ticketIds.length });

    let fixed = 0;
    let failed = 0;

    for (const ticketId of ticketIds) {
      try {
        // Reset ticket status to allow re-minting
        await db('ticket_mints')
          .where({ ticket_id: ticketId, venue_id: venueId })
          .update({
            status: 'pending',
            transaction_signature: null,
            updated_at: new Date()
          });

        // Add back to queue for re-processing
        // This would trigger the minting worker to pick it up again
        logger.info('Reset ticket for re-minting', { ticketId });
        fixed++;

      } catch (error) {
        logger.error('Failed to fix ticket', {
          ticketId,
          error: (error as Error).message
        });
        failed++;
      }
    }

    return {
      attempted: ticketIds.length,
      fixed,
      failed
    };
  }

  /**
   * Store reconciliation report
   */
  private async storeReconciliationReport(
    venueId: string,
    summary: ReconciliationSummary
  ): Promise<void> {
    try {
      await db('minting_reconciliation_reports').insert({
        venue_id: venueId,
        report_date: new Date(),
        total_checked: summary.totalChecked,
        confirmed: summary.confirmed,
        not_found: summary.notFound,
        pending: summary.pending,
        errors: summary.errors,
        discrepancy_count: summary.discrepancies.length,
        discrepancy_rate: summary.totalChecked > 0 
          ? (summary.discrepancies.length / summary.totalChecked) * 100 
          : 0,
        report_data: JSON.stringify(summary),
        created_at: new Date()
      });

      logger.info('Reconciliation report stored', { venueId });

    } catch (error) {
      logger.error('Failed to store reconciliation report', {
        venueId,
        error: (error as Error).message
      });
      // Don't throw - this is not critical
    }
  }

  /**
   * Get reconciliation history
   */
  async getReconciliationHistory(
    venueId: string,
    limit: number = 10
  ): Promise<any[]> {
    return db('minting_reconciliation_reports')
      .where({ venue_id: venueId })
      .orderBy('report_date', 'desc')
      .limit(limit)
      .select('*');
  }

  /**
   * Get metrics for monitoring
   */
  async getReconciliationMetrics(venueId: string): Promise<{
    lastReconciliation: Date | null;
    avgDiscrepancyRate: number;
    totalDiscrepanciesFixed: number;
  }> {
    const lastReport = await db('minting_reconciliation_reports')
      .where({ venue_id: venueId })
      .orderBy('report_date', 'desc')
      .first();

    const avgRate = await db('minting_reconciliation_reports')
      .where({ venue_id: venueId })
      .avg('discrepancy_rate as rate')
      .first();

    return {
      lastReconciliation: lastReport?.report_date || null,
      avgDiscrepancyRate: parseFloat(avgRate?.rate || '0'),
      totalDiscrepanciesFixed: 0 // Would need separate tracking
    };
  }
}
