/**
 * Prometheus Metrics for Marketplace Service
 * 
 * Issues Fixed:
 * - LOG-1: No Prometheus metrics → Comprehensive metrics collection
 * - LOG-2: No distributed tracing → OpenTelemetry integration ready
 * 
 * Metrics Categories:
 * - HTTP request metrics (latency, count, errors)
 * - Business metrics (listings, purchases, fees)
 * - Database metrics (pool, query latency)
 * - External service metrics (circuit breakers)
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { logger } from './logger';

const log = logger.child({ component: 'Metrics' });

// Metric types
interface Counter {
  labels: Record<string, string>;
  value: number;
}

interface Histogram {
  labels: Record<string, string>;
  sum: number;
  count: number;
  buckets: Map<number, number>;
}

interface Gauge {
  labels: Record<string, string>;
  value: number;
}

// In-memory metric storage (for small-scale or when prom-client isn't available)
class MetricsRegistry {
  private counters = new Map<string, Counter[]>();
  private histograms = new Map<string, Histogram[]>();
  private gauges = new Map<string, Gauge[]>();
  
  // Standard histogram buckets (in seconds)
  private defaultBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

  incrementCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, []);
    }
    
    const counters = this.counters.get(name)!;
    const existing = counters.find(c => this.labelsMatch(c.labels, labels));
    
    if (existing) {
      existing.value += value;
    } else {
      counters.push({ labels, value });
    }
  }

  observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    
    const histograms = this.histograms.get(name)!;
    let existing = histograms.find(h => this.labelsMatch(h.labels, labels));
    
    if (!existing) {
      existing = {
        labels,
        sum: 0,
        count: 0,
        buckets: new Map(this.defaultBuckets.map(b => [b, 0]))
      };
      histograms.push(existing);
    }
    
    existing.sum += value;
    existing.count += 1;
    
    for (const bucket of this.defaultBuckets) {
      if (value <= bucket) {
        existing.buckets.set(bucket, (existing.buckets.get(bucket) || 0) + 1);
      }
    }
  }

  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, []);
    }
    
    const gauges = this.gauges.get(name)!;
    const existing = gauges.find(g => this.labelsMatch(g.labels, labels));
    
    if (existing) {
      existing.value = value;
    } else {
      gauges.push({ labels, value });
    }
  }

  incGauge(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, []);
    }
    
    const gauges = this.gauges.get(name)!;
    const existing = gauges.find(g => this.labelsMatch(g.labels, labels));
    
    if (existing) {
      existing.value += value;
    } else {
      gauges.push({ labels, value });
    }
  }

  private labelsMatch(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    
    if (keysA.length !== keysB.length) return false;
    
    for (let i = 0; i < keysA.length; i++) {
      if (keysA[i] !== keysB[i] || a[keysA[i]] !== b[keysB[i]]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Export metrics in Prometheus text format
   */
  export(): string {
    const lines: string[] = [];
    
    // Export counters
    for (const [name, counters] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      for (const counter of counters) {
        const labelsStr = this.formatLabels(counter.labels);
        lines.push(`${name}${labelsStr} ${counter.value}`);
      }
    }
    
    // Export histograms
    for (const [name, histograms] of this.histograms) {
      lines.push(`# TYPE ${name} histogram`);
      for (const histogram of histograms) {
        const labelsStr = this.formatLabels(histogram.labels);
        
        for (const [bucket, count] of histogram.buckets) {
          const bucketLabels = { ...histogram.labels, le: bucket.toString() };
          lines.push(`${name}_bucket${this.formatLabels(bucketLabels)} ${count}`);
        }
        
        const infLabels = { ...histogram.labels, le: '+Inf' };
        lines.push(`${name}_bucket${this.formatLabels(infLabels)} ${histogram.count}`);
        lines.push(`${name}_sum${labelsStr} ${histogram.sum}`);
        lines.push(`${name}_count${labelsStr} ${histogram.count}`);
      }
    }
    
    // Export gauges
    for (const [name, gauges] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      for (const gauge of gauges) {
        const labelsStr = this.formatLabels(gauge.labels);
        lines.push(`${name}${labelsStr} ${gauge.value}`);
      }
    }
    
    return lines.join('\n');
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    
    const pairs = entries.map(([k, v]) => `${k}="${v}"`);
    return `{${pairs.join(',')}}`;
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }
}

