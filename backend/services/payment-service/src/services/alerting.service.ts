/**
 * Alerting Service for Payment Failures
 * 
 * HIGH FIX: Implements alerting for critical payment events:
 * - Transfer failures
 * - Payout failures
 * - Disputes opened
 * - High-value refunds
 * - Rate limit exceeded
 * 
 * MEDIUM FIXES:
 * - MON-3: Alert on account disabled (not just log)
 * - COMM-6: Support visibility beyond audit log (dashboard, notifications)
 */

import { logger } from '../utils/logger';
import { metricsRegistry } from '../routes/metrics.routes';
import { SecureHttpClient } from '../utils/http-client.util';

const log = logger.child({ component: 'AlertingService' });

// =============================================================================
// TYPES
// =============================================================================

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export enum AlertChannel {
  LOG = 'log',
  SLACK = 'slack',
  PAGERDUTY = 'pagerduty',
  EMAIL = 'email',
  WEBHOOK = 'webhook',
}

export interface Alert {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata: Record<string, any>;
  timestamp: Date;
  tenantId?: string;
}

export interface AlertConfig {
  channels: AlertChannel[];
  slackWebhookUrl?: string;
  pagerdutyIntegrationKey?: string;
  emailRecipients?: string[];
  webhookUrl?: string;
  thresholds: {
    highValueRefundAmount: number; // In cents
    transferFailureCountPerHour: number;
    disputeCountPerDay: number;
  };
}

// =============================================================================
// ALERT SERVICE
// =============================================================================

export class AlertingService {
  private config: AlertConfig;
  private httpClient: SecureHttpClient;
  
  // In-memory counters for rate limiting alerts
  private alertCounts: Map<string, { count: number; windowStart: Date }> = new Map();
  private readonly ALERT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_ALERTS_PER_WINDOW = 10;

  constructor(config?: Partial<AlertConfig>) {
    this.config = {
      channels: config?.channels || [AlertChannel.LOG],
      slackWebhookUrl: config?.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL,
      pagerdutyIntegrationKey: config?.pagerdutyIntegrationKey || process.env.PAGERDUTY_INTEGRATION_KEY,
      emailRecipients: config?.emailRecipients || process.env.ALERT_EMAIL_RECIPIENTS?.split(','),
      webhookUrl: config?.webhookUrl || process.env.ALERT_WEBHOOK_URL,
      thresholds: {
        highValueRefundAmount: config?.thresholds?.highValueRefundAmount || 100_000, // $1000
        transferFailureCountPerHour: config?.thresholds?.transferFailureCountPerHour || 5,
        disputeCountPerDay: config?.thresholds?.disputeCountPerDay || 10,
      },
    };

    this.httpClient = new SecureHttpClient('alerting-service');
  }

