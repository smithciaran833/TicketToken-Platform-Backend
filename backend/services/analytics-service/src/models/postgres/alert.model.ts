import { BaseModel } from './base.model';
import { Alert, AlertInstance, AlertStatus } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class AlertModel extends BaseModel {
  protected static tableName = 'analytics_alerts';
  
  static async createAlert(
    data: Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Alert> {
    const alert = {
      id: uuidv4(),
      ...data,
      trigger_count: 0,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    return await this.create(alert);
  }
  
  static async getAlertsByVenue(
    venueId: string,
    enabled?: boolean
  ): Promise<Alert[]> {
    const db = this.db();
    let query = db(this.tableName).where('venue_id', venueId);
    
    if (enabled !== undefined) {
      query = query.where('enabled', enabled);
    }
    
    return await query.orderBy('severity', 'desc');
  }
  
  static async updateAlert(
    id: string,
    data: Partial<Alert>
  ): Promise<Alert> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async toggleAlert(
    id: string,
    enabled: boolean
  ): Promise<Alert> {
    return await this.updateAlert(id, { enabled });
  }
  
  static async incrementTriggerCount(
    id: string
  ): Promise<void> {
    const db = this.db();
    
    await db(this.tableName)
      .where('id', id)
      .increment('trigger_count', 1)
      .update({
        last_triggered: new Date(),
        status: AlertStatus.TRIGGERED
      });
  }
  
  static async createAlertInstance(
    data: Omit<AlertInstance, 'id'>
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const instance = {
      id: uuidv4(),
      ...data,
      status: 'active'
    };
    
    const [result] = await db('analytics_alert_instances')
      .insert(instance)
      .returning('*');
    
    return result;
  }
  
  static async getAlertInstances(
    alertId: string,
    limit: number = 50
  ): Promise<AlertInstance[]> {
    const db = this.db();
    
    return await db('analytics_alert_instances')
      .where('alert_id', alertId)
      .orderBy('triggered_at', 'desc')
      .limit(limit);
  }
  
  static async acknowledgeAlertInstance(
    instanceId: string,
    userId: string,
    notes?: string
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const [result] = await db('analytics_alert_instances')
      .where('id', instanceId)
      .update({
        status: 'acknowledged',
        acknowledged_by: userId,
        notes,
        updated_at: new Date()
      })
      .returning('*');
    
    return result;
  }
  
  static async resolveAlertInstance(
    instanceId: string
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const [result] = await db('analytics_alert_instances')
      .where('id', instanceId)
      .update({
        status: 'resolved',
        resolved_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    return result;
  }
}
