/**
 * Tenant Management Service
 *
 * Handles tenant status changes and publishes cache invalidation events.
 * Part of TODO #9: Tenant Cache Invalidation implementation.
 */

import { pool } from '../config/database';
import { getPub } from '../config/redis';
import { AuthEventPublisher } from '../config/rabbitmq';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'TenantService' });

/**
 * Valid tenant statuses
 */
export type TenantStatus = 'active' | 'suspended' | 'inactive';

const VALID_STATUSES: TenantStatus[] = ['active', 'suspended', 'inactive'];

/**
 * Tenant data from database
 */
export interface Tenant {
  id: string;
  name: string;
  status: TenantStatus;
  created_at: Date;
  updated_at: Date;
}

/**
 * Result of tenant status update
 */
export interface TenantStatusUpdateResult {
  success: boolean;
  tenant: Tenant;
  oldStatus: TenantStatus;
  newStatus: TenantStatus;
  cacheInvalidated: boolean;
}

/**
 * Tenant Service - handles tenant management operations
 */
export class TenantService {
  /**
   * Get a tenant by ID
   */
  async getTenant(tenantId: string): Promise<Tenant | null> {
    const result = await pool.query(
      'SELECT id, name, status, created_at, updated_at FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as Tenant;
  }

  /**
   * Update tenant status
   *
   * @param tenantId - The tenant ID to update
   * @param newStatus - The new status to set
   * @param changedBy - User ID making the change (for audit)
   * @returns Update result with old/new status and cache invalidation status
   */
  async updateTenantStatus(
    tenantId: string,
    newStatus: TenantStatus,
    changedBy: string
  ): Promise<TenantStatusUpdateResult> {
    // Validate status
    if (!VALID_STATUSES.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    // Get current tenant
    const currentTenant = await this.getTenant(tenantId);
    if (!currentTenant) {
      const error: any = new Error('Tenant not found');
      error.statusCode = 404;
      throw error;
    }

    const oldStatus = currentTenant.status;

    // Skip if status is the same
    if (oldStatus === newStatus) {
      return {
        success: true,
        tenant: currentTenant,
        oldStatus,
        newStatus,
        cacheInvalidated: false,
      };
    }

    // Update tenant status
    const updateResult = await pool.query(
      `UPDATE tenants
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, status, created_at, updated_at`,
      [newStatus, tenantId]
    );

    const updatedTenant = updateResult.rows[0] as Tenant;

    log.info('Tenant status updated', {
      tenantId,
      oldStatus,
      newStatus,
      changedBy,
    });

    // Publish cache invalidation event via Redis pub/sub (immediate)
    let cacheInvalidated = false;
    try {
      const redisPub = getPub();
      await redisPub.publish('tenant:cache:invalidate', tenantId);
      cacheInvalidated = true;
      log.debug('Tenant cache invalidation published to Redis', { tenantId });
    } catch (error: any) {
      log.warn('Failed to publish tenant cache invalidation to Redis', { tenantId, error: error.message });
    }

    // Publish event to RabbitMQ (for audit/analytics)
    try {
      await AuthEventPublisher.tenantStatusChanged(tenantId, oldStatus, newStatus, changedBy);
    } catch (error: any) {
      log.warn('Failed to publish tenant status changed event to RabbitMQ', { tenantId, error: error.message });
    }

    return {
      success: true,
      tenant: updatedTenant,
      oldStatus,
      newStatus,
      cacheInvalidated,
    };
  }

  /**
   * List all tenants (admin only)
   */
  async listTenants(options?: { status?: TenantStatus; limit?: number; offset?: number }): Promise<Tenant[]> {
    let query = 'SELECT id, name, status, created_at, updated_at FROM tenants';
    const params: any[] = [];
    const conditions: string[] = [];

    if (options?.status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(options.status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await pool.query(query, params);
    return result.rows as Tenant[];
  }
}

// Singleton instance
export const tenantService = new TenantService();
