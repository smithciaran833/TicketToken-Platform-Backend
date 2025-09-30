import { BaseModel } from './base.model';
import { Dashboard } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class DashboardModel extends BaseModel {
  protected static tableName = 'analytics_dashboards';
  
  static async createDashboard(
    data: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Dashboard> {
    const dashboard = {
      id: uuidv4(),
      ...data,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    return await this.create(dashboard);
  }
  
  static async getDashboardsByVenue(
    venueId: string
  ): Promise<Dashboard[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .orWhere('is_public', true)
      .orderBy('name', 'asc');
  }
  
  static async getDashboardsForUser(
    userId: string,
    venueId: string
  ): Promise<Dashboard[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .andWhere((builder: any) => {
        builder.where('owner_id', userId)
          .orWhere('is_public', true)
          .orWhereRaw(`permissions->'sharedWith' @> '[{"userId": "${userId}"}]'`);
      })
      .orderBy('name', 'asc');
  }
  
  static async updateDashboard(
    id: string,
    data: Partial<Dashboard>
  ): Promise<Dashboard> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async duplicateDashboard(
    dashboardId: string,
    newName: string,
    userId: string
  ): Promise<Dashboard> {
    const original = await this.findById(dashboardId);
    
    if (!original) {
      throw new Error('Dashboard not found');
    }
    
    const duplicate = {
      ...original,
      id: uuidv4(),
      name: newName,
      isDefault: false,
      permissions: {
        ownerId: userId,
        public: false,
        sharedWith: []
      },
      created_at: new Date(),
      updated_at: new Date(),
      created_by: userId,
      updated_by: userId
    };
    
    delete duplicate.id;
    
    return await this.create(duplicate);
  }
  
  static async shareDashboard(
    dashboardId: string,
    shareWith: Array<{
      userId?: string;
      roleId?: string;
      permission: 'view' | 'edit' | 'admin';
    }>
  ): Promise<Dashboard> {
    const dashboard = await this.findById(dashboardId);
    
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }
    
    const permissions = dashboard.permissions;
    permissions.sharedWith = [
      ...permissions.sharedWith,
      ...shareWith
    ];
    
    return await this.update(dashboardId, { permissions });
  }
  
  static async getDefaultDashboard(
    venueId: string
  ): Promise<Dashboard | null> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .where('is_default', true)
      .first();
  }
}
