import { logger } from '../../logger';
import nodemailer from 'nodemailer';
import { WebClient } from '@slack/web-api';
import axios from 'axios';

interface Alert {
  ruleId: string;
  ruleName: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export class NotificationManager {
  private emailTransporter: nodemailer.Transporter | null = null;
  private slackClient: InstanceType<typeof WebClient> | null = null;

  constructor() {
    this.initializeEmailTransporter();
    this.initializeSlackClient();
  }

  private initializeEmailTransporter(): void {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        this.emailTransporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
        logger.info('Email transporter initialized');
      } catch (error) {
        logger.error('Failed to initialize email transporter:', error);
      }
    } else {
      logger.warn('Email notification disabled: Missing SMTP configuration');
    }
  }

  private initializeSlackClient(): void {
    if (process.env.SLACK_TOKEN) {
      try {
        this.slackClient = new WebClient(process.env.SLACK_TOKEN);
        logger.info('Slack client initialized');
      } catch (error) {
        logger.error('Failed to initialize Slack client:', error);
      }
    } else {
      logger.warn('Slack notification disabled: Missing SLACK_TOKEN');
    }
  }

  async send(channel: string, message: string, alert: Alert): Promise<void> {
    try {
      logger.debug(`Sending notification via ${channel}`, { alert: alert.ruleName });

      switch (channel.toLowerCase()) {
        case 'email':
          await this.sendEmail(message, alert);
          break;
        case 'slack':
          await this.sendSlack(message, alert);
          break;
        case 'pagerduty':
          await this.sendPagerDuty(message, alert);
          break;
        case 'webhook':
          await this.sendWebhook(message, alert);
          break;
        default:
          logger.warn(`Unknown notification channel: ${channel}`);
      }
    } catch (error) {
      logger.error(`Failed to send notification via ${channel}:`, error);
      throw error;
    }
  }

  private async sendEmail(message: string, alert: Alert): Promise<void> {
    if (!this.emailTransporter) {
      throw new Error('Email transporter not initialized');
    }

    const toEmail = process.env.ALERT_TO_EMAIL || process.env.SMTP_USER;
    if (!toEmail) {
      throw new Error('No email recipient configured (ALERT_TO_EMAIL or SMTP_USER)');
    }

    try {
      await this.emailTransporter.sendMail({
        from: process.env.SMTP_USER,
        to: toEmail,
        subject: `[${alert.severity.toUpperCase()}] ${alert.ruleName}`,
        text: message,
        html: this.formatEmailHtml(message, alert)
      });

      logger.info(`Email notification sent to ${toEmail}`);
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  private formatEmailHtml(message: string, alert: Alert): string {
    const severityColor = this.getSeverityColor(alert.severity);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .alert-box { border-left: 4px solid ${severityColor}; padding: 15px; margin: 20px 0; background: #f5f5f5; }
          .severity { color: ${severityColor}; font-weight: bold; font-size: 1.2em; }
          .details { margin-top: 15px; }
          .details dt { font-weight: bold; margin-top: 10px; }
          .details dd { margin-left: 0; padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="alert-box">
          <h2>🚨 Monitoring Alert</h2>
          <p class="severity">${alert.severity.toUpperCase()}: ${alert.ruleName}</p>

          <dl class="details">
            <dt>Current Value:</dt>
            <dd>${alert.value}</dd>

            <dt>Threshold:</dt>
            <dd>${alert.threshold}</dd>

            <dt>Message:</dt>
            <dd>${alert.message}</dd>

            <dt>Time:</dt>
            <dd>${alert.timestamp.toLocaleString()}</dd>

            <dt>Rule ID:</dt>
            <dd>${alert.ruleId}</dd>
          </dl>
        </div>
      </body>
      </html>
    `;
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return '#dc3545';
      case 'error':
        return '#fd7e14';
      case 'warning':
        return '#ffc107';
      case 'info':
        return '#17a2b8';
      default:
        return '#6c757d';
    }
  }

  private async sendSlack(message: string, alert: Alert): Promise<void> {
    if (!this.slackClient) {
      throw new Error('Slack client not initialized');
    }

    const channel = process.env.SLACK_CHANNEL || '#monitoring-alerts';

    try {
      await this.slackClient.chat.postMessage({
        channel,
        text: message,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🚨 ${alert.ruleName}`,
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Severity:*\n${alert.severity.toUpperCase()}`
              },
              {
                type: 'mrkdwn',
                text: `*Time:*\n${alert.timestamp.toISOString()}`
              },
              {
                type: 'mrkdwn',
                text: `*Current Value:*\n${alert.value}`
              },
              {
                type: 'mrkdwn',
                text: `*Threshold:*\n${alert.threshold}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Message:*\n${alert.message}`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'plain_text',
                text: `Rule ID: ${alert.ruleId}`,
                emoji: true
              }
            ]
          }
        ]
      });

      logger.info(`Slack notification sent to ${channel}`);
    } catch (error) {
      logger.error('Failed to send Slack message:', error);
      throw error;
    }
  }

  private async sendPagerDuty(message: string, alert: Alert): Promise<void> {
    const routingKey = process.env.PAGERDUTY_ROUTING_KEY;
    if (!routingKey) {
      throw new Error('PagerDuty routing key not configured (PAGERDUTY_ROUTING_KEY)');
    }

    try {
      const event = {
        routing_key: routingKey,
        event_action: 'trigger',
        payload: {
          summary: `${alert.severity.toUpperCase()}: ${alert.ruleName}`,
          severity: this.mapSeverityToPagerDuty(alert.severity),
          source: 'monitoring-service',
          timestamp: alert.timestamp.toISOString(),
          component: 'alert-system',
          group: 'monitoring',
          class: alert.ruleId,
          custom_details: {
            rule_name: alert.ruleName,
            current_value: alert.value,
            threshold: alert.threshold,
            message: alert.message
          }
        }
      };

      await axios.post('https://events.pagerduty.com/v2/enqueue', event, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      logger.info('PagerDuty incident created');
    } catch (error) {
      logger.error('Failed to send PagerDuty event:', error);
      throw error;
    }
  }

  private mapSeverityToPagerDuty(severity: string): string {
    switch (severity) {
      case 'critical':
        return 'critical';
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'warning';
    }
  }

  private async sendWebhook(message: string, alert: Alert): Promise<void> {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error('Webhook URL not configured (WEBHOOK_URL)');
    }

    try {
      await axios.post(webhookUrl, {
        alert: {
          rule_id: alert.ruleId,
          rule_name: alert.ruleName,
          severity: alert.severity,
          message: alert.message,
          value: alert.value,
          threshold: alert.threshold,
          timestamp: alert.timestamp.toISOString()
        },
        formatted_message: message
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TicketToken-Monitoring-Service'
        },
        timeout: 5000
      });

      logger.info('Webhook notification sent');
    } catch (error) {
      logger.error('Failed to send webhook:', error);
      throw error;
    }
  }
}
