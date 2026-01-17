import { metrics, createTimer, MetricLabels } from '../../../src/utils/metrics';
import { redisClient } from '../../../src/config/redis';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/config/redis', () => ({
  redisClient: {
    incrbyfloat: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

describe('NotificationMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    metrics.reset();
  });

  describe('Counter Metrics', () => {
    it('should increment counter with default value of 1', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(1);

      await metrics.incrementCounter('test_counter');

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        'notification_service:counter:test_counter',
        1
      );
    });

    it('should increment counter with custom value', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(5);

      await metrics.incrementCounter('test_counter', {}, 5);

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        'notification_service:counter:test_counter',
        5
      );
    });

    it('should increment counter with labels', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(1);

      await metrics.incrementCounter('test_counter', { status: 'success', channel: 'email' });

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        'notification_service:counter:test_counter{channel="email",status="success"}',
        1
      );
    });

    it('should handle Redis errors gracefully', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      await metrics.incrementCounter('test_counter');

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to increment counter in Redis',
        expect.objectContaining({ name: 'test_counter' })
      );
    });

    it('should track metrics locally even when Redis fails', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockRejectedValue(new Error('Redis error'));

      await metrics.incrementCounter('test_counter', {}, 3);
      await metrics.incrementCounter('test_counter', {}, 2);

      const summary = await metrics.getMetricsSummary();
      expect(summary.counters['counter:test_counter']).toBe(5);
    });
  });

  describe('Gauge Metrics', () => {
    it('should set gauge value', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      await metrics.setGauge('test_gauge', 42);

      expect(redisClient.set).toHaveBeenCalledWith(
        'notification_service:gauge:test_gauge',
        '42'
      );
    });

    it('should set gauge with labels', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      await metrics.setGauge('test_gauge', 100, { provider: 'sendgrid' });

      expect(redisClient.set).toHaveBeenCalledWith(
        'notification_service:gauge:test_gauge{provider="sendgrid"}',
        '100'
      );
    });

    it('should handle Redis errors gracefully', async () => {
      (redisClient.set as jest.Mock).mockRejectedValue(new Error('Redis error'));

      await metrics.setGauge('test_gauge', 50);

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to set gauge in Redis',
        expect.objectContaining({ name: 'test_gauge' })
      );
    });

    it('should track gauge locally', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      await metrics.setGauge('test_gauge', 25);
      await metrics.setGauge('test_gauge', 75);

      const summary = await metrics.getMetricsSummary();
      expect(summary.gauges['gauge:test_gauge']).toBe(75);
    });
  });

  describe('Histogram Metrics', () => {
    it('should record histogram observation', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(1.5);
      (redisClient.incr as jest.Mock).mockResolvedValue(1);

      await metrics.recordHistogram('test_histogram', 1.5);

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        'notification_service:histogram:test_histogram:sum',
        1.5
      );
      expect(redisClient.incr).toHaveBeenCalledWith(
        'notification_service:histogram:test_histogram:count'
      );
    });

    it('should record histogram with labels', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(2.0);
      (redisClient.incr as jest.Mock).mockResolvedValue(1);

      await metrics.recordHistogram('test_histogram', 2.0, { endpoint: '/api/send' });

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        'notification_service:histogram:test_histogram{endpoint="/api/send"}:sum',
        2.0
      );
    });

    it('should handle Redis errors gracefully', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockRejectedValue(new Error('Redis error'));

      await metrics.recordHistogram('test_histogram', 1.5);

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to record histogram in Redis',
        expect.objectContaining({ name: 'test_histogram' })
      );
    });

    it('should track multiple observations locally', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(0);
      (redisClient.incr as jest.Mock).mockResolvedValue(0);

      await metrics.recordHistogram('test_histogram', 1.0);
      await metrics.recordHistogram('test_histogram', 2.0);
      await metrics.recordHistogram('test_histogram', 3.0);

      const summary = await metrics.getMetricsSummary();
      const histogram = summary.histograms['histogram:test_histogram'];
      expect(histogram.count).toBe(3);
      expect(histogram.sum).toBe(6.0);
      expect(histogram.avg).toBe(2.0);
      expect(histogram.min).toBe(1.0);
      expect(histogram.max).toBe(3.0);
    });

    it('should limit local histogram to 1000 observations', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(0);
      (redisClient.incr as jest.Mock).mockResolvedValue(0);

      // Add 1100 observations
      for (let i = 0; i < 1100; i++) {
        await metrics.recordHistogram('test_histogram', i);
      }

      const summary = await metrics.getMetricsSummary();
      const histogram = summary.histograms['histogram:test_histogram'];
      expect(histogram.count).toBe(1000);
    });
  });

  describe('Notification Specific Metrics', () => {
    it('should track notification sent', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(1);

      await metrics.trackNotificationSent('email', 'sendgrid', 'success', 'tenant-123');

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringContaining('notifications_sent_total'),
        1
      );
    });

    it('should track notification sent without tenant', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(1);

      await metrics.trackNotificationSent('sms', 'twilio', 'failure');

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringMatching(/notifications_sent_total.*channel="sms".*provider="twilio".*status="failure"/),
        1
      );
    });

    it('should track delivery latency', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(0);
      (redisClient.incr as jest.Mock).mockResolvedValue(0);

      await metrics.trackDeliveryLatency('email', 'sendgrid', 1.234);

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringContaining('notification_delivery_duration_seconds'),
        1.234
      );
    });

    it('should track provider health', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      await metrics.trackProviderHealth('sendgrid', 'email', true);

      expect(redisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('provider_health'),
        '1'
      );

      await metrics.trackProviderHealth('sendgrid', 'email', false);

      expect(redisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('provider_health'),
        '0'
      );
    });

    it('should track provider errors', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(1);

      await metrics.trackProviderError('twilio', 'sms', 'rate_limit');

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringMatching(/provider_errors_total.*channel="sms".*error_type="rate_limit".*provider="twilio"/),
        1
      );
    });

    it('should track queue depth', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      await metrics.trackQueueDepth('notifications-high-priority', 42);

      expect(redisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('queue_depth'),
        '42'
      );
    });

    it('should track campaign metrics', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(0);

      await metrics.trackCampaignSent('campaign-123', 1000, 950, 50);

      expect(redisClient.incrbyfloat).toHaveBeenCalledTimes(3);
      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringContaining('campaign_notifications_total'),
        1000
      );
      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringContaining('campaign_notifications_success'),
        950
      );
      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringContaining('campaign_notifications_failed'),
        50
      );
    });

    it('should track preference updates', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(1);

      await metrics.trackPreferenceUpdate('email', 'subscribe');
      await metrics.trackPreferenceUpdate('sms', 'unsubscribe');

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringMatching(/preference_updates_total.*action="subscribe".*channel="email"/),
        1
      );
      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringMatching(/preference_updates_total.*action="unsubscribe".*channel="sms"/),
        1
      );
    });

    it('should track webhook delivery', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(1);

      await metrics.trackWebhookDelivery('sendgrid', 'success', 200);

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringMatching(/webhook_deliveries_total.*provider="sendgrid".*status="success".*status_code="200"/),
        1
      );
    });

    it('should track webhook delivery without status code', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(1);

      await metrics.trackWebhookDelivery('twilio', 'failure');

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringMatching(/webhook_deliveries_total.*provider="twilio".*status="failure"/),
        1
      );
    });

    it('should track rate limit hits', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(1);

      await metrics.trackRateLimitHit('/api/send', 'tenant-456');

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringMatching(/rate_limit_hits_total.*endpoint="\/api\/send".*tenant_id="tenant-456"/),
        1
      );
    });

    it('should track consent events', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(1);

      await metrics.trackConsentEvent('granted', 'email');
      await metrics.trackConsentEvent('revoked', 'sms');
      await metrics.trackConsentEvent('expired', 'push');

      expect(redisClient.incrbyfloat).toHaveBeenCalledTimes(3);
    });

    it('should track template rendering', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(0);
      (redisClient.incr as jest.Mock).mockResolvedValue(0);

      await metrics.trackTemplateRender('welcome-email', 'success', 45);

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringMatching(/template_renders_total.*status="success".*template="welcome-email"/),
        1
      );
      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringContaining('template_render_duration_seconds'),
        0.045
      );
    });
  });

  describe('Prometheus Export', () => {
    beforeEach(async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(0);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');
      (redisClient.incr as jest.Mock).mockResolvedValue(0);
    });

    it('should export counters in Prometheus format', async () => {
      await metrics.incrementCounter('requests_total', { status: 'success' }, 10);
      await metrics.incrementCounter('requests_total', { status: 'failure' }, 2);

      const output = await metrics.getPrometheusMetrics();

      expect(output).toContain('# TYPE notification_service_requests_total counter');
      expect(output).toContain('notification_service_requests_total{status="success"} 10');
      expect(output).toContain('notification_service_requests_total{status="failure"} 2');
    });

    it('should export gauges in Prometheus format', async () => {
      await metrics.setGauge('active_connections', 42, { server: 'main' });

      const output = await metrics.getPrometheusMetrics();

      expect(output).toContain('# TYPE notification_service_active_connections gauge');
      expect(output).toContain('notification_service_active_connections{server="main"} 42');
    });

    it('should export histograms in Prometheus format', async () => {
      await metrics.recordHistogram('request_duration', 0.015);
      await metrics.recordHistogram('request_duration', 0.035);
      await metrics.recordHistogram('request_duration', 0.065);

      const output = await metrics.getPrometheusMetrics();

      expect(output).toContain('# TYPE notification_service_request_duration histogram');
      expect(output).toContain('_bucket{le="0.01"}');
      expect(output).toContain('_bucket{le="0.05"}');
      expect(output).toContain('_bucket{le="+Inf"}');
      expect(output).toContain('_sum');
      expect(output).toContain('_count');
    });

    it('should correctly count histogram buckets', async () => {
      await metrics.recordHistogram('latency', 0.02);
      await metrics.recordHistogram('latency', 0.04);
      await metrics.recordHistogram('latency', 0.08);

      const output = await metrics.getPrometheusMetrics();

      // 0.02 and 0.04 should be in le="0.05" bucket
      expect(output).toMatch(/latency_bucket\{le="0\.05"\}\s+2/);
      // All 3 should be in le="0.1" bucket
      expect(output).toMatch(/latency_bucket\{le="0\.1"\}\s+3/);
    });
  });

  describe('Metrics Summary', () => {
    beforeEach(async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(0);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');
      (redisClient.incr as jest.Mock).mockResolvedValue(0);
    });

    it('should provide summary of all metrics', async () => {
      await metrics.incrementCounter('test_counter', {}, 5);
      await metrics.setGauge('test_gauge', 100);
      await metrics.recordHistogram('test_histogram', 1.5);
      await metrics.recordHistogram('test_histogram', 2.5);

      const summary = await metrics.getMetricsSummary();

      expect(summary.counters['counter:test_counter']).toBe(5);
      expect(summary.gauges['gauge:test_gauge']).toBe(100);
      expect(summary.histograms['histogram:test_histogram']).toEqual({
        count: 2,
        sum: 4.0,
        avg: 2.0,
        min: 1.5,
        max: 2.5,
      });
    });

    it('should handle empty histogram correctly', async () => {
      const summary = await metrics.getMetricsSummary();

      expect(summary.histograms).toEqual({});
    });
  });

  describe('Label Handling', () => {
    it('should sort labels alphabetically', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(0);

      await metrics.incrementCounter('test', { z: 'last', a: 'first', m: 'middle' });

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        'notification_service:counter:test{a="first",m="middle",z="last"}',
        1
      );
    });

    it('should handle numeric label values', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(0);

      await metrics.incrementCounter('test', { count: 123, rate: 45.6 });

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        expect.stringContaining('count="123"'),
        1
      );
    });

    it('should handle empty labels', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(0);

      await metrics.incrementCounter('test', {});

      expect(redisClient.incrbyfloat).toHaveBeenCalledWith(
        'notification_service:counter:test',
        1
      );
    });
  });

  describe('Reset Functionality', () => {
    it('should clear all local metrics', async () => {
      (redisClient.incrbyfloat as jest.Mock).mockResolvedValue(0);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');
      (redisClient.incr as jest.Mock).mockResolvedValue(0);

      await metrics.incrementCounter('test_counter', {}, 10);
      await metrics.setGauge('test_gauge', 50);
      await metrics.recordHistogram('test_histogram', 1.5);

      metrics.reset();

      const summary = await metrics.getMetricsSummary();
      expect(Object.keys(summary.counters)).toHaveLength(0);
      expect(Object.keys(summary.gauges)).toHaveLength(0);
      expect(Object.keys(summary.histograms)).toHaveLength(0);
    });
  });
});

describe('createTimer', () => {
  it('should measure elapsed time in seconds', () => {
    const timer = createTimer();
    
    // Simulate some work
    const start = process.hrtime.bigint();
    while (Number(process.hrtime.bigint() - start) < 10_000_000) {} // ~10ms
    
    const elapsed = timer();
    
    expect(elapsed).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1); // Should be less than 1 second
  });

  it('should provide accurate duration measurements', () => {
    const timer = createTimer();
    
    const elapsed1 = timer();
    const elapsed2 = timer();
    
    expect(elapsed2).toBeGreaterThanOrEqual(elapsed1);
  });

  it('should work with async operations', async () => {
    const timer = createTimer();
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const elapsed = timer();
    
    expect(elapsed).toBeGreaterThanOrEqual(0.04); // At least 40ms
    expect(elapsed).toBeLessThan(0.2); // Less than 200ms
  });
});
