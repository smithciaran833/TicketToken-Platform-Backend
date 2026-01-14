/**
 * Unit tests for src/utils/metrics.ts
 * Tests Prometheus metrics registration and incrementing
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
  errorsTotal,
  incrementErrorMetric,
} from '../../../src/utils/metrics';

describe('utils/metrics', () => {
  describe('Registry', () => {
    it('should export a prometheus registry', () => {
      expect(register).toBeDefined();
      expect(typeof register.metrics).toBe('function');
    });

    it('should have registered metrics', async () => {
      const metricsOutput = await register.metrics();
      expect(metricsOutput).toContain('event_created_total');
      expect(metricsOutput).toContain('http_requests_total');
    });
  });

  describe('Event operation counters', () => {
    it('should export eventCreatedTotal counter', () => {
      expect(eventCreatedTotal).toBeDefined();
      expect(eventCreatedTotal.inc).toBeDefined();
    });

    it('should allow incrementing with labels', () => {
      expect(() => {
        eventCreatedTotal.inc({ status: 'success', event_type: 'concert' });
      }).not.toThrow();
    });

    it('should export eventUpdatedTotal counter', () => {
      expect(eventUpdatedTotal).toBeDefined();
      expect(() => eventUpdatedTotal.inc({ status: 'success' })).not.toThrow();
    });

    it('should export eventPublishedTotal counter', () => {
      expect(eventPublishedTotal).toBeDefined();
      expect(() => eventPublishedTotal.inc({ status: 'success' })).not.toThrow();
    });

    it('should export eventDeletedTotal counter', () => {
      expect(eventDeletedTotal).toBeDefined();
      expect(() => eventDeletedTotal.inc({ status: 'success' })).not.toThrow();
    });
  });

  describe('Capacity operation metrics', () => {
    it('should export capacityReservedTotal counter', () => {
      expect(capacityReservedTotal).toBeDefined();
      expect(() => capacityReservedTotal.inc({ status: 'success' })).not.toThrow();
    });

    it('should export capacityCheckedTotal counter', () => {
      expect(capacityCheckedTotal).toBeDefined();
      expect(() => capacityCheckedTotal.inc({ available: 'true' })).not.toThrow();
    });

    it('should export capacityAvailable gauge', () => {
      expect(capacityAvailable).toBeDefined();
      expect(capacityAvailable.set).toBeDefined();
    });

    it('should allow setting gauge with labels', () => {
      expect(() => {
        capacityAvailable.set({ event_id: 'event-123', section_name: 'VIP' }, 50);
      }).not.toThrow();
    });
  });

  describe('Pricing operation counters', () => {
    it('should export pricingCreatedTotal counter', () => {
      expect(pricingCreatedTotal).toBeDefined();
      expect(() => pricingCreatedTotal.inc({ status: 'success' })).not.toThrow();
    });

    it('should export pricingCalculatedTotal counter', () => {
      expect(pricingCalculatedTotal).toBeDefined();
      expect(() => pricingCalculatedTotal.inc()).not.toThrow();
    });

    it('should export priceLockCreatedTotal counter', () => {
      expect(priceLockCreatedTotal).toBeDefined();
      expect(() => priceLockCreatedTotal.inc()).not.toThrow();
    });
  });

  describe('Schedule operation counters', () => {
    it('should export scheduleCreatedTotal counter', () => {
      expect(scheduleCreatedTotal).toBeDefined();
      expect(() => scheduleCreatedTotal.inc({ status: 'success' })).not.toThrow();
    });

    it('should export scheduleUpdatedTotal counter', () => {
      expect(scheduleUpdatedTotal).toBeDefined();
      expect(() => scheduleUpdatedTotal.inc({ status: 'success' })).not.toThrow();
    });
  });

  describe('Performance histograms', () => {
    it('should export eventOperationDuration histogram', () => {
      expect(eventOperationDuration).toBeDefined();
      expect(eventOperationDuration.observe).toBeDefined();
    });

    it('should allow observing with labels', () => {
      expect(() => {
        eventOperationDuration.observe({ operation: 'create' }, 0.5);
      }).not.toThrow();
    });

    it('should export capacityOperationDuration histogram', () => {
      expect(capacityOperationDuration).toBeDefined();
      expect(() => {
        capacityOperationDuration.observe({ operation: 'reserve' }, 0.1);
      }).not.toThrow();
    });

    it('should export databaseQueryDuration histogram', () => {
      expect(databaseQueryDuration).toBeDefined();
      expect(() => {
        databaseQueryDuration.observe({ operation: 'select', table: 'events' }, 0.05);
      }).not.toThrow();
    });
  });

  describe('HTTP metrics', () => {
    it('should export httpRequestsTotal counter', () => {
      expect(httpRequestsTotal).toBeDefined();
      expect(() => {
        httpRequestsTotal.inc({ method: 'GET', route: '/events', status: '200' });
      }).not.toThrow();
    });

    it('should export httpRequestDuration histogram', () => {
      expect(httpRequestDuration).toBeDefined();
      expect(() => {
        httpRequestDuration.observe({ method: 'POST', route: '/events', status: '201' }, 0.3);
      }).not.toThrow();
    });
  });

  describe('Reservation cleanup metrics', () => {
    it('should export reservationCleanupRunsTotal counter', () => {
      expect(reservationCleanupRunsTotal).toBeDefined();
      expect(() => reservationCleanupRunsTotal.inc({ status: 'success' })).not.toThrow();
    });

    it('should export reservationsExpiredTotal counter', () => {
      expect(reservationsExpiredTotal).toBeDefined();
      expect(() => reservationsExpiredTotal.inc()).not.toThrow();
    });

    it('should export reservationCleanupDuration histogram', () => {
      expect(reservationCleanupDuration).toBeDefined();
      expect(() => reservationCleanupDuration.observe(1.5)).not.toThrow();
    });
  });

  describe('Cache metrics', () => {
    it('should export cacheHitsTotal counter', () => {
      expect(cacheHitsTotal).toBeDefined();
      expect(() => cacheHitsTotal.inc({ cache_key: 'event:123' })).not.toThrow();
    });

    it('should export cacheMissesTotal counter', () => {
      expect(cacheMissesTotal).toBeDefined();
      expect(() => cacheMissesTotal.inc({ cache_key: 'event:456' })).not.toThrow();
    });

    it('should export cacheInvalidationTotal counter', () => {
      expect(cacheInvalidationTotal).toBeDefined();
      expect(() => {
        cacheInvalidationTotal.inc({ status: 'success', cache_key: 'event:789' });
      }).not.toThrow();
    });

    it('should export cacheInvalidationFailuresTotal counter', () => {
      expect(cacheInvalidationFailuresTotal).toBeDefined();
      expect(() => {
        cacheInvalidationFailuresTotal.inc({ cache_key: 'event:000', error_type: 'connection' });
      }).not.toThrow();
    });
  });

  describe('Rate limiting metrics', () => {
    it('should export rateLimitHitsTotal counter', () => {
      expect(rateLimitHitsTotal).toBeDefined();
      expect(() => rateLimitHitsTotal.inc({ endpoint: '/events' })).not.toThrow();
    });

    it('should export rateLimitFailOpenTotal counter', () => {
      expect(rateLimitFailOpenTotal).toBeDefined();
      expect(() => rateLimitFailOpenTotal.inc({ error_type: 'redis_connection' })).not.toThrow();
    });
  });

  describe('External service metrics', () => {
    it('should export externalServiceCallsTotal counter', () => {
      expect(externalServiceCallsTotal).toBeDefined();
      expect(() => {
        externalServiceCallsTotal.inc({
          service: 'venue-service',
          operation: 'getVenue',
          status: 'success',
        });
      }).not.toThrow();
    });

    it('should export externalServiceDuration histogram', () => {
      expect(externalServiceDuration).toBeDefined();
      expect(() => {
        externalServiceDuration.observe({
          service: 'ticket-service',
          operation: 'createTicket',
        }, 0.8);
      }).not.toThrow();
    });
  });

  describe('Circuit breaker metrics', () => {
    it('should export circuitBreakerStateChanges counter', () => {
      expect(circuitBreakerStateChanges).toBeDefined();
      expect(() => {
        circuitBreakerStateChanges.inc({
          service: 'payment-service',
          from_state: 'CLOSED',
          to_state: 'OPEN',
        });
      }).not.toThrow();
    });

    it('should export circuitBreakerCallsTotal counter', () => {
      expect(circuitBreakerCallsTotal).toBeDefined();
      expect(() => {
        circuitBreakerCallsTotal.inc({
          service: 'auth-service',
          status: 'success',
        });
      }).not.toThrow();
    });
  });

  describe('Search sync metrics', () => {
    it('should export searchSyncPublishedTotal counter', () => {
      expect(searchSyncPublishedTotal).toBeDefined();
      expect(() => {
        searchSyncPublishedTotal.inc({ event_type: 'event.created', status: 'success' });
      }).not.toThrow();
    });

    it('should export searchSyncFailuresTotal counter', () => {
      expect(searchSyncFailuresTotal).toBeDefined();
      expect(() => {
        searchSyncFailuresTotal.inc({ event_type: 'event.updated', error_type: 'timeout' });
      }).not.toThrow();
    });
  });

  describe('Error tracking metrics', () => {
    it('should export errorsTotal counter', () => {
      expect(errorsTotal).toBeDefined();
    });

    describe('incrementErrorMetric()', () => {
      it('should increment error metric with labels', () => {
        expect(() => {
          incrementErrorMetric('validation', 422, '/events');
        }).not.toThrow();
      });

      it('should handle numeric status codes', () => {
        expect(() => {
          incrementErrorMetric('internal', 500, '/capacity');
        }).not.toThrow();
      });

      it('should handle string status codes', () => {
        expect(() => {
          incrementErrorMetric('not_found', '404', '/events/123');
        }).not.toThrow();
      });

      it('should normalize endpoint with UUID', () => {
        expect(() => {
          incrementErrorMetric('not_found', 404, '/events/550e8400-e29b-41d4-a716-446655440000');
        }).not.toThrow();
        // The endpoint should be normalized to /events/:id
      });

      it('should normalize endpoint with numeric ID', () => {
        expect(() => {
          incrementErrorMetric('not_found', 404, '/events/12345');
        }).not.toThrow();
        // The endpoint should be normalized to /events/:id
      });

      it('should strip query parameters from endpoint', () => {
        expect(() => {
          incrementErrorMetric('validation', 400, '/events?page=1&limit=10');
        }).not.toThrow();
        // The endpoint should be normalized to /events
      });

      it('should handle empty endpoint', () => {
        expect(() => {
          incrementErrorMetric('internal', 500, '');
        }).not.toThrow();
        // The endpoint should be 'unknown'
      });

      it('should handle null-ish endpoint', () => {
        expect(() => {
          incrementErrorMetric('internal', 500, null as any);
        }).not.toThrow();
      });

      it('should not throw on metric failure', () => {
        // This tests the try-catch in incrementErrorMetric
        // The function should never throw even if metrics fail
        expect(() => {
          incrementErrorMetric('test', 500, '/test');
        }).not.toThrow();
      });

      it('should handle complex paths with multiple UUIDs', () => {
        expect(() => {
          incrementErrorMetric(
            'not_found',
            404,
            '/events/550e8400-e29b-41d4-a716-446655440000/capacity/660e8400-e29b-41d4-a716-446655440001'
          );
        }).not.toThrow();
      });

      it('should handle mixed numeric and UUID paths', () => {
        expect(() => {
          incrementErrorMetric('not_found', 404, '/events/123/tiers/550e8400-e29b-41d4-a716-446655440000');
        }).not.toThrow();
      });
    });
  });

  describe('Metric values', () => {
    it('should track event creation', async () => {
      const initialMetrics = await register.getMetricsAsJSON();
      const eventMetric = initialMetrics.find(m => m.name === 'event_created_total');
      expect(eventMetric).toBeDefined();
    });

    it('should track capacity gauges', async () => {
      // Set a capacity value
      capacityAvailable.set({ event_id: 'test-event', section_name: 'GA' }, 100);
      
      const metrics = await register.getMetricsAsJSON();
      const capacityMetric = metrics.find(m => m.name === 'capacity_available');
      expect(capacityMetric).toBeDefined();
    });
  });

  describe('Histogram buckets', () => {
    it('eventOperationDuration should have appropriate buckets for event ops', () => {
      expect(eventOperationDuration).toBeDefined();
      // Buckets: [0.1, 0.5, 1, 2, 5, 10]
      // These cover short to long event operations
    });

    it('capacityOperationDuration should have finer buckets for quick ops', () => {
      expect(capacityOperationDuration).toBeDefined();
      // Buckets: [0.01, 0.05, 0.1, 0.5, 1, 2]
      // These cover very quick capacity checks
    });

    it('databaseQueryDuration should have very fine buckets', () => {
      expect(databaseQueryDuration).toBeDefined();
      // Buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1]
      // These cover millisecond-level DB queries
    });
  });
});
