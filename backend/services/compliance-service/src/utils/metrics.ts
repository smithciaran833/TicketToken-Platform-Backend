/**
 * Metrics Utility for Compliance Service
 * 
 * AUDIT FIX LOG-4: No application metrics
 * 
 * Provides Prometheus-compatible metrics for monitoring:
 * - 1099 generation rates
 * - OFAC screening latency
 * - Risk assessment scores
 * - Verification status distribution
 */

import { logger } from './logger';

// =============================================================================
// TYPES
// =============================================================================

interface Counter {
  name: string;
  help: string;
  labels: string[];
  values: Map<string, number>;
}

interface Gauge {
  name: string;
  help: string;
  labels: string[];
  values: Map<string, number>;
}

interface Histogram {
  name: string;
  help: string;
  labels: string[];
  buckets: number[];
  values: Map<string, { sum: number; count: number; buckets: Map<number, number> }>;
}

// =============================================================================
// METRICS REGISTRY
// =============================================================================

class MetricsRegistry {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();

  /**
   * Create or get a counter
   */
  counter(name: string, help: string, labels: string[] = []): CounterMetric {
    if (!this.counters.has(name)) {
      this.counters.set(name, { name, help, labels, values: new Map() });
    }
    return new CounterMetric(this.counters.get(name)!);
  }

