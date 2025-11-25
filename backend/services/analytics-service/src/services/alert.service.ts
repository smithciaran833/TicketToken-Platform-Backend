import { AlertModel, Alert as DBAlert } from '../models';
import {
  Alert,
  AlertType,
  AlertSeverity,
  AlertStatus,
  AlertInstance,
  ComparisonOperator
} from '../types';
import { logger } from '../utils/logger';
import { messageGatewayService } from './message-gateway.service';
import { metricsService } from './metrics.service';

export class AlertService {
  private static instance: AlertService;
  private log = logger.child({ component: 'AlertService' });
  private checkInterval: NodeJS.Timeout | null = null;

  static getInstance(): AlertService {
    if (!this.instance) {
      this.instance = new AlertService();
    }
    return this.instance;
  }

  private mapDBAlertToAlert(dbAlert: DBAlert): Alert {
    return {
      id: dbAlert.id,
      venueId: dbAlert.tenant_id,
      name: dbAlert.message || 'Alert',
      description: dbAlert.message,
      type: (dbAlert.alert_type as AlertType) || AlertType.THRESHOLD,
      severity: (dbAlert.severity as AlertSeverity) || AlertSeverity.WARNING,
      status: dbAlert.status === 'active' ? AlertStatus.ACTIVE : AlertStatus.DISABLED,
      conditions: [
        {
          id: dbAlert.id,
          metric: dbAlert.metric_type,
          operator: ComparisonOperator.GREATER_THAN,
          value: dbAlert.threshold_value || 0
        }
      ],
      actions: [],
      enabled: dbAlert.status === 'active',
      triggerCount: 0,
      lastTriggered: dbAlert.triggered_at,
      createdBy: dbAlert.tenant_id,
      schedule: undefined,
      createdAt: dbAlert.created_at,
      updatedAt: dbAlert.updated_at
    };
  }

  async startMonitoring(): Promise<void> {
    // Check alerts every minute
    this.checkInterval = setInterval(() => {
      this.checkAllAlerts();
    }, 60000);

    this.log.info('Alert monitoring started');
  }

  async stopMonitoring(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.log.info('Alert monitoring stopped');
  }

