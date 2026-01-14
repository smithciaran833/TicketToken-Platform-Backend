/**
 * Metrics Routes for Payment Service
 * 
 * HIGH FIX: Exposes /metrics endpoint for Prometheus scraping
 * Implements proper metrics collection for payment operations.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'MetricsRoutes' });

// =============================================================================
// METRICS REGISTRY
// =============================================================================

interface MetricValue {
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

interface MetricDefinition {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  values: MetricValue[];
}

class MetricsRegistry {
  private metrics: Map<string, MetricDefinition> = new Map();
  private histogramBuckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

  /**
   * Register a counter metric
   */
  registerCounter(name: string, help: string): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, { name, help, type: 'counter', values: [] });
    }
  }

  /**
   * Register a gauge metric
   */
  registerGauge(name: string, help: string): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, { name, help, type: 'gauge', values: [] });
    }
  }

  /**
   * Register a histogram metric
   */
  registerHistogram(name: string, help: string): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, { name, help, type: 'histogram', values: [] });
    }
  }

  /**
   * Increment a counter
   */
  incCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'counter') return;

    const existing = metric.values.find(v => 
      JSON.stringify(v.labels) === JSON.stringify(labels)
    );
    
    if (existing) {
      existing.value += value;
      existing.timestamp = Date.now();
    } else {
      metric.values.push({ value, labels, timestamp: Date.now() });
    }
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'gauge') return;

    const existing = metric.values.find(v => 
      JSON.stringify(v.labels) === JSON.stringify(labels)
    );
    
    if (existing) {
      existing.value = value;
      existing.timestamp = Date.now();
    } else {
      metric.values.push({ value, labels, timestamp: Date.now() });
    }
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'histogram') return;

    // For histograms, we store bucket counts
    const labelKey = JSON.stringify(labels);
    
    // Find or create bucket counters
    for (const bucket of this.histogramBuckets) {
      const bucketLabels = { ...labels, le: bucket.toString() };
      const existing = metric.values.find(v => 
        JSON.stringify(v.labels) === JSON.stringify(bucketLabels)
      );
      
      if (value <= bucket) {
        if (existing) {
          existing.value += 1;
        } else {
          metric.values.push({ value: 1, labels: bucketLabels, timestamp: Date.now() });
        }
      }
    }

    // +Inf bucket
    const infLabels = { ...labels, le: '+Inf' };
    const infExisting = metric.values.find(v => 
      JSON.stringify(v.labels) === JSON.stringify(infLabels)
    );
    if (infExisting) {
      infExisting.value += 1;
    } else {
      metric.values.push({ value: 1, labels: infLabels, timestamp: Date.now() });
    }

    // Sum
    const sumLabels = { ...labels, __type: 'sum' };
    const sumExisting = metric.values.find(v => 
      JSON.stringify(v.labels) === JSON.stringify(sumLabels)
    );
    if (sumExisting) {
      sumExisting.value += value;
    } else {
      metric.values.push({ value, labels: sumLabels, timestamp: Date.now() });
    }

    // Count
    const countLabels = { ...labels, __type: 'count' };
    const countExisting = metric.values.find(v => 
      JSON.stringify(v.labels) === JSON.stringify(countLabels)
    );
    if (countExisting) {
      countExisting.value += 1;
    } else {
      metric.values.push({ value: 1, labels: countLabels, timestamp: Date.now() });
    }
  }

  /**
   * Format metrics in Prometheus exposition format
   */
  toPrometheusFormat(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      for (const mv of metric.values) {
        const labelStr = Object.entries(mv.labels)
          .filter(([k]) => !k.startsWith('__'))
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');

        const suffix = mv.labels.__type === 'sum' ? '_sum' : 
                       mv.labels.__type === 'count' ? '_count' :
                       mv.labels.le ? '_bucket' : '';

        if (labelStr) {
          lines.push(`${metric.name}${suffix}{${labelStr}} ${mv.value}`);
        } else {
          lines.push(`${metric.name}${suffix} ${mv.value}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const metric of this.metrics.values()) {
      metric.values = [];
    }
  }

  /**
   * Get all metrics as a structured object
   */
  getAllMetrics(): Record<string, MetricDefinition> {
    const result: Record<string, MetricDefinition> = {};
    for (const [name, metric] of this.metrics) {
      result[name] = { ...metric };
    }
    return result;
  }
}

// Global metrics registry
export const metricsRegistry = new MetricsRegistry();

// =============================================================================
// PAYMENT SERVICE METRICS
// =============================================================================

// Initialize default payment metrics
metricsRegistry.registerCounter(
  'payment_transactions_total',
  'Total number of payment transactions'
);

metricsRegistry.registerCounter(
  'payment_transactions_failed_total',
  'Total number of failed payment transactions'
);

metricsRegistry.registerCounter(
  'payment_refunds_total',
  'Total number of refunds processed'
);

metricsRegistry.registerCounter(
  'payment_refunds_failed_total',
  'Total number of failed refunds'
);

metricsRegistry.registerGauge(
  'payment_amount_total',
  'Total payment amount processed in cents'
);

metricsRegistry.registerGauge(
  'payment_refund_amount_total',
  'Total refund amount processed in cents'
);

metricsRegistry.registerHistogram(
  'payment_processing_duration_seconds',
  'Time taken to process payments'
);

metricsRegistry.registerHistogram(
  'stripe_api_duration_seconds',
  'Time taken for Stripe API calls'
);

metricsRegistry.registerCounter(
  'webhook_events_total',
  'Total webhook events received'
);

metricsRegistry.registerCounter(
  'webhook_events_failed_total',
  'Total webhook events that failed processing'
);

metricsRegistry.registerGauge(
  'active_payment_intents',
  'Number of active payment intents'
);

metricsRegistry.registerCounter(
  'rate_limit_exceeded_total',
  'Total number of rate limit exceeded events'
);

metricsRegistry.registerCounter(
  'auth_failures_total',
  'Total number of authentication failures'
);

metricsRegistry.registerGauge(
  'db_connection_pool_size',
  'Current database connection pool size'
);

metricsRegistry.registerGauge(
  'redis_connection_status',
  'Redis connection status (1=connected, 0=disconnected)'
);

// =============================================================================
// METRICS HELPERS
// =============================================================================

/**
 * Record a payment transaction
 */
export function recordPayment(
  status: 'success' | 'failed',
  amount: number,
  currency: string,
  method: string
): void {
  const labels = { currency, method };
  
  if (status === 'success') {
    metricsRegistry.incCounter('payment_transactions_total', labels);
    metricsRegistry.setGauge('payment_amount_total', amount, labels);
  } else {
    metricsRegistry.incCounter('payment_transactions_failed_total', labels);
  }
}

/**
 * Record a refund
 */
export function recordRefund(
  status: 'success' | 'failed',
  amount: number,
  currency: string
): void {
  const labels = { currency };
  
  if (status === 'success') {
    metricsRegistry.incCounter('payment_refunds_total', labels);
    metricsRegistry.setGauge('payment_refund_amount_total', amount, labels);
  } else {
    metricsRegistry.incCounter('payment_refunds_failed_total', labels);
  }
}

/**
 * Record Stripe API call duration
 */
export function recordStripeApiDuration(
  operation: string,
  durationMs: number
): void {
  metricsRegistry.observeHistogram(
    'stripe_api_duration_seconds',
    durationMs / 1000,
    { operation }
  );
}

/**
 * Record webhook event
 */
export function recordWebhook(eventType: string, success: boolean): void {
  const labels = { event_type: eventType };
  metricsRegistry.incCounter('webhook_events_total', labels);
  
  if (!success) {
    metricsRegistry.incCounter('webhook_events_failed_total', labels);
  }
}

/**
 * Record rate limit exceeded
 */
export function recordRateLimitExceeded(endpoint: string): void {
  metricsRegistry.incCounter('rate_limit_exceeded_total', { endpoint });
}

/**
 * Record auth failure
 */
export function recordAuthFailure(reason: string): void {
  metricsRegistry.incCounter('auth_failures_total', { reason });
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function metricsRoutes(fastify: FastifyInstance) {
  /**
   * GET /metrics
   * Returns metrics in Prometheus exposition format
   */
  fastify.get(
    '/',
    {
      schema: {
        description: 'Prometheus metrics endpoint',
        tags: ['metrics'],
        response: {
          200: {
            type: 'string',
            description: 'Prometheus exposition format metrics'
          }
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = metricsRegistry.toPrometheusFormat();
        
        return reply
          .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
          .send(metrics);
      } catch (error) {
        log.error({ error }, 'Failed to generate metrics');
        return reply.status(500).send('Failed to generate metrics');
      }
    }
  );

  /**
   * GET /metrics/json
   * Returns metrics in JSON format (for debugging)
   */
  fastify.get(
    '/json',
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics: Record<string, any> = {};
        
        // Basic service info
        metrics.service = 'payment-service';
        metrics.timestamp = new Date().toISOString();
        metrics.uptime = process.uptime();
        
        // Memory usage
        const memUsage = process.memoryUsage();
        metrics.memory = {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          rss: memUsage.rss,
          external: memUsage.external
        };
        
        // Raw metrics
        metrics.raw = metricsRegistry.toPrometheusFormat();
        
        return reply.send(metrics);
      } catch (error) {
        log.error({ error }, 'Failed to generate JSON metrics');
        return reply.status(500).send({ error: 'Failed to generate metrics' });
      }
    }
  );
}
