import { Pool } from 'pg';
import { TransferService } from './transfer.service';
import logger from '../utils/logger';

/**
 * BATCH TRANSFER SERVICE
 * 
 * Handles bulk transfer operations
 * Phase 6: Enhanced Features & Business Logic
 */

export interface BatchTransferItem {
  ticketId: string;
  toEmail: string;
  message?: string;
}

export interface BatchTransferResult {
  batchId: string;
  totalItems: number;
  successCount: number;
  failureCount: number;
  results: {
    ticketId: string;
    success: boolean;
    transferId?: string;
    error?: string;
  }[];
}

export class BatchTransferService {
  private transferService: TransferService;

  constructor(private readonly pool: Pool) {
    this.transferService = new TransferService(pool);
  }

  /**
   * Execute batch transfer
   */
  async executeBatchTransfer(
    fromUserId: string,
    items: BatchTransferItem[]
  ): Promise<BatchTransferResult> {
    const batchId = this.generateBatchId();
    
    logger.info('Starting batch transfer', {
      batchId,
      fromUserId,
      itemCount: items.length
    });

    // Create batch record
    await this.createBatchRecord(batchId, fromUserId, items.length);

    const results: BatchTransferResult['results'] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process each transfer
    for (const item of items) {
      try {
        const result = await this.transferService.createGiftTransfer(fromUserId, {
          ticketId: item.ticketId,
          toEmail: item.toEmail,
          message: item.message
        });

        results.push({
          ticketId: item.ticketId,
          success: true,
          transferId: result.transferId
        });

        successCount++;

        // Update batch item status
        await this.updateBatchItemStatus(batchId, item.ticketId, 'SUCCESS', result.transferId);

      } catch (error) {
        const err = error as Error;
        results.push({
          ticketId: item.ticketId,
          success: false,
          error: err.message
        });

        failureCount++;

        // Update batch item status
        await this.updateBatchItemStatus(batchId, item.ticketId, 'FAILED', undefined, err.message);
      }
    }

    // Update batch completion
    await this.completeBatchRecord(batchId, successCount, failureCount);

    logger.info('Batch transfer completed', {
      batchId,
      successCount,
      failureCount
    });

    return {
      batchId,
      totalItems: items.length,
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Create batch record
   */
  private async createBatchRecord(
    batchId: string,
    userId: string,
    itemCount: number
  ): Promise<void> {
    await this.pool.query(`
      INSERT INTO batch_transfers (
        id,
        user_id,
        total_items,
        status,
        created_at
      ) VALUES ($1, $2, $3, 'PROCESSING', NOW())
    `, [batchId, userId, itemCount]);
  }

  /**
   * Update batch item status
   */
  private async updateBatchItemStatus(
    batchId: string,
    ticketId: string,
    status: string,
    transferId?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.pool.query(`
      INSERT INTO batch_transfer_items (
        batch_id,
        ticket_id,
        transfer_id,
        status,
        error_message,
        processed_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `, [batchId, ticketId, transferId, status, errorMessage]);
  }

  /**
   * Complete batch record
   */
  private async completeBatchRecord(
    batchId: string,
    successCount: number,
    failureCount: number
  ): Promise<void> {
    await this.pool.query(`
      UPDATE batch_transfers
      SET 
        success_count = $1,
        failure_count = $2,
        status = 'COMPLETED',
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $3
    `, [successCount, failureCount, batchId]);
  }

  /**
   * Get batch status
   */
  async getBatchStatus(batchId: string) {
    const batchResult = await this.pool.query(`
      SELECT 
        id,
        user_id,
        total_items,
        success_count,
        failure_count,
        status,
        created_at,
        completed_at
      FROM batch_transfers
      WHERE id = $1
    `, [batchId]);

    if (batchResult.rows.length === 0) {
      return null;
    }

    const batch = batchResult.rows[0];

    // Get item statuses
    const itemsResult = await this.pool.query(`
      SELECT 
        ticket_id,
        transfer_id,
        status,
        error_message,
        processed_at
      FROM batch_transfer_items
      WHERE batch_id = $1
      ORDER BY processed_at
    `, [batchId]);

    return {
      ...batch,
      items: itemsResult.rows
    };
  }

  /**
   * Generate batch ID
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cancel pending batch
   */
  async cancelBatch(batchId: string): Promise<void> {
    await this.pool.query(`
      UPDATE batch_transfers
      SET 
        status = 'CANCELLED',
        updated_at = NOW()
      WHERE id = $1 AND status = 'PROCESSING'
    `, [batchId]);

    logger.info('Batch cancelled', { batchId });
  }
}
