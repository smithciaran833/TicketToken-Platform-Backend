import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../logger';

interface DashboardWidget {
  id: string;
  type: 'line_chart' | 'bar_chart' | 'gauge' | 'table' | 'number' | 'heatmap';
  title: string;
  metric: string;
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, any>;
}

interface Dashboard {
  id: string;
  userId: string;
  name: string;
  layout: 'grid' | 'free';
  widgets: DashboardWidget[];
  isPublic: boolean;
  sharedWith?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class DashboardBuilderService {
  private cachePrefix = 'dashboard:';
  private cacheTTL = 3600; // 1 hour

  async createDashboard(userId: string, data: Partial<Dashboard>): Promise<Dashboard> {
    try {
      const dashboardId = uuidv4();
      const now = new Date();

      const dashboard: Dashboard = {
        id: dashboardId,
        userId,
        name: data.name || 'Untitled Dashboard',
        layout: data.layout || 'grid',
        widgets: data.widgets || [],
        isPublic: data.isPublic || false,
        sharedWith: data.sharedWith || [],
        createdAt: now,
        updatedAt: now
      };

      // Save to database
      await db.query(`
        INSERT INTO dashboards (id, user_id, name, layout, widgets, is_public, shared_with, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        dashboard.id,
        dashboard.userId,
        dashboard.name,
        dashboard.layout,
        JSON.stringify(dashboard.widgets),
        dashboard.isPublic,
        dashboard.sharedWith,
        dashboard.createdAt,
        dashboard.updatedAt
      ]);

      // Cache the dashboard
      await this.cacheDashboard(dashboard);

      logger.info('Dashboard created', { dashboardId, userId });
      return dashboard;
    } catch (error) {
      logger.error('Failed to create dashboard', { error, userId });
      throw error;
    }
  }

  async getDashboard(dashboardId: string, userId: string): Promise<Dashboard | null> {
    try {
      // Try cache first
      const cached = await this.getCachedDashboard(dashboardId);
      if (cached) {
        // Verify access
        if (await this.canAccessDashboard(cached, userId)) {
          return cached;
        }
        return null;
      }

      // Load from database
      const result = await db.query(`
        SELECT * FROM dashboards WHERE id = $1
      `, [dashboardId]);

      if (result.rows.length === 0) {
        return null;
      }

      const dashboard = this.mapRowToDashboard(result.rows[0]);

      // Verify access
      if (!(await this.canAccessDashboard(dashboard, userId))) {
        return null;
      }

      // Cache it
      await this.cacheDashboard(dashboard);

      return dashboard;
    } catch (error) {
      logger.error('Failed to get dashboard', { error, dashboardId });
      throw error;
    }
  }

  async listDashboards(userId: string): Promise<Dashboard[]> {
    try {
      const result = await db.query(`
        SELECT * FROM dashboards 
        WHERE user_id = $1 OR is_public = true OR $1 = ANY(shared_with)
        ORDER BY updated_at DESC
      `, [userId]);

      return result.rows.map(row => this.mapRowToDashboard(row));
    } catch (error) {
      logger.error('Failed to list dashboards', { error, userId });
      throw error;
    }
  }

  async updateDashboard(dashboardId: string, userId: string, updates: Partial<Dashboard>): Promise<Dashboard> {
    try {
      // Verify ownership
      const existing = await this.getDashboard(dashboardId, userId);
      if (!existing || existing.userId !== userId) {
        throw new Error('Dashboard not found or access denied');
      }

      const now = new Date();
      const updatedDashboard = {
        ...existing,
        ...updates,
        updatedAt: now
      };

      await db.query(`
        UPDATE dashboards 
        SET name = $1, layout = $2, widgets = $3, is_public = $4, shared_with = $5, updated_at = $6
        WHERE id = $7
      `, [
        updatedDashboard.name,
        updatedDashboard.layout,
        JSON.stringify(updatedDashboard.widgets),
        updatedDashboard.isPublic,
        updatedDashboard.sharedWith,
        updatedDashboard.updatedAt,
        dashboardId
      ]);

      // Invalidate cache
      await this.invalidateDashboardCache(dashboardId);

      logger.info('Dashboard updated', { dashboardId, userId });
      return updatedDashboard;
    } catch (error) {
      logger.error('Failed to update dashboard', { error, dashboardId });
      throw error;
    }
  }

  async deleteDashboard(dashboardId: string, userId: string): Promise<void> {
    try {
      // Verify ownership
      const existing = await this.getDashboard(dashboardId, userId);
      if (!existing || existing.userId !== userId) {
        throw new Error('Dashboard not found or access denied');
      }

      await db.query('DELETE FROM dashboards WHERE id = $1', [dashboardId]);

      // Invalidate cache
      await this.invalidateDashboardCache(dashboardId);

      logger.info('Dashboard deleted', { dashboardId, userId });
    } catch (error) {
      logger.error('Failed to delete dashboard', { error, dashboardId });
      throw error;
    }
  }

  async shareDashboard(dashboardId: string, userId: string, shareWithUserIds: string[]): Promise<void> {
    try {
      const dashboard = await this.getDashboard(dashboardId, userId);
      if (!dashboard || dashboard.userId !== userId) {
        throw new Error('Dashboard not found or access denied');
      }

      const updatedSharedWith = Array.from(new Set([...(dashboard.sharedWith || []), ...shareWithUserIds]));

      await db.query(`
        UPDATE dashboards SET shared_with = $1, updated_at = $2 WHERE id = $3
      `, [updatedSharedWith, new Date(), dashboardId]);

      await this.invalidateDashboardCache(dashboardId);

      logger.info('Dashboard shared', { dashboardId, shareWithUserIds });
    } catch (error) {
      logger.error('Failed to share dashboard', { error, dashboardId });
      throw error;
    }
  }

  async cloneDashboard(dashboardId: string, userId: string): Promise<Dashboard> {
    try {
      const original = await this.getDashboard(dashboardId, userId);
      if (!original) {
        throw new Error('Dashboard not found or access denied');
      }

      return await this.createDashboard(userId, {
        name: `${original.name} (Copy)`,
        layout: original.layout,
        widgets: original.widgets,
        isPublic: false
      });
    } catch (error) {
      logger.error('Failed to clone dashboard', { error, dashboardId });
      throw error;
    }
  }

  async getTemplates(): Promise<Dashboard[]> {
    // Return predefined dashboard templates
    return [
      {
        id: 'template-system-overview',
        userId: 'system',
        name: 'System Overview',
        layout: 'grid',
        isPublic: true,
        widgets: [
          {
            id: 'w1',
            type: 'gauge',
            title: 'CPU Usage',
            metric: 'system_cpu_usage_percent',
            position: { x: 0, y: 0, w: 3, h: 4 },
            config: { threshold: 80, criticalThreshold: 90 }
          },
          {
            id: 'w2',
            type: 'gauge',
            title: 'Memory Usage',
            metric: 'system_memory_usage_percent',
            position: { x: 3, y: 0, w: 3, h: 4 },
            config: { threshold: 80, criticalThreshold: 90 }
          },
          {
            id: 'w3',
            type: 'line_chart',
            title: 'Request Rate',
            metric: 'http_requests_total',
            position: { x: 0, y: 4, w: 6, h: 4 },
            config: { timeRange: '1h', refreshInterval: 10000 }
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'template-payment-monitoring',
        userId: 'system',
        name: 'Payment Monitoring',
        layout: 'grid',
        isPublic: true,
        widgets: [
          {
            id: 'w1',
            type: 'number',
            title: 'Success Rate',
            metric: 'payment_success_rate',
            position: { x: 0, y: 0, w: 3, h: 2 },
            config: { unit: '%', decimals: 2 }
          },
          {
            id: 'w2',
            type: 'line_chart',
            title: 'Payment Volume',
            metric: 'payment_success_total',
            position: { x: 0, y: 2, w: 6, h: 4 },
            config: { timeRange: '24h' }
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
  }

  private async canAccessDashboard(dashboard: Dashboard, userId: string): Promise<boolean> {
    return (
      dashboard.userId === userId ||
      dashboard.isPublic ||
      (dashboard.sharedWith && dashboard.sharedWith.includes(userId))
    );
  }

  private async cacheDashboard(dashboard: Dashboard): Promise<void> {
    try {
      const key = `${this.cachePrefix}${dashboard.id}`;
      await redis.setex(key, this.cacheTTL, JSON.stringify(dashboard));
    } catch (error) {
      logger.warn('Failed to cache dashboard', { error, dashboardId: dashboard.id });
    }
  }

  private async getCachedDashboard(dashboardId: string): Promise<Dashboard | null> {
    try {
      const key = `${this.cachePrefix}${dashboardId}`;
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Failed to get cached dashboard', { error, dashboardId });
      return null;
    }
  }

  private async invalidateDashboardCache(dashboardId: string): Promise<void> {
    try {
      const key = `${this.cachePrefix}${dashboardId}`;
      await redis.del(key);
    } catch (error) {
      logger.warn('Failed to invalidate dashboard cache', { error, dashboardId });
    }
  }

  private mapRowToDashboard(row: any): Dashboard {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      layout: row.layout,
      widgets: typeof row.widgets === 'string' ? JSON.parse(row.widgets) : row.widgets,
      isPublic: row.is_public,
      sharedWith: row.shared_with,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const dashboardBuilderService = new DashboardBuilderService();
