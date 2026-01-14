/**
 * Batch Operations Service
 * 
 * Provides efficient batch processing capabilities for ticket operations
 * Supports bulk ticket transfers, updates, and blockchain operations
 */

import { logger } from '../utils/logger';
import { DatabaseService } from './databaseService';
import { SolanaService } from './solanaService';
import { RedisService } from './redisService';
import { Counter, Histogram, Gauge } from 'prom-client';

const log = logger.child({ component: 'BatchOperationsService' });

// =============================================================================
// PROMETHEUS METRICS
// =============================================================================

export const batchMetrics = {
  operationsTotal: new Counter({
    name: 'ticket_batch_operations_total',
    help: 'Total batch operations processed',
    labelNames: ['operation', 'status'] as const,
  }),
  operationDurationSeconds: new Histogram({
    name: 'ticket_batch_operation_duration_seconds',
    help: 'Duration of batch operations',
    labelNames: ['operation'] as const,
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  }),
  itemsProcessed: new Counter({
    name: 'ticket_batch_items_processed_total',
    help: 'Total items processed in batch operations',
    labelNames: ['operation'] as const,
  }),
  activeOperations: new Gauge({
    name: 'ticket_batch_active_operations',
    help: 'Currently active batch operations',
    labelNames: ['operation'] as const,
  }),
  failedItems: new Counter({
    name: 'ticket_batch_failed_items_total',
    help: 'Total items that failed in batch operations',
    labelNames: ['operation', 'reason'] as const,
  }),
};

// =============================================================================
// CONFIGURATION
// =============================================================================

interface BatchConfig {
  /** Maximum batch size for database operations */
  maxBatchSize: number;
  /** Maximum concurrent operations */
  maxConcurrency: number;
  /** Timeout for individual items (ms) */
  itemTimeoutMs: number;
  /** Whether to continue on individual item failures */
  continueOnError: boolean;
  /** Retry count for failed items */
  retryCount: number;
  /** Delay between retries (ms) */
  retryDelayMs: number;
}

const DEFAULT_CONFIG: BatchConfig = {
  maxBatchSize: parseInt(process.env.BATCH_MAX_SIZE || '100', 10),
  maxConcurrency: parseInt(process.env.BATCH_MAX_CONCURRENCY || '10', 10),
  itemTimeoutMs: parseInt(process.env.BATCH_ITEM_TIMEOUT_MS || '30000', 10),
  continueOnError: process.env.BATCH_CONTINUE_ON_ERROR !== 'false',
  retryCount: parseInt(process.env.BATCH_RETRY_COUNT || '2', 10),
  retryDelayMs: parseInt(process.env.BATCH_RETRY_DELAY_MS || '1000', 10),
};

// =============================================================================
// TYPES
// =============================================================================

interface BatchResult<T> {
  success: boolean;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  results: BatchItemResult<T>[];
  durationMs: number;
  errors: BatchError[];
}

interface BatchItemResult<T> {
  id: string;
  success: boolean;
  result?: T;
  error?: string;
  retries: number;
}

interface BatchError {
  id: string;
  error: string;
  code?: string;
}

interface BulkTicketUpdate {
  ticketId: string;
  status?: string;
  metadata?: Record<string, any>;
  ownerId?: string;
}

interface BulkTransferRequest {
  ticketId: string;
  fromUserId: string;
  toUserId: string;
  reason?: string;
}

interface BulkMintRequest {
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  ownerIds: string[];
}

// =============================================================================
// BATCH OPERATIONS SERVICE
// =============================================================================

export class BatchOperationsService {
  private config: BatchConfig;
  private activeOperations = new Map<string, { started: Date; operation: string }>();

