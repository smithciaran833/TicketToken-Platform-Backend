import { JobExecutor, JobConfig } from './job-executor';
import { OrderService } from '../services/order.service';
import { getDatabase } from '../config/database';
import { orderConfig } from '../config';

/**
 * Expiration Job
 * Checks for and expires reserved orders that have timed out
 */
export class ExpirationJob extends JobExecutor {
  private orderService: OrderService;

  constructor() {
    const config: JobConfig = {
      name: 'order-expiration',
      enabled: true,
      intervalSeconds: 60, // Check every minute
      enableRetry: true,
      retryOptions: {
        maxAttempts: 2,
        delayMs: 5000,
        backoffMultiplier: 2,
        maxDelayMs: 30000,
      },
      enableCircuitBreaker: true,
      circuitBreakerOptions: {
        failureThreshold: 5,
        resetTimeoutMs: 300000, // 5 minutes
        timeoutMs: 120000, // 2 minutes
      },
      enableDistributedLock: true,
      lockTTLMs: 120000, // 2 minutes
      timeoutMs: 180000, // 3 minutes
    };

    super(config);

    const pool = getDatabase();
    this.orderService = new OrderService(pool);
  }

  protected async executeCore(): Promise<void> {
    let expiredCount = 0;
    let errorCount = 0;

    // TODO: Get list of all tenants - for now using a placeholder approach
    // In production, this should query the database for all active tenants
    const tenantIds = await this.getTenants();

    for (const tenantId of tenantIds) {
      try {
        // Get expired reservations for this tenant
        const expiredOrders = await this.orderService.getExpiredReservations(tenantId, 100);

        this.jobLogger.debug(`Found ${expiredOrders.length} expired reservations for tenant ${tenantId}`);

        // Process each expired order
        for (const order of expiredOrders) {
          try {
            await this.orderService.expireReservation(order.id, tenantId, 'Reservation timeout');
            expiredCount++;
          } catch (error) {
            errorCount++;
            this.jobLogger.error('Failed to expire order', {
              orderId: order.id,
              tenantId,
              error: error instanceof Error ? error.message : error,
            });
          }
        }
      } catch (error) {
        errorCount++;
        this.jobLogger.error('Failed to process tenant', {
          tenantId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (expiredCount > 0) {
      this.jobLogger.info('Expiration job completed', {
        expired: expiredCount,
        errors: errorCount,
        tenantsProcessed: tenantIds.length,
      });
    }

    if (errorCount > 0 && expiredCount === 0) {
      throw new Error(`Failed to expire any orders (${errorCount} errors)`);
    }
  }

  /**
   * Get list of tenant IDs
   * TODO: This should query a tenants table or orders table for distinct tenant_ids
   */
  private async getTenants(): Promise<string[]> {
    const db = getDatabase();
    try {
      const result = await db.query('SELECT DISTINCT tenant_id FROM orders WHERE status = $1 LIMIT 1000', ['RESERVED']);
      return result.rows.map(row => row.tenant_id);
    } catch (error) {
      this.jobLogger.error('Failed to get tenants', { error });
      return [];
    }
  }
}

// Export singleton instance
export const expirationJob = new ExpirationJob();