  async createAlert(
    data: Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Alert> {
    try {
      const dbAlert = await AlertModel.createAlert(data);
      if (!dbAlert) {
        throw new Error('Failed to create alert');
      }
      const alert = this.mapDBAlertToAlert(dbAlert);
      this.log.info('Alert created', { alertId: alert.id, name: alert.name });
      return alert;
    } catch (error) {
      this.log.error('Failed to create alert', error);
      throw error;
    }
  }

  async updateAlert(
    alertId: string,
    data: Partial<Alert>
  ): Promise<Alert> {
    try {
      const dbAlert = await AlertModel.updateAlert(alertId, data);
      if (!dbAlert) {
        throw new Error('Alert not found');
      }
      const alert = this.mapDBAlertToAlert(dbAlert);
      this.log.info('Alert updated', { alertId });
      return alert;
    } catch (error) {
      this.log.error('Failed to update alert', error, { alertId });
      throw error;
    }
  }

  async toggleAlert(alertId: string, enabled: boolean): Promise<Alert> {
    try {
      const dbAlert = await AlertModel.toggleAlert(alertId, enabled);
      if (!dbAlert) {
        throw new Error('Alert not found');
      }
      const alert = this.mapDBAlertToAlert(dbAlert);
      this.log.info('Alert toggled', { alertId, enabled });
      return alert;
    } catch (error) {
      this.log.error('Failed to toggle alert', error, { alertId });
      throw error;
    }
  }

  private async checkAllAlerts(): Promise<void> {
    try {
      // Get all enabled alerts
      const venues = await this.getMonitoredVenues();

      for (const venueId of venues) {
        const dbAlerts = await AlertModel.getAlertsByVenue(venueId, true);
        const alerts = dbAlerts.map(a => this.mapDBAlertToAlert(a));

        for (const alert of alerts) {
          await this.checkAlert(alert);
        }
      }
    } catch (error) {
      this.log.error('Failed to check alerts', error);
    }
  }

  private async checkAlert(alert: Alert): Promise<void> {
    try {
      // Check if within schedule
      if (!this.isWithinSchedule(alert)) {
        return;
      }

      // Evaluate all conditions
      const triggered = await this.evaluateConditions(alert);

      if (triggered) {
        // Check if already triggered recently
        const recentInstance = await this.getRecentAlertInstance(alert.id);
        if (recentInstance && recentInstance.status === 'active') {
          return; // Already triggered
        }

        // Create alert instance
        const instance = await this.triggerAlert(alert);

        // Execute actions
        await this.executeActions(alert, instance);
      } else {
        // Check if we need to resolve an active alert
        const activeInstance = await this.getActiveAlertInstance(alert.id);
        if (activeInstance) {
          await this.resolveAlert(activeInstance);
        }
      }
    } catch (error) {
      this.log.error('Failed to check alert', error, { alertId: alert.id });
    }
  }

  private async evaluateConditions(alert: Alert): Promise<boolean> {
    try {
      for (const condition of alert.conditions) {
        const currentValue = await this.getMetricValue(
          alert.venueId,
          condition.metric
        );

        if (!this.evaluateCondition(currentValue, condition.operator, condition.value)) {
          return false; // All conditions must be met
        }
      }

      return true;
    } catch (error) {
      this.log.error('Failed to evaluate conditions', error, { alertId: alert.id });
      return false;
    }
  }

  private evaluateCondition(
    currentValue: number,
    operator: ComparisonOperator,
    threshold: number
  ): boolean {
    switch (operator) {
      case ComparisonOperator.EQUALS:
        return currentValue === threshold;
      case ComparisonOperator.NOT_EQUALS:
        return currentValue !== threshold;
      case ComparisonOperator.GREATER_THAN:
        return currentValue > threshold;
      case ComparisonOperator.LESS_THAN:
        return currentValue < threshold;
      case ComparisonOperator.GREATER_THAN_OR_EQUALS:
        return currentValue >= threshold;
      case ComparisonOperator.LESS_THAN_OR_EQUALS:
        return currentValue <= threshold;
      default:
        return false;
    }
  }

  private async getMetricValue(venueId: string, metric: string): Promise<number> {
    // Get current metric value from real-time metrics
    const realTimeMetric = await metricsService.getRealTimeMetric(venueId, metric as any);
    return realTimeMetric?.currentValue || 0;
  }

  private async triggerAlert(alert: Alert): Promise<AlertInstance> {
    try {
      // Increment trigger count
      await AlertModel.incrementTriggerCount(alert.id);

      // Create alert instance
      const instance = await AlertModel.createAlertInstance({
        alertId: alert.id,
        triggeredAt: new Date(),
        severity: alert.severity,
        status: 'active',
        triggerValues: await this.getCurrentTriggerValues(alert),
        message: this.generateAlertMessage(alert),
        actions: alert.actions.map(action => ({
          type: action.type,
          status: 'pending'
        }))
      });

      this.log.info('Alert triggered', {
        alertId: alert.id,
        instanceId: instance.id,
        severity: alert.severity
      });

      return instance;
    } catch (error) {
      this.log.error('Failed to trigger alert', error, { alertId: alert.id });
      throw error;
    }
  }

  private async executeActions(alert: Alert, instance: AlertInstance): Promise<void> {
    for (const action of alert.actions) {
      try {
        // Apply delay if specified
        if (action.delay) {
          await new Promise(resolve => setTimeout(resolve, action.delay! * 60000));
        }

        switch (action.type) {
          case 'email':
            await messageGatewayService.sendAlertNotification(
              instance,
              'email',
              action.config.recipients?.[0] || ''
            );
            break;

          case 'sms':
            await messageGatewayService.sendAlertNotification(
              instance,
              'sms',
              action.config.phoneNumbers?.[0] || ''
            );
            break;

          case 'slack':
            await messageGatewayService.sendAlertNotification(
              instance,
              'slack',
              action.config.channel || ''
            );
            break;

          case 'webhook':
            await this.sendWebhook(action.config, instance);
            break;
        }
      } catch (error) {
        this.log.error('Failed to execute alert action', error, {
          alertId: alert.id,
          actionType: action.type
        });
      }
    }
  }

  private async sendWebhook(config: any, _instance: AlertInstance): Promise<void> {
    // In production, make actual HTTP request
    this.log.info('Webhook sent', { url: config.url });
  }

  private async resolveAlert(instance: AlertInstance): Promise<void> {
    try {
      await AlertModel.resolveAlertInstance(instance.id);
      this.log.info('Alert resolved', { instanceId: instance.id });
    } catch (error) {
      this.log.error('Failed to resolve alert', error, { instanceId: instance.id });
    }
  }

  private isWithinSchedule(alert: Alert): boolean {
    if (!alert.schedule) return true;

    const now = new Date();
    const { activeHours, activeDays } = alert.schedule;

    // Check active days
    if (activeDays && !activeDays.includes(now.getDay())) {
      return false;
    }

    // Check active hours
    if (activeHours) {
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const [startHour, startMin] = activeHours.start.split(':').map(Number);
      const [endHour, endMin] = activeHours.end.split(':').map(Number);
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      if (currentTime < startTime || currentTime > endTime) {
        return false;
      }
    }

    return true;
  }

  private async getCurrentTriggerValues(alert: Alert): Promise<Record<string, any>> {
    const values: Record<string, any> = {};

    for (const condition of alert.conditions) {
      values[condition.metric] = await this.getMetricValue(alert.venueId, condition.metric);
    }

    return values;
  }

  private generateAlertMessage(alert: Alert): string {
    return `Alert: ${alert.name} - ${alert.description || 'Threshold exceeded'}`;
  }

  private async getRecentAlertInstance(alertId: string): Promise<AlertInstance | null> {
    const instances = await AlertModel.getAlertInstances(alertId, 1);
    return instances[0] || null;
  }

  private async getActiveAlertInstance(alertId: string): Promise<AlertInstance | null> {
    const instances = await AlertModel.getAlertInstances(alertId, 10);
    return instances.find(i => i.status === 'active') || null;
  }

  private async getMonitoredVenues(): Promise<string[]> {
    // In production, get list of venues with active alerts
    // For now, return mock data
    return ['venue-1', 'venue-2'];
  }

  async getAlertsByVenue(venueId: string): Promise<Alert[]> {
    const dbAlerts = await AlertModel.getAlertsByVenue(venueId);
    return dbAlerts.map(a => this.mapDBAlertToAlert(a));
  }

  async getAlertInstances(alertId: string, limit: number = 50): Promise<AlertInstance[]> {
    return await AlertModel.getAlertInstances(alertId, limit);
  }

  async acknowledgeAlert(instanceId: string, userId: string, notes?: string): Promise<AlertInstance> {
    return await AlertModel.acknowledgeAlertInstance(instanceId, userId, notes);
  }
}

export const alertService = AlertService.getInstance();
