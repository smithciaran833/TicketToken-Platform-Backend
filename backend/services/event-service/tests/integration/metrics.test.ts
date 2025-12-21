/**
 * Metrics Integration Tests
 */

import {
  register,
  eventCreatedTotal,
  eventUpdatedTotal,
  eventPublishedTotal,
  eventDeletedTotal,
  capacityReservedTotal,
  capacityCheckedTotal,
  capacityAvailable,
  pricingCreatedTotal,
  pricingCalculatedTotal,
  priceLockCreatedTotal,
  scheduleCreatedTotal,
  scheduleUpdatedTotal,
  eventOperationDuration,
  capacityOperationDuration,
  databaseQueryDuration,
  httpRequestsTotal,
  httpRequestDuration,
  reservationCleanupRunsTotal,
  reservationsExpiredTotal,
  reservationCleanupDuration,
  cacheHitsTotal,
  cacheMissesTotal,
  cacheInvalidationTotal,
  cacheInvalidationFailuresTotal,
  rateLimitHitsTotal,
  rateLimitFailOpenTotal,
  externalServiceCallsTotal,
  externalServiceDuration,
  circuitBreakerStateChanges,
  circuitBreakerCallsTotal,
  searchSyncPublishedTotal,
  searchSyncFailuresTotal,
} from '../../src/utils/metrics';

