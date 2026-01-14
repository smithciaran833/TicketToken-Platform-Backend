import { db } from '../config/database';
import { logger } from '../utils/logger';
import { cacheService, CacheTTL } from './cache.service';

interface StorageQuota {
  id: string;
  userId?: string;
  tenantId?: string;
  venueId?: string;
  maxStorageBytes: number;
  maxFiles?: number;
  maxFileSizeBytes?: number;
  limitsByType?: Record<string, number>;
  softLimitPercentage: number;
  sendWarnings: boolean;
  isActive: boolean;
}

interface StorageUsage {
  id: string;
  userId?: string;
  tenantId?: string;
  venueId?: string;
  totalStorageBytes: number;
  totalFiles: number;
  usageByType?: Record<string, { count: number; bytes: number }>;
  peakStorageBytes: number;
  peakStorageAt?: Date;
  lastCalculatedAt: Date;
}

interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  currentUsage: number;
  limit: number;
  percentageUsed: number;
  remaining: number;
}

/**
 * Storage Quota Service
 * Manages storage quotas and usage tracking for users, tenants, and venues
 */
export class StorageQuotaService {
  
  /**
   * Create or update storage quota
   */
  async setQuota(params: {
    userId?: string;
    tenantId?: string;
    venueId?: string;
    maxStorageBytes: number;
    maxFiles?: number;
    maxFileSizeBytes?: number;
    limitsByType?: Record<string, number>;
  }): Promise<string> {
    try {
      const { userId, tenantId, venueId, ...quotaData } = params;

      if (!userId && !tenantId && !venueId) {
        throw new Error('At least one of userId, tenantId, or venueId must be provided');
      }

      // Check if quota exists
      const existing = await db('storage_quotas')
        .where({ user_id: userId, tenant_id: tenantId, venue_id: venueId })
        .first();

      let quotaId: string;

      if (existing) {
        // Update existing quota
        await db('storage_quotas')
          .where({ id: existing.id })
          .update({
            max_storage_bytes: quotaData.maxStorageBytes,
            max_files: quotaData.maxFiles,
            max_file_size_bytes: quotaData.maxFileSizeBytes,
            limits_by_type: JSON.stringify(quotaData.limitsByType || {}),
            updated_at: db.fn.now()
          });
        
        quotaId = existing.id;
        logger.info(`Updated storage quota ${quotaId}`);
      } else {
        // Create new quota
        const [inserted] = await db('storage_quotas')
          .insert({
            user_id: userId,
            tenant_id: tenantId,
            venue_id: venueId,
            max_storage_bytes: quotaData.maxStorageBytes,
            max_files: quotaData.maxFiles,
            max_file_size_bytes: quotaData.maxFileSizeBytes,
            limits_by_type: JSON.stringify(quotaData.limitsByType || {})
          })
          .returning('id');
        
        quotaId = inserted.id;
        logger.info(`Created storage quota ${quotaId}`);
      }

      // Clear cache
      await this.clearQuotaCache(userId, tenantId, venueId);

      return quotaId;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error setting quota');
      throw error;
    }
  }

  /**
   * Get storage quota
   */
  async getQuota(userId?: string, tenantId?: string, venueId?: string): Promise<StorageQuota | null> {
    try {
      // Try cache first
      const cacheKey = this.getQuotaCacheKey(userId, tenantId, venueId);
      const cached = await cacheService.get<StorageQuota>(cacheKey, { prefix: 'quotas' });
      
      if (cached) {
        return cached;
      }

      // Query database
      const quota = await db('storage_quotas')
        .where({ user_id: userId, tenant_id: tenantId, venue_id: venueId, is_active: true })
        .first();

      if (!quota) {
        return null;
      }

      const result: StorageQuota = {
        id: quota.id,
        userId: quota.user_id,
        tenantId: quota.tenant_id,
        venueId: quota.venue_id,
        maxStorageBytes: parseInt(quota.max_storage_bytes),
        maxFiles: quota.max_files,
        maxFileSizeBytes: quota.max_file_size_bytes ? parseInt(quota.max_file_size_bytes) : undefined,
        limitsByType: quota.limits_by_type,
        softLimitPercentage: quota.soft_limit_percentage,
        sendWarnings: quota.send_warnings,
        isActive: quota.is_active
      };

      // Cache for 5 minutes
      await cacheService.set(cacheKey, result, { ttl: CacheTTL.SHORT, prefix: 'quotas' });

      return result;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error getting quota');
      return null;
    }
  }

