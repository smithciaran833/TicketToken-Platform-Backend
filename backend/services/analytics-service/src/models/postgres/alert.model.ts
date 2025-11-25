import { getDb } from '../../config/database';

export interface Alert {
  id: string;
  tenant_id: string;
  alert_type: string;
  severity: string;
  metric_type: string;
  entity_type: string;
  entity_id?: string;
  threshold_config: Record<string, any>;
  current_value?: number;
  threshold_value?: number;
  status: string;
  message: string;
  metadata: Record<string, any>;
  triggered_at: Date;
  resolved_at?: Date;
  resolved_by?: string;
  created_at: Date;
  updated_at: Date;
}

export class AlertModel {
  private static tableName = 'analytics_alerts';

  static async create(alert: Omit<Alert, 'id' | 'created_at' | 'updated_at'>): Promise<Alert> {
    const db = getDb();
    const [created] = await db(this.tableName).insert(alert).returning('*');
    return created;
  }

  // Legacy method for backward compatibility
  static async createAlert(data: any): Promise<Alert> {
    return this.create({
      tenant_id: data.venueId || data.tenant_id,
      alert_type: data.type || data.alert_type,
      severity: data.severity || 'medium',
      metric_type: data.metricType || data.metric_type || 'unknown',
      entity_type: data.entityType || 'venue',
      entity_id: data.venueId || data.entity_id,
      threshold_config: data.thresholdConfig || data.threshold_config || {},
      current_value: data.currentValue || data.current_value,
      threshold_value: data.thresholdValue || data.threshold_value,
      status: data.status || 'active',
      message: data.message,
      metadata: data.metadata || {},
      triggered_at: data.triggeredAt || new Date(),
    });
  }

  // Legacy method for backward compatibility
  static async updateAlert(id: string, data: any): Promise<Alert | null> {
    const db = getDb();
    const [updated] = await db(this.tableName)
      .where({ id })
      .update({
        alert_type: data.type || data.alert_type,
        severity: data.severity,
        threshold_config: data.thresholdConfig || data.threshold_config,
        message: data.message,
        metadata: data.metadata,
      })
      .returning('*');
    return updated || null;
  }

  // Legacy method for backward compatibility
  static async toggleAlert(id: string, enabled: boolean): Promise<Alert | null> {
    const db = getDb();
    const [updated] = await db(this.tableName)
      .where({ id })
      .update({
        status: enabled ? 'active' : 'inactive',
      })
      .returning('*');
    return updated || null;
  }

  // Legacy method for backward compatibility
  static async getAlertsByVenue(venueId: string, activeOnly: boolean = false): Promise<Alert[]> {
    const db = getDb();
    let query = db(this.tableName)
      .where({ tenant_id: venueId });

    if (activeOnly) {
      query = query.where('status', 'active');
    }

    return query.orderBy('triggered_at', 'desc');
  }

  // Legacy method for backward compatibility
  static async incrementTriggerCount(id: string): Promise<void> {
    // This would update a trigger_count field if it existed
    // For now, we'll just update the updated_at timestamp
    const db = getDb();
    await db(this.tableName)
      .where({ id })
      .update({ updated_at: new Date() });
  }

  // Legacy method for backward compatibility
  static async createAlertInstance(data: any): Promise<any> {
    // Alert instances could be stored in metadata for now
    return {
      id: data.alertId,
      alert_id: data.alertId,
      status: 'active',
      triggered_at: new Date(),
      ...data,
    };
  }

  // Legacy method for backward compatibility
  static async resolveAlertInstance(instanceId: string): Promise<void> {
    const db = getDb();
    await db(this.tableName)
      .where({ id: instanceId })
      .update({
        status: 'resolved',
        resolved_at: new Date(),
      });
  }

  // Legacy method for backward compatibility
  static async getAlertInstances(alertId: string, limit: number = 10): Promise<any[]> {
    // Return the alert as an instance for now
    const db = getDb();
    const alerts = await db(this.tableName)
      .where({ id: alertId })
      .limit(limit);
    return alerts;
  }

  // Legacy method for backward compatibility
  static async acknowledgeAlertInstance(instanceId: string, userId: string, notes?: string): Promise<any> {
    const db = getDb();
    const [updated] = await db(this.tableName)
      .where({ id: instanceId })
      .update({
        metadata: db.raw(`metadata || ?::jsonb`, [JSON.stringify({ acknowledged_by: userId, notes })]),
        updated_at: new Date(),
      })
      .returning('*');
    return updated;
  }

  static async findById(id: string, tenantId: string): Promise<Alert | null> {
    const db = getDb();
    const alert = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .first();
    return alert || null;
  }

  static async findByStatus(
    status: string,
    tenantId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Alert[]> {
    const db = getDb();
    let query = db(this.tableName)
      .where({ status, tenant_id: tenantId })
      .orderBy('triggered_at', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.offset(options.offset);
    }

    return query;
  }

  static async findByEntity(
    entityType: string,
    entityId: string,
    tenantId: string,
    options: { status?: string; limit?: number } = {}
  ): Promise<Alert[]> {
    const db = getDb();
    let query = db(this.tableName)
      .where({
        entity_type: entityType,
        entity_id: entityId,
        tenant_id: tenantId,
      })
      .orderBy('triggered_at', 'desc');

    if (options.status) {
      query = query.where('status', options.status);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query;
  }

  static async update(id: string, tenantId: string, updates: Partial<Alert>): Promise<Alert | null> {
    const db = getDb();
    const [updated] = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .update(updates)
      .returning('*');
    return updated || null;
  }

  static async resolve(id: string, tenantId: string, resolvedBy: string): Promise<Alert | null> {
    const db = getDb();
    const [resolved] = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .update({
        status: 'resolved',
        resolved_at: new Date(),
        resolved_by: resolvedBy,
      })
      .returning('*');
    return resolved || null;
  }

  static async delete(id: string, tenantId: string): Promise<boolean> {
    const db = getDb();
    const deleted = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .delete();
    return deleted > 0;
  }
}