// Singleton registry
export const registry = new MetricsRegistry();

// Metric names
export const MetricNames = {
  // HTTP metrics
  HTTP_REQUESTS_TOTAL: 'marketplace_http_requests_total',
  HTTP_REQUEST_DURATION_SECONDS: 'marketplace_http_request_duration_seconds',
  HTTP_REQUEST_SIZE_BYTES: 'marketplace_http_request_size_bytes',
  HTTP_RESPONSE_SIZE_BYTES: 'marketplace_http_response_size_bytes',
  
  // Business metrics
  LISTINGS_CREATED_TOTAL: 'marketplace_listings_created_total',
  LISTINGS_SOLD_TOTAL: 'marketplace_listings_sold_total',
  LISTINGS_CANCELLED_TOTAL: 'marketplace_listings_cancelled_total',
  LISTINGS_EXPIRED_TOTAL: 'marketplace_listings_expired_total',
  PURCHASES_TOTAL: 'marketplace_purchases_total',
  PURCHASE_AMOUNT_CENTS: 'marketplace_purchase_amount_cents',
  FEES_COLLECTED_CENTS: 'marketplace_fees_collected_cents',
  DISPUTES_TOTAL: 'marketplace_disputes_total',
  
  // Database metrics
  DB_QUERY_DURATION_SECONDS: 'marketplace_db_query_duration_seconds',
  DB_POOL_SIZE: 'marketplace_db_pool_size',
  DB_POOL_AVAILABLE: 'marketplace_db_pool_available',
  DB_DEADLOCKS_TOTAL: 'marketplace_db_deadlocks_total',
  
  // External service metrics
  EXTERNAL_REQUEST_DURATION_SECONDS: 'marketplace_external_request_duration_seconds',
  EXTERNAL_REQUEST_ERRORS_TOTAL: 'marketplace_external_request_errors_total',
  CIRCUIT_BREAKER_STATE: 'marketplace_circuit_breaker_state',
  
  // Cache metrics
  CACHE_HITS_TOTAL: 'marketplace_cache_hits_total',
  CACHE_MISSES_TOTAL: 'marketplace_cache_misses_total',
  
  // Service health
  UPTIME_SECONDS: 'marketplace_uptime_seconds',
  ACTIVE_CONNECTIONS: 'marketplace_active_connections',
};

const startTime = Date.now();

/**
 * AUDIT FIX LOG-1: HTTP request metrics middleware
 */
export function metricsMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const start = process.hrtime.bigint();
  
  // Track active connections
  registry.incGauge(MetricNames.ACTIVE_CONNECTIONS);
  
  // On response complete
  reply.raw.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationSeconds = Number(end - start) / 1e9;
    
    const labels = {
      method: request.method,
      route: request.routeOptions?.url || request.url,
      status: reply.statusCode.toString()
    };
    
    // Record request count
    registry.incrementCounter(MetricNames.HTTP_REQUESTS_TOTAL, labels);
    
    // Record duration
    registry.observeHistogram(MetricNames.HTTP_REQUEST_DURATION_SECONDS, durationSeconds, {
      method: request.method,
      route: request.routeOptions?.url || request.url
    });
    
    // Decrement active connections
    registry.incGauge(MetricNames.ACTIVE_CONNECTIONS, {}, -1);
  });
  
  done();
}

/**
 * AUDIT FIX LOG-1: Business metrics helpers
 */