  /**
   * Send an alert
   */
  async sendAlert(alert: Alert): Promise<void> {
    // Rate limit check
    if (!this.shouldSendAlert(alert.type)) {
      log.debug({ type: alert.type }, 'Alert rate limited');
      return;
    }

    // Increment metrics
    metricsRegistry.incCounter('alerts_sent_total', {
      type: alert.type,
      severity: alert.severity,
    });

    // Send to all configured channels
    const promises: Promise<void>[] = [];

    for (const channel of this.config.channels) {
      switch (channel) {
        case AlertChannel.LOG:
          promises.push(this.sendLogAlert(alert));
          break;
        case AlertChannel.SLACK:
          if (this.config.slackWebhookUrl) {
            promises.push(this.sendSlackAlert(alert));
          }
          break;
        case AlertChannel.PAGERDUTY:
          if (this.config.pagerdutyIntegrationKey && alert.severity === AlertSeverity.CRITICAL) {
            promises.push(this.sendPagerDutyAlert(alert));
          }
          break;
        case AlertChannel.WEBHOOK:
          if (this.config.webhookUrl) {
            promises.push(this.sendWebhookAlert(alert));
          }
          break;
        case AlertChannel.EMAIL:
          // Email is typically handled by a separate service
          promises.push(this.queueEmailAlert(alert));
          break;
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Check if we should send this alert (rate limiting)
   */
  private shouldSendAlert(alertType: string): boolean {
    const now = new Date();
    const key = alertType;
    
    const existing = this.alertCounts.get(key);
    
    if (!existing || (now.getTime() - existing.windowStart.getTime()) > this.ALERT_WINDOW_MS) {
      // New window
      this.alertCounts.set(key, { count: 1, windowStart: now });
      return true;
    }
    
    if (existing.count >= this.MAX_ALERTS_PER_WINDOW) {
      return false;
    }
    
    existing.count++;
    return true;
  }

  /**
   * Log alert
   */
  private async sendLogAlert(alert: Alert): Promise<void> {
    const logMethod = alert.severity === AlertSeverity.CRITICAL ? 'fatal' :
                      alert.severity === AlertSeverity.ERROR ? 'error' :
                      alert.severity === AlertSeverity.WARNING ? 'warn' : 'info';
    
    log[logMethod]({
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      tenantId: alert.tenantId,
      metadata: alert.metadata,
    }, `[ALERT] ${alert.title}: ${alert.message}`);
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(alert: Alert): Promise<void> {
    if (!this.config.slackWebhookUrl) return;

    const color = alert.severity === AlertSeverity.CRITICAL ? '#FF0000' :
                  alert.severity === AlertSeverity.ERROR ? '#FF6600' :
                  alert.severity === AlertSeverity.WARNING ? '#FFCC00' : '#00FF00';

    const payload = {
      attachments: [{
        color,
        title: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        text: alert.message,
        fields: [
          { title: 'Type', value: alert.type, short: true },
          { title: 'Severity', value: alert.severity, short: true },
          ...(alert.tenantId ? [{ title: 'Tenant', value: alert.tenantId, short: true }] : []),
          ...Object.entries(alert.metadata).slice(0, 5).map(([k, v]) => ({
            title: k,
            value: String(v),
            short: true,
          })),
        ],
        ts: Math.floor(alert.timestamp.getTime() / 1000),
      }],
    };

    try {
      await this.httpClient.post(this.config.slackWebhookUrl, payload);
    } catch (error) {
      log.error({ error, alertId: alert.id }, 'Failed to send Slack alert');
    }
  }

  /**
   * Send PagerDuty alert
   */
  private async sendPagerDutyAlert(alert: Alert): Promise<void> {
    if (!this.config.pagerdutyIntegrationKey) return;

    const payload = {
      routing_key: this.config.pagerdutyIntegrationKey,
      event_action: 'trigger',
      dedup_key: `payment-service-${alert.type}-${alert.tenantId || 'global'}`,
      payload: {
        summary: `${alert.title}: ${alert.message}`,
        severity: alert.severity === AlertSeverity.CRITICAL ? 'critical' : 'error',
        source: 'payment-service',
        custom_details: {
          ...alert.metadata,
          tenantId: alert.tenantId,
        },
      },
    };

    try {
      await this.httpClient.post(
        'https://events.pagerduty.com/v2/enqueue',
        payload
      );
    } catch (error) {
      log.error({ error, alertId: alert.id }, 'Failed to send PagerDuty alert');
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: Alert): Promise<void> {
    if (!this.config.webhookUrl) return;

    try {
      await this.httpClient.post(this.config.webhookUrl, alert);
    } catch (error) {
      log.error({ error, alertId: alert.id }, 'Failed to send webhook alert');
    }
  }

  /**
   * Queue email alert (placeholder - implement with your email service)
   */
  private async queueEmailAlert(alert: Alert): Promise<void> {
    // In production, queue this for your email service
    log.info({ alertId: alert.id, recipients: this.config.emailRecipients }, 'Email alert queued');
  }

  // =============================================================================
  // PAYMENT-SPECIFIC ALERTS
  // =============================================================================

  /**
   * Alert for transfer failure
   */
  async alertTransferFailed(
    transferId: string,
    amount: number,
    destination: string,
    error: string,
    tenantId?: string
  ): Promise<void> {
    await this.sendAlert({
      id: `transfer-failed-${transferId}`,
      type: 'transfer.failed',
      severity: AlertSeverity.ERROR,
      title: 'Transfer Failed',
      message: `Transfer ${transferId} to ${destination} failed: ${error}`,
      metadata: {
        transferId,
        amount,
        destination,
        error,
      },
      timestamp: new Date(),
      tenantId,
    });
  }

  /**
   * Alert for payout failure
   */
  async alertPayoutFailed(
    payoutId: string,
    amount: number,
    accountId: string,
    failureCode: string | null,
    tenantId?: string
  ): Promise<void> {
    await this.sendAlert({
      id: `payout-failed-${payoutId}`,
      type: 'payout.failed',
      severity: AlertSeverity.ERROR,
      title: 'Payout Failed',
      message: `Payout ${payoutId} to ${accountId} failed: ${failureCode || 'Unknown error'}`,
      metadata: {
        payoutId,
        amount,
        accountId,
        failureCode,
      },
      timestamp: new Date(),
      tenantId,
    });
  }

  /**
   * Alert for new dispute
   */
  async alertDisputeOpened(
    disputeId: string,
    chargeId: string,
    amount: number,
    reason: string,
    tenantId?: string
  ): Promise<void> {
    await this.sendAlert({
      id: `dispute-opened-${disputeId}`,
      type: 'dispute.opened',
      severity: AlertSeverity.WARNING,
      title: 'Dispute Opened',
      message: `New dispute ${disputeId} for charge ${chargeId}: ${reason}`,
      metadata: {
        disputeId,
        chargeId,
        amount,
        reason,
      },
      timestamp: new Date(),
      tenantId,
    });
  }

  /**
   * Alert for high-value refund
   */
  async alertHighValueRefund(
    refundId: string,
    paymentIntentId: string,
    amount: number,
    tenantId?: string
  ): Promise<void> {
    if (amount < this.config.thresholds.highValueRefundAmount) {
      return;
    }

    await this.sendAlert({
      id: `high-value-refund-${refundId}`,
      type: 'refund.high_value',
      severity: AlertSeverity.WARNING,
      title: 'High-Value Refund',
      message: `Refund ${refundId} for $${(amount / 100).toFixed(2)} processed`,
      metadata: {
        refundId,
        paymentIntentId,
        amount,
        threshold: this.config.thresholds.highValueRefundAmount,
      },
      timestamp: new Date(),
      tenantId,
    });
  }

  /**
   * Alert for repeated authentication failures
   */
  async alertAuthFailures(
    ip: string,
    failureCount: number,
    endpoint: string
  ): Promise<void> {
    await this.sendAlert({
      id: `auth-failures-${ip}-${Date.now()}`,
      type: 'security.auth_failures',
      severity: AlertSeverity.WARNING,
      title: 'Repeated Auth Failures',
      message: `${failureCount} authentication failures from ${ip} on ${endpoint}`,
      metadata: {
        ip,
        failureCount,
        endpoint,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Alert for rate limit exceeded
   */
  async alertRateLimitExceeded(
    ip: string,
    endpoint: string,
    limit: number
  ): Promise<void> {
    await this.sendAlert({
      id: `rate-limit-${ip}-${Date.now()}`,
      type: 'security.rate_limit',
      severity: AlertSeverity.INFO,
      title: 'Rate Limit Exceeded',
      message: `Rate limit of ${limit} exceeded by ${ip} on ${endpoint}`,
      metadata: {
        ip,
        endpoint,
        limit,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Alert for database connection issues
   */
  async alertDatabaseIssue(
    issue: string,
    details: Record<string, any>
  ): Promise<void> {
    await this.sendAlert({
      id: `db-issue-${Date.now()}`,
      type: 'infrastructure.database',
      severity: AlertSeverity.CRITICAL,
      title: 'Database Issue',
      message: issue,
      metadata: details,
      timestamp: new Date(),
    });
  }

  /**
   * Alert for Stripe API issues
   */
  async alertStripeApiIssue(
    operation: string,
    error: string,
    statusCode?: number
  ): Promise<void> {
    await this.sendAlert({
      id: `stripe-issue-${Date.now()}`,
      type: 'integration.stripe',
      severity: AlertSeverity.ERROR,
      title: 'Stripe API Issue',
      message: `Stripe ${operation} failed: ${error}`,
      metadata: {
        operation,
        error,
        statusCode,
      },
      timestamp: new Date(),
    });
  }

  // =============================================================================
  // MON-3: ACCOUNT DISABLED ALERTS
  // =============================================================================

  /**
   * MON-3: Alert when a Stripe Connect account is disabled
   * This is critical as it affects the venue's ability to receive payments
   */
  async alertAccountDisabled(
    accountId: string,
    reason: string,
    disabledAt: Date,
    tenantId?: string,
    venueName?: string
  ): Promise<void> {
    await this.sendAlert({
      id: `account-disabled-${accountId}`,
      type: 'account.disabled',
      severity: AlertSeverity.CRITICAL, // Critical - affects business operations
      title: 'Stripe Account Disabled',
      message: `Account ${accountId}${venueName ? ` (${venueName})` : ''} has been disabled: ${reason}`,
      metadata: {
        accountId,
        reason,
        disabledAt: disabledAt.toISOString(),
        venueName,
        action: 'Contact venue owner and Stripe support immediately',
      },
      timestamp: new Date(),
      tenantId,
    });
  }

  /**
   * MON-3: Alert when account verification fails
   */
  async alertAccountVerificationFailed(
    accountId: string,
    requirements: string[],
    deadline?: Date,
    tenantId?: string
  ): Promise<void> {
    await this.sendAlert({
      id: `account-verification-${accountId}-${Date.now()}`,
      type: 'account.verification_failed',
      severity: AlertSeverity.WARNING,
      title: 'Account Verification Required',
      message: `Account ${accountId} requires additional verification: ${requirements.join(', ')}`,
      metadata: {
        accountId,
        requirements,
        deadline: deadline?.toISOString(),
        daysRemaining: deadline ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
      },
      timestamp: new Date(),
      tenantId,
    });
  }

  /**
   * MON-3: Alert when payouts are paused
   */
  async alertPayoutsPaused(
    accountId: string,
    reason: string,
    tenantId?: string
  ): Promise<void> {
    await this.sendAlert({
      id: `payouts-paused-${accountId}`,
      type: 'account.payouts_paused',
      severity: AlertSeverity.ERROR,
      title: 'Payouts Paused',
      message: `Payouts for account ${accountId} have been paused: ${reason}`,
      metadata: {
        accountId,
        reason,
        action: 'Review account status and resolve any outstanding requirements',
      },
      timestamp: new Date(),
      tenantId,
    });
  }

  // =============================================================================
  // COMM-6: VISIBILITY BEYOND AUDIT LOG
  // =============================================================================

  /**
   * COMM-6: Publish alert to dashboard/notification system
   * This makes alerts visible in admin dashboards, not just logs
   */
  async publishToDashboard(alert: Alert): Promise<void> {
    // Store in database for dashboard visibility
    try {
      const db = await import('../services/databaseService').then(m => m.DatabaseService.getPool());
      
      await db.query(`
        INSERT INTO alert_history (
          id, type, severity, title, message, metadata, tenant_id, created_at, acknowledged
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), false)
        ON CONFLICT (id) DO NOTHING
      `, [
        alert.id,
        alert.type,
        alert.severity,
        alert.title,
        alert.message,
        JSON.stringify(alert.metadata),
        alert.tenantId,
      ]);

      log.debug({ alertId: alert.id }, 'Alert published to dashboard');
    } catch (error) {
      log.warn({ error, alertId: alert.id }, 'Failed to publish alert to dashboard');
    }
  }

  /**
   * COMM-6: Get active alerts for dashboard
   */
  async getActiveAlerts(tenantId?: string, limit: number = 50): Promise<Alert[]> {
    try {
      const db = await import('../services/databaseService').then(m => m.DatabaseService.getPool());
      
      let query = `
        SELECT * FROM alert_history 
        WHERE acknowledged = false
      `;
      const params: any[] = [];
      
      if (tenantId) {
        query += ` AND (tenant_id = $1 OR tenant_id IS NULL)`;
        params.push(tenantId);
      }
      
      query += ` ORDER BY created_at DESC LIMIT ${limit}`;
      
      const result = await db.query(query, params);
      
      return result.rows.map(row => ({
        id: row.id,
        type: row.type,
        severity: row.severity as AlertSeverity,
        title: row.title,
        message: row.message,
        metadata: row.metadata,
        timestamp: row.created_at,
        tenantId: row.tenant_id,
      }));
    } catch (error) {
      log.error({ error }, 'Failed to get active alerts');
      return [];
    }
  }

  /**
   * COMM-6: Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    try {
      const db = await import('../services/databaseService').then(m => m.DatabaseService.getPool());
      
      const result = await db.query(`
        UPDATE alert_history 
        SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = $2
        WHERE id = $1
        RETURNING id
      `, [alertId, acknowledgedBy]);
      
      if (result.rows.length > 0) {
        log.info({ alertId, acknowledgedBy }, 'Alert acknowledged');
        return true;
      }
      return false;
    } catch (error) {
      log.error({ error, alertId }, 'Failed to acknowledge alert');
      return false;
    }
  }

  /**
   * COMM-6: Get alert statistics for dashboard
   */
  async getAlertStats(tenantId?: string): Promise<{
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    unacknowledged: number;
  }> {
    try {
      const db = await import('../services/databaseService').then(m => m.DatabaseService.getPool());
      
      const tenantFilter = tenantId ? `WHERE tenant_id = '${tenantId}' OR tenant_id IS NULL` : '';
      
      const [totalResult, typeResult, severityResult, unackResult] = await Promise.all([
        db.query(`SELECT COUNT(*) as count FROM alert_history ${tenantFilter}`),
        db.query(`SELECT type, COUNT(*) as count FROM alert_history ${tenantFilter} GROUP BY type`),
        db.query(`SELECT severity, COUNT(*) as count FROM alert_history ${tenantFilter} GROUP BY severity`),
        db.query(`SELECT COUNT(*) as count FROM alert_history WHERE acknowledged = false ${tenantFilter ? 'AND ' + tenantFilter.replace('WHERE ', '') : ''}`),
      ]);
      
      return {
        total: parseInt(totalResult.rows[0]?.count || '0', 10),
        byType: Object.fromEntries(typeResult.rows.map(r => [r.type, parseInt(r.count, 10)])),
        bySeverity: Object.fromEntries(severityResult.rows.map(r => [r.severity, parseInt(r.count, 10)])),
        unacknowledged: parseInt(unackResult.rows[0]?.count || '0', 10),
      };
    } catch (error) {
      log.error({ error }, 'Failed to get alert stats');
      return { total: 0, byType: {}, bySeverity: {}, unacknowledged: 0 };
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const alertingService = new AlertingService();

// =============================================================================
// METRIC REGISTRATION
// =============================================================================

// Register alert metrics
metricsRegistry.registerCounter(
  'alerts_sent_total',
  'Total number of alerts sent'
);