  /**
   * Calculate current storage usage
   */
  async calculateUsage(userId?: string, tenantId?: string, venueId?: string): Promise<StorageUsage> {
    try {
      // Build query
      let query = db('files')
        .whereNull('deleted_at');

      if (userId) query = query.where({ uploaded_by: userId });
      if (tenantId) query = query.where({ tenant_id: tenantId });
      if (venueId) query = query.where({ venue_id: venueId });

      // Get totals
      const totals = await query
        .select(
          db.raw('COUNT(*) as total_files'),
          db.raw('SUM(size_bytes) as total_bytes')
        )
        .first();

      // Get usage by type
      const byType = await query
        .select('content_type')
        .count('* as count')
        .sum('size_bytes as bytes')
        .groupBy('content_type');

      const usageByType: Record<string, { count: number; bytes: number }> = {};
      for (const row of byType as any[]) {
        usageByType[row.content_type] = {
          count: parseInt(row.count),
          bytes: parseInt(row.bytes || '0')
        };
      }

      const usage: StorageUsage = {
        id: '', // Will be set if saved
        userId,
        tenantId,
        venueId,
        totalStorageBytes: parseInt((totals as any)?.total_bytes || '0'),
        totalFiles: parseInt((totals as any)?.total_files || '0'),
        usageByType,
        peakStorageBytes: 0,
        lastCalculatedAt: new Date()
      };

      // Update or create usage record
      await this.saveUsage(usage);

      return usage;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error calculating usage');
      throw error;
    }
  }

  /**
   * Save usage to database
   */
  private async saveUsage(usage: StorageUsage): Promise<void> {
    try {
      const existing = await db('storage_usage')
        .where({
          user_id: usage.userId,
          tenant_id: usage.tenantId,
          venue_id: usage.venueId
        })
        .first();

      const data = {
        total_storage_bytes: usage.totalStorageBytes,
        total_files: usage.totalFiles,
        usage_by_type: JSON.stringify(usage.usageByType || {}),
        last_calculated_at: db.fn.now()
      };

      if (existing) {
        // Update peak if current usage is higher
        if (usage.totalStorageBytes > existing.peak_storage_bytes) {
          (data as any).peak_storage_bytes = usage.totalStorageBytes;
          (data as any).peak_storage_at = db.fn.now();
        }

        await db('storage_usage')
          .where({ id: existing.id })
          .update(data);
      } else {
        await db('storage_usage').insert({
          user_id: usage.userId,
          tenant_id: usage.tenantId,
          venue_id: usage.venueId,
          ...data,
          peak_storage_bytes: usage.totalStorageBytes,
          peak_storage_at: db.fn.now()
        });
      }
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error saving usage');
    }
  }

  /**
   * Check if upload is within quota
   */
  async checkQuota(
    fileSize: number,
    userId?: string,
    tenantId?: string,
    venueId?: string
  ): Promise<QuotaCheck> {
    try {
      // Get quota
      const quota = await this.getQuota(userId, tenantId, venueId);
      
      if (!quota) {
        // No quota = unlimited (for now)
        return {
          allowed: true,
          currentUsage: 0,
          limit: 0,
          percentageUsed: 0,
          remaining: Infinity
        };
      }

      // Check file size limit
      if (quota.maxFileSizeBytes && fileSize > quota.maxFileSizeBytes) {
        return {
          allowed: false,
          reason: `File size exceeds maximum allowed (${Math.round(quota.maxFileSizeBytes / 1024 / 1024)}MB)`,
          currentUsage: 0,
          limit: quota.maxFileSizeBytes,
          percentageUsed: 0,
          remaining: 0
        };
      }

      // Get current usage
      const usage = await this.calculateUsage(userId, tenantId, venueId);

      // Check storage quota
      const projectedUsage = usage.totalStorageBytes + fileSize;
      if (projectedUsage > quota.maxStorageBytes) {
        return {
          allowed: false,
          reason: 'Storage quota exceeded',
          currentUsage: usage.totalStorageBytes,
          limit: quota.maxStorageBytes,
          percentageUsed: Math.round((usage.totalStorageBytes / quota.maxStorageBytes) * 100),
          remaining: Math.max(0, quota.maxStorageBytes - usage.totalStorageBytes)
        };
      }

      // Check file count limit
      if (quota.maxFiles && usage.totalFiles >= quota.maxFiles) {
        return {
          allowed: false,
          reason: 'Maximum number of files reached',
          currentUsage: usage.totalFiles,
          limit: quota.maxFiles,
          percentageUsed: Math.round((usage.totalFiles / quota.maxFiles) * 100),
          remaining: 0
        };
      }

      const percentageUsed = Math.round((projectedUsage / quota.maxStorageBytes) * 100);

      // Check if approaching soft limit
      if (percentageUsed >= quota.softLimitPercentage && quota.sendWarnings) {
        await this.createAlert(quota, usage, percentageUsed);
      }

      return {
        allowed: true,
        currentUsage: usage.totalStorageBytes,
        limit: quota.maxStorageBytes,
        percentageUsed,
        remaining: quota.maxStorageBytes - projectedUsage
      };
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error checking quota');
      // Fail open - allow upload if check fails
      return {
        allowed: true,
        currentUsage: 0,
        limit: 0,
        percentageUsed: 0,
        remaining: 0
      };
    }
  }