export const BusinessMetrics = {
  recordListingCreated(venueId: string, price: number): void {
    registry.incrementCounter(MetricNames.LISTINGS_CREATED_TOTAL, { venue_id: venueId });
    log.debug('Metric: listing created', { venueId, price });
  },
  
  recordListingSold(venueId: string, price: number): void {
    registry.incrementCounter(MetricNames.LISTINGS_SOLD_TOTAL, { venue_id: venueId });
    registry.observeHistogram(MetricNames.PURCHASE_AMOUNT_CENTS, price, { venue_id: venueId });
    log.debug('Metric: listing sold', { venueId, price });
  },
  
  recordListingCancelled(venueId: string): void {
    registry.incrementCounter(MetricNames.LISTINGS_CANCELLED_TOTAL, { venue_id: venueId });
  },
  
  recordListingExpired(count: number): void {
    registry.incrementCounter(MetricNames.LISTINGS_EXPIRED_TOTAL, {}, count);
  },
  
  recordPurchase(venueId: string, amount: number, paymentMethod: string): void {
    registry.incrementCounter(MetricNames.PURCHASES_TOTAL, { 
      venue_id: venueId, 
      payment_method: paymentMethod 
    });
    registry.observeHistogram(MetricNames.PURCHASE_AMOUNT_CENTS, amount, { venue_id: venueId });
  },
  
  recordFeesCollected(feeType: string, amount: number): void {
    registry.observeHistogram(MetricNames.FEES_COLLECTED_CENTS, amount, { fee_type: feeType });
  },
  
  recordDispute(venueId: string, reason: string): void {
    registry.incrementCounter(MetricNames.DISPUTES_TOTAL, { venue_id: venueId, reason });
  }
};

/**
 * AUDIT FIX LOG-1: Database metrics helpers
 */
export const DatabaseMetrics = {
  recordQueryDuration(queryType: string, durationSeconds: number): void {
    registry.observeHistogram(MetricNames.DB_QUERY_DURATION_SECONDS, durationSeconds, { 
      query_type: queryType 
    });
  },
  
  recordDeadlock(): void {
    registry.incrementCounter(MetricNames.DB_DEADLOCKS_TOTAL);
  },
  
  updatePoolStats(total: number, available: number): void {
    registry.setGauge(MetricNames.DB_POOL_SIZE, total);
    registry.setGauge(MetricNames.DB_POOL_AVAILABLE, available);
  }
};

/**
 * AUDIT FIX LOG-1: External service metrics helpers
 */
export const ExternalServiceMetrics = {
  recordRequest(service: string, success: boolean, durationSeconds: number): void {
    registry.observeHistogram(
      MetricNames.EXTERNAL_REQUEST_DURATION_SECONDS, 
      durationSeconds, 
      { service, success: success.toString() }
    );
    
    if (!success) {
      registry.incrementCounter(MetricNames.EXTERNAL_REQUEST_ERRORS_TOTAL, { service });
    }
  },
  
  updateCircuitBreaker(name: string, state: 'closed' | 'half_open' | 'open'): void {
    const stateValue = state === 'closed' ? 0 : state === 'half_open' ? 1 : 2;
    registry.setGauge(MetricNames.CIRCUIT_BREAKER_STATE, stateValue, { circuit: name });
  }
};

/**
 * AUDIT FIX LOG-1: Cache metrics helpers
 */
export const CacheMetrics = {
  recordHit(cacheName: string): void {
    registry.incrementCounter(MetricNames.CACHE_HITS_TOTAL, { cache: cacheName });
  },
  
  recordMiss(cacheName: string): void {
    registry.incrementCounter(MetricNames.CACHE_MISSES_TOTAL, { cache: cacheName });
  }
};

/**
 * Get all metrics in Prometheus format
 */
export function getMetrics(): string {
  // Add uptime
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  registry.setGauge(MetricNames.UPTIME_SECONDS, uptimeSeconds);
  
  return registry.export();
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  registry.reset();
}
