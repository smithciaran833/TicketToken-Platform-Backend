import { EventEmitter } from 'events';
import nodemailer from 'nodemailer';
import { WebClient } from '@slack/web-api';
import { logger } from './logger';

interface Alert {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  channels: ('email' | 'slack' | 'pagerduty')[];
  cooldown: number; // minutes
  lastFired?: Date;
}

export class AlertingService extends EventEmitter {
  private alerts: Map<string, Alert> = new Map();
  private emailTransporter: any;
  private slackClient: any;
  
  constructor() {
    super();
    this.setupChannels();
    this.defineAlerts();
  }

  private setupChannels() {
    // Email setup
    if (process.env.SMTP_HOST) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }

    // Slack setup
    if (process.env.SLACK_TOKEN) {
      this.slackClient = new WebClient(process.env.SLACK_TOKEN);
    }
  }

  private defineAlerts() {
    // Critical business alerts
    this.addAlert({
      id: 'high_refund_rate',
      name: 'High Refund Rate',
      condition: 'refund_rate > threshold',
      threshold: 0.1, // 10%
      severity: 'warning',
      channels: ['email', 'slack'],
      cooldown: 60
    });

    this.addAlert({
      id: 'payment_failure_spike',
      name: 'Payment Failure Spike',
      condition: 'payment_failure_rate > threshold',
      threshold: 0.2, // 20%
      severity: 'error',
      channels: ['email', 'slack', 'pagerduty'],
      cooldown: 30
    });

    this.addAlert({
      id: 'database_slow',
      name: 'Database Response Slow',
      condition: 'db_response_time_p95 > threshold',
      threshold: 1000, // 1 second
      severity: 'warning',
      channels: ['slack'],
      cooldown: 15
    });

    this.addAlert({
      id: 'api_error_rate_high',
      name: 'High API Error Rate',
      condition: 'api_error_rate > threshold',
      threshold: 0.05, // 5%
      severity: 'error',
      channels: ['email', 'slack'],
      cooldown: 30
    });

    this.addAlert({
      id: 'solana_network_issues',
      name: 'Solana Network Issues',
      condition: 'solana_error_rate > threshold',
      threshold: 0.1, // 10%
      severity: 'critical',
      channels: ['email', 'slack', 'pagerduty'],
      cooldown: 15
    });

    this.addAlert({
      id: 'queue_backup',
      name: 'Queue Backup Detected',
      condition: 'queue_size > threshold',
      threshold: 1000,
      severity: 'warning',
      channels: ['slack'],
      cooldown: 30
    });

    this.addAlert({
      id: 'revenue_drop',
      name: 'Significant Revenue Drop',
      condition: 'hourly_revenue_change < threshold',
      threshold: -0.5, // 50% drop
      severity: 'info',
      channels: ['email'],
      cooldown: 120
    });

    this.addAlert({
      id: 'concurrent_users_spike',
      name: 'Concurrent Users Spike',
      condition: 'concurrent_users > threshold',
      threshold: 10000,
      severity: 'info',
      channels: ['slack'],
      cooldown: 60
    });
  }

  private addAlert(alert: Alert) {
    this.alerts.set(alert.id, alert);
  }

  async checkAlert(alertId: string, currentValue: number): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) return;

    // Check cooldown
    if (alert.lastFired) {
      const cooldownMs = alert.cooldown * 60 * 1000;
      if (Date.now() - alert.lastFired.getTime() < cooldownMs) {
        return; // Still in cooldown
      }
    }

    // Check threshold
    let shouldFire = false;
    if (alert.condition.includes('>')) {
      shouldFire = currentValue > alert.threshold;
    } else if (alert.condition.includes('<')) {
      shouldFire = currentValue < alert.threshold;
    }

    if (shouldFire) {
      await this.fireAlert(alert, currentValue);
    }
  }

  private async fireAlert(alert: Alert, value: number): Promise<void> {
    logger.warn(`Alert fired: ${alert.name}`, { value, threshold: alert.threshold });

    const message = this.formatAlertMessage(alert, value);

    // Send to configured channels
    const promises = alert.channels.map(channel => {
      switch (channel) {
        case 'email':
          return this.sendEmail(alert, message);
        case 'slack':
          return this.sendSlack(alert, message);
        case 'pagerduty':
          return this.sendPagerDuty(alert, message);
        default:
          return Promise.resolve();
      }
    });

    await Promise.allSettled(promises);

    // Update last fired time
    alert.lastFired = new Date();
    this.emit('alert_fired', { alert, value, timestamp: new Date() });
  }

  private formatAlertMessage(alert: Alert, value: number): string {
    const emoji = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🚨',
      critical: '🔥'
    };

    return `${emoji[alert.severity]} **${alert.name}**
    
Current Value: ${value}
Threshold: ${alert.threshold}
Severity: ${alert.severity.toUpperCase()}
Time: ${new Date().toISOString()}

Please investigate immediately.`;
  }

  private async sendEmail(alert: Alert, message: string): Promise<void> {
    if (!this.emailTransporter) return;

    try {
      await this.emailTransporter.sendMail({
        from: process.env.ALERT_FROM_EMAIL || 'alerts@tickettoken.com',
        to: process.env.ALERT_TO_EMAIL || 'ops@tickettoken.com',
        subject: `[${alert.severity.toUpperCase()}] ${alert.name}`,
        text: message,
        html: message.replace(/\n/g, '<br>')
      });
    } catch (error) {
      logger.error('Failed to send email alert:', error);
    }
  }

  private async sendSlack(alert: Alert, message: string): Promise<void> {
    if (!this.slackClient) return;

    try {
      await this.slackClient.chat.postMessage({
        channel: process.env.SLACK_ALERTS_CHANNEL || '#alerts',
        text: message,
        attachments: [{
          color: alert.severity === 'critical' ? 'danger' : 
                 alert.severity === 'error' ? 'warning' : 'good',
          fields: [
            { title: 'Alert', value: alert.name, short: true },
            { title: 'Severity', value: alert.severity, short: true }
          ]
        }]
      });
    } catch (error) {
      logger.error('Failed to send Slack alert:', error);
    }
  }

  private async sendPagerDuty(alert: Alert, message: string): Promise<void> {
    // PagerDuty integration would go here
    logger.info('PagerDuty alert would be sent:', { alert: alert.name });
  }
}

export const alertingService = new AlertingService();