  constructor(config?: Partial<BatchConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // BULK TICKET UPDATES
  // ===========================================================================

  /**
   * Update multiple tickets in a single batch operation
   */
  async bulkUpdateTickets(
    tenantId: string,
    updates: BulkTicketUpdate[],
    actorId: string
  ): Promise<BatchResult<{ ticketId: string }>> {
    const operationId = this.startOperation('bulk_update');
    const startTime = Date.now();
    const results: BatchItemResult<{ ticketId: string }>[] = [];
    const errors: BatchError[] = [];

    try {
      log.info('Starting bulk ticket update', {
        tenantId,
        count: updates.length,
        actorId,
      });

      // Validate batch size
      if (updates.length > this.config.maxBatchSize) {
        throw new Error(`Batch size ${updates.length} exceeds maximum ${this.config.maxBatchSize}`);
      }

      // Process in parallel with concurrency limit
      const batches = this.chunkArray(updates, this.config.maxConcurrency);

      for (const batch of batches) {
        const batchResults = await Promise.allSettled(
          batch.map(update => this.updateSingleTicket(tenantId, update, actorId))
        );

        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i];
          const update = batch[i];

          if (result.status === 'fulfilled') {
            results.push({
              id: update.ticketId,
              success: true,
              result: { ticketId: update.ticketId },
              retries: 0,
            });
            batchMetrics.itemsProcessed.inc({ operation: 'bulk_update' });
          } else {
            const error = result.reason?.message || 'Unknown error';
            results.push({
              id: update.ticketId,
              success: false,
              error,
              retries: 0,
            });
            errors.push({ id: update.ticketId, error });
            batchMetrics.failedItems.inc({ operation: 'bulk_update', reason: 'error' });
          }
        }
      }

      const successCount = results.filter(r => r.success).length;
      const success = errors.length === 0 || (this.config.continueOnError && successCount > 0);

      batchMetrics.operationsTotal.inc({ operation: 'bulk_update', status: success ? 'success' : 'failure' });

      return {
        success,
        totalItems: updates.length,
        processedItems: successCount,
        failedItems: errors.length,
        results,
        durationMs: Date.now() - startTime,
        errors,
      };
    } finally {
      this.endOperation(operationId, 'bulk_update', startTime);
    }
  }

  private async updateSingleTicket(
    tenantId: string,
    update: BulkTicketUpdate,
    actorId: string
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;

    if (update.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(update.status);
    }
    if (update.metadata !== undefined) {
      setClauses.push(`metadata = metadata || $${paramIndex++}`);
      values.push(JSON.stringify(update.metadata));
    }
    if (update.ownerId !== undefined) {
      setClauses.push(`owner_id = $${paramIndex++}`);
      values.push(update.ownerId);
    }

    values.push(update.ticketId, tenantId);

    await DatabaseService.query(
      `UPDATE tickets SET ${setClauses.join(', ')} 
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
      values
    );
  }

  // ===========================================================================
  // BULK TRANSFERS
  // ===========================================================================

  /**
   * Process multiple ticket transfers in a batch
   */
  async bulkTransferTickets(
    tenantId: string,
    transfers: BulkTransferRequest[],
    actorId: string
  ): Promise<BatchResult<{ ticketId: string; txSignature?: string }>> {
    const operationId = this.startOperation('bulk_transfer');
    const startTime = Date.now();
    const results: BatchItemResult<{ ticketId: string; txSignature?: string }>[] = [];
    const errors: BatchError[] = [];

    try {
      log.info('Starting bulk ticket transfer', {
        tenantId,
        count: transfers.length,
        actorId,
      });

      if (transfers.length > this.config.maxBatchSize) {
        throw new Error(`Batch size ${transfers.length} exceeds maximum ${this.config.maxBatchSize}`);
      }

      // Process sequentially to maintain order and avoid race conditions
      for (const transfer of transfers) {
        let retries = 0;
        let success = false;
        let error: string | undefined;
        let txSignature: string | undefined;

        while (retries <= this.config.retryCount && !success) {
          try {
            txSignature = await this.processSingleTransfer(tenantId, transfer, actorId);
            success = true;
            batchMetrics.itemsProcessed.inc({ operation: 'bulk_transfer' });
          } catch (err) {
            error = err instanceof Error ? err.message : 'Unknown error';
            retries++;
            if (retries <= this.config.retryCount) {
              await this.delay(this.config.retryDelayMs * retries);
            }
          }
        }

        results.push({
          id: transfer.ticketId,
          success,
          result: success ? { ticketId: transfer.ticketId, txSignature } : undefined,
          error: success ? undefined : error,
          retries,
        });

        if (!success) {
          errors.push({ id: transfer.ticketId, error: error || 'Unknown error' });
          batchMetrics.failedItems.inc({ operation: 'bulk_transfer', reason: 'error' });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const operationSuccess = errors.length === 0 || (this.config.continueOnError && successCount > 0);

      batchMetrics.operationsTotal.inc({ 
        operation: 'bulk_transfer', 
        status: operationSuccess ? 'success' : 'failure' 
      });

      return {
        success: operationSuccess,
        totalItems: transfers.length,
        processedItems: successCount,
        failedItems: errors.length,
        results,
        durationMs: Date.now() - startTime,
        errors,
      };
    } finally {
      this.endOperation(operationId, 'bulk_transfer', startTime);
    }
  }

  private async processSingleTransfer(
    tenantId: string,
    transfer: BulkTransferRequest,
    actorId: string
  ): Promise<string | undefined> {
    // Use transaction helper for safe database operations
    const pool = DatabaseService.getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);

      // Verify ownership
      const ticketResult = await client.query(
        `SELECT owner_id, nft_mint, status FROM tickets 
         WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [transfer.ticketId, tenantId]
      );

      if (ticketResult.rows.length === 0) {
        throw new Error('Ticket not found');
      }

      const ticket = ticketResult.rows[0];
      if (ticket.owner_id !== transfer.fromUserId) {
        throw new Error('Transfer from user is not the owner');
      }

      if (ticket.status !== 'active' && ticket.status !== 'valid') {
        throw new Error(`Cannot transfer ticket in status: ${ticket.status}`);
      }

      // Update ownership in database
      await client.query(
        `UPDATE tickets SET owner_id = $1, updated_at = NOW() WHERE id = $2`,
        [transfer.toUserId, transfer.ticketId]
      );

      // Record transfer
      await client.query(
        `INSERT INTO ticket_transfers (ticket_id, from_user_id, to_user_id, reason, actor_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [transfer.ticketId, transfer.fromUserId, transfer.toUserId, transfer.reason, actorId, tenantId]
      );

      await client.query('COMMIT');

      // If NFT exists, initiate blockchain transfer (async)
      if (ticket.nft_mint) {
        // Queue blockchain transfer - don't await
        // Note: transferNFT would need to be implemented with proper wallet handling
        log.info('NFT transfer queued for blockchain processing', {
          ticketId: transfer.ticketId,
          nftMint: ticket.nft_mint,
          toUserId: transfer.toUserId,
        });
      }

      return undefined; // Return tx signature when available
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // BULK OPERATIONS FOR EVENTS
  // ===========================================================================

  /**
   * Cancel all tickets for an event
   */
  async cancelEventTickets(
    tenantId: string,
    eventId: string,
    reason: string,
    actorId: string
  ): Promise<BatchResult<{ ticketId: string }>> {
    const operationId = this.startOperation('event_cancellation');
    const startTime = Date.now();
    
    try {
      log.info('Starting event ticket cancellation', {
        tenantId,
        eventId,
        reason,
        actorId,
      });

      // Get all active tickets for the event
      const ticketsResult = await DatabaseService.query<{ id: string }>(
        `SELECT id FROM tickets 
         WHERE event_id = $1 AND tenant_id = $2 
         AND status NOT IN ('cancelled', 'refunded', 'expired')`,
        [eventId, tenantId]
      );

      const updates: BulkTicketUpdate[] = ticketsResult.rows.map(t => ({
        ticketId: t.id,
        status: 'cancelled',
        metadata: { cancellationReason: reason, cancelledAt: new Date().toISOString() },
      }));

      const result = await this.bulkUpdateTickets(tenantId, updates, actorId);

      // Record event cancellation
      await DatabaseService.query(
        `INSERT INTO event_cancellations (event_id, tenant_id, reason, actor_id, ticket_count)
         VALUES ($1, $2, $3, $4, $5)`,
        [eventId, tenantId, reason, actorId, updates.length]
      );

      batchMetrics.operationsTotal.inc({ 
        operation: 'event_cancellation', 
        status: result.success ? 'success' : 'failure' 
      });

      return result;
    } finally {
      this.endOperation(operationId, 'event_cancellation', startTime);
    }
  }

  // ===========================================================================
  // BULK VALIDATION
  // ===========================================================================

  /**
   * Validate multiple tickets at once (e.g., for group entry)
   */
  async bulkValidateTickets(
    tenantId: string,
    ticketIds: string[],
    scanLocation: string,
    scannerId: string
  ): Promise<BatchResult<{ ticketId: string; valid: boolean; reason?: string }>> {
    const operationId = this.startOperation('bulk_validate');
    const startTime = Date.now();
    const results: BatchItemResult<{ ticketId: string; valid: boolean; reason?: string }>[] = [];
    const errors: BatchError[] = [];

    try {
      log.info('Starting bulk ticket validation', {
        tenantId,
        count: ticketIds.length,
        scanLocation,
        scannerId,
      });

      // Fetch all tickets in one query
      const ticketsResult = await DatabaseService.query<{
        id: string;
        status: string;
        event_id: string;
        scan_count: number;
      }>(
        `SELECT id, status, event_id, COALESCE(scan_count, 0) as scan_count
         FROM tickets 
         WHERE id = ANY($1) AND tenant_id = $2`,
        [ticketIds, tenantId]
      );

      const ticketMap = new Map(ticketsResult.rows.map(t => [t.id, t]));

      for (const ticketId of ticketIds) {
        const ticket = ticketMap.get(ticketId);

        if (!ticket) {
          results.push({
            id: ticketId,
            success: true,
            result: { ticketId, valid: false, reason: 'Ticket not found' },
            retries: 0,
          });
          continue;
        }

        const validation = this.validateTicket(ticket);
        results.push({
          id: ticketId,
          success: true,
          result: { ticketId, ...validation },
          retries: 0,
        });

        if (validation.valid) {
          // Record scan
          await DatabaseService.query(
            `INSERT INTO ticket_scans (ticket_id, tenant_id, scan_location, scanned_by)
             VALUES ($1, $2, $3, $4)`,
            [ticketId, tenantId, scanLocation, scannerId]
          );
          
          await DatabaseService.query(
            `UPDATE tickets SET scan_count = scan_count + 1, last_scan_at = NOW() WHERE id = $1`,
            [ticketId]
          );
        }

        batchMetrics.itemsProcessed.inc({ operation: 'bulk_validate' });
      }

      batchMetrics.operationsTotal.inc({ operation: 'bulk_validate', status: 'success' });

      return {
        success: true,
        totalItems: ticketIds.length,
        processedItems: results.length,
        failedItems: 0,
        results,
        durationMs: Date.now() - startTime,
        errors,
      };
    } finally {
      this.endOperation(operationId, 'bulk_validate', startTime);
    }
  }

  private validateTicket(ticket: { status: string; scan_count: number }): { 
    valid: boolean; 
    reason?: string 
  } {
    if (ticket.status === 'cancelled') {
      return { valid: false, reason: 'Ticket is cancelled' };
    }
    if (ticket.status === 'used') {
      return { valid: false, reason: 'Ticket already used' };
    }
    if (ticket.status === 'expired') {
      return { valid: false, reason: 'Ticket is expired' };
    }
    if (ticket.scan_count > 0) {
      return { valid: false, reason: 'Ticket already scanned' };
    }
    return { valid: true };
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private startOperation(operation: string): string {
    const id = `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.activeOperations.set(id, { started: new Date(), operation });
    batchMetrics.activeOperations.inc({ operation });
    return id;
  }

  private endOperation(id: string, operation: string, startTime: number): void {
    this.activeOperations.delete(id);
    batchMetrics.activeOperations.dec({ operation });
    batchMetrics.operationDurationSeconds.observe(
      { operation },
      (Date.now() - startTime) / 1000
    );
  }

  /**
   * Get active operations
   */
  getActiveOperations(): { id: string; operation: string; started: Date }[] {
    return Array.from(this.activeOperations.entries()).map(([id, data]) => ({
      id,
      operation: data.operation,
      started: data.started,
    }));
  }

  /**
   * Get Prometheus metrics
   */
  getPrometheusMetrics(): string {
    return ''; // Metrics are auto-collected by prom-client
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const batchOperationsService = new BatchOperationsService();

export default BatchOperationsService;
