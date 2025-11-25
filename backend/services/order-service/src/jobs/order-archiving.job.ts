import { getDatabase } from '../config/database';
import { orderConfig } from '../config/order.config';
import { logger, createContextLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface ArchiveStats {
  ordersArchived: number;
  itemsArchived: number;
  eventsArchived: number;
  addressesArchived: number;
  discountsArchived: number;
  refundsArchived: number;
  ordersDeleted: number;
  errors: string[];
}

interface ArchiveAuditLog {
  id: string;
  tenantId: string;
  operation: 'ARCHIVE' | 'DELETE';
  ordersAffected: number;
  itemsAffected: number;
  eventsAffected: number;
  thresholdDate: Date;
  daysOld: number;
  executedBy: string;
  notes: string | null;
  metadata: Record<string, any>;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  success: boolean;
  errorMessage: string | null;
}

/**
 * Archive old orders to dedicated archive schema
 * This reduces main table size and improves query performance
 */
export class OrderArchivingJob {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private jobLogger = createContextLogger({ context: 'order-archiving-job' });

  /**
   * Start the archiving job with configured interval
   * Runs daily (every 24 hours) by default
   */
  start(): void {
    if (!orderConfig.archiving.enabled) {
      logger.info('Order archiving disabled via configuration');
      return;
    }

    if (this.intervalId) {
      logger.warn('Order archiving job already running');
      return;
    }

    // Run daily (24 hours = 86400 seconds)
    const intervalSeconds = 86400; // Run once per day
    logger.info(`Starting order archiving job (interval: ${intervalSeconds}s = 24h)`, {
      retentionDays: orderConfig.archiving.retentionDays,
      dryRun: orderConfig.archiving.dryRun
    });

    this.intervalId = setInterval(
      () => this.execute().catch((error) => {
        this.jobLogger.error('Order archiving job failed', { error });
      }),
      intervalSeconds * 1000
    );

    // Run once on startup (after a delay to let system stabilize)
    setTimeout(() => {
      this.execute().catch((error) => {
        this.jobLogger.error('Initial order archiving job failed', { error });
      });
    }, 60000); // Wait 1 minute before first run
  }

  /**
   * Stop the archiving job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Order archiving job stopped');
    }
  }

  /**
   * Execute the archiving process
   */
  async execute(): Promise<ArchiveStats> {
    if (this.isRunning) {
      this.jobLogger.warn('Order archiving job already running, skipping execution');
      return this.emptyStats();
    }

    this.isRunning = true;
    const startTime = Date.now();
    const stats: ArchiveStats = this.emptyStats();

    try {
      this.jobLogger.info('Starting order archiving job', {
        retentionDays: orderConfig.archiving.retentionDays,
        batchSize: orderConfig.archiving.batchSize,
        maxOrdersPerRun: orderConfig.archiving.maxOrdersPerRun,
        dryRun: orderConfig.archiving.dryRun
      });

      // Calculate threshold date
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - orderConfig.archiving.retentionDays);

      // Get list of tenants to process
      const tenants = await this.getTenants();
      this.jobLogger.info(`Found ${tenants.length} tenants to process`);

      // Process each tenant
      for (const tenantId of tenants) {
        try {
          const tenantStats = await this.archiveTenantOrders(tenantId, thresholdDate);
          this.mergeStats(stats, tenantStats);
        } catch (error) {
          const errorMsg = `Failed to archive orders for tenant ${tenantId}: ${error}`;
          this.jobLogger.error(errorMsg, { error, tenantId });
          stats.errors.push(errorMsg);
        }
      }

      const duration = Date.now() - startTime;
      this.jobLogger.info('Order archiving job completed', {
        ...stats,
        durationMs: duration,
        durationSeconds: (duration / 1000).toFixed(2)
      });

      return stats;

    } catch (error) {
      const errorMsg = `Order archiving job failed: ${error}`;
      this.jobLogger.error(errorMsg, { error });
      stats.errors.push(errorMsg);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Archive orders for a specific tenant
   */
  private async archiveTenantOrders(tenantId: string, thresholdDate: Date): Promise<ArchiveStats> {
    const db = getDatabase();
    const stats: ArchiveStats = this.emptyStats();
    const auditId = uuidv4();
    const startedAt = new Date();

    try {
      // Find orders to archive
      const ordersToArchive = await db.query(`
        SELECT id, order_number, status, created_at
        FROM orders
        WHERE tenant_id = $1
          AND created_at < $2
          AND status = ANY($3::text[])
        ORDER BY created_at ASC
        LIMIT $4
      `, [
        tenantId,
        thresholdDate,
        orderConfig.archiving.archivableStatuses,
        orderConfig.archiving.maxOrdersPerRun
      ]);

      if (ordersToArchive.rows.length === 0) {
        this.jobLogger.debug(`No orders to archive for tenant ${tenantId}`);
        return stats;
      }

      this.jobLogger.info(`Found ${ordersToArchive.rows.length} orders to archive for tenant ${tenantId}`);

      if (orderConfig.archiving.dryRun) {
        this.jobLogger.info('[DRY RUN] Would archive orders', {
          tenantId,
          count: ordersToArchive.rows.length,
          oldestOrder: ordersToArchive.rows[0].created_at,
          newestOrder: ordersToArchive.rows[ordersToArchive.rows.length - 1].created_at
        });
        stats.ordersArchived = ordersToArchive.rows.length;
        return stats;
      }

      const orderIds = ordersToArchive.rows.map(row => row.id);

      // Process in batches
      for (let i = 0; i < orderIds.length; i += orderConfig.archiving.batchSize) {
        const batch = orderIds.slice(i, i + orderConfig.archiving.batchSize);
        const batchStats = await this.archiveBatch(tenantId, batch, thresholdDate);
        this.mergeStats(stats, batchStats);
      }

      // Log audit record
      await this.logAuditRecord({
        id: auditId,
        tenantId,
        operation: 'ARCHIVE',
        ordersAffected: stats.ordersArchived,
        itemsAffected: stats.itemsArchived,
        eventsAffected: stats.eventsArchived,
        thresholdDate,
        daysOld: orderConfig.archiving.retentionDays,
        executedBy: 'system-archiving-job',
        notes: stats.errors.length > 0 ? stats.errors.join('; ') : null,
        metadata: {
          batchSize: orderConfig.archiving.batchSize,
          addressesArchived: stats.addressesArchived,
          discountsArchived: stats.discountsArchived,
          refundsArchived: stats.refundsArchived
        },
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        success: stats.errors.length === 0,
        errorMessage: stats.errors.length > 0 ? stats.errors[0] : null
      });

      return stats;

    } catch (error) {
      // Log failed audit record
      await this.logAuditRecord({
        id: auditId,
        tenantId,
        operation: 'ARCHIVE',
        ordersAffected: stats.ordersArchived,
        itemsAffected: stats.itemsArchived,
        eventsAffected: stats.eventsArchived,
        thresholdDate,
        daysOld: orderConfig.archiving.retentionDays,
        executedBy: 'system-archiving-job',
        notes: null,
        metadata: {},
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        success: false,
        errorMessage: String(error)
      }).catch(auditError => {
        this.jobLogger.error('Failed to log failed audit record', { auditError });
      });

      throw error;
    }
  }

  /**
   * Archive a batch of orders
   */
  private async archiveBatch(tenantId: string, orderIds: string[], thresholdDate: Date): Promise<ArchiveStats> {
    const db = getDatabase();
    const stats: ArchiveStats = this.emptyStats();

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Archive orders
      const ordersResult = await client.query(`
        INSERT INTO archive.orders
        SELECT *, NOW() as archived_at, 'age_threshold' as archive_reason, NULL as archive_notes
        FROM orders
        WHERE id = ANY($1)
        ON CONFLICT (id) DO NOTHING
      `, [orderIds]);
      stats.ordersArchived = ordersResult.rowCount || 0;

      // Archive order items
      const itemsResult = await client.query(`
        INSERT INTO archive.order_items
        SELECT *, NOW() as archived_at
        FROM order_items
        WHERE order_id = ANY($1)
        ON CONFLICT (id) DO NOTHING
      `, [orderIds]);
      stats.itemsArchived = itemsResult.rowCount || 0;

      // Archive order events
      const eventsResult = await client.query(`
        INSERT INTO archive.order_events
        SELECT *, NOW() as archived_at
        FROM order_events
        WHERE order_id = ANY($1)
        ON CONFLICT (id) DO NOTHING
      `, [orderIds]);
      stats.eventsArchived = eventsResult.rowCount || 0;

      // Archive order addresses
      const addressesResult = await client.query(`
        INSERT INTO archive.order_addresses
        SELECT *, NOW() as archived_at
        FROM order_addresses
        WHERE order_id = ANY($1)
        ON CONFLICT (id) DO NOTHING
      `, [orderIds]);
      stats.addressesArchived = addressesResult.rowCount || 0;

      // Archive order discounts
      const discountsResult = await client.query(`
        INSERT INTO archive.order_discounts
        SELECT *, NOW() as archived_at
        FROM order_discounts
        WHERE order_id = ANY($1)
        ON CONFLICT (id) DO NOTHING
      `, [orderIds]);
      stats.discountsArchived = discountsResult.rowCount || 0;

      // Archive order refunds
      const refundsResult = await client.query(`
        INSERT INTO archive.order_refunds
        SELECT *, NOW() as archived_at
        FROM order_refunds
        WHERE order_id = ANY($1)
        ON CONFLICT (id) DO NOTHING
      `, [orderIds]);
      stats.refundsArchived = refundsResult.rowCount || 0;

      // Delete from main tables if configured
      if (orderConfig.archiving.deleteAfterDays > 0) {
        const deleteThreshold = new Date();
        deleteThreshold.setDate(deleteThreshold.getDate() - orderConfig.archiving.deleteAfterDays);

        if (thresholdDate < deleteThreshold) {
          // Orders are old enough to delete
          await client.query('DELETE FROM order_refunds WHERE order_id = ANY($1)', [orderIds]);
          await client.query('DELETE FROM order_discounts WHERE order_id = ANY($1)', [orderIds]);
          await client.query('DELETE FROM order_addresses WHERE order_id = ANY($1)', [orderIds]);
          await client.query('DELETE FROM order_events WHERE order_id = ANY($1)', [orderIds]);
          await client.query('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
          const deleteResult = await client.query('DELETE FROM orders WHERE id = ANY($1)', [orderIds]);
          stats.ordersDeleted = deleteResult.rowCount || 0;
        }
      }

      await client.query('COMMIT');

      this.jobLogger.debug(`Archived batch of ${orderIds.length} orders`, { stats, tenantId });

      return stats;

    } catch (error) {
      await client.query('ROLLBACK');
      this.jobLogger.error('Failed to archive batch', { error, orderIds: orderIds.length, tenantId });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get list of tenant IDs
   */
  private async getTenants(): Promise<string[]> {
    const db = getDatabase();
    const result = await db.query('SELECT DISTINCT tenant_id FROM orders');
    return result.rows.map(row => row.tenant_id);
  }

  /**
   * Log archiving operation to audit log
   */
  private async logAuditRecord(record: ArchiveAuditLog): Promise<void> {
    const db = getDatabase();
    
    try {
      await db.query(`
        INSERT INTO archive.archive_audit_log (
          id, tenant_id, operation, orders_affected, items_affected, events_affected,
          threshold_date, days_old, executed_by, notes, metadata,
          started_at, completed_at, duration_ms, success, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        record.id,
        record.tenantId,
        record.operation,
        record.ordersAffected,
        record.itemsAffected,
        record.eventsAffected,
        record.thresholdDate,
        record.daysOld,
        record.executedBy,
        record.notes,
        JSON.stringify(record.metadata),
        record.startedAt,
        record.completedAt,
        record.durationMs,
        record.success,
        record.errorMessage
      ]);
    } catch (error) {
      this.jobLogger.error('Failed to log audit record', { error, record });
      // Don't throw - we don't want to fail the job just because audit logging failed
    }
  }

  /**
   * Initialize empty stats object
   */
  private emptyStats(): ArchiveStats {
    return {
      ordersArchived: 0,
      itemsArchived: 0,
      eventsArchived: 0,
      addressesArchived: 0,
      discountsArchived: 0,
      refundsArchived: 0,
      ordersDeleted: 0,
      errors: []
    };
  }

  /**
   * Merge stats from multiple batches
   */
  private mergeStats(target: ArchiveStats, source: ArchiveStats): void {
    target.ordersArchived += source.ordersArchived;
    target.itemsArchived += source.itemsArchived;
    target.eventsArchived += source.eventsArchived;
    target.addressesArchived += source.addressesArchived;
    target.discountsArchived += source.discountsArchived;
    target.refundsArchived += source.refundsArchived;
    target.ordersDeleted += source.ordersDeleted;
    target.errors.push(...source.errors);
  }

  /**
   * Get archiving status (for monitoring/debugging)
   */
  getStatus(): { running: boolean; enabled: boolean } {
    return {
      running: this.isRunning,
      enabled: orderConfig.archiving.enabled
    };
  }
}

// Export singleton instance
export const orderArchivingJob = new OrderArchivingJob();
