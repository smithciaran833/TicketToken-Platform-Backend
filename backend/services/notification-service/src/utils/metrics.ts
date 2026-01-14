/**
 * Enhanced Metrics Utility
 * 
 * AUDIT FIX MET-M1: Comprehensive metrics collection
 * AUDIT FIX MET-M2: Provider-specific metrics
 * AUDIT FIX MET-M3: Business metrics for notifications
 */

import { redisClient } from '../config/redis';
import { logger } from './logger';

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Metric labels
 */
export interface MetricLabels {
  [key: string]: string | number;
}

/**
 * Histogram buckets for latency measurements (in seconds)
 */
const LATENCY_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * Enhanced metrics service for notification-service
 */
class NotificationMetrics {
  private prefix = 'notification_service';
  private localCounters: Map<string, number> = new Map();
  private localGauges: Map<string, number> = new Map();
  private localHistograms: Map<string, number[]> = new Map();

  /**
   * Increment a counter
   */
  async incrementCounter(
    name: string,
    labels: MetricLabels = {},
    value: number = 1
  ): Promise<void> {
    const key = this.buildKey('counter', name, labels);
    
    // Local tracking
    this.localCounters.set(key, (this.localCounters.get(key) || 0) + value);
    
    // Redis tracking for distributed systems
    try {
      await redisClient.incrbyfloat(`${this.prefix}:${key}`, value);
    } catch (error) {
      logger.warn('Failed to increment counter in Redis', { name, error });
    }
  }

  /**
   * Set a gauge value
   */
  async setGauge(
    name: string,
    value: number,
    labels: MetricLabels = {}
  ): Promise<void> {
    const key = this.buildKey('gauge', name, labels);
    
    // Local tracking
    this.localGauges.set(key, value);
    
    // Redis tracking
    try {
      await redisClient.set(`${this.prefix}:${key}`, value.toString());
    } catch (error) {
      logger.warn('Failed to set gauge in Redis', { name, error });
    }
  }

  /**
   * Record a histogram observation
   */
  async recordHistogram(
    name: string,
    value: number,
    labels: MetricLabels = {}
  ): Promise<void> {
    const key = this.buildKey('histogram', name, labels);
    
    // Local tracking
    const existing = this.localHistograms.get(key) || [];
    existing.push(value);
    // Keep only last 1000 observations
    if (existing.length > 1000) {
      existing.shift();
    }
    this.localHistograms.set(key, existing);
    
    // Redis tracking (store sum and count for averages)
    try {
      await Promise.all([
        redisClient.incrbyfloat(`${this.prefix}:${key}:sum`, value),
        redisClient.incr(`${this.prefix}:${key}:count`),
      ]);
    } catch (error) {
      logger.warn('Failed to record histogram in Redis', { name, error });
    }
  }

  // ==================== NOTIFICATION SPECIFIC METRICS ====================

  /**
   * Track notification sent
   */
  async trackNotificationSent(
    channel: 'email' | 'sms' | 'push' | 'webhook',
    provider: string,
    status: 'success' | 'failure',
    tenantId?: string
  ): Promise<void> {
    await this.incrementCounter('notifications_sent_total', {
      channel,
      provider,
      status,
      ...(tenantId && { tenant_id: tenantId }),
    });
  }

  /**
   * Track notification delivery latency
   */
  async trackDeliveryLatency(
    channel: 'email' | 'sms' | 'push' | 'webhook',
    provider: string,
    durationSeconds: number
  ): Promise<void> {
    await this.recordHistogram('notification_delivery_duration_seconds', durationSeconds, {
      channel,
      provider,
    });
  }

  /**
   * Track provider health
   */
  async trackProviderHealth(
    provider: string,
    channel: string,
    healthy: boolean
  ): Promise<void> {
    await this.setGauge('provider_health', healthy ? 1 : 0, {
      provider,
      channel,
    });
  }

  /**
   * Track provider error rate
   */
  async trackProviderError(
    provider: string,
    channel: string,
    errorType: string
  ): Promise<void> {
    await this.incrementCounter('provider_errors_total', {
      provider,
      channel,
      error_type: errorType,
    });
  }

  /**
   * Track queue depth
   */
  async trackQueueDepth(queueName: string, depth: number): Promise<void> {
    await this.setGauge('queue_depth', depth, { queue: queueName });
  }

  /**
   * Track campaign metrics
   */
  async trackCampaignSent(
    campaignId: string,
    total: number,
    successful: number,
    failed: number
  ): Promise<void> {
    await Promise.all([
      this.incrementCounter('campaign_notifications_total', { campaign_id: campaignId }, total),
      this.incrementCounter('campaign_notifications_success', { campaign_id: campaignId }, successful),
      this.incrementCounter('campaign_notifications_failed', { campaign_id: campaignId }, failed),
    ]);
  }

