import { Registry, Counter, Gauge, Histogram, Summary } from 'prom-client';
import { logger } from '../config/logger';

class MetricsService {
  private registry: Registry;
  
  // Counters (monotonically increasing)
  public notificationSentTotal: Counter;
  public notificationDeliveryTotal: Counter;
  public notificationErrorsTotal: Counter;
  public webhookReceivedTotal: Counter;
  public apiRequestsTotal: Counter;
  
  // Gauges (can go up or down)
  public notificationQueueDepth: Gauge;
  public activeConnections: Gauge;
  public providerStatus: Gauge;
  
  // Histograms (distribution of values)
  public notificationSendDuration: Histogram;
  public templateRenderDuration: Histogram;
  public apiRequestDuration: Histogram;
  public providerResponseTime: Histogram;
  
  // Summaries (quantiles)
  public notificationBatchSize: Summary;
  
  constructor() {
    this.registry = new Registry();
    
    // Initialize counters
    this.notificationSentTotal = new Counter({
      name: 'notification_sent_total',
      help: 'Total number of notifications sent',
      labelNames: ['channel', 'type', 'status', 'provider'],
      registers: [this.registry]
    });
    
    this.notificationDeliveryTotal = new Counter({
      name: 'notification_delivery_total',
      help: 'Total number of delivery confirmations received',
      labelNames: ['channel', 'status', 'provider'],
      registers: [this.registry]
    });
    
    this.notificationErrorsTotal = new Counter({
      name: 'notification_errors_total',
      help: 'Total number of notification errors',
      labelNames: ['error_type', 'provider', 'channel'],
      registers: [this.registry]
    });
    
    this.webhookReceivedTotal = new Counter({
      name: 'webhook_received_total',
      help: 'Total number of webhooks received',
      labelNames: ['provider', 'event_type'],
      registers: [this.registry]
    });
    
    this.apiRequestsTotal = new Counter({
      name: 'api_requests_total',
      help: 'Total number of API requests',
      labelNames: ['endpoint', 'method', 'status_code'],
      registers: [this.registry]
    });
    
    // Initialize gauges
    this.notificationQueueDepth = new Gauge({
      name: 'notification_queue_depth',
      help: 'Current notification queue depth',
      labelNames: ['queue_type'],
      registers: [this.registry]
    });
    
    this.activeConnections = new Gauge({
      name: 'active_connections',
      help: 'Number of active database connections',
      registers: [this.registry]
    });
    
    this.providerStatus = new Gauge({
      name: 'provider_status',
      help: 'Provider health status (0=down, 1=up)',
      labelNames: ['provider_name', 'provider_type'],
      registers: [this.registry]
    });
    
    // Initialize histograms
    this.notificationSendDuration = new Histogram({
      name: 'notification_send_duration_seconds',
      help: 'Time to send notification',
      labelNames: ['channel', 'provider', 'type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry]
    });
    
    this.templateRenderDuration = new Histogram({
      name: 'template_render_duration_seconds',
      help: 'Template rendering time',
      labelNames: ['template_name', 'channel'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry]
    });
    
    this.apiRequestDuration = new Histogram({
      name: 'api_request_duration_seconds',
      help: 'API request latency',
      labelNames: ['endpoint', 'method', 'status_code'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.registry]
    });
    
    this.providerResponseTime = new Histogram({
      name: 'provider_response_time_seconds',
      help: 'Provider API response time',
      labelNames: ['provider_name', 'provider_type', 'operation'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry]
    });
    
    // Initialize summaries
    this.notificationBatchSize = new Summary({
      name: 'notification_batch_size',
      help: 'Distribution of notification batch sizes',
      labelNames: ['channel'],
      percentiles: [0.5, 0.9, 0.95, 0.99],
      registers: [this.registry]
    });
    
    logger.info('Metrics service initialized');
  }
  
  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
  
  /**
   * Get registry for custom metrics
   */
  getRegistry(): Registry {
    return this.registry;
  }
  
  /**
   * Track notification sent
   */
  trackNotificationSent(channel: string, type: string, status: string, provider: string): void {
    this.notificationSentTotal.inc({ channel, type, status, provider });
  }
  
  /**
   * Track notification delivery
   */
  trackNotificationDelivery(channel: string, status: string, provider: string): void {
    this.notificationDeliveryTotal.inc({ channel, status, provider });
  }
  
  /**
   * Track notification error
   */
  trackNotificationError(errorType: string, provider: string, channel: string): void {
    this.notificationErrorsTotal.inc({ error_type: errorType, provider, channel });
  }
  
  /**
   * Track webhook received
   */
  trackWebhookReceived(provider: string, eventType: string): void {
    this.webhookReceivedTotal.inc({ provider, event_type: eventType });
  }
  
  /**
   * Track API request
   */
  trackApiRequest(endpoint: string, method: string, statusCode: number): void {
    this.apiRequestsTotal.inc({ endpoint, method, status_code: statusCode.toString() });
  }
  
  /**
   * Set queue depth
   */
  setQueueDepth(queueType: string, depth: number): void {
    this.notificationQueueDepth.set({ queue_type: queueType }, depth);
  }
  
  /**
   * Set active connections
   */
  setActiveConnections(count: number): void {
    this.activeConnections.set(count);
  }
  
  /**
   * Set provider status
   */
  setProviderStatus(providerName: string, providerType: string, isUp: boolean): void {
    this.providerStatus.set({ provider_name: providerName, provider_type: providerType }, isUp ? 1 : 0);
  }
  
  /**
   * Record notification send duration
   */
  recordNotificationSendDuration(channel: string, provider: string, type: string, durationSeconds: number): void {
    this.notificationSendDuration.observe({ channel, provider, type }, durationSeconds);
  }
  
  /**
   * Record template render duration
   */
  recordTemplateRenderDuration(templateName: string, channel: string, durationSeconds: number): void {
    this.templateRenderDuration.observe({ template_name: templateName, channel }, durationSeconds);
  }
  
  /**
   * Record API request duration
   */
  recordApiRequestDuration(endpoint: string, method: string, statusCode: number, durationSeconds: number): void {
    this.apiRequestDuration.observe({ endpoint, method, status_code: statusCode.toString() }, durationSeconds);
  }
  
  /**
   * Record provider response time
   */
  recordProviderResponseTime(providerName: string, providerType: string, operation: string, durationSeconds: number): void {
    this.providerResponseTime.observe({ provider_name: providerName, provider_type: providerType, operation }, durationSeconds);
  }
  
  /**
   * Record batch size
   */
  recordBatchSize(channel: string, size: number): void {
    this.notificationBatchSize.observe({ channel }, size);
  }

  /**
   * Increment a counter (generic)
   */
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();

  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    if (!this.counters.has(name)) {
      this.counters.set(
        name,
        new Counter({
          name,
          help: `Counter for ${name}`,
          labelNames: Object.keys(labels),
          registers: [this.registry],
        })
      );
    }
    const counter = this.counters.get(name);
    if (counter) {
      counter.inc(labels);
    }
  }

  /**
   * Set a gauge value (generic)
   */
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(
        name,
        new Gauge({
          name,
          help: `Gauge for ${name}`,
          labelNames: Object.keys(labels),
          registers: [this.registry],
        })
      );
    }
    const gauge = this.gauges.get(name);
    if (gauge) {
      gauge.set(labels, value);
    }
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
