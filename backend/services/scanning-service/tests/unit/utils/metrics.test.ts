// @ts-nocheck
import * as client from 'prom-client';
import {
  register,
  httpRequestTotal,
  httpRequestDuration,
  scansAllowedTotal,
  scansDeniedTotal,
  scanLatency,
  qrGenerationDuration,
  replayAttemptsTotal,
  expiredQRAttemptsTotal,
  duplicateScansDetected,
  reentryAllowed,
  reentryDenied,
  accessZoneViolations,
  offlineManifestsGenerated,
  offlineScansReconciled,
  activeScans,
  databaseQueryDuration,
  databaseConnectionsActive,
  redisCacheHits,
  redisCacheMisses,
  rateLimitExceeded,
  authenticationFailures,
  venueIsolationViolations,
  tenantIsolationViolations,
  scansPerMinute,
  uniqueTicketsScanned
} from '../../../src/utils/metrics';

describe('Metrics', () => {
  beforeEach(() => {
    register.resetMetrics();
  });

  describe('Registry', () => {
    it('should be a valid Prometheus Registry', () => {
      expect(register).toBeInstanceOf(client.Registry);
    });

    it('should have default metrics collected', () => {
      const metrics = register.getMetricsAsJSON();
      expect(metrics).toBeDefined();
    });

    it('should return metrics in Prometheus format', async () => {
      const output = await register.metrics();
      expect(typeof output).toBe('string');
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });
  });

  describe('HTTP Metrics', () => {
    it('should increment httpRequestTotal counter', () => {
      httpRequestTotal.inc({ method: 'GET', route: '/test', status: '200' });
      const metrics = register.getSingleMetric('http_requests_total');
      expect(metrics).toBeDefined();
    });

    it('should observe httpRequestDuration histogram', () => {
      httpRequestDuration.observe({ method: 'POST', route: '/api/scan', status: '200' }, 0.5);
      const metrics = register.getSingleMetric('http_request_duration_seconds');
      expect(metrics).toBeDefined();
    });

    it('should have correct buckets for httpRequestDuration', () => {
      const metric = httpRequestDuration as any;
      expect(metric.upperBounds).toContain(0.001);
      expect(metric.upperBounds).toContain(0.5);
      expect(metric.upperBounds).toContain(5);
    });
  });

  describe('Scanning Metrics', () => {
    it('should increment scansAllowedTotal with labels', () => {
      scansAllowedTotal.inc({ venue_id: 'venue1', event_id: 'event1', access_level: 'VIP' });
      const metrics = register.getSingleMetric('scans_allowed_total');
      expect(metrics).toBeDefined();
    });

    it('should increment scansDeniedTotal with reason', () => {
      scansDeniedTotal.inc({ reason: 'QR_EXPIRED', venue_id: 'venue1', event_id: 'event1' });
      const metrics = register.getSingleMetric('scans_denied_total');
      expect(metrics).toBeDefined();
    });

    it('should observe scanLatency histogram', () => {
      scanLatency.observe({ result: 'ALLOW', venue_id: 'venue1' }, 0.15);
      const metrics = register.getSingleMetric('scan_latency_seconds');
      expect(metrics).toBeDefined();
    });

    it('should have correct buckets for scanLatency', () => {
      const metric = scanLatency as any;
      expect(metric.upperBounds).toContain(0.1);
      expect(metric.upperBounds).toContain(0.5);
      expect(metric.upperBounds).toContain(5);
    });

    it('should observe qrGenerationDuration histogram', () => {
      qrGenerationDuration.observe(0.05);
      const metrics = register.getSingleMetric('qr_generation_duration_seconds');
      expect(metrics).toBeDefined();
    });

    it('should have correct buckets for qrGenerationDuration', () => {
      const metric = qrGenerationDuration as any;
      expect(metric.upperBounds).toContain(0.01);
      expect(metric.upperBounds).toContain(0.1);
      expect(metric.upperBounds).toContain(1);
    });
  });

  describe('Security Metrics', () => {
    it('should increment replayAttemptsTotal', () => {
      replayAttemptsTotal.inc({ venue_id: 'venue1' });
      const metrics = register.getSingleMetric('replay_attacks_detected_total');
      expect(metrics).toBeDefined();
    });

    it('should increment expiredQRAttemptsTotal', () => {
      expiredQRAttemptsTotal.inc({ venue_id: 'venue1' });
      const metrics = register.getSingleMetric('expired_qr_attempts_total');
      expect(metrics).toBeDefined();
    });

    it('should increment authenticationFailures with reason', () => {
      authenticationFailures.inc({ reason: 'INVALID_TOKEN' });
      const metrics = register.getSingleMetric('authentication_failures_total');
      expect(metrics).toBeDefined();
    });

    it('should increment venueIsolationViolations', () => {
      venueIsolationViolations.inc({ staff_venue: 'venue1', attempted_venue: 'venue2' });
      const metrics = register.getSingleMetric('venue_isolation_violations_total');
      expect(metrics).toBeDefined();
    });

    it('should increment tenantIsolationViolations', () => {
      tenantIsolationViolations.inc({ staff_tenant: 'tenant1', attempted_tenant: 'tenant2' });
      const metrics = register.getSingleMetric('tenant_isolation_violations_total');
      expect(metrics).toBeDefined();
    });
  });

  describe('Policy Metrics', () => {
    it('should increment duplicateScansDetected', () => {
      duplicateScansDetected.inc({ venue_id: 'venue1', within_window: 'true' });
      const metrics = register.getSingleMetric('duplicate_scans_detected_total');
      expect(metrics).toBeDefined();
    });

    it('should increment reentryAllowed', () => {
      reentryAllowed.inc({ venue_id: 'venue1', event_id: 'event1' });
      const metrics = register.getSingleMetric('reentry_allowed_total');
      expect(metrics).toBeDefined();
    });

    it('should increment reentryDenied with reason', () => {
      reentryDenied.inc({ reason: 'COOLDOWN_ACTIVE', venue_id: 'venue1' });
      const metrics = register.getSingleMetric('reentry_denied_total');
      expect(metrics).toBeDefined();
    });

    it('should increment accessZoneViolations', () => {
      accessZoneViolations.inc({ required_level: 'VIP', device_zone: 'GA', venue_id: 'venue1' });
      const metrics = register.getSingleMetric('access_zone_violations_total');
      expect(metrics).toBeDefined();
    });
  });

  describe('Offline Metrics', () => {
    it('should increment offlineManifestsGenerated', () => {
      offlineManifestsGenerated.inc({ event_id: 'event1', device_id: 'device1' });
      const metrics = register.getSingleMetric('offline_manifests_generated_total');
      expect(metrics).toBeDefined();
    });

    it('should increment offlineScansReconciled', () => {
      offlineScansReconciled.inc({ event_id: 'event1', result: 'SUCCESS' });
      const metrics = register.getSingleMetric('offline_scans_reconciled_total');
      expect(metrics).toBeDefined();
    });
  });

  describe('Gauge Metrics', () => {
    it('should set activeScans gauge', () => {
      activeScans.set(5);
      const metrics = register.getSingleMetric('active_scans_current');
      expect(metrics).toBeDefined();
    });

    it('should increment activeScans gauge', () => {
      activeScans.inc();
      const metrics = register.getSingleMetric('active_scans_current');
      expect(metrics).toBeDefined();
    });

    it('should decrement activeScans gauge', () => {
      activeScans.set(5);
      activeScans.dec();
      const metrics = register.getSingleMetric('active_scans_current');
      expect(metrics).toBeDefined();
    });

    it('should set scansPerMinute gauge with labels', () => {
      scansPerMinute.set({ venue_id: 'venue1' }, 25);
      const metrics = register.getSingleMetric('scans_per_minute_current');
      expect(metrics).toBeDefined();
    });

    it('should set databaseConnectionsActive gauge', () => {
      databaseConnectionsActive.set(10);
      const metrics = register.getSingleMetric('database_connections_active');
      expect(metrics).toBeDefined();
    });
  });

  describe('Infrastructure Metrics', () => {
    it('should observe databaseQueryDuration', () => {
      databaseQueryDuration.observe({ operation: 'SELECT', table: 'tickets' }, 0.05);
      const metrics = register.getSingleMetric('database_query_duration_seconds');
      expect(metrics).toBeDefined();
    });

    it('should have correct buckets for databaseQueryDuration', () => {
      const metric = databaseQueryDuration as any;
      expect(metric.upperBounds).toContain(0.001);
      expect(metric.upperBounds).toContain(0.05);
      expect(metric.upperBounds).toContain(1);
    });

    it('should increment redisCacheHits', () => {
      redisCacheHits.inc({ key_type: 'nonce' });
      const metrics = register.getSingleMetric('redis_cache_hits_total');
      expect(metrics).toBeDefined();
    });

    it('should increment redisCacheMisses', () => {
      redisCacheMisses.inc({ key_type: 'nonce' });
      const metrics = register.getSingleMetric('redis_cache_misses_total');
      expect(metrics).toBeDefined();
    });

    it('should increment rateLimitExceeded', () => {
      rateLimitExceeded.inc({ endpoint: '/api/scan', client_ip: '192.168.1.1' });
      const metrics = register.getSingleMetric('rate_limit_exceeded_total');
      expect(metrics).toBeDefined();
    });
  });

  describe('Business Metrics', () => {
    it('should increment uniqueTicketsScanned', () => {
      uniqueTicketsScanned.inc({ event_id: 'event1', access_level: 'GA' });
      const metrics = register.getSingleMetric('unique_tickets_scanned_total');
      expect(metrics).toBeDefined();
    });
  });

  describe('Metric Types', () => {
    it('should have Counter type for httpRequestTotal', () => {
      expect(httpRequestTotal).toBeInstanceOf(client.Counter);
    });

    it('should have Histogram type for httpRequestDuration', () => {
      expect(httpRequestDuration).toBeInstanceOf(client.Histogram);
    });

    it('should have Gauge type for activeScans', () => {
      expect(activeScans).toBeInstanceOf(client.Gauge);
    });
  });
});