  /**
   * Create quota alert
   */
  private async createAlert(quota: StorageQuota, usage: StorageUsage, percentageUsed: number): Promise<void> {
    try {
      let alertType = 'warning';
      if (percentageUsed >= 95) alertType = 'critical';
      else if (percentageUsed >= 100) alertType = 'exceeded';

      // Check if alert already sent recently (last 24 hours)
      const recentAlert = await db('quota_alerts')
        .where({
          quota_id: quota.id,
          alert_type: alertType
        })
        .where('created_at', '>=', db.raw("NOW() - INTERVAL '24 hours'"))
        .first();

      if (recentAlert) {
        return; // Don't spam alerts
      }

      await db('quota_alerts').insert({
        quota_id: quota.id,
        user_id: quota.userId,
        tenant_id: quota.tenantId,
        venue_id: quota.venueId,
        alert_type: alertType,
        usage_percentage: percentageUsed,
        current_usage_bytes: usage.totalStorageBytes,
        quota_limit_bytes: quota.maxStorageBytes
      });

      logger.warn({ alertType, percentageUsed }, 'Storage quota alert created');

      // Record metric (TODO: Add storageQuotaAlert metric to metricsService)
      // metricsService.storageQuotaAlert.inc({ type: alertType });
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error creating alert');
    }
  }

  /**
   * Get quota usage summary
   */
  async getUsageSummary(userId?: string, tenantId?: string, venueId?: string): Promise<{
    quota: StorageQuota | null;
    usage: StorageUsage;
    percentageUsed: number;
    remaining: number;
    alerts: any[];
  }> {
    const quota = await this.getQuota(userId, tenantId, venueId);
    const usage = await this.calculateUsage(userId, tenantId, venueId);
    
    const percentageUsed = quota 
      ? Math.round((usage.totalStorageBytes / quota.maxStorageBytes) * 100)
      : 0;
    
    const remaining = quota 
      ? Math.max(0, quota.maxStorageBytes - usage.totalStorageBytes)
      : Infinity;

    // Get recent alerts
    const alerts = quota ? await db('quota_alerts')
      .where({ quota_id: quota.id })
      .orderBy('created_at', 'desc')
      .limit(10) : [];

    return {
      quota,
      usage,
      percentageUsed,
      remaining,
      alerts
    };
  }

  /**
   * Clear quota cache
   */
  private async clearQuotaCache(userId?: string, tenantId?: string, venueId?: string): Promise<void> {
    const cacheKey = this.getQuotaCacheKey(userId, tenantId, venueId);
    await cacheService.delete(cacheKey, { prefix: 'quotas' });
  }

  /**
   * Generate cache key
   */
  private getQuotaCacheKey(userId?: string, tenantId?: string, venueId?: string): string {
    return `${userId || 'null'}:${tenantId || 'null'}:${venueId || 'null'}`;
  }

  /**
   * Delete quota
   */
  async deleteQuota(quotaId: string): Promise<boolean> {
    try {
      await db('storage_quotas')
        .where({ id: quotaId })
        .update({ is_active: false });
      
      logger.info(`Deactivated storage quota ${quotaId}`);
      return true;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error deleting quota');
      return false;
    }
  }
}

// Export singleton instance
export const storageQuotaService = new StorageQuotaService();
