import { logger } from '../logger';
import { NotificationManager } from './channels/notification.manager';
import { RuleEngine } from './rules/rule.engine';
import { metricsCollector } from '../metrics.collector';

interface Alert {
  ruleId: string;
  ruleName: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export class AlertManager {
  private notificationManager: NotificationManager;
  private ruleEngine: RuleEngine;

  constructor() {
    this.notificationManager = new NotificationManager();
    this.ruleEngine = new RuleEngine();
  }

  async sendNotification(alert: Alert): Promise<void> {
    try {
      logger.info(`Processing alert: ${alert.ruleName}`, { alert });

      // Get rule configuration to determine channels
      const rule = this.ruleEngine.getRule(alert.ruleId);
      if (!rule) {
        throw new Error(`Rule not found: ${alert.ruleId}`);
      }

      // Format alert message
      const message = this.formatAlertMessage(alert);

      // Send to all configured channels
      const sendPromises = rule.channels.map(channel =>
        this.notificationManager.send(channel, message, alert)
      );

      await Promise.allSettled(sendPromises);

      // Update metrics (commented out - metrics not implemented yet)
      // metricsCollector.alertsSent.inc({
      //   rule: alert.ruleName,
      //   severity: alert.severity
      // });

      logger.info(`Alert sent successfully: ${alert.ruleName}`);
    } catch (error) {
      logger.error('Failed to send alert notification:', error);

      // Update failure metrics (commented out - metrics not implemented yet)
      // metricsCollector.alertsFailed.inc({
      //   rule: alert.ruleName,
      //   error: error instanceof Error ? error.message : 'unknown'
      // });

      throw error;
    }
  }

  private formatAlertMessage(alert: Alert): string {
    const emoji = this.getSeverityEmoji(alert.severity);
    return `
${emoji} ALERT: ${alert.ruleName}
Severity: ${alert.severity.toUpperCase()}
Current Value: ${this.formatValue(alert.value)}
Threshold: ${this.formatValue(alert.threshold)}
Message: ${alert.message}
Time: ${alert.timestamp.toISOString()}
Rule ID: ${alert.ruleId}
    `.trim();
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '🔔';
    }
  }

  private formatValue(value: number): string {
    // Format numbers for readability
    if (value < 1) {
      return `${(value * 100).toFixed(2)}%`;
    } else if (value > 1000) {
      return value.toLocaleString();
    }
    return value.toFixed(2);
  }

  async processAlert(alert: Alert): Promise<void> {
    await this.sendNotification(alert);
  }
}
