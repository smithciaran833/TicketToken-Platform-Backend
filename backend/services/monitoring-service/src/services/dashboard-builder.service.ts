import { logger } from '../logger';
import { db } from '../config/database';
// import { redis } from '../config/redis'; // Commented out - config may not exist

export interface Dashboard {
  id?: string;
  user_id: string;
  name: string;
  description?: string;
  layout: any;
  filters?: any;
  is_public: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class DashboardBuilderService {
  async createDashboard(dashboard: Dashboard): Promise<Dashboard> {
    try {
      const result = await db.raw(`
        INSERT INTO dashboards (user_id, name, description, layout, filters, is_public, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        RETURNING *
      `, [
        dashboard.user_id,
        dashboard.name,
        dashboard.description || '',
        JSON.stringify(dashboard.layout),
        JSON.stringify(dashboard.filters || {}),
        dashboard.is_public
      ]);

      logger.info('Dashboard created', { id: result.rows[0].id });
      return this.mapRowToDashboard(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create dashboard:', error);
      throw error;
    }
  }

  async getDashboard(dashboardId: string): Promise<Dashboard | null> {
    try {
      const result = await db.raw(`
        SELECT * FROM dashboards WHERE id = ?
      `, [dashboardId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToDashboard(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get dashboard:', error);
      throw error;
    }
  }

  async listDashboards(userId: string, includePublic: boolean = true): Promise<Dashboard[]> {
    try {
      let query = 'SELECT * FROM dashboards WHERE user_id = ?';
      const params: any[] = [userId];

      if (includePublic) {
        query += ' OR is_public = TRUE';
      }

      query += ' ORDER BY created_at DESC';

      const result = await db.raw(query, params);
      return result.rows.map((row: any) => this.mapRowToDashboard(row));
    } catch (error) {
      logger.error('Failed to list dashboards:', error);
      throw error;
    }
  }

  async updateDashboard(dashboardId: string, updates: Partial<Dashboard>): Promise<Dashboard> {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        setClauses.push('name = ?');
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        setClauses.push('description = ?');
        values.push(updates.description);
      }
      if (updates.layout !== undefined) {
        setClauses.push('layout = ?');
        values.push(JSON.stringify(updates.layout));
      }
      if (updates.filters !== undefined) {
        setClauses.push('filters = ?');
        values.push(JSON.stringify(updates.filters));
      }
      if (updates.is_public !== undefined) {
        setClauses.push('is_public = ?');
        values.push(updates.is_public);
      }

      setClauses.push('updated_at = NOW()');
      values.push(dashboardId);

      const result = await db.raw(`
        UPDATE dashboards 
        SET ${setClauses.join(', ')}
        WHERE id = ?
        RETURNING *
      `, values);

      logger.info('Dashboard updated', { id: dashboardId });
      return this.mapRowToDashboard(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update dashboard:', error);
      throw error;
    }
  }

  async deleteDashboard(dashboardId: string): Promise<void> {
    try {
      await db.raw('DELETE FROM dashboards WHERE id = ?', [dashboardId]);
      logger.info('Dashboard deleted', { id: dashboardId });
    } catch (error) {
      logger.error('Failed to delete dashboard:', error);
      throw error;
    }
  }

  async duplicateDashboard(dashboardId: string, userId: string): Promise<Dashboard> {
    try {
      const original = await this.getDashboard(dashboardId);
      if (!original) {
        throw new Error('Dashboard not found');
      }

      const result = await db.raw(`
        INSERT INTO dashboards (user_id, name, description, layout, filters, is_public, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        RETURNING *
      `, [
        userId,
        `${original.name} (Copy)`,
        original.description,
        JSON.stringify(original.layout),
        JSON.stringify(original.filters),
        false
      ]);

      logger.info('Dashboard duplicated', { original_id: dashboardId, new_id: result.rows[0].id });
      return this.mapRowToDashboard(result.rows[0]);
    } catch (error) {
      logger.error('Failed to duplicate dashboard:', error);
      throw error;
    }
  }

  private mapRowToDashboard(row: any): Dashboard {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      description: row.description,
      layout: typeof row.layout === 'string' ? JSON.parse(row.layout) : row.layout,
      filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters,
      is_public: row.is_public ?? false,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export const dashboardBuilderService = new DashboardBuilderService();
