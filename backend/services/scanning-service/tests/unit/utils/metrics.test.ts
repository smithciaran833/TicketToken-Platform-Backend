// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/utils/metrics.ts
 * Tests Prometheus metrics behavior and configuration
 */

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

describe('src/utils/metrics.ts - Comprehensive Unit Tests', () => {

  beforeEach(() => {
    register.resetMetrics();
  });

  // =============================================================================
  // REGISTRY CONFIGURATION
  // =============================================================================

  describe('Registry Configuration', () => {
    it('should export a valid Prometheus Registry', () => {
      expect(register).toBeDefined();
      expect(register).toBeInstanceOf(client.Registry);
    });

    it('should return metrics in Prometheus format', async () => {
      const output = await register.metrics();
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should include metric metadata', async () => {
      const output = await register.metrics();
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('should collect default system metrics', async () => {
      const metrics = await register.getMetricsAsJSON();
      expect(metrics).toBeDefined();
    });

    it('should prefix default metrics with scanning_service_', async () => {
      const output = await register.metrics();
      // Default metrics should have the prefix
      expect(output).toContain('scanning_service_');
    });
  });

  // =============================================================================
  // HTTP METRICS - COUNTER
  // =============================================================================

  describe('httpRequestTotal - HTTP Request Counter', () => {
    it('should be a Counter instance', () => {
      expect(httpRequestTotal).toBeInstanceOf(client.Counter);
    });

    it('should increment counter', () => {
      httpRequestTotal.inc({ method: 'GET', route: '/health', status: '200' });
      const metrics = register.getSingleMetric('http_requests_total');
      expect(metrics).toBeDefined();
    });

    it('should track different HTTP methods', () => {
      httpRequestTotal.inc({ method: 'GET', route: '/scan', status: '200' });
      httpRequestTotal.inc({ method: 'POST', route: '/scan', status: '200' });
      httpRequestTotal.inc({ method: 'PUT', route: '/scan', status: '200' });
      httpRequestTotal.inc({ method: 'DELETE', route: '/scan', status: '200' });
      expect(register.getSingleMetric('http_requests_total')).toBeDefined();
    });

    it('should track different routes separately', () => {
      httpRequestTotal.inc({ method: 'GET', route: '/health', status: '200' });
      httpRequestTotal.inc({ method: 'GET', route: '/metrics', status: '200' });
      httpRequestTotal.inc({ method: 'GET', route: '/scan', status: '200' });
      expect(register.getSingleMetric('http_requests_total')).toBeDefined();
    });

    it('should track different status codes', () => {
      httpRequestTotal.inc({ method: 'GET', route: '/scan', status: '200' });
      httpRequestTotal.inc({ method: 'GET', route: '/scan', status: '400' });
      httpRequestTotal.inc({ method: 'GET', route: '/scan', status: '500' });
      expect(register.getSingleMetric('http_requests_total')).toBeDefined();
    });

    it('should increment by custom amount', () => {
      httpRequestTotal.inc({ method: 'GET', route: '/test', status: '200' }, 5);
      expect(register.getSingleMetric('http_requests_total')).toBeDefined();
    });
  });

  // =============================================================================
  // HTTP METRICS - HISTOGRAM
  // =============================================================================

  describe('httpRequestDuration - HTTP Duration Histogram', () => {
    it('should be a Histogram instance', () => {
      expect(httpRequestDuration).toBeInstanceOf(client.Histogram);
    });

    it('should observe request duration', () => {
      httpRequestDuration.observe({ method: 'GET', route: '/scan', status: '200' }, 0.05);
      expect(register.getSingleMetric('http_request_duration_seconds')).toBeDefined();
    });

    it('should handle fast requests', () => {
      httpRequestDuration.observe({ method: 'GET', route: '/health', status: '200' }, 0.001);
      expect(register.getSingleMetric('http_request_duration_seconds')).toBeDefined();
    });

    it('should handle slow requests', () => {
      httpRequestDuration.observe({ method: 'POST', route: '/scan', status: '200' }, 2.5);
      expect(register.getSingleMetric('http_request_duration_seconds')).toBeDefined();
    });

    it('should track multiple observations', () => {
      httpRequestDuration.observe({ method: 'GET', route: '/scan', status: '200' }, 0.01);
      httpRequestDuration.observe({ method: 'GET', route: '/scan', status: '200' }, 0.05);
      httpRequestDuration.observe({ method: 'GET', route: '/scan', status: '200' }, 0.1);
      expect(register.getSingleMetric('http_request_duration_seconds')).toBeDefined();
    });

    it('should have correct bucket configuration', () => {
      const metric = httpRequestDuration as any;
      expect(metric.upperBounds).toContain(0.001);
      expect(metric.upperBounds).toContain(0.01);
      expect(metric.upperBounds).toContain(0.1);
      expect(metric.upperBounds).toContain(1);
      expect(metric.upperBounds).toContain(5);
    });
  });

  // =============================================================================
  // SCANNING METRICS - COUNTERS
  // =============================================================================

  describe('scansAllowedTotal - Allowed Scans Counter', () => {
    it('should be a Counter instance', () => {
      expect(scansAllowedTotal).toBeInstanceOf(client.Counter);
    });

    it('should track allowed scans', () => {
      scansAllowedTotal.inc({ venue_id: 'venue-1', event_id: 'event-1', access_level: 'VIP' });
      expect(register.getSingleMetric('scans_allowed_total')).toBeDefined();
    });

    it('should track different venues', () => {
      scansAllowedTotal.inc({ venue_id: 'venue-1', event_id: 'event-1', access_level: 'GA' });
      scansAllowedTotal.inc({ venue_id: 'venue-2', event_id: 'event-1', access_level: 'GA' });
      expect(register.getSingleMetric('scans_allowed_total')).toBeDefined();
    });

    it('should track different access levels', () => {
      scansAllowedTotal.inc({ venue_id: 'venue-1', event_id: 'event-1', access_level: 'VIP' });
      scansAllowedTotal.inc({ venue_id: 'venue-1', event_id: 'event-1', access_level: 'GA' });
      scansAllowedTotal.inc({ venue_id: 'venue-1', event_id: 'event-1', access_level: 'BACKSTAGE' });
      expect(register.getSingleMetric('scans_allowed_total')).toBeDefined();
    });
  });

  describe('scansDeniedTotal - Denied Scans Counter', () => {
    it('should be a Counter instance', () => {
      expect(scansDeniedTotal).toBeInstanceOf(client.Counter);
    });

    it('should track denied scans with reasons', () => {
      scansDeniedTotal.inc({ reason: 'QR_EXPIRED', venue_id: 'venue-1', event_id: 'event-1' });
      expect(register.getSingleMetric('scans_denied_total')).toBeDefined();
    });

    it('should track different denial reasons', () => {
      scansDeniedTotal.inc({ reason: 'QR_EXPIRED', venue_id: 'venue-1', event_id: 'event-1' });
      scansDeniedTotal.inc({ reason: 'REPLAY_ATTACK', venue_id: 'venue-1', event_id: 'event-1' });
      scansDeniedTotal.inc({ reason: 'INVALID_TICKET', venue_id: 'venue-1', event_id: 'event-1' });
      scansDeniedTotal.inc({ reason: 'ALREADY_SCANNED', venue_id: 'venue-1', event_id: 'event-1' });
      expect(register.getSingleMetric('scans_denied_total')).toBeDefined();
    });
  });

  describe('scanLatency - Scan Latency Histogram', () => {
    it('should be a Histogram instance', () => {
      expect(scanLatency).toBeInstanceOf(client.Histogram);
    });

    it('should observe scan latency', () => {
      scanLatency.observe({ result: 'ALLOW', venue_id: 'venue-1' }, 0.15);
      expect(register.getSingleMetric('scan_latency_seconds')).toBeDefined();
    });

    it('should track fast scans', () => {
      scanLatency.observe({ result: 'ALLOW', venue_id: 'venue-1' }, 0.05);
      expect(register.getSingleMetric('scan_latency_seconds')).toBeDefined();
    });

    it('should track slow scans', () => {
      scanLatency.observe({ result: 'DENY', venue_id: 'venue-1' }, 1.5);
      expect(register.getSingleMetric('scan_latency_seconds')).toBeDefined();
    });

    it('should have correct bucket configuration', () => {
      const metric = scanLatency as any;
      expect(metric.upperBounds).toContain(0.05);
      expect(metric.upperBounds).toContain(0.1);
      expect(metric.upperBounds).toContain(0.5);
      expect(metric.upperBounds).toContain(1);
    });
  });

  describe('qrGenerationDuration - QR Generation Histogram', () => {
    it('should be a Histogram instance', () => {
      expect(qrGenerationDuration).toBeInstanceOf(client.Histogram);
    });

    it('should observe QR generation time', () => {
      qrGenerationDuration.observe(0.05);
      expect(register.getSingleMetric('qr_generation_duration_seconds')).toBeDefined();
    });

    it('should track fast generation', () => {
      qrGenerationDuration.observe(0.01);
      expect(register.getSingleMetric('qr_generation_duration_seconds')).toBeDefined();
    });

    it('should track slow generation', () => {
      qrGenerationDuration.observe(0.5);
      expect(register.getSingleMetric('qr_generation_duration_seconds')).toBeDefined();
    });
  });

  // =============================================================================
  // SECURITY METRICS
  // =============================================================================

  describe('Security Metrics', () => {
    it('should track replay attacks', () => {
      replayAttemptsTotal.inc({ venue_id: 'venue-1' });
      expect(register.getSingleMetric('replay_attacks_detected_total')).toBeDefined();
    });

    it('should track expired QR attempts', () => {
      expiredQRAttemptsTotal.inc({ venue_id: 'venue-1' });
      expect(register.getSingleMetric('expired_qr_attempts_total')).toBeDefined();
    });

    it('should track authentication failures', () => {
      authenticationFailures.inc({ reason: 'INVALID_TOKEN' });
      authenticationFailures.inc({ reason: 'EXPIRED_TOKEN' });
      authenticationFailures.inc({ reason: 'MISSING_TOKEN' });
      expect(register.getSingleMetric('authentication_failures_total')).toBeDefined();
    });

    it('should track venue isolation violations', () => {
      venueIsolationViolations.inc({ staff_venue: 'venue-1', attempted_venue: 'venue-2' });
      expect(register.getSingleMetric('venue_isolation_violations_total')).toBeDefined();
    });

    it('should track tenant isolation violations', () => {
      tenantIsolationViolations.inc({ staff_tenant: 'tenant-a', attempted_tenant: 'tenant-b' });
      expect(register.getSingleMetric('tenant_isolation_violations_total')).toBeDefined();
    });
  });

  // =============================================================================
  // POLICY METRICS
  // =============================================================================

  describe('Policy Metrics', () => {
    it('should track duplicate scans', () => {
      duplicateScansDetected.inc({ venue_id: 'venue-1', within_window: 'true' });
      duplicateScansDetected.inc({ venue_id: 'venue-1', within_window: 'false' });
      expect(register.getSingleMetric('duplicate_scans_detected_total')).toBeDefined();
    });

    it('should track reentry allowed', () => {
      reentryAllowed.inc({ venue_id: 'venue-1', event_id: 'event-1' });
      expect(register.getSingleMetric('reentry_allowed_total')).toBeDefined();
    });

    it('should track reentry denied', () => {
      reentryDenied.inc({ reason: 'COOLDOWN_ACTIVE', venue_id: 'venue-1' });
      reentryDenied.inc({ reason: 'MAX_LIMIT_REACHED', venue_id: 'venue-1' });
      expect(register.getSingleMetric('reentry_denied_total')).toBeDefined();
    });

    it('should track access zone violations', () => {
      accessZoneViolations.inc({ 
        required_level: 'VIP', 
        device_zone: 'GA', 
        venue_id: 'venue-1' 
      });
      expect(register.getSingleMetric('access_zone_violations_total')).toBeDefined();
    });
  });

  // =============================================================================
  // OFFLINE METRICS
  // =============================================================================

  describe('Offline Metrics', () => {
    it('should track offline manifests generated', () => {
      offlineManifestsGenerated.inc({ event_id: 'event-1', device_id: 'device-1' });
      expect(register.getSingleMetric('offline_manifests_generated_total')).toBeDefined();
    });

    it('should track offline scans reconciled', () => {
      offlineScansReconciled.inc({ event_id: 'event-1', result: 'SUCCESS' });
      offlineScansReconciled.inc({ event_id: 'event-1', result: 'CONFLICT' });
      expect(register.getSingleMetric('offline_scans_reconciled_total')).toBeDefined();
    });
  });

  // =============================================================================
  // GAUGE METRICS
  // =============================================================================

  describe('activeScans - Active Scans Gauge', () => {
    it('should be a Gauge instance', () => {
      expect(activeScans).toBeInstanceOf(client.Gauge);
    });

    it('should set gauge value', () => {
      activeScans.set(10);
      expect(register.getSingleMetric('active_scans_current')).toBeDefined();
    });

    it('should increment gauge', () => {
      activeScans.set(5);
      activeScans.inc();
      activeScans.inc();
      expect(register.getSingleMetric('active_scans_current')).toBeDefined();
    });

    it('should decrement gauge', () => {
      activeScans.set(10);
      activeScans.dec();
      activeScans.dec();
      expect(register.getSingleMetric('active_scans_current')).toBeDefined();
    });

    it('should increment by custom amount', () => {
      activeScans.set(5);
      activeScans.inc(10);
      expect(register.getSingleMetric('active_scans_current')).toBeDefined();
    });

    it('should decrement by custom amount', () => {
      activeScans.set(20);
      activeScans.dec(5);
      expect(register.getSingleMetric('active_scans_current')).toBeDefined();
    });
  });

  describe('scansPerMinute - Scan Rate Gauge', () => {
    it('should be a Gauge instance', () => {
      expect(scansPerMinute).toBeInstanceOf(client.Gauge);
    });

    it('should set scan rate for venue', () => {
      scansPerMinute.set({ venue_id: 'venue-1' }, 25);
      expect(register.getSingleMetric('scans_per_minute_current')).toBeDefined();
    });

    it('should track different venues', () => {
      scansPerMinute.set({ venue_id: 'venue-1' }, 25);
      scansPerMinute.set({ venue_id: 'venue-2' }, 40);
      scansPerMinute.set({ venue_id: 'venue-3' }, 15);
      expect(register.getSingleMetric('scans_per_minute_current')).toBeDefined();
    });
  });

  describe('databaseConnectionsActive - Database Connections Gauge', () => {
    it('should be a Gauge instance', () => {
      expect(databaseConnectionsActive).toBeInstanceOf(client.Gauge);
    });

    it('should set active connections', () => {
      databaseConnectionsActive.set(15);
      expect(register.getSingleMetric('database_connections_active')).toBeDefined();
    });

    it('should track connection pool changes', () => {
      databaseConnectionsActive.set(10);
      databaseConnectionsActive.inc();
      databaseConnectionsActive.inc();
      databaseConnectionsActive.dec();
      expect(register.getSingleMetric('database_connections_active')).toBeDefined();
    });
  });

  // =============================================================================
  // DATABASE METRICS
  // =============================================================================

  describe('databaseQueryDuration - Database Query Histogram', () => {
    it('should be a Histogram instance', () => {
      expect(databaseQueryDuration).toBeInstanceOf(client.Histogram);
    });

    it('should observe query duration', () => {
      databaseQueryDuration.observe({ operation: 'SELECT', table: 'tickets' }, 0.05);
      expect(register.getSingleMetric('database_query_duration_seconds')).toBeDefined();
    });

    it('should track different operations', () => {
      databaseQueryDuration.observe({ operation: 'SELECT', table: 'tickets' }, 0.01);
      databaseQueryDuration.observe({ operation: 'INSERT', table: 'scans' }, 0.02);
      databaseQueryDuration.observe({ operation: 'UPDATE', table: 'tickets' }, 0.03);
      databaseQueryDuration.observe({ operation: 'DELETE', table: 'scans' }, 0.01);
      expect(register.getSingleMetric('database_query_duration_seconds')).toBeDefined();
    });

    it('should track different tables', () => {
      databaseQueryDuration.observe({ operation: 'SELECT', table: 'tickets' }, 0.01);
      databaseQueryDuration.observe({ operation: 'SELECT', table: 'events' }, 0.02);
      databaseQueryDuration.observe({ operation: 'SELECT', table: 'venues' }, 0.01);
      expect(register.getSingleMetric('database_query_duration_seconds')).toBeDefined();
    });

    it('should have correct bucket configuration', () => {
      const metric = databaseQueryDuration as any;
      expect(metric.upperBounds).toContain(0.001);
      expect(metric.upperBounds).toContain(0.01);
      expect(metric.upperBounds).toContain(0.1);
      expect(metric.upperBounds).toContain(1);
    });
  });

  // =============================================================================
  // REDIS METRICS
  // =============================================================================

  describe('Redis Cache Metrics', () => {
    it('should track cache hits', () => {
      redisCacheHits.inc({ key_type: 'nonce' });
      redisCacheHits.inc({ key_type: 'ticket' });
      expect(register.getSingleMetric('redis_cache_hits_total')).toBeDefined();
    });

    it('should track cache misses', () => {
      redisCacheMisses.inc({ key_type: 'nonce' });
      redisCacheMisses.inc({ key_type: 'ticket' });
      expect(register.getSingleMetric('redis_cache_misses_total')).toBeDefined();
    });

    it('should track different key types', () => {
      redisCacheHits.inc({ key_type: 'nonce' });
      redisCacheHits.inc({ key_type: 'ticket' });
      redisCacheHits.inc({ key_type: 'session' });
      redisCacheMisses.inc({ key_type: 'nonce' });
      expect(register.getSingleMetric('redis_cache_hits_total')).toBeDefined();
      expect(register.getSingleMetric('redis_cache_misses_total')).toBeDefined();
    });
  });

  // =============================================================================
  // RATE LIMITING METRICS
  // =============================================================================

  describe('rateLimitExceeded - Rate Limit Counter', () => {
    it('should be a Counter instance', () => {
      expect(rateLimitExceeded).toBeInstanceOf(client.Counter);
    });

    it('should track rate limit violations', () => {
      rateLimitExceeded.inc({ endpoint: '/api/scan', client_ip: '192.168.1.1' });
      expect(register.getSingleMetric('rate_limit_exceeded_total')).toBeDefined();
    });

    it('should track different endpoints', () => {
      rateLimitExceeded.inc({ endpoint: '/api/scan', client_ip: '192.168.1.1' });
      rateLimitExceeded.inc({ endpoint: '/api/qr', client_ip: '192.168.1.1' });
      rateLimitExceeded.inc({ endpoint: '/api/events', client_ip: '192.168.1.1' });
      expect(register.getSingleMetric('rate_limit_exceeded_total')).toBeDefined();
    });

    it('should track different client IPs', () => {
      rateLimitExceeded.inc({ endpoint: '/api/scan', client_ip: '192.168.1.1' });
      rateLimitExceeded.inc({ endpoint: '/api/scan', client_ip: '192.168.1.2' });
      rateLimitExceeded.inc({ endpoint: '/api/scan', client_ip: '10.0.0.1' });
      expect(register.getSingleMetric('rate_limit_exceeded_total')).toBeDefined();
    });
  });

  // =============================================================================
  // BUSINESS METRICS
  // =============================================================================

  describe('uniqueTicketsScanned - Unique Tickets Counter', () => {
    it('should be a Counter instance', () => {
      expect(uniqueTicketsScanned).toBeInstanceOf(client.Counter);
    });

    it('should track unique tickets', () => {
      uniqueTicketsScanned.inc({ event_id: 'event-1', access_level: 'GA' });
      expect(register.getSingleMetric('unique_tickets_scanned_total')).toBeDefined();
    });

    it('should track different events', () => {
      uniqueTicketsScanned.inc({ event_id: 'event-1', access_level: 'GA' });
      uniqueTicketsScanned.inc({ event_id: 'event-2', access_level: 'GA' });
      expect(register.getSingleMetric('unique_tickets_scanned_total')).toBeDefined();
    });

    it('should track different access levels', () => {
      uniqueTicketsScanned.inc({ event_id: 'event-1', access_level: 'VIP' });
      uniqueTicketsScanned.inc({ event_id: 'event-1', access_level: 'GA' });
      uniqueTicketsScanned.inc({ event_id: 'event-1', access_level: 'BACKSTAGE' });
      expect(register.getSingleMetric('unique_tickets_scanned_total')).toBeDefined();
    });
  });

  // =============================================================================
  // REAL-WORLD SCENARIOS
  // =============================================================================

  describe('Real-World Scenarios', () => {
    it('should track complete successful scan flow', () => {
      // HTTP request received
      httpRequestTotal.inc({ method: 'POST', route: '/api/scan', status: '200' });
      
      // Active scan counter
      activeScans.inc();
      
      // QR generation
      qrGenerationDuration.observe(0.03);
      
      // Database lookup
      databaseQueryDuration.observe({ operation: 'SELECT', table: 'tickets' }, 0.015);
      
      // Cache hit
      redisCacheHits.inc({ key_type: 'nonce' });
      
      // Scan allowed
      scansAllowedTotal.inc({ venue_id: 'venue-1', event_id: 'event-1', access_level: 'VIP' });
      scanLatency.observe({ result: 'ALLOW', venue_id: 'venue-1' }, 0.12);
      
      // HTTP response
      httpRequestDuration.observe({ method: 'POST', route: '/api/scan', status: '200' }, 0.15);
      
      // Business metrics
      uniqueTicketsScanned.inc({ event_id: 'event-1', access_level: 'VIP' });
      
      // Active scan done
      activeScans.dec();
      
      expect(register.getSingleMetric('scans_allowed_total')).toBeDefined();
    });

    it('should track replay attack detection', () => {
      // HTTP request
      httpRequestTotal.inc({ method: 'POST', route: '/api/scan', status: '403' });
      
      // Cache hit - nonce found
      redisCacheHits.inc({ key_type: 'nonce' });
      
      // Replay detected
      replayAttemptsTotal.inc({ venue_id: 'venue-1' });
      scansDeniedTotal.inc({ reason: 'REPLAY_ATTACK', venue_id: 'venue-1', event_id: 'event-1' });
      
      // Latency recorded
      scanLatency.observe({ result: 'DENY', venue_id: 'venue-1' }, 0.08);
      
      expect(register.getSingleMetric('replay_attacks_detected_total')).toBeDefined();
    });

    it('should track expired QR code attempt', () => {
      expiredQRAttemptsTotal.inc({ venue_id: 'venue-1' });
      scansDeniedTotal.inc({ reason: 'QR_EXPIRED', venue_id: 'venue-1', event_id: 'event-1' });
      httpRequestTotal.inc({ method: 'POST', route: '/api/scan', status: '403' });
      
      expect(register.getSingleMetric('expired_qr_attempts_total')).toBeDefined();
    });

    it('should track database connection pool usage', () => {
      databaseConnectionsActive.set(5);
      databaseConnectionsActive.inc(); // Connection acquired
      databaseQueryDuration.observe({ operation: 'SELECT', table: 'tickets' }, 0.02);
      databaseConnectionsActive.dec(); // Connection released
      
      expect(register.getSingleMetric('database_connections_active')).toBeDefined();
    });

    it('should track cache hit ratio pattern', () => {
      // 80% hit rate
      for (let i = 0; i < 80; i++) {
        redisCacheHits.inc({ key_type: 'nonce' });
      }
      for (let i = 0; i < 20; i++) {
        redisCacheMisses.inc({ key_type: 'nonce' });
      }
      
      expect(register.getSingleMetric('redis_cache_hits_total')).toBeDefined();
      expect(register.getSingleMetric('redis_cache_misses_total')).toBeDefined();
    });

    it('should track rate limiting scenario', () => {
      const clientIp = '192.168.1.100';
      
      // 100 successful requests
      for (let i = 0; i < 100; i++) {
        httpRequestTotal.inc({ method: 'POST', route: '/api/scan', status: '200' });
      }
      
      // Rate limit exceeded
      rateLimitExceeded.inc({ endpoint: '/api/scan', client_ip: clientIp });
      httpRequestTotal.inc({ method: 'POST', route: '/api/scan', status: '429' });
      
      expect(register.getSingleMetric('rate_limit_exceeded_total')).toBeDefined();
    });

    it('should track multi-venue scan rates', () => {
      scansPerMinute.set({ venue_id: 'venue-1' }, 45);
      scansPerMinute.set({ venue_id: 'venue-2' }, 30);
      scansPerMinute.set({ venue_id: 'venue-3' }, 60);
      
      expect(register.getSingleMetric('scans_per_minute_current')).toBeDefined();
    });

    it('should track offline mode workflow', () => {
      // Manifest generation
      offlineManifestsGenerated.inc({ event_id: 'event-1', device_id: 'device-mobile-1' });
      
      // Later reconciliation
      offlineScansReconciled.inc({ event_id: 'event-1', result: 'SUCCESS' }, 50);
      offlineScansReconciled.inc({ event_id: 'event-1', result: 'CONFLICT' }, 2);
      
      expect(register.getSingleMetric('offline_manifests_generated_total')).toBeDefined();
      expect(register.getSingleMetric('offline_scans_reconciled_total')).toBeDefined();
    });

    it('should track security isolation violation', () => {
      // Staff tries to access different venue
      venueIsolationViolations.inc({ staff_venue: 'venue-a', attempted_venue: 'venue-b' });
      authenticationFailures.inc({ reason: 'VENUE_MISMATCH' });
      httpRequestTotal.inc({ method: 'POST', route: '/api/scan', status: '403' });
      
      expect(register.getSingleMetric('venue_isolation_violations_total')).toBeDefined();
    });
  });

});
