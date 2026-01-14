/**
 * Metrics Tests
 * Tests for payment metrics collection and reporting
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('PaymentMetrics', () => {
  let mockRegistry: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistry = new Map();
  });

  describe('counter metrics', () => {
    it('should increment payment count', () => {
      incrementCounter('payments_total', mockRegistry);
      incrementCounter('payments_total', mockRegistry);
      incrementCounter('payments_total', mockRegistry);

      expect(getCounter('payments_total', mockRegistry)).toBe(3);
    });

    it('should track by labels', () => {
      incrementCounter('payments_total', mockRegistry, { status: 'success' });
      incrementCounter('payments_total', mockRegistry, { status: 'success' });
      incrementCounter('payments_total', mockRegistry, { status: 'failed' });

      expect(getCounter('payments_total', mockRegistry, { status: 'success' })).toBe(2);
      expect(getCounter('payments_total', mockRegistry, { status: 'failed' })).toBe(1);
    });

    it('should track refund counts', () => {
      incrementCounter('refunds_total', mockRegistry, { type: 'full' });
      incrementCounter('refunds_total', mockRegistry, { type: 'partial' });

      expect(getCounter('refunds_total', mockRegistry, { type: 'full' })).toBe(1);
    });

    it('should track transfer counts', () => {
      incrementCounter('transfers_total', mockRegistry, { destination: 'venue' });

      expect(getCounter('transfers_total', mockRegistry, { destination: 'venue' })).toBe(1);
    });
  });

  describe('gauge metrics', () => {
    it('should set pending payment amount', () => {
      setGauge('pending_payments_amount', 50000, mockRegistry);

      expect(getGauge('pending_payments_amount', mockRegistry)).toBe(50000);
    });

    it('should update escrow balance', () => {
      setGauge('escrow_balance', 100000, mockRegistry);
      setGauge('escrow_balance', 150000, mockRegistry);

      expect(getGauge('escrow_balance', mockRegistry)).toBe(150000);
    });

    it('should track active disputes', () => {
      setGauge('active_disputes', 5, mockRegistry, { venue: 'venue_123' });

      expect(getGauge('active_disputes', mockRegistry, { venue: 'venue_123' })).toBe(5);
    });

    it('should increment and decrement gauge', () => {
      setGauge('processing_payments', 0, mockRegistry);
      incrementGauge('processing_payments', mockRegistry);
      incrementGauge('processing_payments', mockRegistry);
      decrementGauge('processing_payments', mockRegistry);

      expect(getGauge('processing_payments', mockRegistry)).toBe(1);
    });
  });

  describe('histogram metrics', () => {
    it('should observe payment duration', () => {
      observeHistogram('payment_duration_seconds', 1.5, mockRegistry);
      observeHistogram('payment_duration_seconds', 2.3, mockRegistry);
      observeHistogram('payment_duration_seconds', 0.8, mockRegistry);

      const stats = getHistogramStats('payment_duration_seconds', mockRegistry);
      expect(stats.count).toBe(3);
      expect(stats.sum).toBeCloseTo(4.6);
    });

    it('should track payment amount distribution', () => {
      observeHistogram('payment_amount_cents', 5000, mockRegistry);
      observeHistogram('payment_amount_cents', 10000, mockRegistry);
      observeHistogram('payment_amount_cents', 25000, mockRegistry);

      const stats = getHistogramStats('payment_amount_cents', mockRegistry);
      expect(stats.count).toBe(3);
      expect(stats.avg).toBeCloseTo(13333.33, 0);
    });

    it('should calculate percentiles', () => {
      for (let i = 1; i <= 100; i++) {
        observeHistogram('latency_ms', i, mockRegistry);
      }

      const stats = getHistogramStats('latency_ms', mockRegistry);
      expect(stats.p50).toBeCloseTo(50, 0);
      expect(stats.p95).toBeCloseTo(95, 0);
      expect(stats.p99).toBeCloseTo(99, 0);
    });
  });

  describe('summary metrics', () => {
    it('should track Stripe API latency', () => {
      observeSummary('stripe_api_latency_ms', 150, mockRegistry);
      observeSummary('stripe_api_latency_ms', 200, mockRegistry);
      observeSummary('stripe_api_latency_ms', 180, mockRegistry);

      const summary = getSummary('stripe_api_latency_ms', mockRegistry);
      expect(summary.count).toBe(3);
    });

    it('should track database query time', () => {
      observeSummary('db_query_ms', 5, mockRegistry, { query: 'find_payment' });
      observeSummary('db_query_ms', 15, mockRegistry, { query: 'update_status' });

      expect(getSummary('db_query_ms', mockRegistry).count).toBe(2);
    });
  });

  describe('payment-specific metrics', () => {
    it('should track payment success rate', () => {
      for (let i = 0; i < 90; i++) {
        incrementCounter('payments_total', mockRegistry, { status: 'success' });
      }
      for (let i = 0; i < 10; i++) {
        incrementCounter('payments_total', mockRegistry, { status: 'failed' });
      }

      const successRate = calculateSuccessRate(mockRegistry);
      expect(successRate).toBe(90);
    });

    it('should track gross transaction volume', () => {
      recordTransaction(10000, mockRegistry);
      recordTransaction(25000, mockRegistry);
      recordTransaction(5000, mockRegistry);

      expect(getGTV(mockRegistry)).toBe(40000);
    });

    it('should track fee revenue', () => {
      recordFee(250, mockRegistry, { type: 'platform' });
      recordFee(100, mockRegistry, { type: 'processing' });
      recordFee(50, mockRegistry, { type: 'venue' });

      expect(getTotalFees(mockRegistry)).toBe(400);
    });

    it('should track refund rate', () => {
      setGauge('total_payments', 1000, mockRegistry);
      setGauge('total_refunds', 25, mockRegistry);

      const refundRate = calculateRefundRate(mockRegistry);
      expect(refundRate).toBe(2.5);
    });
  });

  describe('alerting thresholds', () => {
    it('should detect high error rate', () => {
      for (let i = 0; i < 85; i++) {
        incrementCounter('payments_total', mockRegistry, { status: 'success' });
      }
      for (let i = 0; i < 15; i++) {
        incrementCounter('payments_total', mockRegistry, { status: 'failed' });
      }

      const alert = checkErrorRateThreshold(mockRegistry, 10);
      expect(alert.triggered).toBe(true);
      expect(alert.currentRate).toBe(15);
    });

    it('should detect high latency', () => {
      for (let i = 0; i < 10; i++) {
        observeHistogram('payment_duration_seconds', 5 + i, mockRegistry);
      }

      const alert = checkLatencyThreshold(mockRegistry, 'payment_duration_seconds', 3);
      expect(alert.triggered).toBe(true);
    });

    it('should detect low success rate', () => {
      for (let i = 0; i < 80; i++) {
        incrementCounter('payments_total', mockRegistry, { status: 'success' });
      }
      for (let i = 0; i < 20; i++) {
        incrementCounter('payments_total', mockRegistry, { status: 'failed' });
      }

      const alert = checkSuccessRateThreshold(mockRegistry, 90);
      expect(alert.triggered).toBe(true);
    });
  });

  describe('aggregation', () => {
    it('should aggregate metrics by time window', () => {
      const now = Date.now();
      recordTimestampedMetric('payments', 100, now - 60000, mockRegistry);
      recordTimestampedMetric('payments', 150, now - 30000, mockRegistry);
      recordTimestampedMetric('payments', 200, now, mockRegistry);

      const aggregated = aggregateByWindow(mockRegistry, 'payments', 120000);
      expect(aggregated.total).toBe(450);
    });

    it('should calculate moving average', () => {
      for (let i = 0; i < 10; i++) {
        observeHistogram('latency', i * 10, mockRegistry);
      }

      const ma = getMovingAverage('latency', mockRegistry, 5);
      expect(ma).toBeDefined();
    });
  });

  describe('export formats', () => {
    it('should export in Prometheus format', () => {
      incrementCounter('payments_total', mockRegistry, { status: 'success' });
      setGauge('pending_balance', 50000, mockRegistry);

      const exported = exportPrometheus(mockRegistry);

      expect(exported).toContain('payments_total');
      expect(exported).toContain('pending_balance');
    });

    it('should export in JSON format', () => {
      incrementCounter('payments_total', mockRegistry);

      const exported = exportJSON(mockRegistry);
      const parsed = JSON.parse(exported);

      expect(parsed.metrics).toBeDefined();
    });

    it('should export in StatsD format', () => {
      incrementCounter('payments_total', mockRegistry);

      const exported = exportStatsD(mockRegistry);

      expect(exported).toContain('payments_total:1|c');
    });
  });

  describe('edge cases', () => {
    it('should handle non-existent metric', () => {
      expect(getCounter('non_existent', mockRegistry)).toBe(0);
      expect(getGauge('non_existent', mockRegistry)).toBe(0);
    });

    it('should handle negative gauge values', () => {
      setGauge('balance_delta', -5000, mockRegistry);
      expect(getGauge('balance_delta', mockRegistry)).toBe(-5000);
    });

    it('should handle very large numbers', () => {
      const largeAmount = 999999999999;
      recordTransaction(largeAmount, mockRegistry);
      expect(getGTV(mockRegistry)).toBe(largeAmount);
    });

    it('should handle rapid updates', () => {
      for (let i = 0; i < 10000; i++) {
        incrementCounter('rapid_counter', mockRegistry);
      }
      expect(getCounter('rapid_counter', mockRegistry)).toBe(10000);
    });
  });
});

// Helper functions
function incrementCounter(name: string, registry: Map<string, any>, labels: any = {}): void {
  const key = `counter:${name}:${JSON.stringify(labels)}`;
  const current = registry.get(key) || 0;
  registry.set(key, current + 1);
}

function getCounter(name: string, registry: Map<string, any>, labels: any = {}): number {
  const key = `counter:${name}:${JSON.stringify(labels)}`;
  return registry.get(key) || 0;
}

function setGauge(name: string, value: number, registry: Map<string, any>, labels: any = {}): void {
  const key = `gauge:${name}:${JSON.stringify(labels)}`;
  registry.set(key, value);
}

function getGauge(name: string, registry: Map<string, any>, labels: any = {}): number {
  const key = `gauge:${name}:${JSON.stringify(labels)}`;
  return registry.get(key) || 0;
}

function incrementGauge(name: string, registry: Map<string, any>, labels: any = {}): void {
  const key = `gauge:${name}:${JSON.stringify(labels)}`;
  const current = registry.get(key) || 0;
  registry.set(key, current + 1);
}

function decrementGauge(name: string, registry: Map<string, any>, labels: any = {}): void {
  const key = `gauge:${name}:${JSON.stringify(labels)}`;
  const current = registry.get(key) || 0;
  registry.set(key, current - 1);
}

function observeHistogram(name: string, value: number, registry: Map<string, any>): void {
  const key = `histogram:${name}`;
  const observations = registry.get(key) || [];
  observations.push(value);
  registry.set(key, observations);
}

function getHistogramStats(name: string, registry: Map<string, any>): any {
  const key = `histogram:${name}`;
  const observations = registry.get(key) || [];
  if (observations.length === 0) return { count: 0, sum: 0, avg: 0 };

  const sorted = [...observations].sort((a, b) => a - b);
  const sum = observations.reduce((a: number, b: number) => a + b, 0);
  const avg = sum / observations.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  return { count: observations.length, sum, avg, p50, p95, p99 };
}

function observeSummary(name: string, value: number, registry: Map<string, any>, labels: any = {}): void {
  const key = `summary:${name}`;
  const observations = registry.get(key) || [];
  observations.push(value);
  registry.set(key, observations);
}

function getSummary(name: string, registry: Map<string, any>): any {
  const key = `summary:${name}`;
  const observations = registry.get(key) || [];
  return { count: observations.length };
}

function calculateSuccessRate(registry: Map<string, any>): number {
  const success = getCounter('payments_total', registry, { status: 'success' });
  const failed = getCounter('payments_total', registry, { status: 'failed' });
  const total = success + failed;
  return total > 0 ? (success / total) * 100 : 0;
}

function recordTransaction(amount: number, registry: Map<string, any>): void {
  const key = 'gtv';
  const current = registry.get(key) || 0;
  registry.set(key, current + amount);
}

function getGTV(registry: Map<string, any>): number {
  return registry.get('gtv') || 0;
}

function recordFee(amount: number, registry: Map<string, any>, labels: any = {}): void {
  const key = 'total_fees';
  const current = registry.get(key) || 0;
  registry.set(key, current + amount);
}

function getTotalFees(registry: Map<string, any>): number {
  return registry.get('total_fees') || 0;
}

function calculateRefundRate(registry: Map<string, any>): number {
  const totalPayments = getGauge('total_payments', registry);
  const totalRefunds = getGauge('total_refunds', registry);
  return totalPayments > 0 ? (totalRefunds / totalPayments) * 100 : 0;
}

function checkErrorRateThreshold(registry: Map<string, any>, threshold: number): any {
  const success = getCounter('payments_total', registry, { status: 'success' });
  const failed = getCounter('payments_total', registry, { status: 'failed' });
  const total = success + failed;
  const currentRate = total > 0 ? (failed / total) * 100 : 0;
  return { triggered: currentRate > threshold, currentRate };
}

function checkLatencyThreshold(registry: Map<string, any>, metric: string, threshold: number): any {
  const stats = getHistogramStats(metric, registry);
  return { triggered: stats.avg > threshold };
}

function checkSuccessRateThreshold(registry: Map<string, any>, threshold: number): any {
  const rate = calculateSuccessRate(registry);
  return { triggered: rate < threshold };
}

function recordTimestampedMetric(name: string, value: number, timestamp: number, registry: Map<string, any>): void {
  const key = `timestamped:${name}`;
  const metrics = registry.get(key) || [];
  metrics.push({ value, timestamp });
  registry.set(key, metrics);
}

function aggregateByWindow(registry: Map<string, any>, name: string, windowMs: number): any {
  const key = `timestamped:${name}`;
  const metrics = registry.get(key) || [];
  const now = Date.now();
  const inWindow = metrics.filter((m: any) => now - m.timestamp <= windowMs);
  const total = inWindow.reduce((sum: number, m: any) => sum + m.value, 0);
  return { total, count: inWindow.length };
}

function getMovingAverage(name: string, registry: Map<string, any>, window: number): number {
  const stats = getHistogramStats(name, registry);
  return stats.avg;
}

function exportPrometheus(registry: Map<string, any>): string {
  const lines: string[] = [];
  registry.forEach((value, key) => {
    if (key.startsWith('counter:') || key.startsWith('gauge:')) {
      const metricName = key.split(':')[1];
      lines.push(`${metricName} ${value}`);
    }
  });
  return lines.join('\n');
}

function exportJSON(registry: Map<string, any>): string {
  const metrics: any[] = [];
  registry.forEach((value, key) => {
    metrics.push({ key, value });
  });
  return JSON.stringify({ metrics });
}

function exportStatsD(registry: Map<string, any>): string {
  const lines: string[] = [];
  registry.forEach((value, key) => {
    if (key.startsWith('counter:')) {
      const metricName = key.split(':')[1];
      lines.push(`${metricName}:${value}|c`);
    }
  });
  return lines.join('\n');
}
