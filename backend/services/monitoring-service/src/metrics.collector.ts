import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';
import { EventEmitter } from 'events';

class MetricsCollector extends EventEmitter {
  // Business Metrics
  public ticketsSold: Counter;
  public ticketsListed: Counter;
  public revenueTotal: Counter;
  public refundsProcessed: Counter;
  
  // Performance Metrics
  public httpRequestDuration: Histogram;
  public dbQueryDuration: Histogram;
  public apiResponseTime: Summary;
  
  // System Metrics
  public activeUsers: Gauge;
  public queueSize: Gauge;
  public cacheHitRate: Gauge;
  public errorRate: Counter;
  
  // Payment Metrics
  public paymentSuccess: Counter;
  public paymentFailure: Counter;
  public paymentDuration: Histogram;
  public stripeWebhooks: Counter;
  
  // Blockchain Metrics
  public nftMinted: Counter;
  public nftTransferred: Counter;
  public solanaTransactionTime: Histogram;
  public solanaErrors: Counter;

  constructor() {
    super();
    
    // Initialize business metrics
    this.ticketsSold = new Counter({
      name: 'tickets_sold_total',
      help: 'Total number of tickets sold',
      labelNames: ['venue_id', 'event_id', 'ticket_type']
    });
    
    this.ticketsListed = new Counter({
      name: 'tickets_listed_total',
      help: 'Total number of tickets listed on marketplace',
      labelNames: ['venue_id', 'price_range']
    });
    
    this.revenueTotal = new Counter({
      name: 'revenue_total_cents',
      help: 'Total revenue in cents',
      labelNames: ['venue_id', 'type'] // primary_sale, resale, fees
    });
    
    this.refundsProcessed = new Counter({
      name: 'refunds_processed_total',
      help: 'Total number of refunds processed',
      labelNames: ['venue_id', 'reason']
    });
    
    // Initialize performance metrics
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_ms',
      help: 'Duration of HTTP requests in ms',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000]
    });
    
    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_ms',
      help: 'Duration of database queries in ms',
      labelNames: ['operation', 'table'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000]
    });
    
    this.apiResponseTime = new Summary({
      name: 'api_response_time_ms',
      help: 'API response time summary',
      labelNames: ['endpoint', 'service'],
      percentiles: [0.5, 0.9, 0.95, 0.99]
    });
    
    // Initialize system metrics
    this.activeUsers = new Gauge({
      name: 'active_users',
      help: 'Number of active users',
      labelNames: ['type'] // buyer, seller, venue_admin
    });
    
    this.queueSize = new Gauge({
      name: 'queue_size',
      help: 'Number of items in processing queues',
      labelNames: ['queue_name']
    });
    
    this.cacheHitRate = new Gauge({
      name: 'cache_hit_rate',
      help: 'Cache hit rate percentage',
      labelNames: ['cache_type']
    });
    
    this.errorRate = new Counter({
      name: 'errors_total',
      help: 'Total number of errors',
      labelNames: ['service', 'error_type', 'severity']
    });
    
    // Initialize payment metrics
    this.paymentSuccess = new Counter({
      name: 'payment_success_total',
      help: 'Total successful payments',
      labelNames: ['provider', 'currency']
    });
    
    this.paymentFailure = new Counter({
      name: 'payment_failure_total',
      help: 'Total failed payments',
      labelNames: ['provider', 'error_code']
    });
    
    this.paymentDuration = new Histogram({
      name: 'payment_processing_duration_ms',
      help: 'Payment processing duration',
      labelNames: ['provider', 'type'],
      buckets: [100, 500, 1000, 2000, 5000, 10000]
    });
    
    this.stripeWebhooks = new Counter({
      name: 'stripe_webhooks_total',
      help: 'Stripe webhook events received',
      labelNames: ['event_type', 'status']
    });
    
    // Initialize blockchain metrics
    this.nftMinted = new Counter({
      name: 'nft_minted_total',
      help: 'Total NFTs minted',
      labelNames: ['collection', 'status']
    });
    
    this.nftTransferred = new Counter({
      name: 'nft_transferred_total',
      help: 'Total NFT transfers',
      labelNames: ['type'] // sale, gift, burn
    });
    
    this.solanaTransactionTime = new Histogram({
      name: 'solana_transaction_time_ms',
      help: 'Solana transaction confirmation time',
      labelNames: ['type'],
      buckets: [1000, 2000, 5000, 10000, 20000, 30000]
    });
    
    this.solanaErrors = new Counter({
      name: 'solana_errors_total',
      help: 'Solana transaction errors',
      labelNames: ['error_type']
    });
    
    // Register all metrics
    register.registerMetric(this.ticketsSold);
    register.registerMetric(this.ticketsListed);
    register.registerMetric(this.revenueTotal);
    register.registerMetric(this.refundsProcessed);
    register.registerMetric(this.httpRequestDuration);
    register.registerMetric(this.dbQueryDuration);
    register.registerMetric(this.apiResponseTime);
    register.registerMetric(this.activeUsers);
    register.registerMetric(this.queueSize);
    register.registerMetric(this.cacheHitRate);
    register.registerMetric(this.errorRate);
    register.registerMetric(this.paymentSuccess);
    register.registerMetric(this.paymentFailure);
    register.registerMetric(this.paymentDuration);
    register.registerMetric(this.stripeWebhooks);
    register.registerMetric(this.nftMinted);
    register.registerMetric(this.nftTransferred);
    register.registerMetric(this.solanaTransactionTime);
    register.registerMetric(this.solanaErrors);
  }

  // Helper methods for common operations
  recordTicketSale(venueId: string, eventId: string, type: string, price: number) {
    this.ticketsSold.inc({ venue_id: venueId, event_id: eventId, ticket_type: type });
    this.revenueTotal.inc({ venue_id: venueId, type: 'primary_sale' }, price);
  }

  recordPayment(provider: string, success: boolean, duration: number, errorCode?: string) {
    if (success) {
      this.paymentSuccess.inc({ provider, currency: 'USD' });
    } else {
      this.paymentFailure.inc({ provider, error_code: errorCode || 'unknown' });
    }
    this.paymentDuration.observe({ provider, type: 'charge' }, duration);
  }

  recordApiCall(method: string, route: string, statusCode: number, duration: number) {
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString() },
      duration
    );
  }

  recordError(service: string, errorType: string, severity: 'low' | 'medium' | 'high' | 'critical') {
    this.errorRate.inc({ service, error_type: errorType, severity });
    
    // Emit alert for critical errors
    if (severity === 'critical') {
      this.emit('critical_error', { service, errorType, timestamp: new Date() });
    }
  }

  // Get all metrics in Prometheus format
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  // Get specific metric values for dashboards
  async getBusinessMetrics() {
    return {
      totalTicketsSold: await this.getMetricValue(this.ticketsSold),
      totalRevenue: await this.getMetricValue(this.revenueTotal),
      totalRefunds: await this.getMetricValue(this.refundsProcessed),
      activeListings: await this.getMetricValue(this.ticketsListed)
    };
  }

  private async getMetricValue(metric: any): Promise<number> {
    const values = await metric.get();
    return values.values.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
  }
}

export const metricsCollector = new MetricsCollector();
