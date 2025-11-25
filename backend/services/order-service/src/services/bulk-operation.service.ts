import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import {
  BulkOperation,
  BulkOperationRequest,
  BulkOperationType,
  BulkOperationStatus,
} from '../types/bulk.types';

/**
 * Bulk Operation Service
 * Handles bulk operations on multiple orders
 */
export class BulkOperationService {
  /**
   * Create a bulk operation
   */
  async createBulkOperation(
    tenantId: string,
    userId: string,
    request: BulkOperationRequest
  ): Promise<BulkOperation> {
    const db = getDatabase();

    try {
      const result = await db.query(
        `INSERT INTO bulk_operations (
          id, tenant_id, operation_type, status, order_ids, total_count,
          initiated_by, parameters, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
        ) RETURNING *`,
        [
          tenantId,
          request.operationType,
          BulkOperationStatus.PENDING,
          request.orderIds,
          request.orderIds.length,
          userId,
          JSON.stringify(request.parameters || {}),
        ]
      );

      const operation = result.rows[0];

      logger.info('Bulk operation created', {
        operationId: operation.id,
        type: request.operationType,
        orderCount: request.orderIds.length,
      });

      // Process asynchronously
      this.processBulkOperation(operation.id).catch(error => {
        logger.error('Error processing bulk operation', { error, operationId: operation.id });
      });

      return this.mapToBulkOperation(operation);
    } catch (error) {
      logger.error('Error creating bulk operation', { error, request });
      throw error;
    }
  }

  /**
   * Process bulk operation
   */
  private async processBulkOperation(operationId: string): Promise<void> {
    const db = getDatabase();

    try {
      // Update status to processing
      await db.query(
        `UPDATE bulk_operations 
         SET status = $1, started_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [BulkOperationStatus.PROCESSING, operationId]
      );

      // Get operation details
      const opResult = await db.query(
        'SELECT * FROM bulk_operations WHERE id = $1',
        [operationId]
      );

      const operation = opResult.rows[0];
      const results: any[] = [];
      const errors: any[] = [];
      let successCount = 0;
      let failedCount = 0;

      // Process each order (simplified)
      for (const orderId of operation.order_ids) {
        try {
          // Simulate processing based on operation type
          await this.processOrder(orderId, operation.operation_type, operation.parameters);
          results.push({ orderId, status: 'success' });
          successCount++;
        } catch (error) {
          errors.push({ orderId, error: error instanceof Error ? error.message : 'Unknown error' });
          failedCount++;
        }
      }

      // Determine final status
      const finalStatus =
        failedCount === 0
          ? BulkOperationStatus.COMPLETED
          : successCount === 0
          ? BulkOperationStatus.FAILED
          : BulkOperationStatus.PARTIAL_SUCCESS;

      // Update operation with results
      await db.query(
        `UPDATE bulk_operations 
         SET status = $1, 
             processed_count = $2,
             success_count = $3,
             failed_count = $4,
             results = $5,
             errors = $6,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $7`,
        [
          finalStatus,
          operation.order_ids.length,
          successCount,
          failedCount,
          JSON.stringify(results),
          JSON.stringify(errors),
          operationId,
        ]
      );

      logger.info('Bulk operation completed', {
        operationId,
        successCount,
        failedCount,
        status: finalStatus,
      });
    } catch (error) {
      logger.error('Error processing bulk operation', { error, operationId });
      
      // Update status to failed
      await db.query(
        `UPDATE bulk_operations 
         SET status = $1, updated_at = NOW() 
         WHERE id = $2`,
        [BulkOperationStatus.FAILED, operationId]
      );
    }
  }

  /**
   * Process individual order based on operation type
   */
  private async processOrder(
    orderId: string,
    operationType: string,
    parameters: any
  ): Promise<void> {
    // Simplified - would call appropriate service methods
    logger.info('Processing order in bulk operation', { orderId, operationType });
  }

  /**
   * Get bulk operation by ID
   */
  async getBulkOperation(operationId: string): Promise<BulkOperation | null> {
    const db = getDatabase();

    try {
      const result = await db.query(
        'SELECT * FROM bulk_operations WHERE id = $1',
        [operationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToBulkOperation(result.rows[0]);
    } catch (error) {
      logger.error('Error getting bulk operation', { error, operationId });
      throw error;
    }
  }

  /**
   * List bulk operations for tenant
   */
  async listBulkOperations(tenantId: string, limit: number = 50): Promise<BulkOperation[]> {
    const db = getDatabase();

    try {
      const result = await db.query(
        `SELECT * FROM bulk_operations 
         WHERE tenant_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [tenantId, limit]
      );

      return result.rows.map(row => this.mapToBulkOperation(row));
    } catch (error) {
      logger.error('Error listing bulk operations', { error, tenantId });
      throw error;
    }
  }

  private mapToBulkOperation(row: any): BulkOperation {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      operationType: row.operation_type,
      status: row.status,
      orderIds: row.order_ids,
      totalCount: row.total_count,
      processedCount: row.processed_count || 0,
      successCount: row.success_count || 0,
      failedCount: row.failed_count || 0,
      results: row.results,
      errors: row.errors,
      initiatedBy: row.initiated_by,
      parameters: row.parameters,
      metadata: row.metadata,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
    };
  }
}