  /**
   * Create or get a gauge
   */
  gauge(name: string, help: string, labels: string[] = []): GaugeMetric {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, { name, help, labels, values: new Map() });
    }
    return new GaugeMetric(this.gauges.get(name)!);
  }

  /**
   * Create or get a histogram
   */
  histogram(name: string, help: string, buckets: number[] = [0.1, 0.5, 1, 2, 5, 10], labels: string[] = []): HistogramMetric {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, { name, help, labels, buckets, values: new Map() });
    }
    return new HistogramMetric(this.histograms.get(name)!);
  }

  /**
   * Export metrics in Prometheus format
   */
  export(): string {
    const lines: string[] = [];

    // Export counters
    for (const counter of this.counters.values()) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);
      for (const [labelKey, value] of counter.values) {
        const labels = labelKey ? `{${labelKey}}` : '';
        lines.push(`${counter.name}${labels} ${value}`);
      }
    }

    // Export gauges
    for (const gauge of this.gauges.values()) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      for (const [labelKey, value] of gauge.values) {
        const labels = labelKey ? `{${labelKey}}` : '';
        lines.push(`${gauge.name}${labels} ${value}`);
      }
    }

    // Export histograms
    for (const histogram of this.histograms.values()) {
      lines.push(`# HELP ${histogram.name} ${histogram.help}`);
      lines.push(`# TYPE ${histogram.name} histogram`);
      for (const [labelKey, data] of histogram.values) {
        const labels = labelKey ? `,${labelKey}` : '';
        for (const bucket of histogram.buckets) {
          const bucketCount = data.buckets.get(bucket) || 0;
          lines.push(`${histogram.name}_bucket{le="${bucket}"${labels}} ${bucketCount}`);
        }
        lines.push(`${histogram.name}_bucket{le="+Inf"${labels}} ${data.count}`);
        lines.push(`${histogram.name}_sum{${labelKey}} ${data.sum}`);
        lines.push(`${histogram.name}_count{${labelKey}} ${data.count}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get all metrics as JSON
   */
  toJSON(): Record<string, any> {
    return {
      counters: Object.fromEntries(
        Array.from(this.counters.entries()).map(([name, c]) => [
          name, Object.fromEntries(c.values)
        ])
      ),
      gauges: Object.fromEntries(
        Array.from(this.gauges.entries()).map(([name, g]) => [
          name, Object.fromEntries(g.values)
        ])
      ),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([name, h]) => [
          name, Object.fromEntries(h.values)
        ])
      )
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.values.clear();
    }
    for (const gauge of this.gauges.values()) {
      gauge.values.clear();
    }
    for (const histogram of this.histograms.values()) {
      histogram.values.clear();
    }
  }
}

// =============================================================================
// METRIC CLASSES
// =============================================================================

class CounterMetric {
  constructor(private counter: Counter) {}

  inc(labels: Record<string, string> = {}, value: number = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.counter.values.get(key) || 0;
    this.counter.values.set(key, current + value);
  }

  private labelsToKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }
}

class GaugeMetric {
  constructor(private gauge: Gauge) {}

  set(labels: Record<string, string>, value: number): void {
    const key = this.labelsToKey(labels);
    this.gauge.values.set(key, value);
  }

  inc(labels: Record<string, string> = {}, value: number = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.gauge.values.get(key) || 0;
    this.gauge.values.set(key, current + value);
  }

  dec(labels: Record<string, string> = {}, value: number = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.gauge.values.get(key) || 0;
    this.gauge.values.set(key, current - value);
  }

  private labelsToKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }
}

class HistogramMetric {
  constructor(private histogram: Histogram) {}

  observe(labels: Record<string, string>, value: number): void {
    const key = this.labelsToKey(labels);
    let data = this.histogram.values.get(key);
    
    if (!data) {
      data = { sum: 0, count: 0, buckets: new Map() };
      for (const bucket of this.histogram.buckets) {
        data.buckets.set(bucket, 0);
      }
      this.histogram.values.set(key, data);
    }

    data.sum += value;
    data.count += 1;

    // Update bucket counts
    for (const bucket of this.histogram.buckets) {
      if (value <= bucket) {
        data.buckets.set(bucket, (data.buckets.get(bucket) || 0) + 1);
      }
    }
  }

  /**
   * Create a timer that records duration when stopped
   */
  startTimer(labels: Record<string, string>): () => void {
    const start = Date.now();
    return () => {
      const duration = (Date.now() - start) / 1000; // Convert to seconds
      this.observe(labels, duration);
    };
  }

  private labelsToKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }
}

// =============================================================================
// SINGLETON REGISTRY
// =============================================================================

export const registry = new MetricsRegistry();

// =============================================================================
// COMPLIANCE-SPECIFIC METRICS
// =============================================================================

// 1099 Metrics
export const form1099Generated = registry.counter(
  'compliance_1099_generated_total',
  'Total 1099 forms generated',
  ['status', 'year']
);

export const form1099Amount = registry.histogram(
  'compliance_1099_amount_dollars',
  'Distribution of 1099 amounts',
  [100, 500, 1000, 5000, 10000, 50000, 100000],
  ['year']
);

// OFAC Screening Metrics
export const ofacScreenings = registry.counter(
  'compliance_ofac_screenings_total',
  'Total OFAC screenings performed',
  ['result', 'type']
);

export const ofacScreeningDuration = registry.histogram(
  'compliance_ofac_screening_duration_seconds',
  'OFAC screening duration',
  [0.1, 0.5, 1, 2, 5, 10],
  ['type']
);

export const ofacMatches = registry.counter(
  'compliance_ofac_matches_total',
  'Total potential OFAC matches found',
  ['severity']
);

// Risk Assessment Metrics
export const riskAssessments = registry.counter(
  'compliance_risk_assessments_total',
  'Total risk assessments performed',
  ['level']
);

export const riskScore = registry.histogram(
  'compliance_risk_score',
  'Distribution of risk scores',
  [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  ['type']
);

// Verification Metrics
export const verifications = registry.counter(
  'compliance_verifications_total',
  'Total verifications processed',
  ['type', 'status']
);

export const verificationDuration = registry.histogram(
  'compliance_verification_duration_seconds',
  'Verification processing duration',
  [1, 5, 10, 30, 60, 300],
  ['type']
);

// GDPR Metrics
export const gdprRequests = registry.counter(
  'compliance_gdpr_requests_total',
  'Total GDPR requests',
  ['type', 'status']
);

// Bank Verification Metrics
export const bankVerifications = registry.counter(
  'compliance_bank_verifications_total',
  'Total bank verifications',
  ['status']
);

// Active gauges
export const pendingVerifications = registry.gauge(
  'compliance_pending_verifications',
  'Number of pending verifications',
  ['type']
);

export const activeScreenings = registry.gauge(
  'compliance_active_screenings',
  'Number of active OFAC screenings',
  []
);

// Circuit breaker metrics
export const circuitBreakerState = registry.gauge(
  'compliance_circuit_breaker_state',
  'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  ['service']
);

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Record 1099 generation
 */
export function record1099Generation(status: 'success' | 'failure', year: number, amount?: number): void {
  form1099Generated.inc({ status, year: year.toString() });
  if (amount !== undefined) {
    form1099Amount.observe({ year: year.toString() }, amount);
  }
}

/**
 * Record OFAC screening with timing
 */
export function recordOFACScreening(
  result: 'clear' | 'match' | 'error',
  type: string,
  duration: number,
  matchSeverity?: 'low' | 'medium' | 'high'
): void {
  ofacScreenings.inc({ result, type });
  ofacScreeningDuration.observe({ type }, duration);
  if (result === 'match' && matchSeverity) {
    ofacMatches.inc({ severity: matchSeverity });
  }
}

/**
 * Record risk assessment
 */
export function recordRiskAssessment(level: string, score: number, type: string): void {
  riskAssessments.inc({ level });
  riskScore.observe({ type }, score);
}

/**
 * Record verification
 */
export function recordVerification(
  type: string,
  status: 'pending' | 'approved' | 'rejected',
  duration?: number
): void {
  verifications.inc({ type, status });
  if (duration !== undefined) {
    verificationDuration.observe({ type }, duration);
  }
}

/**
 * Get metrics endpoint handler (for Fastify/Express)
 */
export function metricsHandler(_req: any, reply: any): void {
  reply
    .header('Content-Type', 'text/plain; charset=utf-8')
    .send(registry.export());
}

// =============================================================================
// HELPER FUNCTIONS FOR SIMPLE METRIC OPERATIONS
// =============================================================================

/**
 * Simple counter increment helper
 * Creates a counter if it doesn't exist
 */
export function incrementMetric(name: string, labels: Record<string, string> = {}, value: number = 1): void {
  const counter = registry.counter(name, `Auto-created counter for ${name}`, Object.keys(labels));
  counter.inc(labels, value);
}

/**
 * Simple gauge set helper
 * Creates a gauge if it doesn't exist
 */
export function setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
  const gauge = registry.gauge(name, `Auto-created gauge for ${name}`, Object.keys(labels));
  gauge.set(labels, value);
}

export default {
  registry,
  form1099Generated,
  form1099Amount,
  ofacScreenings,
  ofacScreeningDuration,
  ofacMatches,
  riskAssessments,
  riskScore,
  verifications,
  verificationDuration,
  gdprRequests,
  bankVerifications,
  pendingVerifications,
  activeScreenings,
  circuitBreakerState,
  record1099Generation,
  recordOFACScreening,
  recordRiskAssessment,
  recordVerification,
  metricsHandler
};