  /**
   * Track preference updates
   */
  async trackPreferenceUpdate(
    channel: string,
    action: 'subscribe' | 'unsubscribe'
  ): Promise<void> {
    await this.incrementCounter('preference_updates_total', { channel, action });
  }

  /**
   * Track webhook delivery
   */
  async trackWebhookDelivery(
    provider: string,
    status: 'success' | 'failure',
    statusCode?: number
  ): Promise<void> {
    await this.incrementCounter('webhook_deliveries_total', {
      provider,
      status,
      ...(statusCode && { status_code: statusCode.toString() }),
    });
  }

  /**
   * Track rate limit hits
   */
  async trackRateLimitHit(endpoint: string, tenantId?: string): Promise<void> {
    await this.incrementCounter('rate_limit_hits_total', {
      endpoint,
      ...(tenantId && { tenant_id: tenantId }),
    });
  }

  /**
   * Track consent events
   */
  async trackConsentEvent(
    action: 'granted' | 'revoked' | 'expired',
    channel: string
  ): Promise<void> {
    await this.incrementCounter('consent_events_total', { action, channel });
  }

  /**
   * Track template rendering
   */
  async trackTemplateRender(
    templateName: string,
    status: 'success' | 'failure',
    durationMs: number
  ): Promise<void> {
    await this.incrementCounter('template_renders_total', { template: templateName, status });
    await this.recordHistogram('template_render_duration_seconds', durationMs / 1000, {
      template: templateName,
    });
  }

  // ==================== AGGREGATION & EXPORT ====================

  /**
   * Get all metrics in Prometheus format
   */
  async getPrometheusMetrics(): Promise<string> {
    const lines: string[] = [];
    
    // Export counters
    for (const [key, value] of this.localCounters) {
      const { name, labels } = this.parseKey(key);
      lines.push(`# TYPE ${this.prefix}_${name} counter`);
      lines.push(`${this.prefix}_${name}${this.formatLabels(labels)} ${value}`);
    }
    
    // Export gauges
    for (const [key, value] of this.localGauges) {
      const { name, labels } = this.parseKey(key);
      lines.push(`# TYPE ${this.prefix}_${name} gauge`);
      lines.push(`${this.prefix}_${name}${this.formatLabels(labels)} ${value}`);
    }
    
    // Export histograms
    for (const [key, values] of this.localHistograms) {
      const { name, labels } = this.parseKey(key);
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;
      
      lines.push(`# TYPE ${this.prefix}_${name} histogram`);
      
      // Add bucket counts
      for (const bucket of LATENCY_BUCKETS) {
        const bucketCount = values.filter(v => v <= bucket).length;
        lines.push(`${this.prefix}_${name}_bucket${this.formatLabels({ ...labels, le: bucket.toString() })} ${bucketCount}`);
      }
      lines.push(`${this.prefix}_${name}_bucket${this.formatLabels({ ...labels, le: '+Inf' })} ${count}`);
      lines.push(`${this.prefix}_${name}_sum${this.formatLabels(labels)} ${sum}`);
      lines.push(`${this.prefix}_${name}_count${this.formatLabels(labels)} ${count}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Get metrics summary
   */
  async getMetricsSummary(): Promise<Record<string, any>> {
    return {
      counters: Object.fromEntries(this.localCounters),
      gauges: Object.fromEntries(this.localGauges),
      histograms: Object.fromEntries(
        Array.from(this.localHistograms.entries()).map(([key, values]) => [
          key,
          {
            count: values.length,
            sum: values.reduce((a, b) => a + b, 0),
            avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
            min: values.length > 0 ? Math.min(...values) : 0,
            max: values.length > 0 ? Math.max(...values) : 0,
          },
        ])
      ),
    };
  }

  /**
   * Reset local metrics (for testing)
   */
  reset(): void {
    this.localCounters.clear();
    this.localGauges.clear();
    this.localHistograms.clear();
  }

  // ==================== HELPER METHODS ====================

  private buildKey(type: MetricType, name: string, labels: MetricLabels): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${type}:${name}{${labelStr}}` : `${type}:${name}`;
  }

  private parseKey(key: string): { name: string; labels: MetricLabels } {
    const match = key.match(/^[^:]+:([^{]+)(?:\{(.+)\})?$/);
    if (!match) {
      return { name: key, labels: {} };
    }
    
    const name = match[1];
    const labels: MetricLabels = {};
    
    if (match[2]) {
      const pairs = match[2].split(',');
      for (const pair of pairs) {
        const [k, v] = pair.split('=');
        labels[k] = v.replace(/"/g, '');
      }
    }
    
    return { name, labels };
  }

  private formatLabels(labels: MetricLabels): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    
    const formatted = entries
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `{${formatted}}`;
  }
}

/**
 * Export singleton instance
 */
export const metrics = new NotificationMetrics();

/**
 * Create a timer for measuring durations
 */
export function createTimer(): () => number {
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start) / 1_000_000_000; // Convert to seconds
}