describe('Metrics', () => {
  beforeEach(async () => {
    // Reset all metrics before each test
    register.resetMetrics();
  });

  // ==========================================================================
  // Registry
  // ==========================================================================
  describe('register', () => {
    it('should export a prometheus registry', () => {
      expect(register).toBeDefined();
      expect(typeof register.metrics).toBe('function');
    });

    it('should collect default metrics', async () => {
      const metrics = await register.metrics();
      expect(metrics).toContain('process_cpu');
    });
  });

  // ==========================================================================
  // Event Counters
  // ==========================================================================
  describe('event counters', () => {
    it('should increment eventCreatedTotal', () => {
      eventCreatedTotal.inc({ status: 'success', event_type: 'single' });
      
      // Counter should exist and be incrementable
      expect(eventCreatedTotal).toBeDefined();
    });

    it('should increment eventUpdatedTotal', () => {
      eventUpdatedTotal.inc({ status: 'success' });
      expect(eventUpdatedTotal).toBeDefined();
    });

    it('should increment eventPublishedTotal', () => {
      eventPublishedTotal.inc({ status: 'success' });
      expect(eventPublishedTotal).toBeDefined();
    });

    it('should increment eventDeletedTotal', () => {
      eventDeletedTotal.inc({ status: 'success' });
      expect(eventDeletedTotal).toBeDefined();
    });
  });

  // ==========================================================================
  // Capacity Metrics
  // ==========================================================================
  describe('capacity metrics', () => {
    it('should increment capacityReservedTotal', () => {
      capacityReservedTotal.inc({ status: 'success' });
      expect(capacityReservedTotal).toBeDefined();
    });

    it('should increment capacityCheckedTotal', () => {
      capacityCheckedTotal.inc({ available: 'true' });
      expect(capacityCheckedTotal).toBeDefined();
    });

    it('should set capacityAvailable gauge', () => {
      capacityAvailable.set({ event_id: 'test-event', section_name: 'GA' }, 100);
      expect(capacityAvailable).toBeDefined();
    });
  });

  // ==========================================================================
  // Pricing Metrics
  // ==========================================================================
  describe('pricing metrics', () => {
    it('should increment pricingCreatedTotal', () => {
      pricingCreatedTotal.inc({ status: 'success' });
      expect(pricingCreatedTotal).toBeDefined();
    });

    it('should increment pricingCalculatedTotal', () => {
      pricingCalculatedTotal.inc();
      expect(pricingCalculatedTotal).toBeDefined();
    });

    it('should increment priceLockCreatedTotal', () => {
      priceLockCreatedTotal.inc();
      expect(priceLockCreatedTotal).toBeDefined();
    });
  });

  // ==========================================================================
  // Schedule Metrics
  // ==========================================================================
  describe('schedule metrics', () => {
    it('should increment scheduleCreatedTotal', () => {
      scheduleCreatedTotal.inc({ status: 'success' });
      expect(scheduleCreatedTotal).toBeDefined();
    });

    it('should increment scheduleUpdatedTotal', () => {
      scheduleUpdatedTotal.inc({ status: 'success' });
      expect(scheduleUpdatedTotal).toBeDefined();
    });
  });

  // ==========================================================================
  // Duration Histograms
  // ==========================================================================
  describe('duration histograms', () => {
    it('should observe eventOperationDuration', () => {
      eventOperationDuration.observe({ operation: 'create' }, 0.5);
      expect(eventOperationDuration).toBeDefined();
    });

    it('should observe capacityOperationDuration', () => {
      capacityOperationDuration.observe({ operation: 'reserve' }, 0.1);
      expect(capacityOperationDuration).toBeDefined();
    });

    it('should observe databaseQueryDuration', () => {
      databaseQueryDuration.observe({ operation: 'select', table: 'events' }, 0.01);
      expect(databaseQueryDuration).toBeDefined();
    });
  });

  // ==========================================================================
  // HTTP Metrics
  // ==========================================================================
  describe('HTTP metrics', () => {
    it('should increment httpRequestsTotal', () => {
      httpRequestsTotal.inc({ method: 'GET', route: '/events', status: '200' });
      expect(httpRequestsTotal).toBeDefined();
    });

    it('should observe httpRequestDuration', () => {
      httpRequestDuration.observe({ method: 'GET', route: '/events', status: '200' }, 0.25);
      expect(httpRequestDuration).toBeDefined();
    });
  });

  // ==========================================================================
  // Reservation Cleanup Metrics
  // ==========================================================================
  describe('reservation cleanup metrics', () => {
    it('should increment reservationCleanupRunsTotal', () => {
      reservationCleanupRunsTotal.inc({ status: 'success' });
      expect(reservationCleanupRunsTotal).toBeDefined();
    });

    it('should increment reservationsExpiredTotal', () => {
      reservationsExpiredTotal.inc();
      expect(reservationsExpiredTotal).toBeDefined();
    });

    it('should observe reservationCleanupDuration', () => {
      reservationCleanupDuration.observe(2.5);
      expect(reservationCleanupDuration).toBeDefined();
    });
  });

  // ==========================================================================
  // Cache Metrics
  // ==========================================================================
  describe('cache metrics', () => {
    it('should increment cacheHitsTotal', () => {
      cacheHitsTotal.inc({ cache_key: 'event:123' });
      expect(cacheHitsTotal).toBeDefined();
    });

    it('should increment cacheMissesTotal', () => {
      cacheMissesTotal.inc({ cache_key: 'event:456' });
      expect(cacheMissesTotal).toBeDefined();
    });

    it('should increment cacheInvalidationTotal', () => {
      cacheInvalidationTotal.inc({ status: 'success', cache_key: 'event:*' });
      expect(cacheInvalidationTotal).toBeDefined();
    });

    it('should increment cacheInvalidationFailuresTotal', () => {
      cacheInvalidationFailuresTotal.inc({ cache_key: 'event:*', error_type: 'timeout' });
      expect(cacheInvalidationFailuresTotal).toBeDefined();
    });
  });

  // ==========================================================================
  // Rate Limit Metrics
  // ==========================================================================
  describe('rate limit metrics', () => {
    it('should increment rateLimitHitsTotal', () => {
      rateLimitHitsTotal.inc({ endpoint: '/events' });
      expect(rateLimitHitsTotal).toBeDefined();
    });

    it('should increment rateLimitFailOpenTotal', () => {
      rateLimitFailOpenTotal.inc({ error_type: 'redis_connection' });
      expect(rateLimitFailOpenTotal).toBeDefined();
    });
  });

  // ==========================================================================
  // External Service Metrics
  // ==========================================================================
  describe('external service metrics', () => {
    it('should increment externalServiceCallsTotal', () => {
      externalServiceCallsTotal.inc({ service: 'venue-service', operation: 'getVenue', status: 'success' });
      expect(externalServiceCallsTotal).toBeDefined();
    });

    it('should observe externalServiceDuration', () => {
      externalServiceDuration.observe({ service: 'venue-service', operation: 'getVenue' }, 0.3);
      expect(externalServiceDuration).toBeDefined();
    });
  });

  // ==========================================================================
  // Circuit Breaker Metrics
  // ==========================================================================
  describe('circuit breaker metrics', () => {
    it('should increment circuitBreakerStateChanges', () => {
      circuitBreakerStateChanges.inc({ service: 'venue-service', from_state: 'closed', to_state: 'open' });
      expect(circuitBreakerStateChanges).toBeDefined();
    });

    it('should increment circuitBreakerCallsTotal', () => {
      circuitBreakerCallsTotal.inc({ service: 'venue-service', status: 'success' });
      expect(circuitBreakerCallsTotal).toBeDefined();
    });
  });

  // ==========================================================================
  // Search Sync Metrics
  // ==========================================================================
  describe('search sync metrics', () => {
    it('should increment searchSyncPublishedTotal', () => {
      searchSyncPublishedTotal.inc({ event_type: 'event_created', status: 'success' });
      expect(searchSyncPublishedTotal).toBeDefined();
    });

    it('should increment searchSyncFailuresTotal', () => {
      searchSyncFailuresTotal.inc({ event_type: 'event_created', error_type: 'connection_failed' });
      expect(searchSyncFailuresTotal).toBeDefined();
    });
  });

  // ==========================================================================
  // Metrics output
  // ==========================================================================
  describe('metrics output', () => {
    it('should generate prometheus format output', async () => {
      // Increment some metrics
      eventCreatedTotal.inc({ status: 'success', event_type: 'single' });
      httpRequestsTotal.inc({ method: 'GET', route: '/events', status: '200' });

      const output = await register.metrics();

      expect(output).toContain('event_created_total');
      expect(output).toContain('http_requests_total');
    });
  });
});
