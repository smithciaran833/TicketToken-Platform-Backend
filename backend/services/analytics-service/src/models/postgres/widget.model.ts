import { BaseModel } from './base.model';
import { WidgetConfig, WidgetData } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class WidgetModel extends BaseModel {
  protected static tableName = 'analytics_widgets';
  
  static async createWidget(
    data: Omit<WidgetConfig, 'id'>
  ): Promise<WidgetConfig> {
    const widget = {
      id: uuidv4(),
      ...data,
      created_at: new Date()
    };
    
    return await this.create(widget);
  }
  
  static async getWidgetsByDashboard(
    dashboardId: string
  ): Promise<WidgetConfig[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('dashboard_id', dashboardId)
      .orderBy('position_y', 'asc')
      .orderBy('position_x', 'asc');
  }
  
  static async updateWidget(
    id: string,
    data: Partial<WidgetConfig>
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async updateWidgetPosition(
    id: string,
    position: { x: number; y: number }
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      position,
      updated_at: new Date()
    });
  }
  
  static async updateWidgetSize(
    id: string,
    size: { width: number; height: number }
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      size,
      updated_at: new Date()
    });
  }
  
  static async duplicateWidget(
    widgetId: string
  ): Promise<WidgetConfig> {
    const original = await this.findById(widgetId);
    
    if (!original) {
      throw new Error('Widget not found');
    }
    
    const duplicate = {
      ...original,
      id: uuidv4(),
      title: `${original.title} (Copy)`,
      position: {
        x: original.position.x + 1,
        y: original.position.y + 1
      },
      created_at: new Date()
    };
    
    delete duplicate.id;
    
    return await this.create(duplicate);
  }
  
  static async getWidgetData(
    widgetId: string,
    limit: number = 1
  ): Promise<WidgetData[]> {
    const db = this.db();
    
    return await db('analytics_widget_data')
      .where('widget_id', widgetId)
      .orderBy('timestamp', 'desc')
      .limit(limit);
  }
  
  static async saveWidgetData(
    widgetId: string,
    data: any
  ): Promise<void> {
    const db = this.db();
    
    await db('analytics_widget_data').insert({
      id: uuidv4(),
      widget_id: widgetId,
      data,
      timestamp: new Date()
    });
  }
}
